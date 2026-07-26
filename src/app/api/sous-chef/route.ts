import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Rule-based fallback recommendation when AI quota is unavailable
function getRuleBasedRecommendation(query: string, availableItems: any[]): string {
  const q = query.toLowerCase();

  let filtered = [...availableItems];

  if (q.includes("veg") || q.includes("vegetarian")) {
    filtered = availableItems.filter((i) =>
      !["chicken", "lamb", "fish", "meat", "beef"].some((m) =>
        i.name.toLowerCase().includes(m) || i.description.toLowerCase().includes(m)
      )
    );
  } else if (q.includes("spic") || q.includes("hot")) {
    filtered = availableItems.filter((i) =>
      ["masala", "tikka", "chana", "rogan", "chili", "spiced"].some((s) =>
        i.name.toLowerCase().includes(s) || i.description.toLowerCase().includes(s)
      )
    );
  } else if (q.includes("sweet") || q.includes("dessert")) {
    filtered = availableItems.filter((i) => i.category === "Desserts");
  } else if (q.includes("drink") || q.includes("beverage") || q.includes("lassi") || q.includes("chai") || q.includes("tea")) {
    filtered = availableItems.filter((i) => i.category === "Beverages");
  } else if (q.includes("bread") || q.includes("naan") || q.includes("roti") || q.includes("paratha")) {
    filtered = availableItems.filter((i) => i.category === "Breads");
  } else if (q.includes("starter") || q.includes("snack") || q.includes("light")) {
    filtered = availableItems.filter((i) => i.category === "Starters");
  } else if (q.includes("chicken")) {
    filtered = availableItems.filter((i) =>
      i.name.toLowerCase().includes("chicken") || i.description.toLowerCase().includes("chicken")
    );
  } else if (q.includes("lamb") || q.includes("mutton")) {
    filtered = availableItems.filter((i) =>
      i.name.toLowerCase().includes("lamb") || i.description.toLowerCase().includes("lamb")
    );
  } else if (q.includes("paneer")) {
    filtered = availableItems.filter((i) =>
      i.name.toLowerCase().includes("paneer") || i.description.toLowerCase().includes("paneer")
    );
  }

  // Check for budget constraint
  const budgetMatch = q.match(/under\s*[₹rs\s]*(\d+)/i);
  if (budgetMatch) {
    const budget = parseInt(budgetMatch[1]);
    filtered = (filtered.length > 0 ? filtered : availableItems).filter((i) => i.price <= budget);
  }

  // Fall back to full menu if filter too narrow
  if (filtered.length === 0) filtered = availableItems;

  // Pick up to 2 recommendations
  const picks = filtered.slice(0, 2);
  const formatCurrency = (p: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(p);

  if (picks.length === 0) {
    return "I'm sorry, nothing matching your request is currently available. Please check back soon or try a different craving!";
  }

  if (picks.length === 1) {
    return `Based on your request, I'd recommend our **${picks[0].name}** (${formatCurrency(picks[0].price)}) — ${picks[0].description}`;
  }

  return `Based on your request, I'd suggest our **${picks[0].name}** (${formatCurrency(picks[0].price)}) or **${picks[1].name}** (${formatCurrency(picks[1].price)}). Both are freshly available from our kitchen right now!`;
}

export async function POST(request: Request) {
  try {
    const { query, customerId } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required." }, { status: 400 });
    }

    const db = getAdminDb();
    const restaurantId = "default-restaurant";

    // 1. Fetch only AVAILABLE menu items
    const menuSnap = await db.collection("menuItems")
      .where("restaurantId", "==", restaurantId)
      .where("isAvailable", "==", true)
      .get();

    const availableItems: any[] = [];
    menuSnap.forEach((doc: any) => {
      const data = doc.data();
      availableItems.push({
        id: doc.id,
        name: data.name,
        description: data.description,
        price: data.price,
        category: data.category,
      });
    });

    const apiKey = process.env.GEMINI_API_KEY;

    // If no API key, use rule-based fallback
    if (!apiKey) {
      return NextResponse.json({
        recommendation: getRuleBasedRecommendation(query, availableItems),
      });
    }

    // 2. Fetch customer preferences if customerId exists
    let preferencesContext = "No prior preferences recorded.";
    if (customerId) {
      const prefSnap = await db.collection("customerPreferences").doc(customerId).get();
      if (prefSnap.exists) {
        const prefData = prefSnap.data();
        preferencesContext = JSON.stringify({
          likedCategories: prefData?.likedCategories || [],
          dislikedCategories: prefData?.dislikedCategories || [],
          likedItems: prefData?.likedItems || [],
          dislikedItems: prefData?.dislikedItems || [],
        });
      }
    }

    // 3. Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });

    // 4. Build prompt
    const systemPrompt = `You are the AI Sous-Chef for PlateIQ Bistro, an advanced restaurant assistant.
Your goal is to recommend dishes to the customer based on their dietary needs, cravings, and past taste preferences.

CRITICAL CONSTRAINTS:
1. You may ONLY recommend items from the list of CURRENTLY AVAILABLE menu items provided below.
2. Never recommend any out-of-stock item under any circumstances.
3. If no available item matches the request, recommend the closest available alternative, and explain why.
4. Keep your answer brief, warm, and professional (1-3 sentences maximum). Include the exact price of recommended dishes formatted in Indian Rupees (e.g. ₹280).

AVAILABLE MENU ITEMS:
${JSON.stringify(availableItems, null, 2)}

CUSTOMER TASTE PREFERENCES (prioritize liked categories and items, avoid disliked ones):
${preferencesContext}

CUSTOMER REQUEST:
"${query}"`;

    try {
      const result = await model.generateContent(systemPrompt);
      const response = await result.response;
      const text = response.text();
      return NextResponse.json({ recommendation: text });
    } catch (aiError: any) {
      // AI quota or model error — fall back to rule-based engine silently
      console.warn("Gemini AI unavailable, using rule-based fallback:", aiError?.message);
      return NextResponse.json({
        recommendation: getRuleBasedRecommendation(query, availableItems),
      });
    }

  } catch (error: any) {
    console.error("Sous-Chef endpoint error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
