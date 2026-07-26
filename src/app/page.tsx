"use client";

import { useState, useEffect, useCallback } from "react";
import { getCustomerSessionId } from "@/lib/session";
import { subscribeToMenu, MenuItem } from "@/services/menuService";
import { subscribeToIngredients, Ingredient } from "@/services/inventoryService";
import { subscribeToTables, RestaurantTable, reserveTable } from "@/services/tableService";
import { placeOrder, subscribeToCustomerOrders, Order } from "@/services/orderService";
import { submitFeedback, getCustomerPreferences, CustomerPreferences } from "@/services/feedbackService";
import { callAISousChef, generateRescueDescription } from "@/services/aiService";
import { 
  Sparkles, Leaf, ShoppingCart, Clock, Check, ThumbsUp, ThumbsDown, 
  Send, ChevronRight, X, AlertTriangle, ArrowRight, ClipboardList, Info, RefreshCw
} from "lucide-react";

export default function CustomerPage() {
  const [customerId, setCustomerId] = useState("");
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
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ sender: "user" | "ai"; text: string }[]>([
    { sender: "ai", text: "Hello! I am your AI Sous-Chef. Ask me anything about the menu, dietary options, or what matches your taste!" }
  ]);
  const [aiLoading, setAiLoading] = useState(false);

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
      // Scroll to order tracker
      const tracker = document.getElementById("order-tracker");
      if (tracker) tracker.scrollIntoView({ behavior: "smooth" });
    } catch (err: any) {
      console.error(err);
      setOrderError(err.message || "Failed to place order. Check stock availability.");
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
    } catch (err) {
      setChatMessages((prev) => [...prev, { sender: "ai", text: "Sorry, I ran into an error processing that. Please try again." }]);
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
    } catch (err) {
      console.error(err);
    }
  };

  // Categories
  const categories = ["All", ...Array.from(new Set(menuItems.map((item) => item.category)))];

  // Filtered Items
  const filteredMenuItems = menuItems.filter((item) => {
    const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
    const isRescue = getRescueStatus(item).length > 0;
    return matchesCategory && !isRescue; // Keep rescue menu separate
  });

  const rescueMenuItems = menuItems.filter((item) => {
    return getRescueStatus(item).length > 0;
  });

  return (
    <div className="flex-1 flex flex-col relative pb-20">
      {/* Decorative glows */}
      <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-0 w-[30rem] h-[30rem] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-brand-deep/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight font-display text-white flex items-center gap-1.5">
              PlateIQ <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Bistro</span>
            </h1>
            <span className="text-[10px] text-gray-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Real-time Ledger Connected
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <a
            href="/login"
            className="text-xs font-semibold text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/5 hover:border-white/10"
          >
            Staff Dashboard
          </a>

          {/* Cart Indicator */}
          <button
            onClick={() => setCartOpen(true)}
            className="relative p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <ShoppingCart className="w-5 h-5 text-indigo-400" />
            {getCartItemsCount() > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border border-brand-deep animate-bounce">
                {getCartItemsCount()}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="max-w-7xl mx-auto w-full px-6 py-8 space-y-12">
        {/* Sustainability Dashboard Widget (ESG narrartive) */}
        <section className="glass-panel rounded-2xl p-6 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl border border-white/5">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-emerald-500 to-cyan-500" />
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
              <Leaf className="w-4 h-4" />
              <span>Waste Prevention Dashboard</span>
            </div>
            <h2 className="text-2xl font-bold font-display text-white">Every Bite Counts</h2>
            <p className="text-sm text-gray-400 max-w-xl">
              PlateIQ automatically computes dynamic discounts for menu items whose ingredients are in fresh surplus, cutting food waste. Our ledger tracks every single gram saved.
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-center p-4 bg-white/5 rounded-xl border border-white/5">
              <span className="block text-3xl font-extrabold text-emerald-400">14.5 kg</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Food Waste Rescued</span>
            </div>
            <div className="text-center p-4 bg-white/5 rounded-xl border border-white/5">
              <span className="block text-3xl font-extrabold text-cyan-400">-12.8%</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Kitchen Waste Today</span>
            </div>
          </div>
        </section>

        {/* Dynamic Rescue Menu (waste-reduction dynamic pricing) */}
        {rescueMenuItems.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Leaf className="w-5 h-5 text-emerald-400" />
                <h2 className="text-2xl font-extrabold font-display text-white">Chef's Rescue Menu</h2>
              </div>
              <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 font-medium">
                15% OFF — Surplus Pricing Applied
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {rescueMenuItems.map((item) => {
                const discountedPrice = item.price * 0.85;
                const surplusIngredients = getRescueStatus(item);
                
                return (
                  <div key={item.id} className="glass-panel glass-panel-interactive rounded-2xl overflow-hidden shadow-lg border border-white/5 flex flex-col sm:flex-row">
                    <div className="relative w-full sm:w-44 h-44 shrink-0 bg-gray-800">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      <div className="absolute top-2 left-2 bg-emerald-500/90 text-white font-bold text-xs px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-md">
                        <Leaf className="w-3.5 h-3.5" />
                        <span>Rescue</span>
                      </div>
                    </div>

                    <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex justify-between items-start gap-4">
                          <h3 className="font-bold text-lg text-white">{item.name}</h3>
                          <div className="text-right">
                            <span className="block text-emerald-400 font-extrabold text-lg">${discountedPrice.toFixed(2)}</span>
                            <span className="block text-gray-500 text-xs line-through">${item.price.toFixed(2)}</span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-2 line-clamp-2">{item.description}</p>
                      </div>

                      {/* AI dynamic Description Tagline */}
                      <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3 flex gap-2 items-start">
                        <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                        <div className="text-[11px] text-indigo-300 italic">
                          {loadingRescue[item.id] ? "Generating eco-pitch..." : rescueDescriptions[item.id] || "Calculating carbon offset..."}
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2">
                        <span className="text-[10px] bg-white/5 px-2 py-1 rounded-md text-gray-400 font-medium border border-white/5">
                          Rescuing: {surplusIngredients.join(", ")}
                        </span>
                        
                        <button
                          onClick={() => addToCart(item.id)}
                          disabled={!item.isAvailable}
                          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-600 font-semibold text-xs py-2 px-4 rounded-xl transition-all shadow-md shadow-emerald-600/10 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {item.isAvailable ? "Add to Order" : "Sold Out"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Regular Menu */}
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <h2 className="text-2xl font-extrabold font-display text-white">Our Menu</h2>

            {/* Category Filter */}
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-1.5 rounded-xl font-medium text-xs border transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20"
                      : "bg-white/5 border-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredMenuItems.map((item) => (
              <div key={item.id} className="glass-panel glass-panel-interactive rounded-2xl overflow-hidden shadow-lg border border-white/5 flex flex-col sm:flex-row">
                <div className="relative w-full sm:w-40 h-40 shrink-0 bg-gray-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                  {!item.isAvailable && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center">
                      <span className="bg-rose-500/90 text-white font-bold text-[10px] uppercase tracking-wider py-1 px-2.5 rounded-full border border-rose-400/20 shadow-md">
                        Sold Out
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex justify-between items-start gap-4">
                      <h3 className="font-bold text-lg text-white">{item.name}</h3>
                      <span className="text-indigo-400 font-extrabold text-lg">${item.price.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-2 line-clamp-2">{item.description}</p>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <span className={`text-[10px] font-semibold flex items-center gap-1.5 ${
                      item.isAvailable ? "text-emerald-400" : "text-rose-400"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        item.isAvailable ? "bg-emerald-500" : "bg-rose-500"
                      }`} />
                      {item.isAvailable ? "Ingredients in Stock" : "Sold Out (Stock Replenishment Required)"}
                    </span>

                    <button
                      onClick={() => addToCart(item.id)}
                      disabled={!item.isAvailable}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-600 font-semibold text-xs py-2 px-4 rounded-xl transition-all shadow-md shadow-indigo-600/10 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {item.isAvailable ? "Add to Order" : "Unavailable"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Live Order Tracker & Closed Loop Feedback */}
        {customerOrders.length > 0 && (
          <section id="order-tracker" className="space-y-6">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400 animate-pulse" />
              <h2 className="text-2xl font-extrabold font-display text-white">Live Order Status</h2>
            </div>

            <div className="space-y-6">
              {customerOrders.map((order) => {
                const isCompleted = order.status === "billed" || order.status === "served";
                const date = order.createdAt ? new Date(order.createdAt) : new Date();
                const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                // ETA computation
                const etaDate = order.estimatedReadyAt ? new Date(order.estimatedReadyAt) : null;
                const etaStr = etaDate ? etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Calculating...";

                return (
                  <div key={order.id} className="glass-panel rounded-2xl p-6 shadow-xl border border-white/5 space-y-6 relative overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                      <div>
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Order ID: #{order.id.slice(0, 8)}</span>
                        <h3 className="font-bold text-white mt-0.5">Table {order.tableId}</h3>
                      </div>
                      
                      <div className="text-right">
                        <span className="text-sm font-semibold text-gray-400">Placed: {timeStr}</span>
                        {!isCompleted && (
                          <span className="block text-xs text-indigo-300 font-medium">ETA: {etaStr}</span>
                        )}
                      </div>
                    </div>

                    {/* Progress visual tracker */}
                    <div className="grid grid-cols-5 text-center relative pt-2">
                      <div className="absolute top-[28px] left-[10%] right-[10%] h-0.5 bg-white/5 -z-10" />
                      
                      {/* Progress Line fill */}
                      <div 
                        className="absolute top-[28px] left-[10%] h-0.5 bg-gradient-to-r from-indigo-500 to-cyan-500 -z-10 transition-all duration-1000"
                        style={{
                          width: 
                            order.status === "placed" ? "0%" :
                            order.status === "preparing" ? "25%" :
                            order.status === "ready" ? "50%" :
                            order.status === "served" ? "75%" : "80%"
                        }}
                      />

                      {[
                        { key: "placed", label: "Placed" },
                        { key: "preparing", label: "Kitchen Prep" },
                        { key: "ready", label: "Ready" },
                        { key: "served", label: "Served" },
                        { key: "billed", label: "Billed" },
                      ].map((step, idx) => {
                        const statusWeights: { [key: string]: number } = { placed: 1, preparing: 2, ready: 3, served: 4, billed: 5 };
                        const isActive = statusWeights[order.status] >= statusWeights[step.key];
                        const isCurrent = order.status === step.key;

                        return (
                          <div key={step.key} className="flex flex-col items-center gap-2">
                            <div className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs transition-all shadow-md ${
                              isCurrent ? "bg-cyan-500 border-cyan-400 text-brand-deep animate-pulse shadow-cyan-500/20" :
                              isActive ? "bg-indigo-600 border-indigo-500 text-white" :
                              "bg-brand-deep border-white/5 text-gray-500"
                            }`}>
                              {idx + 1}
                            </div>
                            <span className={`text-[10px] font-semibold ${isActive ? "text-indigo-300" : "text-gray-500"}`}>{step.label}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Items List */}
                    <div className="bg-brand-deep/30 rounded-xl p-4 border border-white/5 space-y-3">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ordered Items</h4>
                      <div className="divide-y divide-white/5 space-y-2.5">
                        {order.items.map((item) => (
                          <div key={item.menuItemId} className="flex items-center justify-between pt-2.5 first:pt-0">
                            <div>
                              <span className="font-semibold text-sm text-white">{item.name}</span>
                              <span className="text-xs text-gray-500 ml-2">x{item.quantity}</span>
                            </div>
                            
                            {/* Thumbs Feedback loops */}
                            {(order.status === "ready" || order.status === "served" || order.status === "billed") ? (
                              <div className="flex items-center gap-2">
                                {ratedDishes.has(item.menuItemId) ? (
                                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5" /> Preference Saved
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-[10px] text-gray-500">Rate dish:</span>
                                    <button
                                      onClick={() => handleFeedback(item.menuItemId, "up")}
                                      className="p-1 rounded-md bg-white/5 border border-white/5 hover:border-emerald-500/50 hover:text-emerald-400 hover:bg-emerald-500/5 transition-colors cursor-pointer"
                                      title="Thumbs Up"
                                    >
                                      <ThumbsUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleFeedback(item.menuItemId, "down")}
                                      className="p-1 rounded-md bg-white/5 border border-white/5 hover:border-rose-500/50 hover:text-rose-400 hover:bg-rose-500/5 transition-colors cursor-pointer"
                                      title="Thumbs Down"
                                    >
                                      <ThumbsDown className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>

                      <div className="border-t border-white/5 pt-3 flex justify-between items-center text-xs">
                        <span className="text-gray-400">Total (Tax & Service Charge Incl.):</span>
                        <span className="font-bold text-indigo-400 text-sm">${order.totalAmount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Table Reservation Flow */}
        <section className="glass-panel rounded-2xl p-8 shadow-xl border border-white/5 space-y-6">
          <div className="flex items-center gap-2 border-b border-white/5 pb-4">
            <Clock className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold font-display text-white">Book a Table</h2>
          </div>
          
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target as any;
              const name = form.customerName.value;
              const size = parseInt(form.partySize.value, 10);
              const slot = form.timeSlot.value;
              if (!name || !size || !slot) return;
              
              setOrderError("");
              try {
                const res = await reserveTable(name, size, slot);
                alert(`Table ${res.table.tableNumber} assigned successfully! Reservation ID: ${res.reservationId}`);
                form.reset();
              } catch (err: any) {
                alert(err.message || "Failed to book table.");
              }
            }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end"
          >
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Guest Name</label>
              <input
                name="customerName"
                type="text"
                required
                placeholder="Your Name"
                className="block w-full px-4 py-3 bg-brand-deep/50 border border-white/5 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
              />
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Party Size</label>
              <input
                name="partySize"
                type="number"
                min="1"
                max="8"
                required
                placeholder="4"
                className="block w-full px-4 py-3 bg-brand-deep/50 border border-white/5 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Time Slot</label>
              <select
                name="timeSlot"
                required
                className="block w-full px-4 py-3 bg-brand-deep/50 border border-white/5 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
              >
                <option value="now" className="bg-brand-dark text-white">Walk-in Now (Assign occupancy)</option>
                <option value="18:00" className="bg-brand-dark text-white">18:00</option>
                <option value="19:00" className="bg-brand-dark text-white">19:00</option>
                <option value="20:00" className="bg-brand-dark text-white">20:00</option>
                <option value="21:00" className="bg-brand-dark text-white">21:00</option>
              </select>
            </div>

            <button
              type="submit"
              className="glow-btn bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-all shadow-md shadow-cyan-600/10 cursor-pointer flex items-center justify-center gap-2"
            >
              Check & Assign Table <ChevronRight className="w-4 h-4" />
            </button>
          </form>
        </section>
      </div>

      {/* Floating AI Sous-Chef Chat Drawer */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {chatOpen ? (
          <div className="w-[20rem] sm:w-[24rem] h-[28rem] glass-panel rounded-2xl shadow-2xl flex flex-col border border-white/10 animate-fade-in relative mb-4">
            {/* Header */}
            <div className="p-4 border-b border-white/5 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-t-2xl flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 animate-pulse" />
                <div>
                  <h3 className="font-bold text-sm">AI Sous-Chef</h3>
                  {preferences && (
                    <span className="block text-[8px] text-indigo-200">
                      Personalized for you (Likes: {preferences.likedCategories.slice(0, 2).join(", ") || "General"})
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-white/80 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] p-3 rounded-2xl border ${
                    msg.sender === "user" 
                      ? "bg-indigo-600 border-indigo-500 text-white" 
                      : "bg-white/5 border-white/5 text-gray-300"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 border border-white/5 p-3 rounded-2xl text-gray-500 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Consulting ledger availability...
                  </div>
                </div>
              )}
            </div>

            {/* Quick prompts */}
            <div className="p-2 border-t border-white/5 flex gap-1.5 overflow-x-auto shrink-0 bg-white/2">
              {[
                "Suggest something spicy!",
                "Vegetarian main dishes",
                "Starters under $10",
              ].map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setChatInput(p);
                  }}
                  className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/5 rounded-full text-[10px] text-indigo-300 hover:text-indigo-200 whitespace-nowrap cursor-pointer"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-white/5 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                placeholder="Ask about ingredients or recommendations..."
                className="flex-1 bg-brand-deep/50 border border-white/5 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white"
              />
              <button
                onClick={handleSendChat}
                className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-xl cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : null}

        <button
          onClick={() => setChatOpen(!chatOpen)}
          className="glow-btn bg-indigo-600 hover:bg-indigo-500 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/40 border border-indigo-400/20 cursor-pointer animate-pulse-glow"
        >
          <Sparkles className="w-6 h-6" />
        </button>
      </div>

      {/* Cart Modal Slideover */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-brand-dark border-l border-white/10 h-full p-6 flex flex-col justify-between shadow-2xl animate-slide-up">
            <div className="space-y-6 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-2 text-white">
                  <ShoppingCart className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-xl font-bold font-display">Your Order</h2>
                </div>
                <button onClick={() => setCartOpen(false)} className="text-gray-400 hover:text-white cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {Object.keys(cart).length === 0 ? (
                <div className="text-center py-20 space-y-4 text-gray-500">
                  <ClipboardList className="w-12 h-12 mx-auto text-gray-600" />
                  <p className="text-sm">Your order card is empty.</p>
                </div>
              ) : (
                <div className="space-y-4 divide-y divide-white/5">
                  {Object.entries(cart).map(([itemId, qty]) => {
                    const item = menuItems.find((m) => m.id === itemId);
                    if (!item) return null;
                    const isRescue = getRescueStatus(item).length > 0;
                    const itemPrice = isRescue ? item.price * 0.85 : item.price;

                    return (
                      <div key={itemId} className="flex items-center justify-between pt-4 first:pt-0">
                        <div>
                          <h4 className="font-bold text-sm text-white">{item.name}</h4>
                          <span className="text-xs text-indigo-400">${itemPrice.toFixed(2)} each</span>
                          {isRescue && (
                            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded ml-2 font-medium">Rescue Applied</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => removeFromCart(itemId)}
                            className="w-7 h-7 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer font-bold"
                          >
                            -
                          </button>
                          <span className="font-bold text-sm text-white">{qty}</span>
                          <button
                            onClick={() => addToCart(itemId)}
                            className="w-7 h-7 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer font-bold"
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

            {Object.keys(cart).length > 0 && (
              <div className="border-t border-white/5 pt-6 space-y-6">
                {/* Table & customer details */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Table Number</label>
                    <select
                      value={selectedTable}
                      onChange={(e) => setSelectedTable(e.target.value)}
                      required
                      className="block w-full px-4 py-3 bg-brand-deep border border-white/5 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm"
                    >
                      <option value="">Select your table...</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.tableNumber.toString()} className="bg-brand-dark text-white">
                          Table {t.tableNumber} (Seats {t.capacity}) - {t.status}
                        </option>
                      ))}
                    </select>
                  </div>

                  {orderError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{orderError}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center text-gray-400 font-semibold text-sm">
                  <span>Cart Subtotal:</span>
                  <span className="text-xl font-bold text-white">${getCartTotal().toFixed(2)}</span>
                </div>

                <button
                  onClick={handlePlaceOrder}
                  disabled={placing}
                  className="w-full glow-btn bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 px-4 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {placing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Running Transaction Ledger...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit Order to Ledger</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
