"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  UtensilsCrossed, ShoppingCart, Clock, Sparkles, X, ChevronRight, Send,
  ThumbsUp, ThumbsDown, Check, RefreshCw, Trash2, ArrowRight, Calendar
} from "lucide-react";
import {
  subscribeToMenu,
  MenuItem,
} from "@/services/menuService";
import {
  subscribeToIngredients,
  Ingredient,
} from "@/services/inventoryService";
import {
  subscribeToTables,
  RestaurantTable,
} from "@/services/tableService";
import {
  placeOrder,
  subscribeToCustomerOrders,
  Order,
} from "@/services/orderService";
import {
  submitFeedback,
  getCustomerPreferences,
  CustomerPreferences,
} from "@/services/feedbackService";
import { getCustomerSessionId } from "@/lib/session";
import { callAISousChef, generateRescueDescription } from "@/services/aiService";
import { useToast } from "@/components/Toast";

export default function GuestPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [customerId, setCustomerId] = useState("");

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [preferences, setPreferences] = useState<CustomerPreferences | null>(null);

  // UI state
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState<{ [menuItemId: string]: number }>({});
  const [selectedTable, setSelectedTable] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState("");
  
  // AI Sous-Chef state
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ sender: "user" | "ai"; text: string }[]>([
    { sender: "ai", text: "Hello! I am your AI Sous-Chef. Ask me anything about the menu, dietary options, or what matches your taste!" }
  ]);
  const [aiLoading, setAiLoading] = useState(false);

  // Table Booking state (Task 4 — Smart Optimizer flow)
  const [bookingName, setBookingName] = useState("");
  const [bookingParty, setBookingParty] = useState("2");
  const [bookingSlot, setBookingSlot] = useState("now");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingResult, setBookingResult] = useState<{ tableNumber: number; tableId: string } | null>(null);
  const [bookingError, setBookingError] = useState("");

  // Rescue Menu state
  const [rescueDescriptions, setRescueDescriptions] = useState<{ [menuItemId: string]: string }>({});
  const [loadingRescue, setLoadingRescue] = useState<{ [menuItemId: string]: boolean }>({});

  // Feedback loop state
  const [ratedDishes, setRatedDishes] = useState<Set<string>>(new Set());

  // Initialization
  useEffect(() => {
    const sessId = getCustomerSessionId();
    setCustomerId(sessId);

    // Fetch Initial Preferences
    getCustomerPreferences(sessId).then(setPreferences);

    // Subscribe to Menu
    const unsubMenu = subscribeToMenu(setMenuItems);

    // Subscribe to Ingredients
    const unsubIng = subscribeToIngredients(setIngredients);

    // Subscribe to Tables
    const unsubTables = subscribeToTables(setTables);

    // Subscribe to Orders
    const unsubOrders = subscribeToCustomerOrders(sessId, setCustomerOrders);

    return () => {
      unsubMenu();
      unsubIng();
      unsubTables();
      unsubOrders();
    };
  }, []);

  // Update Preferences when feedback loop triggers
  const refreshPreferences = useCallback(async () => {
    if (!customerId) return;
    const prefs = await getCustomerPreferences(customerId);
    setPreferences(prefs);
  }, [customerId]);

  // Check if ingredient is expiring (within 3 days) or marked surplus
  const getRescueStatus = useCallback((menuItem: MenuItem) => {
    const recipe = menuItem.recipeMap || [];
    const surplusIngredients: string[] = [];
    
    for (const step of recipe) {
      const ing = ingredients.find((i) => i.id === step.ingredientId);
      if (ing) {
        let isExpiring = false;
        if (ing.expiryDate) {
          const daysLeft = (new Date(ing.expiryDate).getTime() - Date.now()) / (1000 * 3600 * 24);
          isExpiring = daysLeft >= 0 && daysLeft <= 3;
        }
        if (ing.isSurplus || isExpiring) {
          surplusIngredients.push(ing.name);
        }
      }
    }
    return surplusIngredients;
  }, [ingredients]);

  // Generate dynamic Gemini tags for Rescue Menu items
  useEffect(() => {
    menuItems.forEach((item) => {
      const surplus = getRescueStatus(item);
      if (surplus.length > 0 && !rescueDescriptions[item.id] && !loadingRescue[item.id]) {
        setLoadingRescue((prev) => ({ ...prev, [item.id]: true }));
        generateRescueDescription(item.id, item.name, surplus)
          .then((desc) => {
            setRescueDescriptions((prev) => ({ ...prev, [item.id]: desc }));
          })
          .catch((err) => console.error("Error generating rescue tagline:", err))
          .finally(() => {
            setLoadingRescue((prev) => ({ ...prev, [item.id]: false }));
          });
      }
    });
  }, [menuItems, getRescueStatus, rescueDescriptions, loadingRescue]);

  // Handle Cart
  const addToCart = (itemId: string) => {
    setCart((prev) => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const newCart = { ...prev };
      if (newCart[itemId] > 1) {
        newCart[itemId] -= 1;
      } else {
        delete newCart[itemId];
      }
      return newCart;
    });
  };

  const getCartTotal = () => {
    return Object.entries(cart).reduce((sum, [itemId, qty]) => {
      const item = menuItems.find((m) => m.id === itemId);
      if (!item) return sum;
      const isRescue = getRescueStatus(item).length > 0;
      const price = isRescue ? item.price * 0.85 : item.price;
      return sum + price * qty;
    }, 0);
  };

  const getCartItemsCount = () => {
    return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  };

  // Submit Order
  const handlePlaceOrder = async () => {
    if (!selectedTable) {
      setOrderError("Please select your table number.");
      showToast("Please select your table number.", "error");
      return;
    }
    setOrderError("");
    setPlacing(true);

    const orderItems = Object.entries(cart).map(([menuItemId, quantity]) => ({
      menuItemId,
      quantity,
    }));

    try {
      await placeOrder(selectedTable, customerId, orderItems);
      setCart({});
      setCartOpen(false);
      showToast("Order ticket sent to kitchen! Stock deducted live.", "success");
      const tracker = document.getElementById("order-tracker");
      if (tracker) tracker.scrollIntoView({ behavior: "smooth" });
    } catch (err: any) {
      console.error(err);
      const msg = err.message || "Failed to place order. Check stock availability.";
      setOrderError(msg);
      showToast(msg, "error");
    } finally {
      setPlacing(false);
    }
  };

  // Handle AI Sous-Chef Chat
  const handleSendChat = async () => {
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setChatMessages((prev) => [...prev, { sender: "user", text: userText }]);
    setChatInput("");
    setAiLoading(true);

    try {
      const aiReply = await callAISousChef(userText, customerId);
      setChatMessages((prev) => [...prev, { sender: "ai", text: aiReply }]);
    } catch (err: any) {
      setChatMessages((prev) => [...prev, { sender: "ai", text: err.message || "Sorry, I ran into an error processing that. Please try again." }]);
    } finally {
      setAiLoading(false);
    }
  };

  // Handle Feedback Loops
  const handleFeedback = async (menuItemId: string, rating: "up" | "down") => {
    try {
      await submitFeedback(customerId, menuItemId, rating);
      setRatedDishes((prev) => new Set([...prev, menuItemId]));
      refreshPreferences();
      showToast(rating === "up" ? "Dish liked! Taste profile updated." : "Dish feedback recorded.", "info");
    } catch (err) {
      console.error(err);
    }
  };

  // Smart Table Booking via optimizer (Task 4)
  const handleBookTable = async () => {
    if (!bookingName.trim()) { setBookingError("Please enter your name."); showToast("Please enter your name.", "error"); return; }
    setBookingError("");
    setBookingLoading(true);
    setBookingResult(null);
    try {
      const res = await fetch("/api/tables/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: bookingName.trim(), partySize: bookingParty, timeSlot: bookingSlot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Booking failed.");
      setBookingResult({ tableNumber: data.table.tableNumber, tableId: data.table.id });
      setSelectedTable(String(data.table.tableNumber));
      showToast(`Table ${data.table.tableNumber} assigned by optimizer!`, "success");
    } catch (err: any) {
      const msg = err.message || "Could not assign a table. Please try again.";
      setBookingError(msg);
      showToast(msg, "error");
    } finally {
      setBookingLoading(false);
    }
  };

  // Categories
  const categories = ["All", ...Array.from(new Set(menuItems.map((item) => item.category)))];

  // Filtered Items
  const filteredMenuItems = menuItems.filter((item) => {
    const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
    const isRescue = getRescueStatus(item).length > 0;
    return matchesCategory && !isRescue;
  });

  const rescueMenuItems = menuItems.filter((item) => {
    return getRescueStatus(item).length > 0;
  });

  // Render stocking gauge helper
  const renderRecipeStockBars = (recipeMap: any[]) => {
    if (!recipeMap || recipeMap.length === 0) return null;
    return (
      <div className="mt-3 space-y-1 bg-stone-900/60 p-2 rounded border border-stone-800">
        <span className="text-[9px] uppercase font-bold text-stone-400 tracking-wider">Kitchen Stocks:</span>
        {recipeMap.map((recipeItem) => {
          const ing = ingredients.find(i => i.id === recipeItem.ingredientId);
          if (!ing) return null;
          
          const maxCap = Math.max(ing.lowStockThreshold * 3, 20);
          const percent = Math.min((ing.currentStock / maxCap) * 100, 100);
          const isLow = ing.currentStock <= ing.lowStockThreshold;

          return (
            <div key={recipeItem.ingredientId} className="flex items-center justify-between gap-2 text-[9px] text-stone-300">
              <span className="truncate max-w-[80px]">{ing.name}</span>
              <div className="flex-1 h-1.5 bg-stone-950 rounded-full overflow-hidden border border-stone-800">
                <div 
                  className={`h-full rounded-full transition-all duration-300 ${isLow ? "bg-brand-primary animate-pulse" : "bg-brand-secondary"}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="tabular-nums font-mono text-[8px] text-stone-400">
                {ing.currentStock} {ing.unit}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col relative pb-20 bg-brand-deep">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-brand-dark/95 border-b-2 border-brand-primary px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-primary flex items-center justify-center shadow-md">
            <UtensilsCrossed className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight font-display text-white flex items-center gap-1.5">
              PLATEIQ <span className="text-xs font-normal px-2 py-0.5 rounded bg-brand-secondary/10 text-brand-secondary border border-brand-secondary/20 uppercase font-mono">Bistro</span>
            </h1>
            <span className="text-[10px] text-stone-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-pulse" />
              Real-time Ledger Connected
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <a
            href="/login"
            className="text-xs font-semibold text-stone-300 hover:text-white transition-colors px-3 py-1.5 rounded border border-stone-700 hover:bg-stone-850"
          >
            Staff Dashboard
          </a>

          {/* Cart Indicator */}
          <button
            onClick={() => setCartOpen(true)}
            className="relative p-2 rounded border border-stone-700 bg-stone-900 hover:bg-stone-800 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <ShoppingCart className="w-5 h-5 text-brand-secondary" />
            {getCartItemsCount() > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-brand-primary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border border-brand-deep">
                {getCartItemsCount()}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── SMART TABLE BOOKING FORM (Task 4) ─────────────── */}
      <div className="max-w-7xl mx-auto w-full px-6 pt-6">
        <div className="bg-brand-dark border border-stone-700 rounded-xl p-5 shadow-md">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-brand-secondary" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-display">Reserve Your Table</h2>
            <span className="ml-auto text-[9px] font-mono text-brand-secondary border border-brand-secondary/30 px-2 py-0.5 rounded bg-brand-secondary/10 uppercase">Smart Optimizer</span>
          </div>

          {bookingResult ? (
            <div className="flex items-center justify-between bg-brand-secondary/10 border border-brand-secondary/30 rounded-lg p-4">
              <div>
                <p className="text-brand-secondary font-bold text-sm">✓ Table {bookingResult.tableNumber} Assigned!</p>
                <p className="text-stone-400 text-xs mt-0.5">Your table is reserved. Add items to your cart to place your order.</p>
              </div>
              <button
                onClick={() => { setBookingResult(null); setBookingName(""); }}
                className="text-[10px] text-stone-400 hover:text-white border border-stone-700 px-3 py-1.5 rounded cursor-pointer transition-all"
              >
                Book Again
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider">Your Name</label>
                <input
                  type="text"
                  value={bookingName}
                  onChange={(e) => setBookingName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2 text-xs text-white placeholder:text-stone-600 focus:outline-none focus:border-brand-secondary"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider">Party Size</label>
                <select
                  value={bookingParty}
                  onChange={(e) => setBookingParty(e.target.value)}
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2 text-xs text-white"
                >
                  {[1,2,3,4,5,6,7,8].map(n => (
                    <option key={n} value={n}>{n} {n === 1 ? "guest" : "guests"}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider">Time Slot</label>
                <select
                  value={bookingSlot}
                  onChange={(e) => setBookingSlot(e.target.value)}
                  className="w-full bg-stone-900 border border-stone-700 rounded p-2 text-xs text-white"
                >
                  <option value="now">Right Now (Walk-in)</option>
                  <option value="12:00">12:00 PM</option>
                  <option value="13:00">1:00 PM</option>
                  <option value="14:00">2:00 PM</option>
                  <option value="19:00">7:00 PM</option>
                  <option value="20:00">8:00 PM</option>
                  <option value="21:00">9:00 PM</option>
                </select>
              </div>
              <button
                onClick={handleBookTable}
                disabled={bookingLoading}
                className="bg-brand-secondary hover:bg-[#4a7c59] disabled:bg-stone-700 text-white font-bold py-2 px-4 rounded text-xs transition-all cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {bookingLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {bookingLoading ? "Finding best table..." : "Check & Assign Table"}
              </button>
            </div>
          )}

          {bookingError && (
            <p className="mt-3 text-[10px] text-brand-primary bg-brand-primary/10 border border-brand-primary/20 p-2 rounded">{bookingError}</p>
          )}
        </div>
      </div>

      {/* Main Body Grid */}
      <div className="max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left 2 Columns: Chalkboard Menu */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Sustainability ESG Widget */}
          <section className="bg-brand-dark border-2 border-stone-700 rounded-xl p-5 relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand-accent" />
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-brand-secondary text-[10px] font-bold uppercase tracking-wider font-mono">
                <UtensilsCrossed className="w-3.5 h-3.5" />
                <span>Zero-Waste Operations</span>
              </div>
              <h2 className="text-xl font-bold font-display text-white">Every Gram Rescued</h2>
              <p className="text-xs text-stone-400 max-w-lg leading-relaxed">
                We adjust discounts dynamically for dishes using surplus ingredients, helping prevent food waste. Our ledger logs every gram saved.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-center p-3 bg-stone-900/60 rounded border border-stone-800">
                <span className="block text-2xl font-extrabold text-brand-accent">14.5 kg</span>
                <span className="text-[8px] text-stone-400 uppercase tracking-wider font-bold">Waste Rescued</span>
              </div>
              <div className="text-center p-3 bg-stone-900/60 rounded border border-stone-800">
                <span className="block text-2xl font-extrabold text-brand-secondary">-12.8%</span>
                <span className="text-[8px] text-stone-400 uppercase tracking-wider font-bold">Waste Change</span>
              </div>
            </div>
          </section>

          {/* CHALKBOARD PANEL MENU */}
          <div className="chalkboard-panel rounded-xl p-6 sm:p-8">
            <div className="absolute top-0 right-0 left-0 h-1 bg-[#44403c]/20" />
            
            {/* Board Header */}
            <div className="text-center border-b-2 border-stone-700 pb-6 mb-8">
              <h2 className="text-3xl font-bold font-display text-white tracking-wide uppercase">Today's Menu Board</h2>
              <p className="text-xs text-stone-400 font-mono italic mt-1">Fresh ingredients & Real-time availability</p>
            </div>

            {/* Chef's Rescue Menu Section (surplus items) */}
            {menuItems.length === 0 ? (
              <div className="py-20 text-center space-y-4">
                <RefreshCw className="w-8 h-8 mx-auto text-brand-secondary animate-spin" />
                <p className="text-xs text-stone-400 font-mono italic">Polishing the chalkboard and preparing fresh ingredients...</p>
              </div>
            ) : (
              <>
                {rescueMenuItems.length > 0 && (
                  <div className="mb-10">
                    <div className="flex items-center justify-between border-b border-stone-800 pb-2.5 mb-6">
                      <h3 className="text-lg font-bold font-display text-brand-secondary uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" />
                        Chef's Rescue Specials
                      </h3>
                      <span className="text-[9px] uppercase font-mono bg-brand-primary/20 text-brand-primary px-2 py-0.5 rounded border border-brand-primary/30">
                        15% Off Applied
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {rescueMenuItems.map((item) => {
                        const discountedPrice = item.price * 0.85;
                        const surplusIngredients = getRescueStatus(item);
                        
                        return (
                          <div key={item.id} className="border border-stone-800 bg-[#262322] p-4 rounded-lg flex flex-col justify-between space-y-4">
                            <div className="flex gap-4">
                              <div className="w-20 h-20 shrink-0 rounded overflow-hidden relative flex items-center justify-center bg-stone-900 border border-stone-700" style={{fontSize: '2rem'}}>
                                {({'Starters':'🥗','Mains':'🍛','Breads':'🫓','Desserts':'🍮','Beverages':'🥛'} as Record<string,string>)[item.category] || '🍽️'}
                                <div className="absolute top-1 left-1 bg-brand-primary text-white font-bold text-[8px] px-1.5 py-0.5 rounded uppercase">
                                  Rescue
                                </div>
                              </div>

                              <div className="flex-1">
                                <div className="flex justify-between items-start">
                                  <h4 className="font-bold text-white text-sm">{item.name}</h4>
                                  <div className="text-right">
                                    <span className="block text-brand-secondary font-bold text-sm">{formatCurrency(discountedPrice)}</span>
                                    <span className="block text-stone-500 text-[10px] line-through">{formatCurrency(item.price)}</span>
                                  </div>
                                </div>
                                <p className="text-[11px] text-stone-400 line-clamp-2 mt-1 leading-relaxed">{item.description}</p>
                              </div>
                            </div>

                            {/* AI Sustainability Pitch */}
                            <div className="bg-stone-900/80 border border-stone-800 rounded p-2.5 flex gap-2 items-start">
                              <Sparkles className="w-3.5 h-3.5 text-brand-secondary shrink-0 mt-0.5" />
                              <p className="text-[10px] text-stone-300 italic leading-normal">
                                {loadingRescue[item.id] ? "Chef is writing pitch..." : rescueDescriptions[item.id] || "Calculating dynamic impact..."}
                              </p>
                            </div>

                            {renderRecipeStockBars(item.recipeMap)}

                            <div className="flex justify-between items-center pt-2">
                              <span className="text-[8px] bg-stone-900 border border-stone-800 px-2 py-0.5 rounded text-stone-400 uppercase font-mono">
                                Rescues: {surplusIngredients.join(", ")}
                              </span>
                              
                              <button
                                onClick={() => addToCart(item.id)}
                                disabled={!item.isAvailable}
                                className="bg-brand-primary hover:bg-[#a1402a] disabled:bg-stone-800 disabled:text-stone-600 text-white font-semibold text-xs py-1.5 px-3.5 rounded cursor-pointer disabled:cursor-not-allowed transition-all"
                              >
                                {item.isAvailable ? "Add to Order" : "Sold Out"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Regular Menu Section */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800 pb-3 mb-6">
                    <h3 className="text-lg font-bold font-display text-white uppercase tracking-wider">A La Carte</h3>

                    {/* Categories */}
                    <div className="flex flex-wrap gap-1">
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setSelectedCategory(cat)}
                          className={`px-3 py-1 rounded text-[10px] uppercase font-bold tracking-wider font-mono border transition-all cursor-pointer ${
                            selectedCategory === cat
                              ? "bg-brand-primary border-brand-primary text-white"
                              : "bg-stone-900 border-stone-800 text-stone-400 hover:text-white"
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filteredMenuItems.map((item) => (
                      <div key={item.id} className="border border-stone-800 bg-[#262322] p-4 rounded-lg flex flex-col justify-between space-y-4">
                        <div className="flex gap-4">
                          <div className="w-20 h-20 shrink-0 rounded overflow-hidden relative flex items-center justify-center bg-stone-900 border border-stone-700" style={{fontSize: '2rem'}}>
                            {({'Starters':'🥗','Mains':'🍛','Breads':'🫓','Desserts':'🍮','Beverages':'🥛'} as Record<string,string>)[item.category] || '🍽️'}
                            {!item.isAvailable && (
                              <div className="absolute inset-0 bg-black/75 flex items-center justify-center">
                                <span className="bg-brand-danger text-white font-bold text-[8px] uppercase tracking-wider py-0.5 px-1.5 rounded">
                                  Sold Out
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <h4 className="font-bold text-white text-sm">{item.name}</h4>
                              <span className="text-brand-secondary font-bold text-sm">{formatCurrency(item.price)}</span>
                            </div>
                            <p className="text-[11px] text-stone-400 line-clamp-2 mt-1 leading-relaxed">{item.description}</p>
                          </div>
                        </div>

                        {renderRecipeStockBars(item.recipeMap)}

                        <div className="flex justify-between items-center pt-2">
                          <span className={`text-[8px] font-mono uppercase tracking-wider flex items-center gap-1 ${
                            item.isAvailable ? "text-brand-secondary" : "text-brand-danger"
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${
                              item.isAvailable ? "bg-brand-secondary" : "bg-brand-danger"
                            }`} />
                            {item.isAvailable ? "Available" : "Stock Empty"}
                          </span>

                          <button
                            onClick={() => addToCart(item.id)}
                            disabled={!item.isAvailable}
                            className="bg-brand-primary hover:bg-[#a1402a] disabled:bg-stone-800 disabled:text-stone-600 text-white font-semibold text-xs py-1.5 px-3.5 rounded cursor-pointer disabled:cursor-not-allowed transition-all"
                          >
                            {item.isAvailable ? "Add to Order" : "Sold Out"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

          </div>
        </div>

        {/* Right 1 Column: Tactile Sidebar Elements */}
        <div className="space-y-8 lg:col-span-1">

          {/* 📜 "Ask the Chef" Pinned Parchment Pad (AI Chat widget inline!) */}
          <section className="parchment-ticket parchment-ticket-jagged rounded-t-lg p-5 flex flex-col space-y-4">
            <div className="border-b-2 border-stone-300 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-brand-primary" />
                <h3 className="font-bold font-display text-sm uppercase tracking-wide text-brand-primary">Ask the Chef</h3>
              </div>
              <span className="text-[8px] font-mono bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded font-bold uppercase">
                Gemini AI
              </span>
            </div>

            {/* Chat Messages */}
            <div className="h-56 overflow-y-auto space-y-3 p-1 rounded bg-[#f5efe4] border border-stone-200 text-[11px] leading-relaxed">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] p-2 rounded shadow-xs ${
                    msg.sender === "user" 
                      ? "bg-brand-primary text-white rounded-tr-none" 
                      : "bg-[#faf9f6] border border-stone-200 text-stone-800 rounded-tl-none"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#faf9f6] border border-stone-200 p-2 rounded text-stone-500 flex items-center gap-1.5 animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Chef is checking stock...
                  </div>
                </div>
              )}
            </div>

            {/* Quick Prompts */}
            <div className="flex gap-1 overflow-x-auto pb-1">
              {[
                "Suggest something spicy!",
                "Vegetarian dishes",
                "Dishes under ₹150",
              ].map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => setChatInput(p)}
                  className="px-2 py-0.5 bg-stone-200 hover:bg-stone-300 text-stone-700 border border-stone-300 rounded-full text-[9px] whitespace-nowrap cursor-pointer transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Send Input */}
            <div className="flex gap-1">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                placeholder="Ask about ingredients or dishes..."
                className="flex-1 bg-[#faf9f6] border border-stone-300 rounded px-2.5 py-1.5 text-xs text-stone-850 focus:outline-none focus:border-brand-primary"
              />
              <button
                onClick={handleSendChat}
                className="bg-brand-primary hover:bg-[#a1402a] text-white px-2.5 py-1.5 rounded cursor-pointer transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </section>

          {/* Table Reservation & Walk-in */}
          <section className="parchment-ticket rounded-lg p-5 space-y-4">
            <div className="border-b-2 border-stone-300 pb-2">
              <h3 className="font-bold font-display text-sm uppercase tracking-wide text-stone-850">Book a Table</h3>
              <p className="text-[10px] text-stone-500 font-mono">Immediate booking or reservation</p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const name = formData.get("name") as string;
                const size = formData.get("partySize") as string;
                const slot = formData.get("timeSlot") as string;

                if (!name || !size || !slot) return;

                setPlacing(true);
                fetch("/api/tables/reserve", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ customerName: name, partySize: size, timeSlot: slot }),
                })
                  .then((res) => res.json())
                  .then((data) => {
                    if (data.error) {
                      alert(data.error);
                    } else {
                      alert(`Successfully reserved Table ${data.table.tableNumber} under name: ${name}!`);
                      e.currentTarget.reset();
                    }
                  })
                  .catch(() => alert("Failed to book table. Please check table capacities."))
                  .finally(() => setPlacing(false));
              }}
              className="space-y-3 text-xs"
            >
              <div className="space-y-1">
                <label className="block font-bold text-stone-700">Customer Name</label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="E.g., Saatvik"
                  className="w-full bg-white border border-stone-300 rounded p-1.5 text-stone-800 focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block font-bold text-stone-700">Party Size</label>
                  <select name="partySize" required className="w-full bg-white border border-stone-300 rounded p-1.5 text-stone-800">
                    <option value="2">2 Guests</option>
                    <option value="4">4 Guests</option>
                    <option value="6">6 Guests</option>
                    <option value="8">8 Guests</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-stone-700">Time Slot</label>
                  <select name="timeSlot" required className="w-full bg-white border border-stone-300 rounded p-1.5 text-stone-800">
                    <option value="now">Now (Walk-in)</option>
                    <option value="18:00">18:00</option>
                    <option value="19:30">19:30</option>
                    <option value="21:00">21:00</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={placing}
                className="w-full bg-brand-primary hover:bg-[#a1402a] text-white font-semibold py-2 rounded text-xs transition-colors cursor-pointer flex items-center justify-center gap-1"
              >
                {placing ? "Checking..." : "Confirm Reservation"}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </form>
          </section>

          {/* 🧾 Live Order Tracker (Receipt card!) */}
          {customerOrders.length > 0 && (
            <section id="order-tracker" className="parchment-ticket parchment-ticket-jagged rounded-t-lg p-5 space-y-4">
              <div className="border-b-2 border-stone-300 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-brand-primary animate-pulse" />
                  <h3 className="font-bold font-display text-sm uppercase tracking-wide text-brand-primary">Live Orders</h3>
                </div>
                <span className="text-[8px] font-mono bg-brand-primary/10 text-brand-primary px-1.5 py-0.5 rounded font-bold uppercase">
                  Receipt
                </span>
              </div>

              <div className="space-y-5 divide-y divide-stone-200">
                {customerOrders.map((order) => {
                  const estReady = order.estimatedReadyAt ? new Date(order.estimatedReadyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "N/A";
                  const elapsed = (Date.now() - new Date(order.createdAt).getTime()) / 60000;
                  const duration = 12; // average
                  const progress = Math.min((elapsed / duration) * 100, 100);

                  return (
                    <div key={order.id} className="pt-4 first:pt-0 space-y-3 text-xs text-stone-800">
                      <div className="flex justify-between items-start font-mono">
                        <div>
                          <span className="block font-bold">Ticket: #{order.id.slice(-4).toUpperCase()}</span>
                          <span className="text-[9px] text-stone-500">Table {order.tableId}</span>
                        </div>
                        <span className="px-2 py-0.5 bg-stone-200 border border-stone-300 text-stone-800 rounded text-[9px] uppercase font-bold tracking-wider">
                          {order.status}
                        </span>
                      </div>

                      {/* Item Roster */}
                      <ul className="space-y-1 font-mono text-[10px] text-stone-600 border-y border-dashed border-stone-300 py-2">
                        {order.items.map((item, idx) => (
                          <li key={idx} className="flex justify-between">
                            <span>{item.quantity}x {item.name}</span>
                            <span>{formatCurrency(item.price * item.quantity)}</span>
                          </li>
                        ))}
                      </ul>

                      {/* ETA Tracker */}
                      {order.status !== "served" && order.status !== "billed" && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] font-mono text-stone-500">
                            <span>ETA: {estReady}</span>
                            <span>Progress</span>
                          </div>
                          <div className="w-full h-2 bg-stone-200 rounded-full overflow-hidden border border-stone-300">
                            <div 
                              className="h-full bg-brand-primary transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Closed Loop Taste Feedback (thumbs rating stamps!) */}
                      {(order.status === "served" || order.status === "billed") && (
                        <div className="bg-[#f0e8db] border border-stone-200 p-2.5 rounded space-y-2">
                          <div className="text-[10px] font-bold text-stone-700 flex items-center gap-1">
                            <ThumbsUp className="w-3.5 h-3.5 text-brand-primary" />
                            Rate items to guide the Chef:
                          </div>

                          <div className="space-y-1.5">
                            {order.items.map((item) => {
                              const rated = ratedDishes.has(item.menuItemId);
                              return (
                                <div key={item.menuItemId} className="flex items-center justify-between text-[10px]">
                                  <span className="truncate max-w-[120px] text-stone-800">{item.name}</span>
                                  {rated ? (
                                    <span className="text-brand-accent font-bold uppercase text-[9px] flex items-center gap-0.5">
                                      <Check className="w-3 h-3" /> Stamped
                                    </span>
                                  ) : (
                                    <div className="flex gap-1">
                                      <button
                                        onClick={() => handleFeedback(item.menuItemId, "up")}
                                        className="p-1 hover:bg-stone-300 rounded border border-stone-300 text-stone-600 hover:text-stone-900 cursor-pointer"
                                      >
                                        <ThumbsUp className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleFeedback(item.menuItemId, "down")}
                                        className="p-1 hover:bg-stone-300 rounded border border-stone-300 text-stone-600 hover:text-stone-900 cursor-pointer"
                                      >
                                        <ThumbsDown className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

        </div>
      </div>

      {/* Cart Modal Slideover */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-brand-dark border-l-2 border-brand-primary h-full p-6 flex flex-col justify-between shadow-2xl animate-slide-up">
            <div className="space-y-6 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-stone-800 pb-4">
                <div className="flex items-center gap-2 text-white">
                  <ShoppingCart className="w-5 h-5 text-brand-secondary" />
                  <h2 className="text-xl font-bold font-display uppercase tracking-wider">Your Order List</h2>
                </div>
                <button onClick={() => setCartOpen(false)} className="text-stone-400 hover:text-white cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {Object.keys(cart).length === 0 ? (
                <div className="text-center py-20 space-y-3 text-stone-500">
                  <ShoppingCart className="w-12 h-12 mx-auto text-stone-700" />
                  <p className="text-xs">Your order card is empty.</p>
                </div>
              ) : (
                <div className="space-y-4 divide-y divide-stone-800">
                  {Object.entries(cart).map(([itemId, qty]) => {
                    const item = menuItems.find((m) => m.id === itemId);
                    if (!item) return null;
                    const isRescue = getRescueStatus(item).length > 0;
                    const itemPrice = isRescue ? item.price * 0.85 : item.price;

                    return (
                      <div key={itemId} className="flex items-center justify-between pt-4 first:pt-0">
                        <div>
                          <h4 className="font-bold text-white text-xs">{item.name}</h4>
                          <span className="text-[10px] text-brand-secondary font-mono">{formatCurrency(itemPrice)} each</span>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => removeFromCart(itemId)}
                            className="w-6 h-6 rounded border border-stone-700 text-stone-400 hover:text-white flex items-center justify-center text-xs hover:bg-stone-900 cursor-pointer"
                          >
                            -
                          </button>
                          <span className="text-xs font-mono font-bold text-white">{qty}</span>
                          <button
                            onClick={() => addToCart(itemId)}
                            className="w-6 h-6 rounded border border-stone-700 text-stone-400 hover:text-white flex items-center justify-center text-xs hover:bg-stone-900 cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Checkout Options */}
            {Object.keys(cart).length > 0 && (
              <div className="border-t border-stone-850 pt-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-stone-400">
                    <span>Tax (8%)</span>
                    <span>{formatCurrency(getCartTotal() * 0.08)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-stone-400">
                    <span>Service Charge (10%)</span>
                    <span>{formatCurrency(getCartTotal() * 0.10)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-white border-t border-dashed border-stone-800 pt-2">
                    <span>Total Amount</span>
                    <span className="text-brand-secondary">{formatCurrency(getCartTotal() * 1.18)}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-wider">Select Table</label>
                    <select
                      value={selectedTable}
                      onChange={(e) => setSelectedTable(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-700 rounded p-2 text-xs text-white"
                    >
                      <option value="">-- Choose Your Table --</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.tableNumber}>
                          Table {t.tableNumber} (Capacity: {t.capacity})
                        </option>
                      ))}
                    </select>
                  </div>

                  {orderError && (
                    <p className="text-[10px] text-brand-primary bg-brand-primary/10 border border-brand-primary/20 p-2 rounded">
                      {orderError}
                    </p>
                  )}

                  <button
                    onClick={handlePlaceOrder}
                    disabled={placing}
                    className="w-full bg-brand-primary hover:bg-[#a1402a] disabled:bg-stone-800 text-white font-bold py-2 rounded text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    {placing ? "Submitting Ticket..." : "Send Ticket to Kitchen"}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
