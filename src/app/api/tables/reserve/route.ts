import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export async function POST(request: Request) {
  try {
    const { customerName, partySize, timeSlot } = await request.json();

    if (!customerName || !partySize || !timeSlot) {
      return NextResponse.json({ error: "Missing required reservation fields." }, { status: 400 });
    }

    const restaurantId = "default-restaurant";
    const size = parseInt(partySize, 10);
    if (isNaN(size) || size <= 0) {
      return NextResponse.json({ error: "Invalid party size." }, { status: 400 });
    }

    const db = getAdminDb();

    const result = await db.runTransaction(async (transaction: any) => {
      // 1. --- READS FIRST ---
      // Fetch all tables for this restaurant
      const tablesSnap = await transaction.get(
        db.collection("tables").where("restaurantId", "==", restaurantId)
      );

      if (tablesSnap.empty) {
        throw new Error("No tables found. Please run the One-Click Demo Seeding first to initialize the tables.");
      }

      // Fetch reservations for this slot that are active (confirmed/pending)
      const reservationsSnap = await transaction.get(
        db.collection("reservations")
          .where("timeSlot", "==", timeSlot)
          .where("status", "==", "confirmed")
      );

      // 2. --- COMPUTATION ---
      const tables: any[] = [];
      tablesSnap.forEach((doc: any) => {
        tables.push({ id: doc.id, ...doc.data() });
      });

      const reservedTableIds = new Set<string>();
      reservationsSnap.forEach((doc: any) => {
        const data = doc.data();
        if (data.tableId) {
          reservedTableIds.add(data.tableId);
        }
      });

      // Find available tables
      const availableTables = tables.filter((table) => {
        // Table is reserved for this timeslot
        if (reservedTableIds.has(table.id)) {
          return false;
        }

        // If it's a walk-in right now, it can't be occupied
        if (timeSlot === "now" && table.status === "occupied") {
          return false;
        }

        // Must have enough capacity
        return table.capacity >= size;
      });

      if (availableTables.length === 0) {
        throw new Error(`No available tables matching party size ${size} at slot "${timeSlot}".`);
      }

      // Greedy Match: Sort by capacity (ascending) to minimize idle capacity
      availableTables.sort((a, b) => {
        if (a.capacity !== b.capacity) {
          return a.capacity - b.capacity;
        }
        return a.tableNumber - b.tableNumber;
      });

      const assignedTable = availableTables[0];

      // 3. --- WRITES SECOND ---
      // Create reservation record
      const reservationRef = db.collection("reservations").doc();
      const reservationData = {
        restaurantId,
        tableId: assignedTable.id,
        tableNumber: assignedTable.tableNumber,
        customerName,
        partySize: size,
        timeSlot,
        status: "confirmed",
        createdAt: Timestamp.now(),
      };
      transaction.set(reservationRef, reservationData);

      // If it's a walk-in "now", mark table status as occupied
      if (timeSlot === "now") {
        const tableRef = db.collection("tables").doc(assignedTable.id);
        transaction.update(tableRef, { status: "occupied" });
        assignedTable.status = "occupied";
      }

      return {
        reservationId: reservationRef.id,
        table: assignedTable,
        reservation: reservationData,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Reservation Transaction Error:", error);
    return NextResponse.json({ error: error.message || "Failed to make reservation." }, { status: 500 });
  }
}
