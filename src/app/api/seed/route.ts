import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ensureSeeded } from "@/lib/startupSeed";

export async function POST(request: Request) {
  try {
    // 1. Ensure the base restaurant data, tables, menu, and ingredients are seeded (idempotent)
    await ensureSeeded();

    // 2. Register or update the staff document if credentials were provided
    const body = await request.json().catch(() => ({}));
    const { staffUid, staffEmail, staffName, staffRole } = body;
    
    if (staffUid && staffEmail) {
      const db = getAdminDb();
      const restaurantId = "default-restaurant";
      const staffRef = db.collection("staff").doc(staffUid);
      
      await staffRef.set({
        restaurantId,
        name: staffName || "Seed User",
        email: staffEmail,
        role: staffRole || "admin",
      });
    }

    return NextResponse.json({ success: true, message: "Database seeding verified and staff registered." });
  } catch (error: any) {
    console.error("Seeding Endpoint Error:", error);
    return NextResponse.json({ error: error.message || "Failed to verify database seeding." }, { status: 500 });
  }
}
