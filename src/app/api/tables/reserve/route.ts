import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import * as admin from "firebase-admin";

export async function POST(request: Request) {
  try {
    const { customerName, partySize, timeSlot } = await request.json();

    if (!customerName || !partySize || !timeSlot) {
      return NextResponse.json(
        { error: "customerName, partySize, and timeSlot are required." },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const restaurantId = "default-restaurant";
    const size = parseInt(partySize, 10);

    if (isNaN(size) || size <= 0) {
      return NextResponse.json({ error: "Invalid party size." }, { status: 400 });
    }

    const result = await db.runTransaction(async (transaction) => {
      // 1. Fetch all tables for this restaurant
      const tablesSnap = await transaction.get(
        db.collection("tables").where("restaurantId", "==", restaurantId)
      );

      // Auto-create default tables if none exist (for hackathon convenience)
      const tables: any[] = [];
      if (tablesSnap.empty) {
        const defaultTables = [
          { tableNumber: 1, capacity: 2 },
          { tableNumber: 2, capacity: 2 },
          { tableNumber: 3, capacity: 4 },
          { tableNumber: 4, capacity: 4 },
          { tableNumber: 5, capacity: 6 },
          { tableNumber: 6, capacity: 8 },
        ];
        
        for (const tbl of defaultTables) {
          const newRef = db.collection("tables").doc();
          const tblData = { ...tbl, status: "free", restaurantId };
          transaction.set(newRef, tblData);
          tables.push({ id: newRef.id, ...tblData });
        }
      } else {
        tablesSnap.forEach((doc) => {
          tables.push({ id: doc.id, ...doc.data() });
        });
      }

      // 2. Fetch reservations for this slot that are active (confirmed/pending)
      const reservationsSnap = await transaction.get(
        db.collection("reservations")
          .where("timeSlot", "==", timeSlot)
          .where("status", "==", "confirmed")
      );
      
      const reservedTableIds = new Set<string>();
      reservationsSnap.forEach((doc) => {
        const data = doc.data();
        if (data.tableId) {
          reservedTableIds.add(data.tableId);
        }
      });

      // 3. Find available tables
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

      // 4. Greedy Match: Sort by capacity (ascending) to minimize idle capacity
      // If capacity is same, sort by table number
      availableTables.sort((a, b) => {
        if (a.capacity !== b.capacity) {
          return a.capacity - b.capacity;
        }
        return a.tableNumber - b.tableNumber;
      });

      const assignedTable = availableTables[0];

      // 5. Create reservation record
      const reservationRef = db.collection("reservations").doc();
      const reservationData = {
        restaurantId,
        tableId: assignedTable.id,
        tableNumber: assignedTable.tableNumber,
        customerName,
        partySize: size,
        timeSlot,
        status: "confirmed",
        createdAt: admin.firestore.Timestamp.now(),
      };
      transaction.set(reservationRef, reservationData);

      // 6. If it's a walk-in "now", mark table status as occupied
      if (timeSlot === "now") {
        const tableRef = db.collection("tables").doc(assignedTable.id);
        transaction.update(tableRef, { status: "occupied" });
        assignedTable.status = "occupied";
      } else if (timeSlot.toLowerCase().includes("today")) {
        // Let's say if it's for today's general reservations, we can mark table reserved if needed,
        // but typically status is changed at check-in. Let's just leave status for now unless it's immediate.
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
