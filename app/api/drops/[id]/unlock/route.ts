import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import argon2 from "argon2";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { adminDb } from "@/lib/firebase-admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const redis = Redis.fromEnv();

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, "15 m"),
  analytics: true,
  prefix: "dropnexa:unlock",
});

function getSessionKey(request: Request): string | null {
  const sessionId = request.headers.get("x-drop-access-session");

  if (!sessionId || !/^[a-f0-9]{32}$/i.test(sessionId)) {
    return null;
  }

  return createHash("sha256")
    .update(sessionId)
    .digest("hex");
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { id } = await params;

    if (!/^[a-zA-Z0-9]{20}$/.test(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid drop ID." },
        { status: 400 }
      );
    }

    const sessionKey = getSessionKey(request);

    if (!sessionKey) {
      return NextResponse.json(
        { success: false, message: "Invalid access session." },
        { status: 400 }
      );
    }

    let body: { password?: unknown };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid request body." },
        { status: 400 }
      );
    }

    if (
      typeof body.password !== "string" ||
      body.password.length < 1 ||
      body.password.length > 128
    ) {
      return NextResponse.json(
        { success: false, message: "Please enter a valid password." },
        { status: 400 }
      );
    }

    // Identify requesting IP.
    const forwardedFor = request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      .trim();

    const ipAddress =
      forwardedFor ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Apply Upstash rate limiting.
    let rateLimitResult;

    try {
      rateLimitResult = await ratelimit.limit(
        `${ipAddress}:${id}`
      );
    } catch (error) {
      console.error("Upstash rate limit error:", error);

      return NextResponse.json(
        {
          success: false,
          message:
            "Password verification is temporarily unavailable. Please try again shortly.",
        },
        {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    if (!rateLimitResult.success) {
      const retryAfter = Math.max(
        1,
        Math.ceil(
          (rateLimitResult.reset - Date.now()) / 1000
        )
      );

      return NextResponse.json(
        {
          success: false,
          message:
            "Too many password attempts. Please try again in 15 minutes.",
          retryAfter,
        },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(retryAfter),
          },
        }
      );
    }

    const dropRef = adminDb.collection("drops").doc(id);
    const snapshot = await dropRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { success: false, message: "This drop does not exist." },
        { status: 404 }
      );
    }

    const drop = snapshot.data();

    if (!drop) {
      return NextResponse.json(
        { success: false, message: "Drop data unavailable." },
        { status: 404 }
      );
    }

    if (!["active", "exhausted"].includes(drop.status)) {
      return NextResponse.json(
        { success: false, message: "This drop is unavailable." },
        { status: 410 }
      );
    }

    const expiresAt = drop.expiresAt?.toDate?.();

    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { success: false, message: "This drop has expired." },
        { status: 410 }
      );
    }

    if (
      drop.passwordProtected !== true ||
      typeof drop.passwordHash !== "string"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Password protection is not configured.",
        },
        { status: 400 }
      );
    }

    const originalPasswordHash = drop.passwordHash;

    // Verify password using Argon2id.
    let passwordMatches = false;

    try {
      passwordMatches = await argon2.verify(
        originalPasswordHash,
        body.password
      );
    } catch (error) {
      console.error("Password hash verification error:", error);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to verify this password.",
        },
        { status: 500 }
      );
    }

    if (!passwordMatches) {
      return NextResponse.json(
        {
          success: false,
          message: "Incorrect password. Try again.",
        },
        { status: 401 }
      );
    }

    if (
      !["text", "link"].includes(drop.type) ||
      typeof drop.content !== "string"
    ) {
      return NextResponse.json(
        { success: false, message: "Drop content unavailable." },
        { status: 500 }
      );
    }

    // Atomically authorize this session and consume access once.
    const result = await adminDb.runTransaction(
      async (transaction) => {
        const latestSnapshot = await transaction.get(dropRef);

        if (!latestSnapshot.exists) {
          return {
            error: "This drop does not exist.",
            status: 404,
          };
        }

        const latestDrop = latestSnapshot.data();

        if (!latestDrop) {
          return {
            error: "Drop data unavailable.",
            status: 404,
          };
        }

        const latestExpiry = latestDrop.expiresAt?.toDate?.();

        if (
          !latestExpiry ||
          latestExpiry.getTime() <= Date.now()
        ) {
          return {
            error: "This drop has expired.",
            status: 410,
          };
        }

        if (
          latestDrop.passwordProtected !== true ||
          latestDrop.passwordHash !== originalPasswordHash
        ) {
          return {
            error: "Drop security settings changed. Please try again.",
            status: 409,
          };
        }

        if (
          !["active", "exhausted"].includes(latestDrop.status)
        ) {
          return {
            error: "This drop is unavailable.",
            status: 410,
          };
        }

        if (
          !["text", "link"].includes(latestDrop.type) ||
          typeof latestDrop.content !== "string"
        ) {
          return {
            error: "Drop content unavailable.",
            status: 500,
          };
        }

        const accessSessions =
          latestDrop.accessSessions &&
          typeof latestDrop.accessSessions === "object"
            ? latestDrop.accessSessions
            : {};

        const alreadyAccessed =
          accessSessions[sessionKey] === true;

        const currentCount =
          typeof latestDrop.downloadCount === "number" &&
          Number.isInteger(latestDrop.downloadCount) &&
          latestDrop.downloadCount >= 0
            ? latestDrop.downloadCount
            : 0;

        const maxAccesses =
          typeof latestDrop.maxAccesses === "number" &&
          Number.isInteger(latestDrop.maxAccesses) &&
          latestDrop.maxAccesses > 0
            ? latestDrop.maxAccesses
            : null;

        // A previously authorized session can unlock again
        // without consuming another access.
        if (!alreadyAccessed) {
          if (latestDrop.status !== "active") {
            return {
              error: "This drop has reached its access limit.",
              status: 410,
            };
          }

          if (
            maxAccesses !== null &&
            currentCount >= maxAccesses
          ) {
            return {
              error: "This drop has reached its access limit.",
              status: 410,
            };
          }

          const nextCount = currentCount + 1;

          transaction.update(dropRef, {
            downloadCount: nextCount,
            [`accessSessions.${sessionKey}`]: true,

            ...(maxAccesses !== null &&
            nextCount >= maxAccesses
              ? { status: "exhausted" }
              : {}),
          });
        }

        return {
          success: true as const,
          id,
          type: latestDrop.type,
          content: latestDrop.content,
          expiresAt: latestExpiry.toISOString(),
        };
      }
    );

    if ("error" in result) {
      return NextResponse.json(
        {
          success: false,
          message: result.error,
        },
        {
          status: result.status,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Drop unlocked successfully.",
        drop: {
          id: result.id,
          type: result.type,
          content: result.content,
          expiresAt: result.expiresAt,
        },
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Unlock Drop API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to unlock this drop. Please try again.",
      },
      { status: 500 }
    );
  }
}