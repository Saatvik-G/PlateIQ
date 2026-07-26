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
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [staffRecord, setStaffRecord] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(true);

  // Subscribed Data
  const [orders, setOrders] = useState<Order[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<"orders" | "tables" | "inventory" | "staff" | "analytics">("orders");

  // Interaction State
  const [restockValues, setRestockValues] = useState<{ [ingId: string]: string }>({});
  const [expiryValues, setExpiryValues] = useState<{ [ingId: string]: string }>({});
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Staff list (mock roster data populated from our DB or setup)
  const [staffRoster, setStaffRoster] = useState<any[]>([]);

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
            setActiveTab("orders");
          }
        } else {
          // Fallback if record missing
          setStaffRecord({
            uid: user.uid,
            name: "Unknown Staff",
            email: user.email || "",
            role: "waiter",
          });
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

  const handleLogout = async () => {
    try {
      await logout();
      router.push("/login");
    } catch (e) {
      console.error(e);
    }
  };

  // Order status transitions
  const handleTransitionOrder = async (orderId: string, currentStatus: string) => {
    let nextStatus = "";
    if (currentStatus === "placed") nextStatus = "preparing";
    else if (currentStatus === "preparing") nextStatus = "ready";
    else if (currentStatus === "ready") nextStatus = "served";
    else if (currentStatus === "served") nextStatus = "billed";

    if (!nextStatus) return;
    setActionLoading(orderId);
    setStatusMessage(null);

    try {
      await updateOrderStatus(orderId, nextStatus);
      setStatusMessage({ type: "success", text: `Order transitioned to ${nextStatus}!` });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: "error", text: err.message || "Failed to update order status." });
    } finally {
      setActionLoading(null);
    }
  };

  // Restock ingredient
  const handleRestock = async (ingId: string) => {
    const qty = parseFloat(restockValues[ingId] || "");
    if (isNaN(qty) || qty <= 0) return;

    setActionLoading(`restock_${ingId}`);
    setStatusMessage(null);

    try {
      await restockIngredient(ingId, qty);
      setRestockValues((prev) => ({ ...prev, [ingId]: "" }));
      setStatusMessage({ type: "success", text: "Ingredient restocked and menu items recalculated!" });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: "error", text: err.message || "Failed to restock." });
    } finally {
      setActionLoading(null);
    }
  };

  // Update Surplus & Expiry
  const handleUpdateSurplus = async (ingId: string, currentSurplus: boolean) => {
    setActionLoading(`surplus_${ingId}`);
    setStatusMessage(null);

    try {
      const expDate = expiryValues[ingId] || null;
      await updateIngredientSurplus(ingId, !currentSurplus, expDate);
      setStatusMessage({ type: "success", text: "Sustainability settings updated!" });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: "error", text: err.message || "Failed to update." });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateExpiry = async (ingId: string) => {
    const expDate = expiryValues[ingId];
    if (!expDate) return;
    setActionLoading(`expiry_${ingId}`);
    setStatusMessage(null);

    try {
      // Find current surplus state
      const ing = ingredients.find((i) => i.id === ingId);
      const isSurp = ing ? ing.isSurplus : false;
      await updateIngredientSurplus(ingId, isSurp, expDate);
      setStatusMessage({ type: "success", text: "Expiry date logged to ledger!" });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: "error", text: err.message || "Failed to log expiry date." });
    } finally {
      setActionLoading(null);
    }
  };

  // Table manual status overrides
  const handleTableStatus = async (tableId: string, nextStatus: "free" | "occupied" | "reserved") => {
    setActionLoading(`table_${tableId}`);
    try {
      await updateTableStatus(tableId, nextStatus);
    } catch (err: any) {
      alert(err.message || "Failed to update table status.");
    } finally {
      setActionLoading(null);
    }
  };

  // Menu Manual 86 Override
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
        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
        <span className="text-xs text-gray-500 mt-3 font-semibold uppercase tracking-wider">Securing Terminal...</span>
      </div>
    );
  }

  // Role permissions
  const isKitchen = staffRecord.role === "kitchen";
  const isWaiter = staffRecord.role === "waiter";
  const isAdmin = staffRecord.role === "admin";

  // KPIs
  const lowStockCount = ingredients.filter((i) => i.currentStock < i.lowStockThreshold).length;
  const activeOrders = orders.filter((o) => o.status !== "billed" && o.status !== "served");
  const occupiedTables = tables.filter((t) => t.status === "occupied").length;
  const todayRevenue = orders
    .filter((o) => o.status === "billed")
    .reduce((sum, o) => sum + o.totalAmount, 0);

  return (
    <div className="flex-1 flex flex-col">
      {/* Top Banner Navigation */}
      <header className="bg-brand-dark border-b border-white/5 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold font-display shadow-lg shadow-indigo-600/20">
            P
          </div>
          <div>
            <h1 className="font-bold text-white leading-tight font-display flex items-center gap-1.5">
              PlateIQ Control Panel
              <span className="text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-md flex items-center gap-1 uppercase">
                <ShieldCheck className="w-3 h-3 text-indigo-400" /> {staffRecord.role}
              </span>
            </h1>
            <p className="text-[10px] text-gray-500">Authorized Operator: {staffRecord.name} ({staffRecord.email})</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a href="/" className="text-xs text-gray-400 hover:text-white transition-colors">
            Customer Menu
          </a>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 font-semibold cursor-pointer border border-rose-500/10 hover:border-rose-500/30 px-3 py-1.5 rounded-lg bg-rose-500/5 transition-all"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </header>

      {/* Control center body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sidebar tabs */}
        <aside className="w-full md:w-56 bg-brand-dark/50 border-b md:border-b-0 md:border-r border-white/5 p-4 flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible shrink-0">
          {[
            { id: "orders", label: "Orders Ledger", icon: ClipboardList, allowed: true },
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
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20 shadow-md shadow-indigo-600/5"
                    : "text-gray-400 hover:bg-white/2 hover:text-white"
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
            <div className={`p-4 rounded-xl flex items-start gap-3 border animate-fade-in ${
              statusMessage.type === "success" 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                : "bg-rose-500/10 border-rose-500/20 text-rose-400"
            }`}>
              {statusMessage.type === "success" ? (
                <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              )}
              <span className="text-sm font-semibold">{statusMessage.text}</span>
            </div>
          )}

          {/* Quick Metrics Header Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-panel p-4 rounded-xl flex flex-col justify-between border border-white/5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Active Prep Load</span>
              <span className="text-2xl font-extrabold text-white mt-1">{activeOrders.length} orders</span>
            </div>
            
            <div className="glass-panel p-4 rounded-xl flex flex-col justify-between border border-white/5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Low Stock Warnings</span>
              <span className={`text-2xl font-extrabold mt-1 ${lowStockCount > 0 ? "text-amber-400 animate-pulse" : "text-white"}`}>
                {lowStockCount} items
              </span>
            </div>
            
            <div className="glass-panel p-4 rounded-xl flex flex-col justify-between border border-white/5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Live Occupancy</span>
              <span className="text-2xl font-extrabold text-white mt-1">{occupiedTables} / {tables.length} tables</span>
            </div>

            <div className="glass-panel p-4 rounded-xl flex flex-col justify-between border border-white/5">
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Today's Revenue</span>
              <span className="text-2xl font-extrabold text-emerald-400 mt-1">${todayRevenue.toFixed(2)}</span>
            </div>
          </div>

          {/* TAB 1: Orders (Kanban Workflow) */}
          {activeTab === "orders" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white font-display">Active Kitchen Workflow</h2>
                <span className="text-xs text-gray-500">Real-time status changes push directly to customer menu trackers</span>
              </div>

              {/* Status categories grid */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {[
                  { key: "placed", title: "Placed Requests", border: "border-indigo-500/20", text: "text-indigo-400" },
                  { key: "preparing", title: "In Preparation", border: "border-amber-500/20", text: "text-amber-400" },
                  { key: "ready", title: "Ready for Delivery", border: "border-cyan-500/20", text: "text-cyan-400" },
                  { key: "served", title: "Served / Awaiting Bill", border: "border-emerald-500/20", text: "text-emerald-400" },
                ].map((col) => {
                  const colOrders = orders.filter((o) => o.status === col.key);

                  return (
                    <div key={col.key} className="space-y-4">
                      <div className={`p-3 rounded-xl border ${col.border} bg-white/2 flex items-center justify-between`}>
                        <span className={`text-xs font-bold font-display uppercase tracking-wider ${col.text}`}>{col.title}</span>
                        <span className="text-[10px] font-bold bg-white/5 px-2 py-0.5 rounded text-gray-400">{colOrders.length}</span>
                      </div>

                      <div className="space-y-3 max-h-[35rem] overflow-y-auto pr-1">
                        {colOrders.length === 0 ? (
                          <div className="text-center py-8 text-xs text-gray-600 border border-dashed border-white/5 rounded-xl">
                            No orders in column
                          </div>
                        ) : (
                          colOrders.map((order) => (
                            <div key={order.id} className="glass-panel p-4 rounded-xl border border-white/5 space-y-4 shadow-sm hover:border-white/10 transition-colors">
                              <div className="flex justify-between items-start">
                                <div>
                                  <span className="text-[9px] font-semibold text-gray-500">T{order.tableId} | ID: #{order.id.slice(0, 5)}</span>
                                  <h4 className="font-bold text-sm text-white mt-0.5">Table {order.tableId}</h4>
                                </div>
                                <span className="text-[10px] text-indigo-400 font-bold">${order.totalAmount.toFixed(2)}</span>
                              </div>

                              <ul className="text-xs text-gray-400 space-y-1 divide-y divide-white/2">
                                {order.items.map((item, idx) => (
                                  <li key={idx} className="flex justify-between pt-1 first:pt-0">
                                    <span>{item.name}</span>
                                    <span className="font-semibold">x{item.quantity}</span>
                                  </li>
                                ))}
                              </ul>

                              {/* Button transitions (correction #7) */}
                              <button
                                onClick={() => handleTransitionOrder(order.id, order.status)}
                                disabled={actionLoading === order.id}
                                className={`w-full py-2 px-3 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                                  order.status === "placed" ? "bg-amber-600 hover:bg-amber-500 text-white" :
                                  order.status === "preparing" ? "bg-cyan-600 hover:bg-cyan-500 text-white" :
                                  order.status === "ready" ? "bg-emerald-600 hover:bg-emerald-500 text-white" :
                                  "bg-indigo-600 hover:bg-indigo-500 text-white"
                                }`}
                              >
                                {actionLoading === order.id ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
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
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: Tables Grid */}
          {activeTab === "tables" && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-white font-display">Restaurant Occupancy Visual Grid</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                {tables.map((table) => {
                  const isActive = table.status === "occupied";
                  const isReserved = table.status === "reserved";

                  return (
                    <div 
                      key={table.id} 
                      className={`glass-panel p-5 rounded-xl border flex flex-col justify-between h-40 transition-all ${
                        isActive ? "border-rose-500/25 bg-rose-500/2" :
                        isReserved ? "border-amber-500/25 bg-amber-500/2" :
                        "border-white/5"
                      }`}
                    >
                      <div>
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Seats {table.capacity}</span>
                        <h3 className="text-2xl font-black mt-1 font-display text-white">Table {table.tableNumber}</h3>
                      </div>

                      <div className="space-y-2">
                        <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          isActive ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" :
                          isReserved ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                          "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}>
                          {table.status}
                        </span>

                        <div className="flex gap-1.5">
                          {table.status !== "free" && (
                            <button
                              onClick={() => handleTableStatus(table.id, "free")}
                              className="text-[9px] font-bold uppercase text-emerald-400 bg-white/5 border border-white/5 hover:border-emerald-500/30 px-2 py-1 rounded cursor-pointer"
                            >
                              Free
                            </button>
                          )}
                          {table.status !== "occupied" && (
                            <button
                              onClick={() => handleTableStatus(table.id, "occupied")}
                              className="text-[9px] font-bold uppercase text-rose-400 bg-white/5 border border-white/5 hover:border-rose-500/30 px-2 py-1 rounded cursor-pointer"
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

          {/* TAB 3: Inventory Control */}
          {activeTab === "inventory" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-white font-display">Live Ingredient Ledger & Control</h2>
                  <p className="text-xs text-gray-500">Every restock is appended to the ledger; stocks falling below threshold auto-trigger alerts.</p>
                </div>
              </div>

              {/* Ingredients table */}
              <div className="glass-panel rounded-xl overflow-hidden border border-white/5">
                <table className="min-w-full text-left text-xs divide-y divide-white/5">
                  <thead className="bg-brand-dark/40 text-gray-400 uppercase tracking-wider font-bold">
                    <tr>
                      <th className="px-6 py-4">Ingredient Name</th>
                      <th className="px-6 py-4">Stock Level</th>
                      <th className="px-6 py-4">Threshold</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Restock Add</th>
                      <th className="px-6 py-4">Sustainability Settings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-gray-300">
                    {ingredients.map((ing) => {
                      const isLow = ing.currentStock < ing.lowStockThreshold;
                      const isOut = ing.currentStock === 0;

                      return (
                        <tr key={ing.id} className="hover:bg-white/2">
                          <td className="px-6 py-4 font-semibold text-white">{ing.name}</td>
                          <td className="px-6 py-4 font-mono">
                            {ing.currentStock.toFixed(1)} {ing.unit}
                          </td>
                          <td className="px-6 py-4 font-mono text-gray-500">
                            {ing.lowStockThreshold} {ing.unit}
                          </td>
                          <td className="px-6 py-4">
                            {isOut ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase tracking-wider">Out of Stock</span>
                            ) : isLow ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider animate-pulse">Low Stock</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">Healthy</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                placeholder="Qty"
                                value={restockValues[ing.id] || ""}
                                onChange={(e) => setRestockValues({ ...restockValues, [ing.id]: e.target.value })}
                                className="w-16 bg-brand-deep/50 border border-white/5 rounded-lg px-2 py-1 text-xs text-white"
                              />
                              <button
                                onClick={() => handleRestock(ing.id)}
                                disabled={actionLoading === `restock_${ing.id}`}
                                className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer disabled:opacity-50"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 space-y-2">
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1.5 text-[10px] text-gray-400 font-semibold cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={ing.isSurplus || false}
                                  onChange={() => handleUpdateSurplus(ing.id, ing.isSurplus || false)}
                                  className="rounded border-white/10 bg-brand-deep text-indigo-600"
                                />
                                Surplus (15% Off Recipes)
                              </label>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <input
                                type="date"
                                value={expiryValues[ing.id] || (ing.expiryDate ? new Date(ing.expiryDate).toISOString().split("T")[0] : "")}
                                onChange={(e) => setExpiryValues({ ...expiryValues, [ing.id]: e.target.value })}
                                className="bg-brand-deep/50 border border-white/5 rounded-lg px-1.5 py-0.5 text-[10px] text-white"
                              />
                              <button
                                onClick={() => handleUpdateExpiry(ing.id)}
                                className="p-1 rounded bg-white/5 border border-white/5 hover:border-indigo-500/50 text-[10px] cursor-pointer"
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
                <div className="glass-panel p-5 rounded-xl border border-white/5 space-y-4">
                  <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                    <Bell className="w-4 h-4 text-amber-400" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-white">Live Stock Alerts Log</h3>
                  </div>

                  <div className="space-y-3 max-h-40 overflow-y-auto">
                    {notifications.filter(n => !n.read).map((notif) => (
                      <div key={notif.id} className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 flex items-start justify-between gap-4 text-[11px]">
                        <div className="text-amber-300 font-semibold">
                          {notif.message}
                        </div>
                        <button
                          onClick={() => markNotificationRead(notif.id)}
                          className="text-[9px] font-bold uppercase text-gray-500 hover:text-white cursor-pointer shrink-0"
                        >
                          Dismiss
                        </button>
                      </div>
                    ))}
                    {notifications.filter(n => !n.read).length === 0 && (
                      <div className="text-xs text-gray-600 italic">No active alert logs.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Menu availability manual override tool */}
              <div className="glass-panel p-5 rounded-xl border border-white/5 space-y-4">
                <h3 className="font-bold text-sm font-display text-white">Staff Menu Overrides (86/Disable Toggles)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {menuItems.map((item) => (
                    <div key={item.id} className="p-4 rounded-xl bg-brand-deep/50 border border-white/5 flex flex-col justify-between h-28">
                      <div>
                        <h4 className="font-bold text-xs text-white leading-snug">{item.name}</h4>
                        <span className="text-[9px] text-gray-500">{item.category}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2">
                        <span className={`text-[9px] font-semibold ${item.isAvailable ? "text-emerald-400" : "text-rose-400"}`}>
                          {item.isAvailable ? "Available" : "Sold Out"}
                        </span>
                        <button
                          onClick={() => handleMenuOverride(item.id, item.isAvailable)}
                          className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase cursor-pointer transition-colors border ${
                            item.isAvailable 
                              ? "bg-rose-500/15 border-rose-500/20 text-rose-400 hover:bg-rose-500/30" 
                              : "bg-emerald-500/15 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
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

          {/* TAB 4: Staff Roster */}
          {activeTab === "staff" && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-white font-display">Staff Roster & Authorizations</h2>
              
              <div className="glass-panel rounded-xl overflow-hidden border border-white/5">
                <table className="min-w-full text-left text-xs divide-y divide-white/5">
                  <thead className="bg-brand-dark/40 text-gray-400 uppercase tracking-wider font-bold">
                    <tr>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Assigned Role</th>
                      <th className="px-6 py-4">ID Profile</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-gray-300">
                    {staffRoster.map((rosterItem) => (
                      <tr key={rosterItem.id}>
                        <td className="px-6 py-4 font-semibold text-white">{rosterItem.name}</td>
                        <td className="px-6 py-4">{rosterItem.email}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${
                            rosterItem.role === "admin" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                            rosterItem.role === "kitchen" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                            "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                          }`}>
                            {rosterItem.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-[10px] text-gray-500">{rosterItem.id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: Sales & Analytics */}
          {activeTab === "analytics" && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-white font-display">Sales Performance & Operations Insights</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Popular items */}
                <div className="glass-panel p-5 rounded-xl border border-white/5 space-y-4">
                  <h3 className="font-bold text-sm text-white font-display uppercase tracking-wider text-indigo-400">Popular Menu Items</h3>
                  <div className="space-y-3">
                    {menuItems.map((item) => {
                      // Calculate quantity sold
                      const qtySold = orders
                        .filter(o => o.status === "billed")
                        .reduce((sum, o) => {
                          const orderItem = o.items.find(i => i.menuItemId === item.id);
                          return sum + (orderItem ? orderItem.quantity : 0);
                        }, 0);

                      return (
                        <div key={item.id} className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-white">{item.name}</span>
                          <span className="font-mono text-gray-400">{qtySold} servings sold</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Peak times */}
                <div className="glass-panel p-5 rounded-xl border border-white/5 space-y-4">
                  <h3 className="font-bold text-sm text-white font-display uppercase tracking-wider text-cyan-400">Peak Ordering Hours</h3>
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, idx) => {
                      const hr = 18 + idx; // 6 PM to 9 PM
                      // count orders in this hour slot
                      const count = orders.filter((o) => {
                        const date = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
                        return date.getHours() === hr;
                      }).length;

                      return (
                        <div key={hr} className="flex items-center gap-4 text-xs">
                          <span className="w-12 font-semibold text-white">{hr}:00</span>
                          <div className="flex-1 h-2.5 bg-white/5 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-cyan-500 rounded-full" 
                              style={{ width: `${Math.min(100, count * 20)}%` }}
                            />
                          </div>
                          <span className="w-12 text-right text-gray-400 font-mono">{count} orders</span>
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
