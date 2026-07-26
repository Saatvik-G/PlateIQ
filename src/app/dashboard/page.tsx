"use client";

import { useState, useEffect } from "react";
import { getDb } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { getStaffRecord, logout, StaffMember, subscribeToAuth } from "@/services/authService";
import { subscribeToAllOrders, updateOrderStatus, Order } from "@/services/orderService";
import { subscribeToIngredients, restockIngredient, updateIngredientSurplus, subscribeToNotifications, markNotificationRead, Ingredient, SystemNotification } from "@/services/inventoryService";
import { subscribeToTables, updateTableStatus, RestaurantTable } from "@/services/tableService";
import { subscribeToMenu, MenuItem, overrideMenuAvailability } from "@/services/menuService";
import { 
  ClipboardList, Users, Layers, TrendingUp, Bell, LogOut, CheckCircle, 
  AlertTriangle, RefreshCw, Plus, Calendar, AlertCircle, ShoppingBag, ShieldCheck
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [staffRecord, setStaffRecord] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(true);

  // Real-time states
  const [orders, setOrders] = useState<Order[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  
  // Dashboard UI states
  const [activeTab, setActiveTab] = useState<"orders" | "tables" | "inventory" | "staff" | "analytics">("orders");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  // Roster states
  const [staffRoster, setStaffRoster] = useState<any[]>([]);

  // Restock slider state
  const [restockValues, setRestockValues] = useState<{ [ingId: string]: string }>({});
  // Expiry date selector state
  const [expiryValues, setExpiryValues] = useState<{ [ingId: string]: string }>({});

  // Authentication check
  useEffect(() => {
    const unsubscribe = subscribeToAuth(async (user) => {
      if (!user) {
        router.push("/login");
      } else {
        setCurrentUser(user);
        const record = await getStaffRecord(user.uid);
        if (record) {
          setStaffRecord(record);
          // Set active tab based on role permissions
          if (record.role === "kitchen") {
            setActiveTab("orders");
          } else if (record.role === "waiter") {
            setActiveTab("orders");
          } else {
            setActiveTab("orders"); // Admins start at orders
          }
        }
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Real-time Subscriptions
  useEffect(() => {
    if (!staffRecord) return;

    const unsubOrders = subscribeToAllOrders(setOrders);
    const unsubIngredients = subscribeToIngredients(setIngredients);
    const unsubTables = subscribeToTables(setTables);
    const unsubMenu = subscribeToMenu(setMenuItems);
    const unsubNotifications = subscribeToNotifications(setNotifications);

    // Fetch staff list for roster
    getDocs(collection(getDb(), "staff")).then((snap: any) => {
      const roster: any[] = [];
      snap.forEach((doc: any) => {
        roster.push({ id: doc.id, ...doc.data() });
      });
      setStaffRoster(roster);
    });

    return () => {
      unsubOrders();
      unsubIngredients();
      unsubTables();
      unsubMenu();
      unsubNotifications();
    };
  }, [staffRecord]);

  // Handle Logout
  const handleLogout = async () => {
    try {
      await logout();
      router.push("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Order State Transition (placed -> preparing -> ready -> served -> billed)
  const handleTransitionOrder = async (orderId: string, currentStatus: string) => {
    setStatusMessage(null);
    setActionLoading(orderId);
    
    let nextStatus = "";
    if (currentStatus === "placed") nextStatus = "preparing";
    else if (currentStatus === "preparing") nextStatus = "ready";
    else if (currentStatus === "ready") nextStatus = "served";
    else if (currentStatus === "served") nextStatus = "billed";
    else return; // already completed

    try {
      await updateOrderStatus(orderId, nextStatus);
      setStatusMessage({ type: "success", text: `Order #${orderId.slice(-4).toUpperCase()} marked as ${nextStatus}!` });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: "error", text: err.message || "Failed to update order status." });
    } finally {
      setActionLoading(null);
    }
  };

  // Table Status change
  const handleTableStatus = async (tableId: string, status: "free" | "occupied" | "reserved") => {
    setStatusMessage(null);
    try {
      await updateTableStatus(tableId, status);
      setStatusMessage({ type: "success", text: `Table status updated successfully.` });
    } catch (err: any) {
      alert(err.message || "Failed to update table status.");
    }
  };

  // Restock Action
  const handleRestock = async (ingId: string) => {
    const qtyStr = restockValues[ingId];
    const qty = parseFloat(qtyStr);
    if (isNaN(qty) || qty <= 0) {
      alert("Please enter a valid positive number for restocking.");
      return;
    }

    setStatusMessage(null);
    setActionLoading(`restock_${ingId}`);

    try {
      await restockIngredient(ingId, qty);
      setRestockValues({ ...restockValues, [ingId]: "" });
      setStatusMessage({ type: "success", text: "Ledger updated: Stock replenished successfully!" });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: "error", text: err.message || "Failed to restock ingredient." });
    } finally {
      setActionLoading(null);
    }
  };

  // Update Surplus Toggle
  const handleUpdateSurplus = async (ingId: string, currentSurplus: boolean) => {
    const ing = ingredients.find(i => i.id === ingId);
    let expiryStr: string | null = null;
    if (ing?.expiryDate) {
      expiryStr = new Date(ing.expiryDate).toISOString().split("T")[0];
    }

    try {
      await updateIngredientSurplus(ingId, !currentSurplus, expiryStr);
    } catch (err: any) {
      alert(err.message || "Failed to update surplus status.");
    }
  };

  // Update Expiry Date
  const handleUpdateExpiry = async (ingId: string) => {
    const dateStr = expiryValues[ingId];
    if (!dateStr) {
      alert("Please select a valid expiry date.");
      return;
    }

    setStatusMessage(null);
    try {
      await updateIngredientSurplus(ingId, ingredients.find(i => i.id === ingId)?.isSurplus || false, dateStr);
      setStatusMessage({ type: "success", text: "Expiry date saved successfully." });
    } catch (err: any) {
      alert(err.message || "Failed to update expiry date.");
    }
  };

  // Menu Manual Availability Override
  const handleMenuOverride = async (itemId: string, currentAvailability: boolean) => {
    try {
      await overrideMenuAvailability(itemId, !currentAvailability);
    } catch (err: any) {
      alert(err.message || "Failed to override menu item availability.");
    }
  };

  if (loading || !staffRecord) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center bg-brand-deep">
        <RefreshCw className="w-8 h-8 text-brand-primary animate-spin" />
        <span className="text-xs text-stone-500 mt-3 font-semibold uppercase tracking-wider font-mono">Securing Terminal...</span>
      </div>
    );
  }

  const isKitchen = staffRecord.role === "kitchen";
  const isWaiter = staffRecord.role === "waiter";
  const isAdmin = staffRecord.role === "admin";

  const lowStockCount = ingredients.filter((i) => i.currentStock < i.lowStockThreshold).length;
  const activeOrders = orders.filter((o) => o.status !== "billed" && o.status !== "served");
  const occupiedTables = tables.filter((t) => t.status === "occupied").length;
  const todayRevenue = orders
    .filter((o) => o.status === "billed")
    .reduce((sum, o) => sum + o.totalAmount, 0);

  return (
    <div className="flex-1 flex flex-col bg-brand-deep">
      {/* Top Banner Navigation */}
      <header className="bg-brand-dark border-b-2 border-brand-primary px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-brand-primary flex items-center justify-center text-white font-bold font-display shadow-md">
            P
          </div>
          <div>
            <h1 className="font-bold text-white leading-tight font-display flex items-center gap-1.5 text-lg">
              PLATEIQ Control Terminal
              <span className="text-[9px] font-bold bg-brand-secondary/15 text-brand-secondary border border-brand-secondary/35 px-2 py-0.5 rounded font-mono flex items-center gap-1 uppercase">
                <ShieldCheck className="w-3.5 h-3.5" /> {staffRecord.role}
              </span>
            </h1>
            <p className="text-[10px] text-stone-400 font-mono">Operator: {staffRecord.name} ({staffRecord.email})</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a href="/" className="text-xs text-stone-400 hover:text-white transition-colors font-semibold">
            Customer Menu
          </a>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-brand-danger hover:text-[#d34734] font-semibold cursor-pointer border border-brand-danger/20 hover:border-brand-danger/40 px-3 py-1.5 rounded bg-brand-danger/5 transition-all"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </header>

      {/* Control center body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar tabs */}
        <aside className="w-full md:w-56 bg-brand-dark border-b md:border-b-0 md:border-r border-stone-850 p-4 flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible shrink-0 shadow-md">
          {[
            { id: "orders", label: "Kitchen Ticket Rail", icon: ClipboardList, allowed: true },
            { id: "tables", label: "Occupancy Grid", icon: Layers, allowed: isAdmin || isWaiter },
            { id: "inventory", label: "Stock Ledger", icon: TrendingUp, allowed: isAdmin || isKitchen },
            { id: "staff", label: "Staff Roster", icon: Users, allowed: isAdmin },
            { id: "analytics", label: "KPIs & Reports", icon: TrendingUp, allowed: isAdmin },
          ].map((tab) => {
            if (!tab.allowed) return null;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setStatusMessage(null);
                }}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                  activeTab === tab.id
                    ? "bg-brand-primary border-brand-primary text-white"
                    : "text-stone-400 border-transparent hover:text-white hover:bg-stone-900"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Dashboard Content area */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Status Message */}
          {statusMessage && (
            <div className={`p-4 rounded border animate-fade-in flex items-start gap-3 ${
              statusMessage.type === "success" 
                ? "bg-brand-accent/15 border-brand-accent/35 text-[#cca043]" 
                : "bg-brand-danger/10 border-brand-danger/20 text-brand-danger"
            }`}>
              {statusMessage.type === "success" ? (
                <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-brand-secondary" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-brand-danger" />
              )}
              <span className="text-xs font-bold font-mono">{statusMessage.text}</span>
            </div>
          )}

          {/* Quick Metrics Header Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-brand-dark border border-stone-850 p-4 rounded flex flex-col justify-between">
              <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider font-mono">Kitchen Load</span>
              <span className="text-xl font-extrabold text-white mt-1">{activeOrders.length} tickets</span>
            </div>
            
            <div className="bg-brand-dark border border-stone-850 p-4 rounded flex flex-col justify-between">
              <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider font-mono">Low Stocks</span>
              <span className={`text-xl font-extrabold mt-1 ${lowStockCount > 0 ? "text-brand-secondary animate-pulse" : "text-white"}`}>
                {lowStockCount} items
              </span>
            </div>
            
            <div className="bg-brand-dark border border-stone-850 p-4 rounded flex flex-col justify-between">
              <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider font-mono">Table Count</span>
              <span className="text-xl font-extrabold text-white mt-1">{occupiedTables} / {tables.length} full</span>
            </div>

            <div className="bg-brand-dark border border-stone-850 p-4 rounded flex flex-col justify-between">
              <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider font-mono">Total Sales</span>
              <span className="text-xl font-extrabold text-brand-secondary mt-1">{formatCurrency(todayRevenue)}</span>
            </div>
          </div>

          {/* TAB 1: KITCHEN TICKET RAIL */}
          {activeTab === "orders" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-stone-800 pb-3">
                <h2 className="text-lg font-bold text-white font-display uppercase tracking-wider">Kitchen Ticket Rail</h2>
                <span className="text-xs text-stone-400 font-mono italic">Orders slide and stamp as progress occurs</span>
              </div>

              {/* Brushed Metal Slide Rail Visual */}
              <div className="relative">
                <div className="ticket-rail rounded-t-lg">
                  {/* Clip nodes simulating hanging sliders */}
                  <div className="ticket-rail-clip left-10" />
                  <div className="ticket-rail-clip left-1/4" />
                  <div className="ticket-rail-clip left-2/4" />
                  <div className="ticket-rail-clip left-3/4" />
                  <div className="ticket-rail-clip right-10" />
                </div>

                {/* Horizontal Ticket Rail Slider */}
                <div className="flex flex-row overflow-x-auto gap-6 py-6 px-4 bg-stone-900/40 border-x border-b border-stone-800 rounded-b-lg scrollbar-thin">
                  {orders.filter(o => o.status !== "billed").length === 0 ? (
                    <div className="w-full py-16 text-center text-xs text-stone-500 italic font-mono border border-dashed border-stone-800 rounded">
                      Rail is empty — No active kitchen tickets.
                    </div>
                  ) : (
                    orders
                      .filter(o => o.status !== "billed")
                      .map((order) => {
                        const statusColors: { [key: string]: string } = {
                          placed: "text-brand-primary border-brand-primary bg-brand-primary/10",
                          preparing: "text-brand-secondary border-brand-secondary bg-brand-secondary/10",
                          ready: "text-brand-accent border-brand-accent bg-brand-accent/10",
                          served: "text-stone-500 border-stone-500 bg-stone-100",
                        };

                        return (
                          <div 
                            key={order.id} 
                            className="parchment-ticket parchment-ticket-jagged rounded-t w-64 shrink-0 flex flex-col justify-between p-4 h-96 shadow-xl animate-ticket-punch relative overflow-hidden"
                          >
                            {/* Stamped Overlay for served order */}
                            {order.status === "served" && (
                              <div className="absolute inset-0 flex items-center justify-center bg-white/20 backdrop-blur-3xs pointer-events-none z-10">
                                <div className="stamp-overlay animate-stamp text-brand-primary border-brand-primary uppercase text-2xl px-4 py-1.5 border-4 tracking-widest font-black rounded-lg">
                                  Served
                                </div>
                              </div>
                            )}

                            <div className="space-y-4">
                              {/* Ticket Header */}
                              <div className="flex justify-between items-start font-mono text-[10px] border-b border-stone-300 pb-2">
                                <div>
                                  <span className="block font-bold">Ticket: #{order.id.slice(-4).toUpperCase()}</span>
                                  <span className="block text-[8px] text-stone-500">
                                    {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="block font-bold text-stone-800">TABLE {order.tableId}</span>
                                  <span className="block text-[8px] text-stone-500">Sub: {formatCurrency(order.subtotal)}</span>
                                </div>
                              </div>

                              {/* Ticket Status Label */}
                              <div className="flex justify-between items-center">
                                <span className={`text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${statusColors[order.status] || "text-stone-600 border-stone-300"}`}>
                                  {order.status}
                                </span>
                                <span className="text-[11px] font-bold text-stone-900 font-mono">{formatCurrency(order.totalAmount)}</span>
                              </div>

                              {/* Roster of Items */}
                              <ul className="space-y-1 text-xs text-stone-750 font-mono border-t border-dashed border-stone-300 pt-3">
                                {order.items.map((item, idx) => (
                                  <li key={idx} className="flex justify-between">
                                    <span>{item.name}</span>
                                    <span className="font-bold">x{item.quantity}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Action Button */}
                            <div className="pt-4 border-t border-dashed border-stone-300">
                              <button
                                onClick={() => handleTransitionOrder(order.id, order.status)}
                                disabled={actionLoading === order.id}
                                className={`w-full py-2 px-3 rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 text-white ${
                                  order.status === "placed" ? "bg-brand-primary hover:bg-[#a1402a]" :
                                  order.status === "preparing" ? "bg-[#b08735] hover:bg-[#97732a]" :
                                  order.status === "ready" ? "bg-brand-accent hover:bg-[#2e4d35]" :
                                  "bg-stone-800 hover:bg-stone-700"
                                }`}
                              >
                                {actionLoading === order.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <span>
                                      {order.status === "placed" ? "Start Preparing" :
                                       order.status === "preparing" ? "Mark Ready" :
                                       order.status === "ready" ? "Mark Served" : "Finalize Bill"}
                                    </span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TABLES GRID */}
          {activeTab === "tables" && (
            <div className="space-y-6">
              <div className="border-b border-stone-800 pb-3">
                <h2 className="text-lg font-bold text-white font-display uppercase tracking-wider">Seating Occupancy Grid</h2>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                {tables.map((table) => {
                  const isActive = table.status === "occupied";
                  const isReserved = table.status === "reserved";

                  return (
                    <div 
                      key={table.id} 
                      className={`p-5 rounded border flex flex-col justify-between h-40 transition-all ${
                        isActive ? "border-brand-primary bg-brand-primary/10 text-brand-primary" :
                        isReserved ? "border-brand-secondary bg-brand-secondary/10 text-brand-secondary" :
                        "border-stone-850 bg-brand-dark"
                      }`}
                    >
                      <div>
                        <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider font-mono">Seats {table.capacity}</span>
                        <h3 className="text-2xl font-black mt-1 font-display text-white">Table {table.tableNumber}</h3>
                      </div>

                      <div className="space-y-2.5">
                        <span className={`inline-block text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                          isActive ? "bg-brand-primary/25 border-brand-primary text-white" :
                          isReserved ? "bg-brand-secondary/25 border-brand-secondary text-white" :
                          "bg-stone-900 border-stone-800 text-stone-400"
                        }`}>
                          {table.status}
                        </span>

                        <div className="flex gap-1.5">
                          {table.status !== "free" && (
                            <button
                              onClick={() => handleTableStatus(table.id, "free")}
                              className="text-[9px] font-bold uppercase text-brand-accent bg-stone-900 border border-stone-800 hover:border-brand-accent/50 px-2 py-1 rounded cursor-pointer transition-colors"
                            >
                              Free
                            </button>
                          )}
                          {table.status !== "occupied" && (
                            <button
                              onClick={() => handleTableStatus(table.id, "occupied")}
                              className="text-[9px] font-bold uppercase text-brand-primary bg-stone-900 border border-stone-800 hover:border-brand-primary/50 px-2 py-1 rounded cursor-pointer transition-colors"
                            >
                              Occupy
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: INVENTORY LEDGER */}
          {activeTab === "inventory" && (
            <div className="space-y-6">
              <div className="border-b border-stone-800 pb-3">
                <h2 className="text-lg font-bold text-white font-display uppercase tracking-wider">Ingredient Ledger</h2>
                <p className="text-xs text-stone-400 font-mono italic mt-1">Every restock appends to the ledger; low levels generate warnings.</p>
              </div>

              {/* Ingredients table in parchment style */}
              <div className="bg-[#fcfaf7] text-stone-850 rounded overflow-hidden border border-stone-300 shadow-md">
                <table className="min-w-full text-left text-xs divide-y divide-stone-300">
                  <thead className="bg-[#f0ece6] text-stone-700 uppercase tracking-wider font-bold">
                    <tr>
                      <th className="px-6 py-4">Ingredient Name</th>
                      <th className="px-6 py-4">Stock Level</th>
                      <th className="px-6 py-4">Threshold</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Restock Add</th>
                      <th className="px-6 py-4">Settings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 text-stone-850 font-mono">
                    {ingredients.map((ing) => {
                      const isLow = ing.currentStock < ing.lowStockThreshold;
                      const isOut = ing.currentStock === 0;

                      return (
                        <tr key={ing.id} className="hover:bg-stone-50 transition-colors">
                          <td className="px-6 py-4 font-sans font-bold text-stone-900">{ing.name}</td>
                          <td className="px-6 py-4">
                            {ing.currentStock.toFixed(1)} {ing.unit}
                          </td>
                          <td className="px-6 py-4 text-stone-500">
                            {ing.lowStockThreshold} {ing.unit}
                          </td>
                          <td className="px-6 py-4">
                            {isOut ? (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-brand-danger/10 text-brand-danger border border-brand-danger/30 uppercase tracking-wider">Out of Stock</span>
                            ) : isLow ? (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#b08735]/10 text-[#a2782b] border border-[#a2782b]/35 uppercase tracking-wider">Low Stock</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-brand-accent/15 text-brand-accent border border-brand-accent/35 uppercase tracking-wider">Healthy</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                placeholder="Qty"
                                value={restockValues[ing.id] || ""}
                                onChange={(e) => setRestockValues({ ...restockValues, [ing.id]: e.target.value })}
                                className="w-16 bg-white border border-stone-300 rounded px-2.5 py-1 text-xs text-stone-850 focus:outline-none"
                              />
                              <button
                                onClick={() => handleRestock(ing.id)}
                                disabled={actionLoading === `restock_${ing.id}`}
                                className="p-1.5 rounded bg-brand-primary hover:bg-[#a1402a] text-white cursor-pointer disabled:opacity-50"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 space-y-2 text-[10px]">
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1.5 font-bold text-stone-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={ing.isSurplus || false}
                                  onChange={() => handleUpdateSurplus(ing.id, ing.isSurplus || false)}
                                  className="rounded border-stone-300 bg-white text-brand-primary"
                                />
                                Surplus (15% Off Recipes)
                              </label>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <input
                                type="date"
                                value={expiryValues[ing.id] || (ing.expiryDate ? new Date(ing.expiryDate).toISOString().split("T")[0] : "")}
                                onChange={(e) => setExpiryValues({ ...expiryValues, [ing.id]: e.target.value })}
                                className="bg-white border border-stone-300 rounded px-1 py-0.5 text-[10px] text-stone-850 focus:outline-none"
                              />
                              <button
                                onClick={() => handleUpdateExpiry(ing.id)}
                                className="p-1 rounded bg-[#f0ece6] hover:bg-stone-300 border border-stone-300 text-[9px] font-bold text-stone-700 cursor-pointer"
                              >
                                Save Expiry
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Alert notifications sidebar list */}
              {notifications.length > 0 && (
                <div className="bg-brand-dark p-5 rounded border border-stone-850 space-y-4">
                  <div className="flex items-center gap-2 border-b border-stone-800 pb-2">
                    <Bell className="w-4 h-4 text-brand-secondary" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-white">Live Stock Alerts Log</h3>
                  </div>

                  <div className="space-y-3 max-h-40 overflow-y-auto">
                    {notifications.filter(n => !n.read).map((notif) => (
                      <div key={notif.id} className="p-3 rounded bg-brand-danger/10 border border-brand-danger/25 flex items-start justify-between gap-4 text-[11px]">
                        <div className="text-stone-300 font-bold">
                          {notif.message}
                        </div>
                        <button
                          onClick={() => markNotificationRead(notif.id)}
                          className="text-[9px] font-bold uppercase text-brand-danger hover:text-red-400 cursor-pointer shrink-0"
                        >
                          Dismiss
                        </button>
                      </div>
                    ))}
                    {notifications.filter(n => !n.read).length === 0 && (
                      <div className="text-xs text-stone-500 italic font-mono">No active alerts.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Menu availability manual override tool */}
              <div className="bg-brand-dark p-5 rounded border border-stone-850 space-y-4">
                <h3 className="font-bold text-sm font-display text-white uppercase tracking-wider">Manual Menu Disable (86 Override)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {menuItems.map((item) => (
                    <div key={item.id} className="p-4 rounded bg-stone-900/60 border border-stone-800 flex flex-col justify-between h-28">
                      <div>
                        <h4 className="font-bold text-xs text-white leading-snug">{item.name}</h4>
                        <span className="text-[9px] text-stone-500 uppercase font-mono">{item.category}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2">
                        <span className={`text-[9px] font-bold uppercase ${item.isAvailable ? "text-brand-secondary" : "text-brand-danger"}`}>
                          {item.isAvailable ? "Available" : "Sold Out"}
                        </span>
                        <button
                          onClick={() => handleMenuOverride(item.id, item.isAvailable)}
                          className={`px-3 py-1 rounded text-[9px] font-bold uppercase cursor-pointer transition-colors border ${
                            item.isAvailable 
                              ? "bg-brand-danger/10 border-brand-danger/30 text-brand-danger hover:bg-brand-danger/20" 
                              : "bg-brand-secondary/10 border-brand-secondary/30 text-brand-secondary hover:bg-brand-secondary/20"
                          }`}
                        >
                          {item.isAvailable ? "86 Dish" : "Restore"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: STAFF ROSTER */}
          {activeTab === "staff" && (
            <div className="space-y-6">
              <div className="border-b border-stone-800 pb-3">
                <h2 className="text-lg font-bold text-white font-display uppercase tracking-wider">Staff Roster</h2>
              </div>
              
              <div className="bg-[#fcfaf7] text-stone-850 rounded border border-stone-300 shadow-md">
                <table className="min-w-full text-left text-xs divide-y divide-stone-300">
                  <thead className="bg-[#f0ece6] text-stone-700 uppercase tracking-wider font-bold">
                    <tr>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Assigned Role</th>
                      <th className="px-6 py-4">ID Profile</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 text-stone-850 font-mono">
                    {staffRoster.map((rosterItem) => (
                      <tr key={rosterItem.id}>
                        <td className="px-6 py-4 font-sans font-bold text-stone-900">{rosterItem.name}</td>
                        <td className="px-6 py-4">{rosterItem.email}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${
                            rosterItem.role === "admin" ? "bg-brand-primary/10 text-brand-primary border-brand-primary/30" :
                            rosterItem.role === "kitchen" ? "bg-brand-secondary/10 text-brand-secondary border-brand-secondary/30" :
                            "bg-brand-accent/15 text-brand-accent border-brand-accent/35"
                          }`}>
                            {rosterItem.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[10px] text-stone-500">{rosterItem.id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: SALES & ANALYTICS */}
          {activeTab === "analytics" && (
            <div className="space-y-6">
              <div className="border-b border-stone-800 pb-3">
                <h2 className="text-lg font-bold text-white font-display uppercase tracking-wider">Operational Insights</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Popular items */}
                <div className="bg-[#fcfaf7] text-stone-850 p-5 rounded border border-stone-300 shadow-md space-y-4">
                  <h3 className="font-bold text-sm text-brand-primary font-display uppercase tracking-wider">Popular Menu Items</h3>
                  <div className="space-y-3 font-mono text-xs">
                    {menuItems.map((item) => {
                      const qtySold = orders
                        .filter(o => o.status === "billed")
                        .reduce((sum, o) => {
                          const orderItem = o.items.find(i => i.menuItemId === item.id);
                          return sum + (orderItem ? orderItem.quantity : 0);
                        }, 0);

                      return (
                        <div key={item.id} className="flex items-center justify-between border-b border-dashed border-stone-200 pb-2">
                          <span className="font-sans font-bold text-stone-900">{item.name}</span>
                          <span className="text-stone-500">{qtySold} sold</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Peak times */}
                <div className="bg-[#fcfaf7] text-stone-850 p-5 rounded border border-stone-300 shadow-md space-y-4">
                  <h3 className="font-bold text-sm text-brand-secondary font-display uppercase tracking-wider">Peak Ordering Hours</h3>
                  <div className="space-y-3 font-mono text-xs">
                    {Array.from({ length: 4 }).map((_, idx) => {
                      const hr = 18 + idx; // 6 PM to 9 PM
                      const count = orders.filter((o) => {
                        const date = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
                        return date.getHours() === hr;
                      }).length;

                      return (
                        <div key={hr} className="flex items-center gap-4 text-xs">
                          <span className="w-12 font-bold text-stone-700">{hr}:00</span>
                          <div className="flex-1 h-3.5 bg-stone-200 rounded overflow-hidden border border-stone-300">
                            <div 
                              className="h-full bg-brand-secondary" 
                              style={{ width: `${Math.min(100, count * 20)}%` }}
                            />
                          </div>
                          <span className="w-16 text-right text-stone-500">{count} orders</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
