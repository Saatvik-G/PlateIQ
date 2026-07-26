import { NextResponse } from "next/server";
import { getAdminDb, decodeFirebaseToken } from "@/lib/firebaseAdmin";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized. Missing authorization token." }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1]!;
    const decodedToken = decodeFirebaseToken(token);
    if (!decodedToken || !decodedToken.uid) {
      return NextResponse.json({ error: "Unauthorized. Invalid token." }, { status: 401 });
    }

    const { tableId, status } = await request.json();
    if (!tableId || !status) {
      return NextResponse.json({ error: "tableId and status are required." }, { status: 400 });
    }

    const validStatuses = ["free", "occupied", "reserved"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const db = getAdminDb();
    
    // Check staff role in the database
    const staffRef = db.collection("staff").doc(decodedToken.uid);
    const staffDoc = await staffRef.get();

    if (!staffDoc.exists) {
      return NextResponse.json({ error: "Forbidden. User is not registered as staff." }, { status: 403 });
    }

    const staffData = staffDoc.data();
    if (!staffData || (staffData.role !== "waiter" && staffData.role !== "admin" && staffData.role !== "kitchen")) {
      return NextResponse.json({ error: "Forbidden. Only staff can change table status." }, { status: 403 });
    }

    // Update table status
    const tableRef = db.collection("tables").doc(tableId);
    await tableRef.update({ status });

    return NextResponse.json({ success: true, tableId, status });
  } catch (error: any) {
    console.error("Table Update Error:", error);
    return NextResponse.json({ error: error.message || "Failed to update table status." }, { status: 500 });
  }
}
