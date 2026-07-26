import { getDb, getAuth } from "@/lib/firebase";
import { 
  collection, 
  query, 
  onSnapshot, 
  Unsubscribe 
} from "firebase/firestore";

export interface RecipeItem {
  ingredientId: string;
  quantityRequired: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  isAvailable: boolean;
  manualOverride?: boolean;
  recipeMap: RecipeItem[];
  restaurantId: string;
}

// 1. Subscribe to Menu Items (for live guest-facing menus and dashboard)
export function subscribeToMenu(callback: (items: MenuItem[]) => void): Unsubscribe {
  const q = query(collection(getDb(), "menuItems"));

  return onSnapshot(q, (snapshot) => {
    const items: MenuItem[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      items.push({
        id: doc.id,
        ...data,
      } as MenuItem);
    });
    callback(items);
  }, (error) => {
    console.error("Menu subscription error:", error);
  });
}

// 2. Staff Manual Override (forces status bypass on server)
export async function overrideMenuAvailability(menuItemId: string, isAvailable: boolean): Promise<void> {
  const currentUser = getAuth().currentUser;
  if (!currentUser) {
    throw new Error("You must be logged in to override menu item availability.");
  }

  const idToken = await currentUser.getIdToken();
  const response = await fetch("/api/menu/override", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`,
    },
    body: JSON.stringify({ menuItemId, isAvailable }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to override menu item.");
  }
}
