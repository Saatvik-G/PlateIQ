import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(request: Request) {
  try {
    const { menuItemId, itemName, ingredients } = await request.json();

    if (!itemName || !ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return NextResponse.json({ error: "itemName and ingredients list are required." }, { status: 400 });
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
        description: `Enjoy this delicious ${itemName} at 15% off and help us rescue our fresh surplus ${ingredients.join(" and ")} today!`
      });
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

    // Build prompt
    const systemPrompt = `You are the Sustainability Lead for PlateIQ Bistro.
Write a short, fun, enthusiastic, single-line marketing description explaining why this dish (${itemName}) is on the "Chef's Rescue Menu" at a 15% discount.
The discount is applied because we have a fresh surplus of: ${ingredients.join(", ")}.

CRITICAL CONSTRAINTS:
1. The response must be exactly one short sentence.
2. Do not wrap the response in quotation marks or markdown.
3. Sound delicious, eco-friendly, and enticing.
4. Focus on how ordering this dish helps prevent food waste of the specified surplus ingredients.`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const text = response.text().trim().replace(/^["']|["']$/g, ""); // Strip leading/trailing quotes

    return NextResponse.json({ description: text });
  } catch (error: any) {
    console.error("Rescue Description Endpoint Error:", error);
    return NextResponse.json({ error: error.message || "Failed to generate sustainability description." }, { status: 500 });
  }
}
