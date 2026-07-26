import { db, auth } from "@/lib/firebase";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  DocumentData,
  Unsubscribe
} from "firebase/firestore";

export interface OrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  restaurantId: string;
  tableId: string;
  customerId: string;
  status: "placed" | "preparing" | "ready" | "served" | "billed";
  createdAt: any;
  estimatedReadyAt: any;
  taxRate: number;
  serviceChargeRate: number;
  subtotal: number;
  totalAmount: number;
  items: OrderItem[];
}

// 1. Place Order via Server API (Runs atomic transaction and recomputes menu availability)
export async function placeOrder(
  tableId: string,
  customerId: string,
  items: { menuItemId: string; quantity: number }[]
): Promise<Order> {
  const response = await fetch("/api/orders/place", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tableId, customerId, items }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to place order.");
  }

  const data = await response.json();
  return data.order;
}

// 2. Update Order Status via Server API (Enforces role-gated access check on backend)
export async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("You must be logged in to update order status.");
  }

  const idToken = await currentUser.getIdToken();
  const response = await fetch("/api/orders/update-status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`,
    },
    body: JSON.stringify({ orderId, status }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to update order status.");
  }
}

// 3. Subscribe to All Orders (for Staff Dashboard)
export function subscribeToAllOrders(callback: (orders: Order[]) => void): Unsubscribe {
  const q = query(
    collection(db, "orders"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const orders: Order[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      orders.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        estimatedReadyAt: data.estimatedReadyAt?.toDate ? data.estimatedReadyAt.toDate() : data.estimatedReadyAt,
      } as Order);
    });
    callback(orders);
  }, (error) => {
    console.error("Orders subscription error:", error);
  });
}

// 4. Subscribe to Customer's Orders (for live customer status page)
export function subscribeToCustomerOrders(
  customerId: string,
  callback: (orders: Order[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "orders"),
    where("customerId", "==", customerId),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const orders: Order[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      orders.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        estimatedReadyAt: data.estimatedReadyAt?.toDate ? data.estimatedReadyAt.toDate() : data.estimatedReadyAt,
      } as Order);
    });
    callback(orders);
  }, (error) => {
    console.error("Customer orders subscription error:", error);
  });
}
