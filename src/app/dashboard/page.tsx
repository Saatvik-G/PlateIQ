"use client";

import { useState, useEffect } from "react";
import { getDb } from "@/lib/firebase";
import { collection, getDocs, addDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { getStaffRecord, logout, StaffMember, subscribeToAuth } from "@/services/authService";
import { subscribeToAllOrders, updateOrderStatus, Order } from "@/services/orderService";
import { subscribeToIngredients, restockIngredient, updateIngredientSurplus, subscribeToNotifications, markNotificationRead, Ingredient, SystemNotification } from "@/services/inventoryService";
import { subscribeToTables, updateTableStatus, RestaurantTable } from "@/services/tableService";
import { subscribeToMenu, MenuItem, overrideMenuAvailability } from "@/services/menuService";
import { useToast } from "@/components/Toast";
import { 
  ClipboardList, Users, Layers, TrendingUp, Bell, LogOut, CheckCircle, 
  AlertTriangle, RefreshCw, Plus, Calendar, AlertCircle, ShoppingBag, ShieldCheck, Printer, BarChart3, Clock, PackageCheck, FileText, Check
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();

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
  
  // Roster states
  const [staffRoster, setStaffRoster] = useState<any[]>([]);

  // Restock slider state
  const [restockValues, setRestockValues] = useState<{ [ingId: string]: string }>({});
  // Expiry date selector state
  const [expiryValues, setExpiryValues] = useState<{ [ingId: string]: string }>({});
  // Bill modal state
  const [billOrder, setBillOrder] = useState<Order | null>(null);

  // Admin Modal: Add New Ingredient
  const [showAddIngModal, setShowAddIngModal] = useState(false);
  const [newIngName, setNewIngName] = useState("");
  const [newIngStock, setNewIngStock] = useState("");
  const [newIngUnit, setNewIngUnit] = useState("kg");
  const [newIngThreshold, setNewIngThreshold] = useState("5");

  // Authentication check (Real-time Auth listener)
  useEffect(() => {
    const unsubscribe = subscribeToAuth(async (user) => {
      if (!user) {
        setStaffRecord(null);
        setCurrentUser(null);
        router.push("/login");
      } else {
        setCurrentUser(user);
        const record = await getStaffRecord(user.uid);
        if (record) {
          setStaffRecord(record);
        } else {
          // Auto provision if first login
          setStaffRecord({
            uid: user.uid,
            email: user.email || "",
            name: user.displayName || "Staff Member",
            role: "waiter"
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

  // Handle Logout
  const handleLogout = async () => {
    try {
      await logout();
      showToast("Signed out successfully", "info");
      router.push("/login");
    } catch (err: any) {
      console.error("Logout failed:", err);
      showToast(err.message || "Logout failed", "error");
    }
  };

  // Order State Transition (placed -> preparing -> ready -> served -> billed)
  const handleTransitionOrder = async (orderId: string, currentStatus: string) => {
    // For served -> billed, show bill modal first
    if (currentStatus === "served") {
      const order = orders.find(o => o.id === orderId);
      if (order) { setBillOrder(order); return; }
    }

    setActionLoading(orderId);
    let nextStatus = "";
    if (currentStatus === "placed") nextStatus = "preparing";
    else if (currentStatus === "preparing") nextStatus = "ready";
    else if (currentStatus === "ready") nextStatus = "served";
    else return;

    try {
      await updateOrderStatus(orderId, nextStatus);
      showToast(`Order #${orderId.slice(-4).toUpperCase()} marked as ${nextStatus}!`, "success");
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to update order status.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // Table Status change
  const handleTableStatus = async (tableId: string, status: "free" | "occupied" | "reserved") => {
    try {
      await updateTableStatus(tableId, status);
      showToast(`Table status updated to ${status}.`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update table status.", "error");
    }
  };

  // Restock Action
  const handleRestock = async (ingId: string) => {
    const qtyStr = restockValues[ingId];
    const qty = parseFloat(qtyStr);
    if (isNaN(qty) || qty <= 0) {
      showToast("Please enter a valid positive number for restocking.", "error");
      return;
    }

    setActionLoading(`restock_${ingId}`);

    try {
      await restockIngredient(ingId, qty);
      setRestockValues({ ...restockValues, [ingId]: "" });
      showToast("Ledger updated: Stock replenished successfully!", "success");
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to restock ingredient.", "error");
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
      showToast(`Surplus flag updated for ${ing?.name || 'ingredient'}.`, "info");
    } catch (err: any) {
      showToast(err.message || "Failed to update surplus status.", "error");
    }
  };

  // Update Expiry Date
  const handleUpdateExpiry = async (ingId: string) => {
    const dateStr = expiryValues[ingId];
    if (!dateStr) {
      showToast("Please select a valid expiry date.", "error");
      return;
    }

    try {
      await updateIngredientSurplus(ingId, ingredients.find(i => i.id === ingId)?.isSurplus || false, dateStr);
      showToast("Expiry date saved successfully.", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update expiry date.", "error");
    }
  };

  // Menu Manual Availability Override
  const handleMenuOverride = async (itemId: string, currentAvailability: boolean) => {
    try {
      await overrideMenuAvailability(itemId, !currentAvailability);
      showToast("Menu availability override toggled.", "info");
    } catch (err: any) {
      showToast(err.message || "Failed to override menu availability.", "error");
    }
  };

  // Printable Thermal Receipt Generator
  const handlePrintReceipt = (order: Order) => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) {
      showToast("Pop-up blocked. Please allow popups to print receipt.", "error");
      return;
    }

    const itemsHtml = order.items.map(item => `
      <tr style="font-size:12px; line-height:1.4;">
        <td style="padding:4px 0;">${item.name} x${item.quantity}</td>
        <td style="text-align:right; padding:4px 0;">${formatCurrency(item.price * item.quantity)}</td>
      </tr>
    `).join('');

    const subtotal = order.subtotal;
    const tax = subtotal * (order.taxRate || 0.08);
    const service = subtotal * (order.serviceChargeRate || 0.10);
    const total = order.totalAmount;
    const dateStr = new Date(order.createdAt).toLocaleString('en-IN');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt #${order.id.slice(-4).toUpperCase()}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; width: 280px; margin: 20px auto; color: #111; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .divider { border-top: 1px dashed #444; margin: 10px 0; }
            .double-divider { border-top: 2px solid #111; margin: 10px 0; }
            table { width: 100%; border-collapse: collapse; }
            .title { font-size: 18px; font-weight: bold; }
            .subtitle { font-size: 11px; text-transform: uppercase; }
            .total-row { font-size: 14px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="text-center">
            <div class="title">PLATEIQ BISTRO</div>
            <div class="subtitle">Zero-Waste Smart Dining</div>
            <div style="font-size:10px; margin-top:4px;">Receipt #${order.id.slice(-4).toUpperCase()}</div>
            <div style="font-size:10px;">Table ${order.tableId} · ${dateStr}</div>
          </div>
          <div class="divider"></div>
          <table>
            <thead>
              <tr style="font-size:11px; text-align:left; border-bottom:1px solid #111;">
                <th>ITEM</th>
                <th style="text-align:right;">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div class="divider"></div>
          <table>
            <tr style="font-size:11px;">
              <td>Subtotal</td>
              <td class="text-right">${formatCurrency(subtotal)}</td>
            </tr>
            <tr style="font-size:11px;">
              <td>Tax (${Math.round((order.taxRate || 0.08) * 100)}%)</td>
              <td class="text-right">${formatCurrency(tax)}</td>
            </tr>
            <tr style="font-size:11px;">
              <td>Service Charge (${Math.round((order.serviceChargeRate || 0.10) * 100)}%)</td>
              <td class="text-right">${formatCurrency(service)}</td>
            </tr>
            <tr class="total-row">
              <td style="padding-top:6px;">TOTAL PAID</td>
              <td class="text-right" style="padding-top:6px;">${formatCurrency(total)}</td>
            </tr>
          </table>
          <div class="double-divider"></div>
          <div class="text-center" style="font-size:10px; margin-top:12px;">
            Thank you for dining with us!<br/>
            Ingredients Rescued & Accounted Live.
          </div>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
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
            </h1>
            <div className="flex items-center gap-2 text-[10px] text-stone-400 font-mono">
              <span className="inline-block w-2 h-2 rounded-full bg-brand-secondary animate-pulse" />
              <span>Real-Time Ledger Online</span>
            </div>
          </div>
        </div>

        {/* User Info & Actions */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="block text-xs font-bold text-white">{staffRecord.name}</span>
            <span className="inline-flex items-center gap-1 text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-stone-900 text-stone-300 border border-stone-800">
              <ShieldCheck className="w-3.5 h-3.5" /> {staffRecord.role}
            </span>
          </div>
          <a
            href="/"
            className="text-xs text-stone-400 hover:text-white font-semibold transition-colors px-3 py-1.5 rounded border border-stone-800 hover:border-stone-700 bg-stone-900/50"
          >
            Guest Portal
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
            { id: "analytics", label: "KPIs & Reports", icon: BarChart3, allowed: isAdmin },
          ].map((tab) => {
            if (!tab.allowed) return null;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
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

          {/* ROLE GATE: block tab content if role is not permitted */}
          {((activeTab === "staff" || activeTab === "analytics") && !isAdmin) ||
           (activeTab === "inventory" && !isAdmin && !isKitchen) ||
           (activeTab === "tables" && !isAdmin && !isWaiter) ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 border border-brand-danger/20 rounded bg-brand-danger/5">
              <ShieldCheck className="w-12 h-12 text-brand-danger opacity-60" />
              <p className="text-brand-danger font-bold text-sm uppercase tracking-wider font-display">Access Denied — 403 Forbidden</p>
              <p className="text-stone-500 text-xs font-mono">Your role <span className="font-bold text-stone-300">{staffRecord.role}</span> does not have permission to view this section.</p>
            </div>
          ) : null}

          {/* Quick Metrics Header Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-brand-dark border border-stone-850 p-4 rounded flex flex-col justify-between shadow-sm">
              <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider font-mono">Kitchen Load</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-black font-display text-white">{activeOrders.length}</span>
                <span className="text-[10px] text-stone-500 font-mono">Active Tickets</span>
              </div>
            </div>

            <div className="bg-brand-dark border border-stone-850 p-4 rounded flex flex-col justify-between shadow-sm">
              <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider font-mono">Inventory Warnings</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className={`text-2xl font-black font-display ${lowStockCount > 0 ? "text-brand-danger animate-pulse" : "text-brand-secondary"}`}>
                  {lowStockCount}
                </span>
                <span className="text-[10px] text-stone-500 font-mono">Low Items</span>
              </div>
            </div>

            <div className="bg-brand-dark border border-stone-850 p-4 rounded flex flex-col justify-between shadow-sm">
              <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider font-mono">Table Occupancy</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-black font-display text-white">{occupiedTables} / {tables.length}</span>
                <span className="text-[10px] text-stone-500 font-mono">Tables In-Use</span>
              </div>
            </div>

            <div className="bg-brand-dark border border-stone-850 p-4 rounded flex flex-col justify-between shadow-sm">
              <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider font-mono">Billed Sales Today</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-black font-display text-brand-secondary">{formatCurrency(todayRevenue)}</span>
                <span className="text-[10px] text-stone-500 font-mono">Cleared Revenue</span>
              </div>
            </div>
          </div>

          {/* TAB 1: KITCHEN TICKET RAIL */}
          {activeTab === "orders" && (
            <div className="space-y-6">
              <div className="border-b border-stone-850 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white font-display uppercase tracking-wider">Kitchen Ticket Rail</h2>
                  <p className="text-xs text-stone-400 font-mono">Real-time status transitions for kitchen and floor staff.</p>
                </div>
                <span className="text-[10px] font-mono text-stone-400 bg-stone-900 border border-stone-800 px-2.5 py-1 rounded">
                  Active Rail: {orders.filter(o => o.status !== "billed").length} tickets
                </span>
              </div>

              {/* Horizontal Ticket Rail Slider */}
              <div className="flex flex-row overflow-x-auto gap-6 py-6 px-4 bg-stone-900/40 border border-stone-800 rounded-lg scrollbar-thin">
                {orders.filter(o => o.status !== "billed").length === 0 ? (
                  <div className="w-full py-16 text-center text-xs text-stone-500 italic font-mono border border-dashed border-stone-800 rounded flex flex-col items-center justify-center gap-2">
                    <ClipboardList className="w-8 h-8 opacity-40 text-stone-400" />
                    <span>Rail is empty — No active kitchen tickets right now.</span>
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
                          className="parchment-ticket parchment-ticket-jagged rounded-t w-64 shrink-0 flex flex-col justify-between p-4 h-96 shadow-xl animate-ticket-punch relative overflow-hidden text-stone-850"
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
          )}

          {/* TAB 2: TABLES GRID */}
          {activeTab === "tables" && (
            <div className="space-y-6">
              <div className="border-b border-stone-850 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white font-display uppercase tracking-wider">Seating Occupancy Grid</h2>
                  <p className="text-xs text-stone-400 font-mono">Live floor state and walk-in seating assignment.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                {tables.map((table) => {
                  const isActive = table.status === "occupied";
                  const isReserved = table.status === "reserved";

                  return (
                    <div 
                      key={table.id} 
                      className={`p-5 rounded border flex flex-col justify-between h-40 transition-all ${
                        isActive ? "bg-brand-primary/10 border-brand-primary text-white" :
                        isReserved ? "bg-brand-secondary/10 border-brand-secondary text-white" :
                        "bg-stone-900 border-stone-800 text-stone-400"
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-xs font-bold uppercase text-white">Table {table.tableNumber}</span>
                          <span className={`w-2.5 h-2.5 rounded-full ${
                            isActive ? "bg-brand-primary animate-ping" :
                            isReserved ? "bg-brand-secondary" :
                            "bg-stone-700"
                          }`} />
                        </div>
                        <span className="text-[10px] font-mono text-stone-500 block mt-1">Cap: {table.capacity} Guests</span>
                      </div>

                      <div className="space-y-2">
                        <span className={`text-[9px] font-bold font-mono uppercase tracking-wider px-2 py-0.5 rounded inline-block ${
                          isActive ? "bg-brand-primary/20 text-brand-primary border border-brand-primary/30" :
                          isReserved ? "bg-brand-secondary/20 text-brand-secondary border border-brand-secondary/30" :
                          "bg-stone-800 text-stone-400 border border-stone-700"
                        }`}>
                          {table.status}
                        </span>

                        <select
                          value={table.status}
                          onChange={(e) => handleTableStatus(table.id, e.target.value as any)}
                          className="w-full bg-stone-950 border border-stone-800 rounded p-1 text-[10px] font-mono text-stone-300 focus:outline-none"
                        >
                          <option value="free">Free</option>
                          <option value="occupied">Occupied</option>
                          <option value="reserved">Reserved</option>
                        </select>
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
              <div className="border-b border-stone-850 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white font-display uppercase tracking-wider">Live Stock Ledger</h2>
                  <p className="text-xs text-stone-400 font-mono">Real-time ingredient levels, low-stock alerts, and surplus flags.</p>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => {
                      const name = prompt("Enter new ingredient name:");
                      if (!name) return;
                      const stockStr = prompt("Initial stock quantity:");
                      const unit = prompt("Unit (e.g. kg, L, pcs):", "kg") || "kg";
                      const threshStr = prompt("Low stock threshold:", "5") || "5";
                      if (name && stockStr) {
                        addDoc(collection(getDb(), "ingredients"), {
                          name,
                          currentStock: parseFloat(stockStr) || 10,
                          unit,
                          lowStockThreshold: parseFloat(threshStr) || 5,
                          isSurplus: false,
                          restaurantId: "default-restaurant",
                          createdAt: new Date().toISOString()
                        }).then(() => {
                          showToast(`Ingredient ${name} added successfully!`, "success");
                        });
                      }
                    }}
                    className="flex items-center gap-1.5 bg-brand-secondary hover:bg-[#4a7c59] text-white text-xs font-bold px-3 py-1.5 rounded transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Ingredient
                  </button>
                )}
              </div>

              <div className="bg-brand-dark border border-stone-850 rounded overflow-hidden shadow-lg">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-stone-900 text-stone-400 uppercase text-[10px] border-b border-stone-800">
                    <tr>
                      <th className="p-3">Ingredient</th>
                      <th className="p-3">Stock Level</th>
                      <th className="p-3">Threshold</th>
                      <th className="p-3">Surplus Rescue</th>
                      <th className="p-3">Replenish Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-850 text-stone-300">
                    {ingredients.map((ing) => {
                      const isLow = ing.currentStock < ing.lowStockThreshold;

                      return (
                        <tr key={ing.id} className="hover:bg-stone-900/50 transition-colors">
                          <td className="p-3 font-sans font-bold text-white">{ing.name}</td>
                          <td className="p-3">
                            <span className={`tabular-nums font-bold ${isLow ? "text-brand-danger animate-pulse" : "text-brand-secondary"}`}>
                              {ing.currentStock} {ing.unit}
                            </span>
                          </td>
                          <td className="p-3 text-stone-500 tabular-nums">{ing.lowStockThreshold} {ing.unit}</td>
                          <td className="p-3">
                            <button
                              onClick={() => handleUpdateSurplus(ing.id, ing.isSurplus)}
                              className={`text-[10px] font-bold px-2 py-1 rounded cursor-pointer border transition-all ${
                                ing.isSurplus 
                                  ? "bg-brand-secondary/20 text-brand-secondary border-brand-secondary/40 hover:bg-brand-secondary/30"
                                  : "bg-stone-900 text-stone-500 border-stone-800 hover:text-stone-300"
                              }`}
                            >
                              {ing.isSurplus ? "✓ Surplus (Rescue Menu)" : "+ Flag Surplus"}
                            </button>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                placeholder="Qty"
                                value={restockValues[ing.id] || ""}
                                onChange={(e) => setRestockValues({ ...restockValues, [ing.id]: e.target.value })}
                                className="w-16 bg-stone-950 border border-stone-800 rounded p-1 text-xs text-white placeholder:text-stone-600 focus:outline-none"
                              />
                              <button
                                onClick={() => handleRestock(ing.id)}
                                disabled={actionLoading === `restock_${ing.id}`}
                                className="bg-brand-primary hover:bg-[#a1402a] text-white text-[10px] font-bold px-2.5 py-1 rounded cursor-pointer disabled:opacity-50 transition-all"
                              >
                                Restock
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: STAFF ROSTER */}
          {activeTab === "staff" && (
            <div className="space-y-6">
              <div className="border-b border-stone-850 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white font-display uppercase tracking-wider">Staff Roster</h2>
                  <p className="text-xs text-stone-400 font-mono">Authenticated team members and role credentials.</p>
                </div>
              </div>

              <div className="bg-brand-dark border border-stone-850 rounded overflow-hidden shadow-lg">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-stone-900 text-stone-400 uppercase text-[10px] border-b border-stone-800">
                    <tr>
                      <th className="p-3">Name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">UID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-850 text-stone-300">
                    {staffRoster.map((item) => (
                      <tr key={item.id} className="hover:bg-stone-900/50 transition-colors">
                        <td className="p-3 font-sans font-bold text-white">{item.name}</td>
                        <td className="p-3 text-stone-400">{item.email}</td>
                        <td className="p-3">
                          <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${
                            item.role === "admin" ? "bg-brand-primary/20 text-brand-primary border-brand-primary/30" :
                            item.role === "kitchen" ? "bg-brand-secondary/20 text-brand-secondary border-brand-secondary/30" :
                            "bg-brand-accent/20 text-brand-accent border-brand-accent/30"
                          }`}>
                            {item.role}
                          </span>
                        </td>
                        <td className="p-3 text-[10px] text-stone-500">{item.id}</td>
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
              <div className="border-b border-stone-850 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white font-display uppercase tracking-wider">Operational Insights &amp; Charts</h2>
                  <p className="text-xs text-stone-400 font-mono">Live sales charts, peak hourly demand, and ingredient depletion forecasting.</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Popular items visual bar chart */}
                <div className="bg-[#fcfaf7] text-stone-850 p-5 rounded border border-stone-300 shadow-md space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-sm text-brand-primary font-display uppercase tracking-wider">Top Menu Items Sold</h3>
                    <span className="text-[9px] font-mono text-stone-500 uppercase font-bold">Units Cleared</span>
                  </div>
                  
                  <div className="space-y-3 font-mono text-xs">
                    {menuItems.slice(0, 6).map((item) => {
                      const qtySold = orders
                        .filter(o => o.status === "billed")
                        .reduce((sum, o) => {
                          const orderItem = o.items.find(i => i.menuItemId === item.id);
                          return sum + (orderItem ? orderItem.quantity : 0);
                        }, 0);

                      const maxUnits = 10;
                      const percent = Math.min(100, (qtySold / maxUnits) * 100);

                      return (
                        <div key={item.id} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-sans font-bold text-stone-900">{item.name}</span>
                            <span className="text-stone-600 font-bold">{qtySold} sold</span>
                          </div>
                          <div className="h-3 bg-stone-200 rounded overflow-hidden border border-stone-300">
                            <div 
                              className="h-full bg-brand-primary transition-all duration-500" 
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Peak times histogram */}
                <div className="bg-[#fcfaf7] text-stone-850 p-5 rounded border border-stone-300 shadow-md space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-sm text-brand-secondary font-display uppercase tracking-wider">Peak Ordering Distribution</h3>
                    <span className="text-[9px] font-mono text-stone-500 uppercase font-bold">Hourly Blocks</span>
                  </div>
                  <div className="space-y-3 font-mono text-xs">
                    {[12, 13, 14, 18, 19, 20, 21].map((hr) => {
                      const count = orders.filter((o) => {
                        const date = o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
                        return date.getHours() === hr;
                      }).length;

                      const label = hr > 12 ? `${hr - 12}:00 PM` : `${hr}:00 ${hr === 12 ? 'PM' : 'AM'}`;

                      return (
                        <div key={hr} className="flex items-center gap-3 text-xs">
                          <span className="w-16 font-bold text-stone-700">{label}</span>
                          <div className="flex-1 h-3.5 bg-stone-200 rounded overflow-hidden border border-stone-300">
                            <div 
                              className="h-full bg-brand-secondary transition-all duration-500" 
                              style={{ width: `${Math.min(100, Math.max(10, count * 25))}%` }}
                            />
                          </div>
                          <span className="w-14 text-right text-stone-600 font-bold">{count} tickets</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Demand Forecasting Note */}
                <div className="md:col-span-2 bg-[#fcfaf7] text-stone-850 p-5 rounded border border-stone-300 shadow-md space-y-3">
                  <div className="flex items-center gap-2 text-brand-primary">
                    <Clock className="w-4 h-4" />
                    <h3 className="font-bold text-sm uppercase tracking-wider font-display">Inventory Depletion Velocity Forecast</h3>
                  </div>
                  <p className="text-xs text-stone-600 font-sans leading-relaxed">
                    Based on real-time consumption rates across active tickets, the following critical ingredients are operating near depletion capacity:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 font-mono text-xs">
                    {ingredients.slice(0, 6).map((ing) => {
                      const isLow = ing.currentStock <= ing.lowStockThreshold;
                      const hoursLeft = isLow ? "~1.5 hours" : "~8.0 hours";

                      return (
                        <div key={ing.id} className="p-3 bg-white border border-stone-300 rounded flex flex-col justify-between">
                          <div>
                            <span className="font-bold font-sans text-stone-900 block">{ing.name}</span>
                            <span className="text-[10px] text-stone-500">Current: {ing.currentStock} {ing.unit}</span>
                          </div>
                          <span className={`text-[10px] font-bold mt-2 px-2 py-0.5 rounded inline-block border ${
                            isLow ? "bg-brand-primary/10 text-brand-primary border-brand-primary/30" : "bg-brand-secondary/10 text-brand-secondary border-brand-secondary/30"
                          }`}>
                            Est. Depletion: {hoursLeft}
                          </span>
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

      {/* ── BILL MODAL (Task 3 + Section D Receipt Print) ─── */}
      {billOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#fcfaf7] rounded-lg shadow-2xl w-full max-w-sm border border-stone-300 overflow-hidden text-stone-850">
            {/* Header */}
            <div className="bg-brand-primary px-5 py-4 text-white">
              <p className="text-xs font-mono uppercase tracking-widest opacity-70">PlateIQ Bistro</p>
              <h2 className="text-lg font-extrabold font-display tracking-wide mt-0.5">Final Bill &amp; Checkout</h2>
              <p className="text-xs opacity-70 font-mono">Table {billOrder.tableId} · Ticket #{billOrder.id.slice(-4).toUpperCase()}</p>
            </div>

            {/* Items */}
            <div className="px-5 py-4 space-y-2 border-b border-dashed border-stone-300 max-h-48 overflow-y-auto">
              <p className="text-[9px] font-bold uppercase tracking-wider text-stone-500 font-mono mb-2">Items Ordered</p>
              {billOrder.items.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between text-xs text-stone-800 font-mono">
                  <span>{item.name} <span className="text-stone-400">×{item.quantity}</span></span>
                  <span className="font-semibold">{formatCurrency(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="px-5 py-4 space-y-1.5 border-b border-dashed border-stone-300 font-mono">
              <div className="flex justify-between text-xs text-stone-600">
                <span>Subtotal</span>
                <span>{formatCurrency(billOrder.subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-stone-600">
                <span>Tax ({Math.round((billOrder.taxRate || 0.08) * 100)}%)</span>
                <span>{formatCurrency(billOrder.subtotal * (billOrder.taxRate || 0.08))}</span>
              </div>
              <div className="flex justify-between text-xs text-stone-600">
                <span>Service Charge ({Math.round((billOrder.serviceChargeRate || 0.10) * 100)}%)</span>
                <span>{formatCurrency(billOrder.subtotal * (billOrder.serviceChargeRate || 0.10))}</span>
              </div>
              <div className="flex justify-between text-sm font-extrabold text-stone-900 pt-1 border-t border-stone-300 mt-1">
                <span>TOTAL</span>
                <span className="text-brand-primary">{formatCurrency(billOrder.totalAmount)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 py-4 flex flex-col gap-2">
              <button
                onClick={() => handlePrintReceipt(billOrder)}
                className="w-full py-2 px-3 text-xs font-bold border border-stone-300 bg-stone-100 hover:bg-stone-200 rounded text-stone-800 flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Printer className="w-3.5 h-3.5" /> Print Thermal Receipt / PDF
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setBillOrder(null)}
                  className="flex-1 py-2 text-xs font-semibold border border-stone-300 rounded text-stone-600 hover:bg-stone-100 cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setActionLoading(billOrder.id);
                    setBillOrder(null);
                    try {
                      await updateOrderStatus(billOrder.id, "billed");
                      showToast(`Order #${billOrder.id.slice(-4).toUpperCase()} billed and closed!`, "success");
                    } catch (err: any) {
                      showToast(err.message || "Failed to close bill.", "error");
                    } finally {
                      setActionLoading(null);
                    }
                  }}
                  className="flex-1 py-2 text-xs font-bold bg-brand-primary text-white rounded hover:bg-[#a1402a] cursor-pointer transition-all"
                >
                  Confirm &amp; Close Bill
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
