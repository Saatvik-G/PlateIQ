import { db, auth } from "@/lib/firebase";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  Unsubscribe 
} from "firebase/firestore";

export interface RestaurantTable {
  id: string;
  tableNumber: number;
  capacity: number;
  status: "free" | "occupied" | "reserved";
  restaurantId: string;
}

export interface Reservation {
  id: string;
  tableId: string;
  tableNumber: number;
  customerName: string;
  partySize: number;
  timeSlot: string;
  status: "confirmed" | "cancelled";
  createdAt: any;
}

// 1. Subscribe to All Tables (for occupancy grids and order placement dropdowns)
export function subscribeToTables(callback: (tables: RestaurantTable[]) => void): Unsubscribe {
  const q = query(collection(db, "tables"), orderBy("tableNumber", "asc"));

  return onSnapshot(q, (snapshot) => {
    const tables: RestaurantTable[] = [];
    snapshot.forEach((doc) => {
      tables.push({
        id: doc.id,
        ...doc.data(),
      } as RestaurantTable);
    });
    callback(tables);
  }, (error) => {
    console.error("Tables subscription error:", error);
  });
}

// 2. Reserve Table (calls server API running transactional optimizer)
export async function reserveTable(
  customerName: string,
  partySize: number,
  timeSlot: string
): Promise<{ reservationId: string; table: RestaurantTable; reservation: any }> {
  const response = await fetch("/api/tables/reserve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ customerName, partySize, timeSlot }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to reserve table.");
  }

  return response.json();
}

// 3. Update Table Status (calls role-gated server API)
export async function updateTableStatus(tableId: string, status: "free" | "occupied" | "reserved"): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("You must be logged in to update table status.");
  }

  const idToken = await currentUser.getIdToken();
  const response = await fetch("/api/tables/update-status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`,
    },
    body: JSON.stringify({ tableId, status }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to update table status.");
  }
}

// 4. Subscribe to Reservations (for live dashboard booking list)
export function subscribeToReservations(callback: (reservations: Reservation[]) => void): Unsubscribe {
  const q = query(collection(db, "reservations"), orderBy("createdAt", "desc"));

  return onSnapshot(q, (snapshot) => {
    const reservations: Reservation[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      reservations.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
      } as Reservation);
    });
    callback(reservations);
  }, (error) => {
    console.error("Reservations subscription error:", error);
  });
}
