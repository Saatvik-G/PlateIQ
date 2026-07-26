import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import * as admin from "firebase-admin";

export async function POST(request: Request) {
  try {
    const { ingredientId, restockQty, isSurplus, expiryDate } = await request.json();

    if (!ingredientId) {
      return NextResponse.json({ error: "ingredientId is required." }, { status: 400 });
    }

    const db = getAdminDb();
    const restaurantId = "default-restaurant";

    const result = await db.runTransaction(async (transaction) => {
      const ingRef = db.collection("ingredients").doc(ingredientId);
      const ingDoc = await transaction.get(ingRef);

      if (!ingDoc.exists) {
        throw new Error("Ingredient not found.");
      }

      const ingData = ingDoc.data();
      if (!ingData) throw new Error("Ingredient data is empty.");

      const updates: any = {};
      let stockChanged = false;
      let newStock = ingData.currentStock;

      // 1. Handle Restock
      if (typeof restockQty === "number" && restockQty !== 0) {
        newStock = ingData.currentStock + restockQty;
        updates.currentStock = newStock;
        stockChanged = true;

        // Write ledger entry
        const ledgerRef = db.collection("inventoryLedger").doc();
        transaction.set(ledgerRef, {
          restaurantId,
          ingredientId,
          changeQty: restockQty,
          reason: restockQty > 0 ? "restock" : "waste",
          createdAt: admin.firestore.Timestamp.now(),
        });
      }

      // 2. Handle Surplus / Expiry
      if (typeof isSurplus === "boolean") {
        updates.isSurplus = isSurplus;
      }
      
      if (expiryDate !== undefined) {
        updates.expiryDate = expiryDate
          ? admin.firestore.Timestamp.fromDate(new Date(expiryDate))
          : null;
      }

      // Commit changes to ingredient
      transaction.update(ingRef, updates);

      // 3. If stock changed, run global menu availability sweep
      if (stockChanged) {
        // Fetch all menu items for the restaurant
        const menuSnap = await transaction.get(
          db.collection("menuItems").where("restaurantId", "==", restaurantId)
        );

        // Fetch all ingredients to get current stocks
        const ingredientsSnap = await transaction.get(
          db.collection("ingredients").where("restaurantId", "==", restaurantId)
        );

        const ingredientsMap = new Map<string, any>();
        ingredientsSnap.forEach((doc) => {
          ingredientsMap.set(doc.id, { id: doc.id, ...doc.data() });
        });
        
        // Update our local stock value in map for the sweep
        const localIng = ingredientsMap.get(ingredientId);
        if (localIng) {
          localIng.currentStock = newStock;
        }

        menuSnap.forEach((menuItemDoc) => {
          const menuItem = menuItemDoc.data();
          const recipeMap = menuItem.recipeMap || [];
          let isNowAvailable = true;

          if (recipeMap.length > 0) {
            for (const recipeItem of recipeMap) {
              const ing = ingredientsMap.get(recipeItem.ingredientId);
              if (!ing || ing.currentStock < recipeItem.quantityRequired) {
                isNowAvailable = false;
                break;
              }
            }
          }

          if (menuItem.isAvailable !== isNowAvailable) {
            const menuItemRef = db.collection("menuItems").doc(menuItemDoc.id);
            transaction.update(menuItemRef, { isAvailable: isNowAvailable });
          }
        });
      }

      return {
        ingredientId,
        updatedFields: updates,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Inventory Update Transaction Error:", error);
    return NextResponse.json({ error: error.message || "Failed to update inventory." }, { status: 500 });
  }
}
