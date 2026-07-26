import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

export async function ensureSeeded() {
  const db = getAdminDb();
  
  // Idempotency check: check if menuItems collection is empty
  const menuSnap = await db.collection("menuItems").limit(1).get();
  if (!menuSnap.empty) {
    // Database is already seeded, skip silently
    return;
  }
  
  console.log("Database is empty. Running scaled idempotent Indian cuisine seeding...");
  const restaurantId = "default-restaurant";

  // 1. Create Restaurant
  const restRef = db.collection("restaurants").doc(restaurantId);
  await restRef.set({
    name: "PlateIQ Bistro",
    taxRate: 0.05, // 5% GST for Indian restaurants
    serviceChargeRate: 0.10, // 10% Service Charge
    createdAt: Timestamp.now(),
  });

  // 2. Create 30 Ingredients
  const ingredients = [
    // Core shared ingredients
    { id: "ing_paneer", name: "Fresh Paneer", unit: "g", currentStock: 410, lowStockThreshold: 400, expiryDate: null, isSurplus: false },
    { id: "ing_basmati", name: "Basmati Rice", unit: "g", currentStock: 3000, lowStockThreshold: 1000, expiryDate: null, isSurplus: false },
    { id: "ing_tomato", name: "Tomato Puree", unit: "g", currentStock: 2000, lowStockThreshold: 500, expiryDate: null, isSurplus: false },
    { id: "ing_ghee", name: "Desi Ghee", unit: "ml", currentStock: 800, lowStockThreshold: 200, expiryDate: null, isSurplus: false },
    { id: "ing_garam_masala", name: "Garam Masala", unit: "g", currentStock: 300, lowStockThreshold: 50, expiryDate: null, isSurplus: false },
    { id: "ing_maida", name: "Maida Flour", unit: "g", currentStock: 4000, lowStockThreshold: 1000, expiryDate: null, isSurplus: false },
    
    // Vegetables & Dairy (with some surplus items)
    { id: "ing_ginger", name: "Fresh Ginger", unit: "g", currentStock: 400, lowStockThreshold: 100, expiryDate: null, isSurplus: false },
    { id: "ing_garlic", name: "Fresh Garlic", unit: "g", currentStock: 500, lowStockThreshold: 100, expiryDate: null, isSurplus: false },
    { id: "ing_onion", name: "Red Onion", unit: "g", currentStock: 2500, lowStockThreshold: 600, expiryDate: null, isSurplus: false },
    { id: "ing_yogurt", name: "Plain Yogurt", unit: "g", currentStock: 1500, lowStockThreshold: 500, expiryDate: null, isSurplus: false },
    { id: "ing_spinach", name: "Fresh Spinach", unit: "g", currentStock: 800, lowStockThreshold: 200, expiryDate: null, isSurplus: true }, // Surplus
    { id: "ing_potato", name: "Potato", unit: "g", currentStock: 3000, lowStockThreshold: 800, expiryDate: null, isSurplus: false },
    { id: "ing_peas", name: "Green Peas", unit: "g", currentStock: 1000, lowStockThreshold: 300, expiryDate: null, isSurplus: false },
    { id: "ing_chickpeas", name: "Chickpeas", unit: "g", currentStock: 2000, lowStockThreshold: 500, expiryDate: null, isSurplus: false },
    { id: "ing_lentils", name: "Black Lentils", unit: "g", currentStock: 3000, lowStockThreshold: 800, expiryDate: null, isSurplus: false },
    
    // Meats & Garnish
    { id: "ing_chicken", name: "Boneless Chicken", unit: "g", currentStock: 520, lowStockThreshold: 500, expiryDate: null, isSurplus: false }, // Close to threshold
    { id: "ing_lamb", name: "Tender Lamb", unit: "g", currentStock: 1500, lowStockThreshold: 500, expiryDate: null, isSurplus: false },
    { id: "ing_mint", name: "Fresh Mint", unit: "g", currentStock: 200, lowStockThreshold: 50, expiryDate: null, isSurplus: false },
    { id: "ing_coriander", name: "Fresh Coriander", unit: "g", currentStock: 300, lowStockThreshold: 50, expiryDate: null, isSurplus: false },
    
    // Baking, Spices & Sugar
    { id: "ing_cashews", name: "Cashew Nuts", unit: "g", currentStock: 1000, lowStockThreshold: 200, expiryDate: null, isSurplus: false },
    { id: "ing_cream", name: "Fresh Cream", unit: "ml", currentStock: 1000, lowStockThreshold: 300, expiryDate: null, isSurplus: false },
    { id: "ing_butter", name: "Salted Butter", unit: "g", currentStock: 220, lowStockThreshold: 200, expiryDate: null, isSurplus: false }, // Close to threshold
    { id: "ing_cardamom", name: "Cardamom Pods", unit: "g", currentStock: 100, lowStockThreshold: 20, expiryDate: null, isSurplus: false },
    { id: "ing_turmeric", name: "Turmeric Powder", unit: "g", currentStock: 200, lowStockThreshold: 40, expiryDate: null, isSurplus: false },
    { id: "ing_cumin", name: "Cumin Seeds", unit: "g", currentStock: 300, lowStockThreshold: 50, expiryDate: null, isSurplus: false },
    { id: "ing_chili", name: "Chili Powder", unit: "g", currentStock: 200, lowStockThreshold: 40, expiryDate: null, isSurplus: false },
    { id: "ing_lemon", name: "Fresh Lemon", unit: "pcs", currentStock: 25, lowStockThreshold: 5, expiryDate: null, isSurplus: false },
    { id: "ing_sugar", name: "White Sugar", unit: "g", currentStock: 2000, lowStockThreshold: 500, expiryDate: null, isSurplus: false },
    { id: "ing_coconut", name: "Coconut Milk", unit: "ml", currentStock: 1200, lowStockThreshold: 300, expiryDate: null, isSurplus: false },
    { id: "ing_tea", name: "Tea Leaves", unit: "g", currentStock: 500, lowStockThreshold: 100, expiryDate: null, isSurplus: false },
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

  // 3. Create 22 Menu Items with INR prices and recipe maps
  const menuItems = [
    // --- STARTERS ---
    {
      id: "menu_paneer_tikka",
      name: "Tandoori Paneer Tikka",
      description: "Cubes of paneer marinated in yogurt and spices, grilled in a clay tandoor.",
      price: 220,
      category: "Starters",
      imageUrl: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_paneer", quantityRequired: 150 },
        { ingredientId: "ing_yogurt", quantityRequired: 50 },
        { ingredientId: "ing_ghee", quantityRequired: 10 },
        { ingredientId: "ing_garam_masala", quantityRequired: 5 },
      ],
    },
    {
      id: "menu_samosa_chaat",
      name: "Samosa Chaat",
      description: "Crispy potato samosas crushed and topped with chickpeas, yogurt, sweet tamarind and mint chutney.",
      price: 140,
      category: "Starters",
      imageUrl: "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_potato", quantityRequired: 100 },
        { ingredientId: "ing_maida", quantityRequired: 50 },
        { ingredientId: "ing_chickpeas", quantityRequired: 50 },
        { ingredientId: "ing_yogurt", quantityRequired: 50 },
        { ingredientId: "ing_mint", quantityRequired: 10 },
      ],
    },
    {
      id: "menu_chicken_tikka",
      name: "Chicken Tikka Kebab",
      description: "Boneless chicken thighs marinated in yogurt, tandoori spices, and finished with fresh coriander.",
      price: 260,
      category: "Starters",
      imageUrl: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_chicken", quantityRequired: 150 },
        { ingredientId: "ing_yogurt", quantityRequired: 50 },
        { ingredientId: "ing_ghee", quantityRequired: 10 },
        { ingredientId: "ing_garam_masala", quantityRequired: 5 },
      ],
    },
    {
      id: "menu_onion_bhaji",
      name: "Crispy Onion Bhaji",
      description: "Slices of red onion mixed with chickpea batter, turmeric, and cumin, deep-fried to golden perfection.",
      price: 120,
      category: "Starters",
      imageUrl: "https://images.unsplash.com/photo-1626132647523-66f5bf380027?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_onion", quantityRequired: 150 },
        { ingredientId: "ing_turmeric", quantityRequired: 3 },
        { ingredientId: "ing_cumin", quantityRequired: 2 },
      ],
    },
    {
      id: "menu_hara_bhara",
      name: "Hara Bhara Kabab",
      description: "Healthy patties made of fresh spinach, boiled potatoes, green peas, and warm garam masala.",
      price: 160,
      category: "Starters",
      imageUrl: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_spinach", quantityRequired: 100 },
        { ingredientId: "ing_potato", quantityRequired: 50 },
        { ingredientId: "ing_peas", quantityRequired: 30 },
        { ingredientId: "ing_garam_masala", quantityRequired: 2 },
      ],
    },

    // --- MAINS ---
    {
      id: "menu_paneer_butter",
      name: "Paneer Butter Masala",
      description: "Paneer simmered in a smooth, creamy tomato and cashew nut gravy, finished with butter and fresh cream.",
      price: 320,
      category: "Mains",
      imageUrl: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_paneer", quantityRequired: 200 },
        { ingredientId: "ing_tomato", quantityRequired: 100 },
        { ingredientId: "ing_butter", quantityRequired: 30 },
        { ingredientId: "ing_cream", quantityRequired: 20 },
        { ingredientId: "ing_cashews", quantityRequired: 20 },
        { ingredientId: "ing_garam_masala", quantityRequired: 5 },
      ],
    },
    {
      id: "menu_chicken_masala",
      name: "Chicken Tikka Masala",
      description: "Roasted chicken chunks folded in a creamy tomato sauce spiced with turmeric and garam masala.",
      price: 360,
      category: "Mains",
      imageUrl: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_chicken", quantityRequired: 200 },
        { ingredientId: "ing_tomato", quantityRequired: 100 },
        { ingredientId: "ing_yogurt", quantityRequired: 50 },
        { ingredientId: "ing_butter", quantityRequired: 20 },
        { ingredientId: "ing_cream", quantityRequired: 20 },
        { ingredientId: "ing_garam_masala", quantityRequired: 5 },
      ],
    },
    {
      id: "menu_dal_makhani",
      name: "Slow-Cooked Dal Makhani",
      description: "Black lentils slow-cooked overnight with ghee, butter, and cream for a rich texture.",
      price: 280,
      category: "Mains",
      imageUrl: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_lentils", quantityRequired: 150 },
        { ingredientId: "ing_tomato", quantityRequired: 50 },
        { ingredientId: "ing_ghee", quantityRequired: 20 },
        { ingredientId: "ing_butter", quantityRequired: 20 },
        { ingredientId: "ing_cream", quantityRequired: 20 },
        { ingredientId: "ing_garam_masala", quantityRequired: 3 },
      ],
    },
    {
      id: "menu_chana_masala",
      name: "Amritsari Chana Masala",
      description: "Soft chickpeas cooked in a spicy onion-tomato gravy with red chili and garam masala.",
      price: 240,
      category: "Mains",
      imageUrl: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_chickpeas", quantityRequired: 150 },
        { ingredientId: "ing_tomato", quantityRequired: 50 },
        { ingredientId: "ing_onion", quantityRequired: 80 },
        { ingredientId: "ing_garam_masala", quantityRequired: 5 },
      ],
    },
    {
      id: "menu_aloo_gobi",
      name: "Homestyle Aloo Gobi",
      description: "Fresh potato chunks and cauliflower florets tossed with onions, turmeric, and cumin seeds.",
      price: 220,
      category: "Mains",
      imageUrl: "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_potato", quantityRequired: 120 },
        { ingredientId: "ing_onion", quantityRequired: 50 },
        { ingredientId: "ing_turmeric", quantityRequired: 3 },
        { ingredientId: "ing_cumin", quantityRequired: 3 },
      ],
    },
    {
      id: "menu_lamb_rogan",
      name: "Lamb Rogan Josh",
      description: "Tender lamb chunks cooked in rich yogurt gravy flavored with cardamom, fennel, and chilies.",
      price: 420,
      category: "Mains",
      imageUrl: "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_lamb", quantityRequired: 200 },
        { ingredientId: "ing_yogurt", quantityRequired: 80 },
        { ingredientId: "ing_ghee", quantityRequired: 25 },
        { ingredientId: "ing_garam_masala", quantityRequired: 8 },
        { ingredientId: "ing_cardamom", quantityRequired: 2 },
      ],
    },

    // --- BREADS ---
    {
      id: "menu_garlic_naan",
      name: "Butter Garlic Naan",
      description: "Leavened maida flatbread topped with garlic and butter, baked in a tandoor.",
      price: 70,
      category: "Breads",
      imageUrl: "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_maida", quantityRequired: 120 },
        { ingredientId: "ing_garlic", quantityRequired: 15 },
        { ingredientId: "ing_butter", quantityRequired: 15 },
        { ingredientId: "ing_yogurt", quantityRequired: 10 },
      ],
    },
    {
      id: "menu_butter_naan",
      name: "Classic Butter Naan",
      description: "Soft tandoor-baked flatbread glazed with melted butter.",
      price: 60,
      category: "Breads",
      imageUrl: "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_maida", quantityRequired: 120 },
        { ingredientId: "ing_butter", quantityRequired: 15 },
        { ingredientId: "ing_yogurt", quantityRequired: 10 },
      ],
    },
    {
      id: "menu_roti",
      name: "Tandoori Roti",
      description: "Simple, whole wheat tandoor-cooked flatbread brushed with clean ghee.",
      price: 40,
      category: "Breads",
      imageUrl: "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_maida", quantityRequired: 100 },
        { ingredientId: "ing_ghee", quantityRequired: 5 },
      ],
    },
    {
      id: "menu_laccha",
      name: "Laccha Paratha",
      description: "Multi-layered, crispy tandoori flatbread folded with ghee.",
      price: 80,
      category: "Breads",
      imageUrl: "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_maida", quantityRequired: 120 },
        { ingredientId: "ing_ghee", quantityRequired: 15 },
      ],
    },

    // --- DESSERTS ---
    {
      id: "menu_gulab_jamun",
      name: "Gulab Jamun",
      description: "Golden milk-solid dumplings soaked in warm cardamom-flavored sugar syrup.",
      price: 120,
      category: "Desserts",
      imageUrl: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_maida", quantityRequired: 40 },
        { ingredientId: "ing_sugar", quantityRequired: 100 },
        { ingredientId: "ing_ghee", quantityRequired: 10 },
        { ingredientId: "ing_cardamom", quantityRequired: 1 },
      ],
    },
    {
      id: "menu_kheer",
      name: "Rice Kheer",
      description: "Traditional Indian rice pudding slow-cooked with basmati, sugar, cardamoms, and cream.",
      price: 140,
      category: "Desserts",
      imageUrl: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_basmati", quantityRequired: 50 },
        { ingredientId: "ing_sugar", quantityRequired: 60 },
        { ingredientId: "ing_cream", quantityRequired: 20 },
        { ingredientId: "ing_cardamom", quantityRequired: 2 },
      ],
    },
    {
      id: "menu_rasmalai",
      name: "Saffron Rasmalai",
      description: "Soft paneer discs soaked in sweet, saffron-infused milk cream topped with cardamoms.",
      price: 160,
      category: "Desserts",
      imageUrl: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_paneer", quantityRequired: 50 },
        { ingredientId: "ing_sugar", quantityRequired: 50 },
        { ingredientId: "ing_cream", quantityRequired: 30 },
        { ingredientId: "ing_cardamom", quantityRequired: 1 },
      ],
    },
    {
      id: "menu_kulfi",
      name: "Mango Kulfi",
      description: "Dense, creamy Indian ice cream flavored with sweet mangoes, cardamom, and thick cream.",
      price: 130,
      category: "Desserts",
      imageUrl: "https://images.unsplash.com/photo-1560512823-829485b8bf24?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_sugar", quantityRequired: 50 },
        { ingredientId: "ing_cream", quantityRequired: 40 },
        { ingredientId: "ing_cardamom", quantityRequired: 1 },
      ],
    },

    // --- BEVERAGES ---
    {
      id: "menu_mango_lassi",
      name: "Mango Lassi",
      description: "Thick, creamy drink made of sweet mangoes, fresh yogurt, and sugar.",
      price: 90,
      category: "Beverages",
      imageUrl: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_yogurt", quantityRequired: 150 },
        { ingredientId: "ing_sugar", quantityRequired: 20 },
      ],
    },
    {
      id: "menu_sweet_lassi",
      name: "Sweet Punjabi Lassi",
      description: "Rich yogurt shake sweetened with sugar and flavored with a hint of cardamom.",
      price: 80,
      category: "Beverages",
      imageUrl: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_yogurt", quantityRequired: 150 },
        { ingredientId: "ing_sugar", quantityRequired: 25 },
      ],
    },
    {
      id: "menu_chai",
      name: "Tandoori Masala Chai",
      description: "Hot, spiced milk tea brewed with ginger, cardamoms, sugar, and organic tea leaves.",
      price: 60,
      category: "Beverages",
      imageUrl: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_tea", quantityRequired: 10 },
        { ingredientId: "ing_ginger", quantityRequired: 5 },
        { ingredientId: "ing_cardamom", quantityRequired: 2 },
        { ingredientId: "ing_sugar", quantityRequired: 10 },
      ],
    },
    {
      id: "menu_jalebi",
      name: "Saffron Jalebi",
      description: "Crispy, spiral-shaped deep-fried maida batter wheels soaked in sweet cardamom and saffron syrup.",
      price: 100,
      category: "Desserts",
      imageUrl: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_maida", quantityRequired: 50 },
        { ingredientId: "ing_sugar", quantityRequired: 100 },
        { ingredientId: "ing_ghee", quantityRequired: 10 },
      ],
    },
    {
      id: "menu_paneer_amritsari",
      name: "Amritsari Paneer Fry",
      description: "Crispy paneer strips marinated in chickpea flour batter, spices, ginger, and a splash of fresh lemon.",
      price: 240,
      category: "Starters",
      imageUrl: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_paneer", quantityRequired: 150 },
        { ingredientId: "ing_chickpeas", quantityRequired: 30 },
        { ingredientId: "ing_ginger", quantityRequired: 5 },
        { ingredientId: "ing_lemon", quantityRequired: 1 },
      ],
    },
    {
      id: "menu_lamb_biryani",
      name: "Royal Lamb Biryani",
      description: "Fragrant basmati rice layered with tender lamb chunks, cooked with saffron, ghee, and traditional spices.",
      price: 450,
      category: "Mains",
      imageUrl: "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=500&auto=format&fit=crop",
      isAvailable: true,
      recipeMap: [
        { ingredientId: "ing_lamb", quantityRequired: 150 },
        { ingredientId: "ing_basmati", quantityRequired: 150 },
        { ingredientId: "ing_ghee", quantityRequired: 15 },
        { ingredientId: "ing_garam_masala", quantityRequired: 5 },
        { ingredientId: "ing_onion", quantityRequired: 50 },
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
  
  console.log("Scaled Indian database seeding completed successfully.");
}
