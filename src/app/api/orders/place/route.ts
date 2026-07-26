import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export async function POST(request: Request) {
  try {
    const { tableId, customerId, items } = await request.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Invalid request. Order items are required." },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const restaurantId = "default-restaurant";

    const result = await db.runTransaction(async (transaction: any) => {
      // 1. Get restaurant rates (tax & service charge)
      const restRef = db.collection("restaurants").doc(restaurantId);
      const restDoc = await transaction.get(restRef);
      
      let taxRate = 0.08;
      let serviceChargeRate = 0.10;
      
      if (!restDoc.exists) {
        // Auto-create default restaurant for hackathon convenience
        transaction.set(restRef, {
          name: "PlateIQ Bistro",
          createdAt: Timestamp.now(),
          taxRate,
          serviceChargeRate,
        });
      } else {
        const restData = restDoc.data();
        if (restData) {
          taxRate = restData.taxRate ?? taxRate;
          serviceChargeRate = restData.serviceChargeRate ?? serviceChargeRate;
        }
      }

      // 2. Fetch all menu items for the restaurant
      const menuSnap = await transaction.get(
        db.collection("menuItems").where("restaurantId", "==", restaurantId)
      );
      const menuItemsMap = new Map<string, any>();
      menuSnap.forEach((doc: any) => {
        menuItemsMap.set(doc.id, { id: doc.id, ...doc.data() });
      });

      // 3. Fetch all ingredients for the restaurant
      const ingSnap = await transaction.get(
        db.collection("ingredients").where("restaurantId", "==", restaurantId)
      );
      const ingredientsMap = new Map<string, any>();
      ingSnap.forEach((doc: any) => {
        ingredientsMap.set(doc.id, { id: doc.id, ...doc.data() });
      });

      // Verify that all ordered items exist in the menu and are available
      const orderedItemsDetails: any[] = [];
      const ingredientRequirements = new Map<string, number>();

      for (const item of items) {
        const menuItem = menuItemsMap.get(item.menuItemId);
        if (!menuItem) {
          throw new Error(`Menu item with ID ${item.menuItemId} does not exist.`);
        }
        
        orderedItemsDetails.push({
          menuItemId: menuItem.id,
          name: menuItem.name,
          price: menuItem.price,
          quantity: item.quantity,
        });

        // Compute ingredient needs
        const recipeMap = menuItem.recipeMap || [];
        for (const recipeItem of recipeMap) {
          const reqQty = recipeItem.quantityRequired * item.quantity;
          const currentReq = ingredientRequirements.get(recipeItem.ingredientId) || 0;
          ingredientRequirements.set(recipeItem.ingredientId, currentReq + reqQty);
        }
      }

      // 4. Verify stock and plan updates
      const ingredientUpdates: { ref: any; name: string; oldStock: number; newStock: number; threshold: number; unit: string }[] = [];
      
      for (const [ingredientId, requiredQty] of ingredientRequirements.entries()) {
        const ingredient = ingredientsMap.get(ingredientId);
        if (!ingredient) {
          throw new Error(`Required ingredient with ID ${ingredientId} not found in database.`);
        }

        if (ingredient.currentStock < requiredQty) {
          throw new Error(
            `Insufficient stock for ingredient "${ingredient.name}". Required: ${requiredQty} ${ingredient.unit}, Available: ${ingredient.currentStock} ${ingredient.unit}.`
          );
        }

        ingredientUpdates.push({
          ref: db.collection("ingredients").doc(ingredientId),
          name: ingredient.name,
          oldStock: ingredient.currentStock,
          newStock: ingredient.currentStock - requiredQty,
          threshold: ingredient.lowStockThreshold,
          unit: ingredient.unit,
        });
      }

      // 5. Query active cooking load for prep time estimation
      const activeOrdersSnap = await transaction.get(
        db.collection("orders")
          .where("restaurantId", "==", restaurantId)
          .where("status", "in", ["placed", "preparing"])
      );
      const activeOrdersCount = activeOrdersSnap.size;

      // Calculate ETA: base 5m + 1m per recipe step + 2m per active kitchen order load
      let totalRecipeSteps = 0;
      for (const item of items) {
        const menuItem = menuItemsMap.get(item.menuItemId);
        totalRecipeSteps += (menuItem?.recipeMap?.length || 0) * item.quantity;
      }
      const prepMinutes = 5 + totalRecipeSteps + activeOrdersCount * 2;
      const estimatedReadyAt = Timestamp.fromDate(
        new Date(Date.now() + prepMinutes * 60 * 1000)
      );

      // 6. Deduct ingredient stock, write ledger, and trigger threshold-crossing notifications
      const ledgerWrites: any[] = [];
      const notificationWrites: any[] = [];

      for (const update of ingredientUpdates) {
        // Update ingredient document stock
        transaction.update(update.ref, { currentStock: update.newStock });

        // Update local map value for the global menu recalculation step
        const localIng = ingredientsMap.get(update.ref.id);
        if (localIng) {
          localIng.currentStock = update.newStock;
        }

        // Ledger Entry
        const changeQty = update.newStock - update.oldStock;
        const ledgerRef = db.collection("inventoryLedger").doc();
        transaction.set(ledgerRef, {
          restaurantId,
          ingredientId: update.ref.id,
          changeQty,
          reason: "order_deduction",
          createdAt: Timestamp.now(),
        });

        // Check if stock crossed below lowStockThreshold
        if (update.oldStock >= update.threshold && update.newStock < update.threshold) {
          const notificationRef = db.collection("notifications").doc();
          transaction.set(notificationRef, {
            restaurantId,
            type: "low_stock",
            message: `Ingredient alert: "${update.name}" has crossed below its threshold. Current stock: ${update.newStock.toFixed(1)} ${update.unit}.`,
            createdAt: Timestamp.now(),
            read: false,
          });
        }
      }

      // 7. Re-calculate availability for the ENTIRE restaurant's menu using updated stocks
      menuItemsMap.forEach((menuItem: any) => {
        let isNowAvailable = true;

        const recipeMap = menuItem.recipeMap || [];
        if (recipeMap.length === 0) {
          // If no recipe, it's always available unless manual override
          isNowAvailable = true;
        } else {
          for (const recipeItem of recipeMap) {
            const ingredient = ingredientsMap.get(recipeItem.ingredientId);
            if (!ingredient || ingredient.currentStock < recipeItem.quantityRequired) {
              isNowAvailable = false;
              break;
            }
          }
        }

        // Update if state has changed
        if (menuItem.isAvailable !== isNowAvailable) {
          const menuItemRef = db.collection("menuItems").doc(menuItem.id);
          transaction.update(menuItemRef, { isAvailable: isNowAvailable });
        }
      });

      // 8. Calculate pricing server-side
      const subtotal = orderedItemsDetails.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );
      const tax = subtotal * taxRate;
      const serviceCharge = subtotal * serviceChargeRate;
      const totalAmount = subtotal + tax + serviceCharge;

      // 9. Write the order
      const orderRef = db.collection("orders").doc();
      const orderData = {
        restaurantId,
        tableId: tableId || "walk-in",
        customerId: customerId || "anonymous",
        status: "placed",
        createdAt: Timestamp.now(),
        estimatedReadyAt,
        taxRate,
        serviceChargeRate,
        subtotal,
        totalAmount,
        items: orderedItemsDetails,
      };
      
      transaction.set(orderRef, orderData);

      return {
        id: orderRef.id,
        ...orderData,
        createdAt: orderData.createdAt.toDate(),
        estimatedReadyAt: orderData.estimatedReadyAt.toDate(),
      };
    });

    return NextResponse.json({ success: true, order: result });
  } catch (error: any) {
    console.error("Order Transaction Error:", error);
    return NextResponse.json({ error: error.message || "Failed to place order." }, { status: 500 });
  }
}
