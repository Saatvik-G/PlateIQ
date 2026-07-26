# PlateIQ — Smart Restaurant Management System

PlateIQ is a real-time, ledger-driven restaurant operations and ordering platform built for a hackathon. The core differentiator of PlateIQ is that dish availability, kitchen alerts, dynamic pricing, and AI recommendations are not manually set or toggled — they are dynamically computed from an append-only ingredient inventory ledger. 

---

## 🚀 Hackathon Info
- **Team Name**: Antigravity & Pair
- **Hosted Application Link**: [https://plateiq-bistro.vercel.app](https://plateiq-bistro.vercel.app)
- **GitHub Repository**: [https://github.com/Saatvik-G/PlateIQ.git](https://github.com/Saatvik-G/PlateIQ.git)
- **Tech Stack**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Firebase Client SDK (Auth + Firestore on Snapshot), Firebase Admin SDK (Server transactions + Gating), Google Gemini Flash AI.

---

## 🏆 Completed User Stories

### 🥉 Bronze Tier — UI & UX Foundations
- **Premium Design System**: Developed a modern dark-mode aesthetic utilizing glassmorphism (`backdrop-filter`), vibrant color palettes (indigo, cyan, emerald), and responsive layouts.
- **Typography & Font Optimization**: Configured Google Fonts (`Outfit` for headings and `Inter` for copy) loaded via `next/font` for performance.
- **Unified Interfaces**: Created a sleek guest portal with categories and a passwordless staff login terminal.

### 🥈 Silver Tier — Live Workflows & Role-Based Auth
- **Real-Time Subscriptions**: Used Firestore `onSnapshot` listeners to sync the guest menu and staff dashboard instantly when stock, orders, or tables update.
- **Secure Passwordless Link Auth**: Implemented Firebase Auth email-link sign-in (`sendSignInLinkToEmail` + `signInWithEmailLink`) for a modern passwordless staff experience.
- **DB-Driven Role Gating**: Roles are resolved strictly by looking up the authenticated user's ID against the `/staff` collection. All sensitive order transitions are gated on the server using Admin SDK token validation.
- **Calculated ETAs**: Live prep timers are computed dynamically on order placement based on recipe complexity and active kitchen preparing load.

### 🥇 Gold Tier — Unified Staff Control Panel
- **Active Orders tab**: Multi-column columns (Placed, Preparing, Ready, Served) with status-transition buttons instead of high-risk drag-and-drop.
- **Live Occupancy Grid**: Real-time table status grid allowing waiters to mark tables free or occupied.
- **Stock Control Ledger**: Real-time stock counts with warning badges for low stock and restock inputs that append ledger entries.
- **KPIs & Analytics**: Metrics showing active load, low stock counts, live table occupancy, today's revenue, popular items, and peak busy hours.

### 💎 Platinum & Bonus Tier — Intelligent Operations (Built 3)
1. **AI Sous-Chef Widget (Grounded Recommender)**: A floating drawer chatbot powered by **Gemini Flash**. It analyzes the customer query, parses their taste profile, and references the list of currently available menu items. It is strictly constrained to recommend only available items.
2. **Dynamic Rescue Menu (Surplus Pricing)**: Automatically scans ingredients expiring within 3 days or manually flagged as surplus, applies a 15% discount to menu items using them, and calls **Gemini Flash** to generate a one-line sustainability marketing pitch to encourage guest purchase.
3. **Closed-Loop Taste Learning (Bonus)**: Prompts guests to rate served dishes (thumbs up/down). This logs entries to `tasteFeedback` and updates their persistent session preferences (`customerPreferences`). This preference history is fed directly into the AI Sous-Chef system prompt for personalized suggestions.
4. **Smart Table Optimizer (Bonus)**: Uses a transaction-wrapped greedy assignment algorithm. Given a party size and time slot, it assigns the smallest available table that fits the guest count to maximize table turnover and minimize idle capacity, preventing double-bookings.

---

## 🧠 AI & Ledger Engine Architecture

PlateIQ operates on a single truth source: the `inventoryLedger` collection. 

```mermaid
flowchart TD
    Order[Customer Places Order] --> Trans[Firestore runTransaction]
    Trans --> CheckStock{Verify Ingredient Stock}
    CheckStock -- Insufficient --> Abort[Transaction Aborted]
    CheckStock -- Sufficient --> Deduct[Deduct Ingredient Stock]
    Deduct --> WriteLedger[Write inventoryLedger entries]
    WriteLedger --> NotifyCheck{Crossed lowStockThreshold?}
    NotifyCheck -- Yes --> Alert[Write notification Alert]
    NotifyCheck -- No --> Sweep[Global Menu Availability Sweep]
    Sweep --> UpdateMenu[Recalculate isAvailable for Menu Items]
    UpdateMenu --> Commit[Commit Transaction]
    Commit --> Clients[onSnapshot Pushes update to Clients]
```

1. **Transactional Decimation**: Order placement runs inside a Firestore transaction. It reads required ingredients, decrements `currentStock`, and appends an `order_deduction` ledger entry.
2. **Threshold Crossing Alerts**: When stock transitions from healthy to low, a notification is written. It is gated to only write once on crossing to prevent log spam.
3. **Whole-Menu Sweeps**: Menu availability `menuItems.isAvailable` is re-evaluated for the entire restaurant on every stock change. Any item whose recipe ingredients cannot support at least one order is instantly marked out of stock.
4. **Grounded AI**: Gemini Flash recommendations are grounded by injecting the live, ledger-computed list of available items and the customer's historical taste profile, preventing out-of-stock suggestions.

---

## 🛠️ Installation & Setup

### 1. Environment Variables
To run PlateIQ locally or in production, configure the following keys:

**Client Side (`.env.local` or Vercel Environment Variables)**:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_client_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

**Server Side (Next.js API route context)**:
```env
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your_project_id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7...\n-----END PRIVATE KEY-----\n"
GEMINI_API_KEY=your_gemini_flash_api_key
```

### 2. Seeding & Quick Play
1. Run the local development server:
   ```bash
   npm run dev
   ```
2. Navigate to `http://localhost:3000/login`.
3. Click the dashed **One-Click Demo Setup & Login** button. 
4. This will call `/api/seed` to seed ingredients, recipes, tables, and a demo staff member (`admin@plateiq.com` / `password123`) and automatically log you into the dashboard.
5. In another window, open `http://localhost:3000/` to test ordering, the AI Sous-Chef, and the dynamic Rescue Menu.
