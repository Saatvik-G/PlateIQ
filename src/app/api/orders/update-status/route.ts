import { NextResponse } from "next/server";
import { getAdminDb, decodeFirebaseToken } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

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

    const { orderId, status } = await request.json();
    if (!orderId || !status) {
      return NextResponse.json({ error: "orderId and status are required." }, { status: 400 });
    }

    const validStatuses = ["placed", "preparing", "ready", "served", "billed"];
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
    const role = staffData?.role;

    if (!role) {
      return NextResponse.json({ error: "Forbidden. Role not found for user." }, { status: 403 });
    }

    // Role-gating logic
    if (status === "preparing" || status === "ready") {
      if (role !== "kitchen" && role !== "admin") {
        return NextResponse.json({ error: "Forbidden. Only kitchen or admin roles can update prep status." }, { status: 403 });
      }
    } else if (status === "served" || status === "billed") {
      if (role !== "waiter" && role !== "admin") {
        return NextResponse.json({ error: "Forbidden. Only waiters or admins can serve or bill orders." }, { status: 403 });
      }
    }

    // Update order
    const orderRef = db.collection("orders").doc(orderId);
    const orderDoc = await orderRef.get();
    
    if (!orderDoc.exists) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    await orderRef.update({
      status,
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ success: true, orderId, newStatus: status });
  } catch (error: any) {
    console.error("Update Status Error:", error);
    return NextResponse.json({ error: error.message || "Failed to update order status." }, { status: 500 });
  }
}
