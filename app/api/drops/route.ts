import { NextRequest, NextResponse } from "next/server";
import {
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import argon2 from "argon2";

import { adminAuth, adminDb } from "@/lib/firebase-admin";

type DropType = "text" | "link";

type CreateDropBody = {
  type: DropType;
  content: string;
  expiry: string;
  customExpiry?: string;
  password?: string;
  limitEnabled?: boolean;
  downloadLimit?: number;
  oneTime?: boolean;
};

function getExpiryDate(
  expiry: string,
  customExpiry?: string
): Date | null {
  const now = Date.now();

  const durations: Record<string, number> = {
    "1 hour": 60 * 60 * 1000,
    "2 hours": 2 * 60 * 60 * 1000,
    "6 hours": 6 * 60 * 60 * 1000,
    "24 hours": 24 * 60 * 60 * 1000,
    "7 days": 7 * 24 * 60 * 60 * 1000,
    "30 days": 30 * 24 * 60 * 60 * 1000,
  };

  if (expiry === "Custom") {
    if (!customExpiry) return null;

    const date = new Date(customExpiry);

    if (
      Number.isNaN(date.getTime()) ||
      date.getTime() <= now ||
      date.getTime() > now + 30 * 24 * 60 * 60 * 1000
    ) {
      return null;
    }

    return date;
  }

  const duration = durations[expiry];

  if (!duration) return null;

  return new Date(now + duration);
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verify Firebase ID token.
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, message: "Authentication required." },
        { status: 401 }
      );
    }

    const idToken = authorization.slice(7);

    let decodedToken;

    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid or expired session." },
        { status: 401 }
      );
    }

    // 2. Read request body.
    let body: CreateDropBody;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid request body." },
        { status: 400 }
      );
    }

    if (!body || !["text", "link"].includes(body.type)) {
      return NextResponse.json(
        { success: false, message: "Invalid drop type." },
        { status: 400 }
      );
    }

    if (
      typeof body.content !== "string" ||
      !body.content.trim()
    ) {
      return NextResponse.json(
        { success: false, message: "Drop content is required." },
        { status: 400 }
      );
    }

    const content = body.content.trim();

    if (body.type === "text" && content.length > 100000) {
      return NextResponse.json(
        {
          success: false,
          message: "Text exceeds the 100,000 character limit.",
        },
        { status: 400 }
      );
    }

    if (body.type === "link") {
      try {
        const url = new URL(content);

        if (!["http:", "https:"].includes(url.protocol)) {
          throw new Error("Unsupported URL protocol.");
        }
      } catch {
        return NextResponse.json(
          {
            success: false,
            message: "Please provide a valid HTTP or HTTPS URL.",
          },
          { status: 400 }
        );
      }
    }

    // 3. Validate password.
    let passwordHash: string | null = null;

    if (body.password !== undefined) {
      if (
        typeof body.password !== "string" ||
        body.password.length < 6 ||
        body.password.length > 128
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Password must contain between 6 and 128 characters.",
          },
          { status: 400 }
        );
      }

      passwordHash = await argon2.hash(body.password, {
        type: argon2.argon2id,
      });
    }

    // 4. Validate access settings.
    if (
      body.limitEnabled !== undefined &&
      typeof body.limitEnabled !== "boolean"
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid download limit setting." },
        { status: 400 }
      );
    }

    if (
      body.oneTime !== undefined &&
      typeof body.oneTime !== "boolean"
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid one-time access setting." },
        { status: 400 }
      );
    }

    const limitEnabled = body.limitEnabled === true;
    const oneTimeAccess = body.oneTime === true;

    let maxAccesses: number | null = null;

    if (oneTimeAccess) {
      maxAccesses = 1;
    } else if (limitEnabled) {
      if (
        !Number.isInteger(body.downloadLimit) ||
        body.downloadLimit! < 1 ||
        body.downloadLimit! > 1000
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Download limit must be between 1 and 1000.",
          },
          { status: 400 }
        );
      }

      maxAccesses = body.downloadLimit!;
    }

    // 5. Calculate expiry.
    if (typeof body.expiry !== "string") {
      return NextResponse.json(
        { success: false, message: "Expiry setting is required." },
        { status: 400 }
      );
    }

    const expiresAt = getExpiryDate(
      body.expiry,
      body.customExpiry
    );

    if (!expiresAt) {
      return NextResponse.json(
        { success: false, message: "Invalid expiry setting." },
        { status: 400 }
      );
    }

    // 6. Create Firestore record.
    const dropRef = adminDb.collection("drops").doc();

    await dropRef.set({
      ownerId: decodedToken.uid,
      type: body.type,
      content,

      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),

      downloadCount: 0,
      maxAccesses,
      oneTimeAccess,

      status: "active",

      passwordProtected: passwordHash !== null,
      ...(passwordHash ? { passwordHash } : {}),
    });

    // 7. Return drop details.
    return NextResponse.json(
      {
        success: true,
        message: "Drop created successfully.",
        drop: {
          id: dropRef.id,
          type: body.type,
          expiresAt: expiresAt.toISOString(),
          passwordProtected: passwordHash !== null,
          maxAccesses,
          oneTimeAccess,
          shareUrl: `${request.nextUrl.origin}/d/${dropRef.id}`,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create Drop API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to create drop. Please try again.",
      },
      { status: 500 }
    );
  }
}