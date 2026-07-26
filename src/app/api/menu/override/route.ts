import { NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebaseAdmin";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized. Missing authorization token." }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1]!;
    let decodedToken;
    try {
      decodedToken = await getAdminAuth().verifyIdToken(token);
    } catch (e) {
      return NextResponse.json({ error: "Unauthorized. Invalid token." }, { status: 401 });
    }

    const { menuItemId, isAvailable } = await request.json();
    if (!menuItemId || typeof isAvailable !== "boolean") {
      return NextResponse.json({ error: "menuItemId and isAvailable are required." }, { status: 400 });
    }

    const db = getAdminDb();
    
    // Check staff role in the database
    const staffRef = db.collection("staff").doc(decodedToken.uid);
    const staffDoc = await staffRef.get();

    if (!staffDoc.exists) {
      return NextResponse.json({ error: "Forbidden. User is not registered as staff." }, { status: 403 });
    }

    const staffData = staffDoc.data();
    if (!staffData || (staffData.role !== "kitchen" && staffData.role !== "admin" && staffData.role !== "waiter")) {
      return NextResponse.json({ error: "Forbidden. Only authorized staff can override availability." }, { status: 403 });
    }

    // Update menu item availability override
    const menuItemRef = db.collection("menuItems").doc(menuItemId);
    await menuItemRef.update({
      isAvailable,
      manualOverride: true, // Mark that it was manual
    });

    return NextResponse.json({ success: true, menuItemId, isAvailable });
  } catch (error: any) {
    console.error("Menu Override Error:", error);
    return NextResponse.json({ error: error.message || "Failed to override menu item availability." }, { status: 500 });
  }
}
