export async function callAISousChef(query: string, customerId: string): Promise<string> {
  const response = await fetch("/api/sous-chef", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, customerId }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to get AI recommendation.");
  }

  const data = await response.json();
  return data.recommendation;
}

export async function generateRescueDescription(menuItemId: string, itemName: string, ingredients: string[]): Promise<string> {
  const response = await fetch("/api/rescue-description", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ menuItemId, itemName, ingredients }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to generate dynamic rescue description.");
  }

  const data = await response.json();
  return data.description;
}
