import { db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  Unsubscribe,
  doc,
  updateDoc
} from "firebase/firestore";

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  lowStockThreshold: number;
  expiryDate: any;
  isSurplus: boolean;
  restaurantId: string;
}

export interface SystemNotification {
  id: string;
  restaurantId: string;
  type: "low_stock" | "expiry_warning" | "new_order";
  message: string;
  createdAt: any;
  read: boolean;
}

// 1. Subscribe to Ingredients (for Dashboard and Customer menus)
export function subscribeToIngredients(callback: (ingredients: Ingredient[]) => void): Unsubscribe {
  const q = query(
    collection(db, "ingredients"),
    orderBy("name", "asc")
  );

  return onSnapshot(q, (snapshot) => {
    const ingredients: Ingredient[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      ingredients.push({
        id: doc.id,
        ...data,
        expiryDate: data.expiryDate?.toDate ? data.expiryDate.toDate() : data.expiryDate,
      } as Ingredient);
    });
    callback(ingredients);
  }, (error) => {
    console.error("Ingredients subscription error:", error);
  });
}

// 2. Subscribe to Notifications (for staff alerts panel)
export function subscribeToNotifications(callback: (notifications: SystemNotification[]) => void): Unsubscribe {
  const q = query(
    collection(db, "notifications"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const notifications: SystemNotification[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      notifications.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
      } as SystemNotification);
    });
    callback(notifications);
  }, (error) => {
    console.error("Notifications subscription error:", error);
  });
}

// 3. Restock Ingredient (triggers ledger write & availability sweep on server)
export async function restockIngredient(ingredientId: string, quantity: number): Promise<void> {
  const response = await fetch("/api/inventory/update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ingredientId, restockQty: quantity }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to restock ingredient.");
  }
}

// 4. Update Expiry and Surplus state (for waste rescue auto-pricing)
export async function updateIngredientSurplus(
  ingredientId: string,
  isSurplus: boolean,
  expiryDate: string | null
): Promise<void> {
  const response = await fetch("/api/inventory/update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ingredientId, isSurplus, expiryDate }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to update ingredient settings.");
  }
}

// 5. Mark Notification as Read
export async function markNotificationRead(notificationId: string): Promise<void> {
  const ref = doc(db, "notifications", notificationId);
  await updateDoc(ref, { read: true });
}
