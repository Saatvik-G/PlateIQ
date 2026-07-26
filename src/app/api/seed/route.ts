import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import * as admin from "firebase-admin";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { staffUid, staffEmail, staffName, staffRole } = body;
    const db = getAdminDb();
    const restaurantId = "default-restaurant";

    // 1. Create Restaurant
    const restRef = db.collection("restaurants").doc(restaurantId);
    await restRef.set({
      name: "PlateIQ Bistro",
      taxRate: 0.08,
      serviceChargeRate: 0.10,
      createdAt: admin.firestore.Timestamp.now(),
    });

    // 2. Create Ingredients
    const ingredients = [
      { id: "ing_tomato", name: "Fresh Tomato", unit: "pcs", currentStock: 50, lowStockThreshold: 10, expiryDate: null, isSurplus: false },
      { id: "ing_cheese", name: "Mozzarella Cheese", unit: "g", currentStock: 5000, lowStockThreshold: 1000, expiryDate: null, isSurplus: false },
      { id: "ing_dough", name: "Pizza Dough", unit: "pcs", currentStock: 20, lowStockThreshold: 5, expiryDate: null, isSurplus: false },
      { id: "ing_beef", name: "Beef Patty", unit: "pcs", currentStock: 30, lowStockThreshold: 8, expiryDate: null, isSurplus: false },
      { id: "ing_bun", name: "Burger Bun", unit: "pcs", currentStock: 35, lowStockThreshold: 8, expiryDate: null, isSurplus: false },
      { id: "ing_lettuce", name: "Iceberg Lettuce", unit: "g", currentStock: 1000, lowStockThreshold: 200, expiryDate: null, isSurplus: false },
    ];

    const ingBatch = db.batch();
    for (const ing of ingredients) {
      const ref = db.collection("ingredients").doc(ing.id);
      ingBatch.set(ref, {
        restaurantId,
        name: ing.name,
        unit: ing.unit,
        currentStock: ing.currentStock,
        lowStockThreshold: ing.lowStockThreshold,
        expiryDate: ing.expiryDate,
        isSurplus: ing.isSurplus,
      });
    }
    await ingBatch.commit();

    // 3. Create Menu Items
    const menuItems = [
      {
        id: "menu_pizza",
        name: "Classic Margherita Pizza",
        description: "Fresh pizza dough topped with vine-ripened tomatoes, mozzarella cheese, and aromatic basil.",
        price: 14.99,
        category: "Mains",
        imageUrl: "https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=500&auto=format&fit=crop",
        isAvailable: true,
        recipeMap: [
          { ingredientId: "ing_dough", quantityRequired: 1 },
          { ingredientId: "ing_tomato", quantityRequired: 3 },
          { ingredientId: "ing_cheese", quantityRequired: 200 },
        ],
      },
      {
        id: "menu_burger",
        name: "Gourmet Beef Burger",
        description: "Juicy beef patty with fresh lettuce on a toasted bun, served with signature burger sauce.",
        price: 12.49,
        category: "Mains",
        imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop",
        isAvailable: true,
        recipeMap: [
          { ingredientId: "ing_beef", quantityRequired: 1 },
          { ingredientId: "ing_bun", quantityRequired: 1 },
          { ingredientId: "ing_lettuce", quantityRequired: 20 },
          { ingredientId: "ing_tomato", quantityRequired: 1 },
        ],
      },
      {
        id: "menu_soup",
        name: "Rustic Tomato Soup",
        description: "Warm, creamy tomato soup slow-cooked with fresh garlic and olive oil, served with croutons.",
        price: 6.99,
        category: "Starters",
        imageUrl: "https://images.unsplash.com/photo-1547592165-e1d17fed6005?w=500&auto=format&fit=crop",
        isAvailable: true,
        recipeMap: [
          { ingredientId: "ing_tomato", quantityRequired: 4 },
        ],
      },
      {
        id: "menu_salad",
        name: "Fresh Garden Salad",
        description: "Crisp iceberg lettuce tossed with tomatoes, cucumbers, and a zesty vinaigrette.",
        price: 8.99,
        category: "Starters",
        imageUrl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&auto=format&fit=crop",
        isAvailable: true,
        recipeMap: [
          { ingredientId: "ing_lettuce", quantityRequired: 100 },
          { ingredientId: "ing_tomato", quantityRequired: 2 },
        ],
      },
    ];

    const menuBatch = db.batch();
    for (const item of menuItems) {
      const ref = db.collection("menuItems").doc(item.id);
      menuBatch.set(ref, {
        restaurantId,
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category,
        imageUrl: item.imageUrl,
        isAvailable: item.isAvailable,
        recipeMap: item.recipeMap,
      });
    }
    await menuBatch.commit();

    // 4. Create Tables
    const tables = [
      { id: "table_1", tableNumber: 1, capacity: 2, status: "free" },
      { id: "table_2", tableNumber: 2, capacity: 2, status: "free" },
      { id: "table_3", tableNumber: 3, capacity: 4, status: "free" },
      { id: "table_4", tableNumber: 4, capacity: 4, status: "free" },
      { id: "table_5", tableNumber: 5, capacity: 6, status: "free" },
      { id: "table_6", tableNumber: 6, capacity: 8, status: "free" },
    ];

    const tableBatch = db.batch();
    for (const tbl of tables) {
      const ref = db.collection("tables").doc(tbl.id);
      tableBatch.set(ref, {
        restaurantId,
        tableNumber: tbl.tableNumber,
        capacity: tbl.capacity,
        status: tbl.status,
      });
    }
    await tableBatch.commit();

    // 5. If staffUid is provided, seed the staff document
    if (staffUid && staffEmail) {
      const staffRef = db.collection("staff").doc(staffUid);
      await staffRef.set({
        restaurantId,
        name: staffName || "Seed User",
        email: staffEmail,
        role: staffRole || "admin",
      });
    }

    return NextResponse.json({ success: true, message: "Database seeded successfully." });
  } catch (error: any) {
    console.error("Seeding Error:", error);
    return NextResponse.json({ error: error.message || "Failed to seed database." }, { status: 500 });
  }
}
