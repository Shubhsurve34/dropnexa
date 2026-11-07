
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: Request,
  { params }: RouteContext
) {
  try {
    const { id } = await params;

    // Validate the Drop ID.
    if (!/^[a-zA-Z0-9]{20}$/.test(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid drop ID." },
        { status: 400 }
      );
    }

    // Retrieve the drop from Firestore.
    const dropRef = adminDb.collection("drops").doc(id);
    const dropSnapshot = await dropRef.get();

    if (!dropSnapshot.exists) {
      return NextResponse.json(
        { success: false, message: "This drop does not exist." },
        { status: 404 }
      );
    }

    const drop = dropSnapshot.data();

    if (!drop) {
      return NextResponse.json(
        { success: false, message: "Drop data unavailable." },
        { status: 404 }
      );
    }

    // Check whether the drop is active.
    if (drop.status !== "active") {
      return NextResponse.json(
        { success: false, message: "This drop is unavailable." },
        { status: 410 }
      );
    }

    // Enforce expiry when someone tries to access the drop.
    const expiresAt = drop.expiresAt?.toDate?.();

    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { success: false, message: "This drop has expired." },
        { status: 410 }
      );
    }

    // Only return supported content types.
    if (!["text", "link"].includes(drop.type)) {
      return NextResponse.json(
        { success: false, message: "Unsupported drop type." },
        { status: 400 }
      );
    }

    if (typeof drop.content !== "string") {
      return NextResponse.json(
        { success: false, message: "Drop content unavailable." },
        { status: 500 }
      );
    }

    // Return only recipient-facing data.
    return NextResponse.json(
      {
        success: true,
        drop: {
          id,
          type: drop.type,
          content: drop.content,
          expiresAt: expiresAt.toISOString(),
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Retrieve Drop API error:", error);

    return NextResponse.json(
      { success: false, message: "Unable to retrieve this drop." },
      { status: 500 }
    );
  }
}
