import { db } from "@/lib/firebase";
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  serverTimestamp 
} from "firebase/firestore";

export interface TasteFeedback {
  id?: string;
  customerId: string;
  menuItemId: string;
  rating: "up" | "down";
  createdAt: any;
}

export interface CustomerPreferences {
  customerId: string;
  likedCategories: string[];
  dislikedCategories: string[];
  likedItems: string[];
  dislikedItems: string[];
}

// 1. Submit Taste Feedback and Update Preferences Loop
export async function submitFeedback(
  customerId: string,
  menuItemId: string,
  rating: "up" | "down"
): Promise<void> {
  // 1a. Write to tasteFeedback collection
  const feedbackRef = collection(db, "tasteFeedback");
  await addDoc(feedbackRef, {
    customerId,
    menuItemId,
    rating,
    createdAt: serverTimestamp(),
  });

  // 1b. Load menu item to find its category
  const itemRef = doc(db, "menuItems", menuItemId);
  const itemSnap = await getDoc(itemRef);
  if (!itemSnap.exists()) return;
  const itemData = itemSnap.data();
  const category = itemData.category;
  const itemName = itemData.name;

  // 1c. Load or initialize customerPreferences document
  const prefRef = doc(db, "customerPreferences", customerId);
  const prefSnap = await getDoc(prefRef);

  let prefs: CustomerPreferences = {
    customerId,
    likedCategories: [],
    dislikedCategories: [],
    likedItems: [],
    dislikedItems: [],
  };

  if (prefSnap.exists()) {
    const data = prefSnap.data();
    prefs = {
      customerId,
      likedCategories: data.likedCategories || [],
      dislikedCategories: data.dislikedCategories || [],
      likedItems: data.likedItems || [],
      dislikedItems: data.dislikedItems || [],
    };
  }

  // Update lists based on rating
  if (rating === "up") {
    // Add to likes
    if (category && !prefs.likedCategories.includes(category)) {
      prefs.likedCategories.push(category);
    }
    if (!prefs.likedItems.includes(itemName)) {
      prefs.likedItems.push(itemName);
    }
    // Remove from dislikes if present
    prefs.dislikedCategories = prefs.dislikedCategories.filter((c) => c !== category);
    prefs.dislikedItems = prefs.dislikedItems.filter((i) => i !== itemName);
  } else {
    // Add to dislikes
    if (category && !prefs.dislikedCategories.includes(category)) {
      prefs.dislikedCategories.push(category);
    }
    if (!prefs.dislikedItems.includes(itemName)) {
      prefs.dislikedItems.push(itemName);
    }
    // Remove from likes if present
    prefs.likedCategories = prefs.likedCategories.filter((c) => c !== category);
    prefs.likedItems = prefs.likedItems.filter((i) => i !== itemName);
  }

  // Save updated preferences
  await setDoc(prefRef, prefs);
}

// 2. Fetch Customer Preferences (to display or feed into AI prompt)
export async function getCustomerPreferences(customerId: string): Promise<CustomerPreferences | null> {
  const docRef = doc(db, "customerPreferences", customerId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as CustomerPreferences;
  }
  return null;
}
