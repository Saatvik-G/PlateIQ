import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(request: Request) {
  try {
    const { query, customerId } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "Query is required." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const isProduction = process.env.NODE_ENV === "production";

    if (!apiKey) {
      if (isProduction) {
        throw new Error("CRITICAL: GEMINI_API_KEY environment variable is missing in production.");
      }
      
      // Local development fallback
      console.warn("GEMINI_API_KEY is missing. Using development mock fallback.");
      return NextResponse.json({
        recommendation: `[Simulated Sous-Chef] I see you are asking for: "${query}". (Note: GEMINI_API_KEY is not configured in local environment variables). Based on our live stock ledger, I'd suggest our Classic Margherita Pizza ($14.99) or Gourmet Beef Burger ($12.49) which are fully in-stock and freshly prepared right now!`
      });
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
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ recommendation: text });
  } catch (error: any) {
    console.error("CRITICAL AI Sous-Chef Endpoint Error Details:", error);
    return NextResponse.json({ 
      error: `AI Error: ${error.message || "Unknown error occurred"}. Ensure your Vercel GEMINI_API_KEY is set to a valid Google AI Studio API key.` 
    }, { status: 500 });
  }
}
