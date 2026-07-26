import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export async function POST(request: Request) {
  try {
    const { ingredientId, restockQty, isSurplus, expiryDate } = await request.json();

    if (!ingredientId) {
      return NextResponse.json({ error: "ingredientId is required." }, { status: 400 });
    }

    const db = getAdminDb();
    const restaurantId = "default-restaurant";

    const result = await db.runTransaction(async (transaction: any) => {
      // 1. --- READS FIRST ---
      const ingRef = db.collection("ingredients").doc(ingredientId);
      const ingDoc = await transaction.get(ingRef);

      if (!ingDoc.exists) {
        throw new Error("Ingredient not found.");
      }

      // Fetch all menu items for the restaurant (read)
      const menuSnap = await transaction.get(
        db.collection("menuItems").where("restaurantId", "==", restaurantId)
      );

      // Fetch all ingredients to get current stocks (read)
      const ingredientsSnap = await transaction.get(
        db.collection("ingredients").where("restaurantId", "==", restaurantId)
      );

      // 2. --- WRITES SECOND ---
      const ingData = ingDoc.data();
      if (!ingData) throw new Error("Ingredient data is empty.");

      const updates: any = {};
      let stockChanged = false;
      let newStock = ingData.currentStock;

      // Handle Restock
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
          createdAt: Timestamp.now(),
        });
      }

      // Handle Surplus / Expiry
      if (typeof isSurplus === "boolean") {
        updates.isSurplus = isSurplus;
      }
      
      if (expiryDate !== undefined) {
        updates.expiryDate = expiryDate
          ? Timestamp.fromDate(new Date(expiryDate))
          : null;
      }

      // Commit changes to ingredient
      transaction.update(ingRef, updates);

      // If stock changed, run global menu availability sweep
      if (stockChanged) {
        const ingredientsMap = new Map<string, any>();
        ingredientsSnap.forEach((doc: any) => {
          ingredientsMap.set(doc.id, { id: doc.id, ...doc.data() });
        });
        
        // Update our local stock value in map for the sweep
        const localIng = ingredientsMap.get(ingredientId);
        if (localIng) {
          localIng.currentStock = newStock;
        }

        menuSnap.forEach((menuItemDoc: any) => {
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
