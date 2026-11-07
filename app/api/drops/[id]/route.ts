import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { adminDb } from "@/lib/firebase-admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getSessionKey(request: Request): string | null {
  const sessionId = request.headers.get("x-drop-access-session");

  if (!sessionId || !/^[a-f0-9]{32}$/i.test(sessionId)) {
    return null;
  }

  // Store a hash instead of the raw browser session ID.
  return createHash("sha256").update(sessionId).digest("hex");
}

export async function GET(
  request: Request,
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

    const dropRef = adminDb.collection("drops").doc(id);

    const result = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(dropRef);

      if (!snapshot.exists) {
        return {
          error: "This drop does not exist.",
          status: 404,
        };
      }

      const drop = snapshot.data();

      if (!drop) {
        return {
          error: "Drop data unavailable.",
          status: 404,
        };
      }

      const expiresAt = drop.expiresAt?.toDate?.();

      if (!expiresAt || expiresAt.getTime() <= Date.now()) {
        return {
          error: "This drop has expired.",
          status: 410,
        };
      }

      if (!["text", "link"].includes(drop.type)) {
        return {
          error: "Unsupported drop type.",
          status: 400,
        };
      }

      if (typeof drop.content !== "string") {
        return {
          error: "Drop content unavailable.",
          status: 500,
        };
      }

      const accessSessions =
        drop.accessSessions &&
        typeof drop.accessSessions === "object"
          ? drop.accessSessions
          : {};

      const alreadyAccessed =
        accessSessions[sessionKey] === true;

      // Previously authorized sessions can retrieve their content again.
      // This prevents refreshes and repeated requests from consuming access.
      if (alreadyAccessed) {
        if (!["active", "exhausted"].includes(drop.status)) {
          return {
            error: "This drop is unavailable.",
            status: 410,
          };
        }

        return {
          passwordRequired: drop.passwordProtected === true,
          id,
          type: drop.type,
          content:
            drop.passwordProtected === true
              ? undefined
              : drop.content,
          expiresAt: expiresAt.toISOString(),
        };
      }

      // New sessions cannot access exhausted or revoked drops.
      if (drop.status !== "active") {
        return {
          error: "This drop is unavailable or has reached its access limit.",
          status: 410,
        };
      }

      // Protected drops must be unlocked before consuming access.
      if (drop.passwordProtected === true) {
        return {
          passwordRequired: true,
          id,
          type: drop.type,
          expiresAt: expiresAt.toISOString(),
        };
      }

      const currentCount =
        typeof drop.downloadCount === "number" &&
        Number.isInteger(drop.downloadCount) &&
        drop.downloadCount >= 0
          ? drop.downloadCount
          : 0;

      const maxAccesses =
        typeof drop.maxAccesses === "number" &&
        Number.isInteger(drop.maxAccesses) &&
        drop.maxAccesses > 0
          ? drop.maxAccesses
          : null;

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

        ...(maxAccesses !== null && nextCount >= maxAccesses
          ? { status: "exhausted" }
          : {}),
      });

      return {
        passwordRequired: false,
        id,
        type: drop.type,
        content: drop.content,
        expiresAt: expiresAt.toISOString(),
      };
    });

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

    if (result.passwordRequired) {
      return NextResponse.json(
        {
          success: true,
          passwordRequired: true,
          drop: {
            id: result.id,
            type: result.type,
            expiresAt: result.expiresAt,
          },
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        passwordRequired: false,
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
    console.error("Retrieve Drop API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to retrieve this drop.",
      },
      { status: 500 }
    );
  }
}