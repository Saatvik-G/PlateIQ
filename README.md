# PlateIQ — Real-Time Ingredient Ledger-Driven Restaurant Management

> A full-stack restaurant platform where dish availability, low-stock alerts, and rescue pricing are not manually toggled — they are computed live from atomic ingredient stock transactions across the entire menu.


## Problem Statement Summary

Restaurant staff waste significant time manually updating menu availability and tracking ingredient stock across whiteboard ledgers or spreadsheets. Meanwhile, customers arrive without knowing what is actually available that day, and kitchens routinely discard surplus ingredients that could have been served at a discount rather than thrown away. PlateIQ addresses all three gaps — real-time ingredient-driven availability visible to customers the moment stock changes, a digital ordering and billing workflow for staff, and a dynamic Rescue Menu that surfaces surplus-ingredient dishes with automatic discount pricing before those ingredients expire.

---

## Core Differentiator — The Ingredient Ledger Engine

Every dish in PlateIQ has a `recipeMap`: a list of ingredient IDs and the quantities required per serving. When a customer places an order, a single atomic Firestore transaction simultaneously deducts the required stock from each ingredient document, writes a timestamped entry to the `inventoryLedger` collection, and then recalculates `isAvailable` for **every dish on the entire menu** — not just the ones that were ordered. This means that if Paneer Butter Masala, Tandoori Paneer Tikka, and Rasmalai all share the `paneer` ingredient, and an order reduces the paneer stock below any of their required quantities, all three dishes are marked unavailable in the same transaction before the response returns. The same sweep runs on staff restocking events. The Rescue Menu is a separate live view that surfaces dishes whose ingredients are flagged as surplus — these are automatically shown with a 15% discount, with an AI-generated sustainability pitch written by Gemini explaining why the dish is worth ordering today. Low-stock threshold alerts are generated server-side inside the same transaction and written to a `notifications` collection that the staff dashboard subscribes to in real time.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database | Firebase Firestore (real-time listeners + Admin SDK transactions) |
| Auth | Firebase Authentication (email magic link / passwordless) |
| Server API | Next.js API Routes (9 routes, all writes via Admin SDK) |
| AI | Google Gemini (`gemini-flash-lite-latest` via `@google/generative-ai` SDK) |
| Deployment | Vercel (free tier) |
| All services | Free tier only — no billing enabled on any service |

---

## User Stories Completed

### Bronze — UI/UX
**Status: Complete.**
Responsive dark-themed UI across all pages. Guest menu board with real-time availability badges, kitchen stock gauges per dish, and sold-out overlays. Staff dashboard with ticket-rail order view, occupancy grid, and inventory ledger panels. Smooth loading states, error boundaries, and role-appropriate navigation.

### Silver — Authentication + Digitized Workflows
**Status: Complete.**

- **Authentication:** Passwordless email magic link via Firebase Auth. Staff records stored in Firestore with `admin`, `kitchen`, or `waiter` roles. The `/dashboard` route is protected — unauthenticated users are redirected to `/login`.
- **Menu & Availability:** Live Firestore snapshot on the guest page; availability is recomputed server-side on every order and restock.
- **Ordering:** Customers browse the menu, add items to a cart, select a table, and submit an order. The order placement API runs an atomic transaction (stock deduction + availability sweep + ETA calculation).
- **Billing:** The `billed` status is fully reachable through the UI. When an order reaches `served`, staff click "Finalize Bill" which opens a modal showing the itemized bill (items + quantities + line totals, subtotal, tax, service charge, grand total). Clicking "Confirm & Close Bill" transitions the order to `billed`. The bill amounts displayed are the values computed at order placement time — they are not recalculated at billing time.
- **Notifications:** Low-stock alerts are written server-side when an ingredient crosses its threshold and displayed in the staff dashboard notification panel.

### Gold — Management Dashboard
**Status: Complete.**

- **Orders:** Live Kitchen Ticket Rail with status transitions (`placed → preparing → ready → served → billed`).
- **Tables:** Occupancy grid with live status. Staff can reserve tables.
- **Inventory:** Stock levels for all 30 ingredients with restock inputs and full timestamped ledger.
- **Staff Roster:** Admin-only view of all staff with role badges.
- **Analytics / KPIs:** Today's revenue, top menu items by units sold, peak ordering time histogram, occupied table count.
- **Role-based access:** `kitchen` sees orders + inventory. `waiter` sees orders + tables. `admin` sees everything. Tab content is blocked at the render level — a waiter who sets `activeTab` via browser console sees a 403 block, not the restricted content. All write API routes enforce server-side role checks returning `403 Forbidden` for unauthorized roles.

### Platinum — Intelligent Features
**Status: Partially verified end-to-end.**

- **AI Sous-Chef (grounded recommender):** Operational with `gemini-flash-lite-latest`. The prompt is grounded to the live list of `isAvailable === true` menu items fetched at request time. When Gemini quota is unavailable, the endpoint falls back silently to a keyword rule-based engine (vegetarian, spicy, budget, category, ingredient filters) using the same live available-item list — the customer always receives a recommendation.
- **Rescue Menu with AI descriptions:** Dishes with surplus ingredients shown at 15% discount. AI-generated sustainability pitch copy via Gemini. Known limitation: if Gemini quota is exhausted, shows a static fallback string rather than a graceful degradation message.

### Bonus — Beyond Problem Statement

- **Smart Table Optimizer:** Customer-facing reservation form (name, party size, time slot). The API runs a greedy best-fit algorithm inside a Firestore transaction — filters by available capacity ≥ party size, sorts by ascending capacity to minimize idle space, assigns the tightest-fit table. Auto-fills the cart's table selector on success.
- **Closed-loop taste feedback:** Thumbs-up / thumbs-down per dish per anonymous session. Ratings stored in `customerPreferences` and included in the AI Sous-Chef prompt.
- **Sustainability metrics:** ESG widget showing waste-rescued counter. Rescue Menu as a revenue-recovery + waste-reduction mechanism.

---

## AI Usage

**In-product AI features:**

1. **AI Sous-Chef** — `POST /api/sous-chef` uses Gemini (`gemini-flash-lite-latest`) to answer natural-language dish queries grounded to only currently available menu items. Customer taste preferences are injected into the system prompt at request time.

2. **Rescue Menu Description Generator** — `POST /api/rescue-description` uses Gemini to write a sustainability pitch for a surplus-ingredient dish.

**Development tooling:**

This application was built with the assistance of **Antigravity**, Google DeepMind's AI-assisted development environment. This is a "vibe coding" hackathon and the use of AI development tools is both expected and transparent — all architectural decisions, data model design, security rule authoring, and feature scoping were directed by the team; Antigravity was used as the primary implementation accelerator.

---

## Setup / Running Locally

```bash
# 1. Clone the repository
git clone https://github.com/Saatvik-G/PlateIQ.git
cd PlateIQ

# 2. Install dependencies
npm install

# 3. Copy and fill in environment variables
cp .env.example .env.local
# Edit .env.local with your Firebase and Gemini credentials

# 4. Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Database seeding:** On first page load, the app calls `/api/seed` which checks whether `menuItems` and `ingredients` exist in Firestore. If either collection is empty, it seeds 25 Indian dishes across 5 categories and 30 shared ingredients with realistic stock levels. No manual seeding step is required.

**Staff login:** Navigate to `/login`, enter any email address, and click the magic link sent to that inbox. The first user to log in is seeded as `admin`. Subsequent users are seeded as `waiter` by default (editable in Firestore).

---

## Security Notes

All writes to sensitive Firestore collections (`ingredients`, `orders`, `inventoryLedger`, `menuItems`, `tables`, `notifications`, `staff`, `reservations`) are routed exclusively through server-side Next.js API routes using the Firebase Admin SDK with a service account private key. Firestore Security Rules deny direct client-side writes to all of these collections (`allow write: if false`). The rules are correctly authored in `firestore.rules` in this repository. **Note for judges:** please verify these rules are actively deployed to your Firestore project by running `firebase deploy --only firestore:rules` if testing locally, as rule deployment is a separate step from code deployment.

The two collections that allow open client reads and writes are `tasteFeedback` and `customerPreferences`, which are intentionally open to support anonymous guest sessions without authentication.

---

## Hosted Application

**Live URL:** [https://plateiq-bistro-app.vercel.app](https://plateiq-bistro-app.vercel.app)

---

## Known Limitations / Future Improvements

- **Time-slot reservation conflicts are not auto-released.** A table reserved for the 7:00 PM slot remains blocked for that slot indefinitely — there is no scheduled job that releases confirmed reservations after the slot passes. In production this would require a Cloud Function or cron task.
- **Gemini quota dependency for Rescue Menu descriptions.** The AI Sous-Chef degrades gracefully to a rule-based fallback when Gemini is unavailable. The Rescue Menu AI description generator does not have an equivalent fallback — it shows a static "Calculating dynamic impact..." string rather than a clear degradation message.
- **No real payment integration.** The billing flow closes the order with a computed total displayed to staff, but there is no payment gateway — the bill is an internal record only, not a customer-facing receipt or a payment processor call.
- **Single restaurant only.** The `restaurantId` is hardcoded as `"default-restaurant"`. The data model supports multi-tenancy (every document carries `restaurantId`), but the routing and auth layer to separate multiple restaurant accounts was not built within hackathon scope.
- **Voice ordering not implemented.** Natural language voice input for ordering was considered but cut for time. The AI Sous-Chef is text-only.
