# Medical Shop Inventory Management System — System Design Plan

## 1. Project Overview

Build a production-ready web application for a medical shop to manage:

- Inventory / medicines
- Sales and billing
- Daily, weekly, and monthly sales dashboard
- Printable bills
- Authentication using Google
- Low-stock and expiry alerts
- Sales history and reports

### Core principle

The application should be designed around this business workflow:

```text
Inventory
   ↓
Customer Sale
   ↓
Stock Validation
   ↓
Create Sale
   ↓
Deduct Stock
   ↓
Bill Preview
   ↓
Direct Browser Printing
   ↓
Sales / Dashboard Data
```

> **Important billing decision:** Do NOT generate or store a PDF for every sale. After a sale is completed, show a print-friendly bill preview and use the browser's print functionality (`window.print()` / print CSS) to print it directly.

---

# 2. Recommended Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) + React + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| API | tRPC v11 (served from a Next.js route handler) |
| Validation | Zod |
| Data fetching | TanStack Query (via tRPC React client) |
| Database | PostgreSQL |
| ORM | Prisma |
| Authentication | Clerk — Google sign-in |

### Recommended architecture for this project

Use:

**Next.js + TypeScript + tRPC + Prisma + PostgreSQL + Clerk**

Single Next.js project — **no separate Express server**.

Why:

- End-to-end type safety: types flow from Prisma/Zod to the UI automatically, no duplicated frontend types or hand-written fetch clients.
- Zod input validation on every procedure enforces the backend-validation rules in §22.
- One codebase, one deploy, no CORS, one Clerk setup.
- Less boilerplate per feature, which keeps development (and AI-assisted development) faster and cheaper.

Trade-off: tRPC is TypeScript-client only. If a non-TypeScript client (e.g. a native mobile app or third-party integration) is needed later, add REST endpoints alongside it.

---

# 3. Application Architecture

```text
                    ┌──────────────────────┐
                    │      Frontend        │
                    │ Next.js + React      │
                    │ Tailwind + shadcn/ui │
                    └──────────┬───────────┘
                               │
                         tRPC
                               │
                    ┌──────────▼───────────┐
                    │  tRPC Routers (Next) │
                    │ Zod Validation / Auth│
                    │ Service Layer        │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │     PostgreSQL       │
                    │       Prisma         │
                    └──────────────────────┘
```

External services:

```text
Google
        ↓
     Clerk Auth

Browser
   ↓
Print Preview
   ↓
window.print()
   ↓
Printer
```

---

# 4. Main Pages

The initial version should have approximately **8 main application areas**.

```text
/login

/dashboard

/inventory

/sales
/sales/new
/sales/[id]

/reports

/settings
```

The Add/Edit Medicine form can be a modal or drawer instead of separate pages.

## Page list

### 1. Login
- Google authentication
- Logout

### 2. Dashboard
- Today's sales
- Weekly sales
- Monthly sales
- Number of orders
- Low-stock medicines
- Expiring medicines
- Sales chart

### 3. Inventory
- Search medicines
- Add medicine
- Edit medicine
- Delete medicine
- View stock
- View batch information
- View expiry
- Low-stock status

### 4. New Sale / POS
- Search medicine
- Select batch
- Add quantity
- Cart
- Calculate subtotal
- Calculate tax
- Apply discount if supported
- Select payment method
- Complete sale

### 5. Sale Details
- View completed sale
- View bill
- Print bill directly
- Start new sale

### 6. Sales History
- Search invoice
- Filter by date
- View sale
- View/print bill

### 7. Reports
- Daily sales
- Weekly sales
- Monthly sales
- Date-range sales
- Top-selling medicines
- Stock report
- Expiry report

### 8. Settings
- Shop details
- Address
- Phone
- GST information
- Invoice settings
- User profile
- Logout

---

# 5. Dashboard Design

Dashboard cards:

```text
┌─────────────────┐
│ Today's Sales   │
│ ₹24,560         │
└─────────────────┘

┌─────────────────┐
│ Today's Orders  │
│ 42              │
└─────────────────┘

┌─────────────────┐
│ Total Medicines │
│ 1,250           │
└─────────────────┘

┌─────────────────┐
│ Low Stock       │
│ 12              │
└─────────────────┘
```

Sales chart:

```text
[ Today ] [ Week ] [ Month ] [ Custom ]

              Sales
                │
                │        ●
                │     ●     ●
                │  ●
                │●
                └────────────────
                 Mon Tue Wed Thu
```

Dashboard should calculate its data from actual sales and inventory records.

---

# 6. Inventory Design

The inventory should not be a simple CRUD table.

A medical shop needs medicine and batch information.

## Medicine

```text
Medicine
--------
id
name
genericName
category
manufacturer
barcode
createdAt
updatedAt
```

## Inventory Batch

```text
InventoryBatch
--------------
id
medicineId
shopId
batchNumber
expiryDate
purchasePrice
sellingPrice
quantity
minimumStock
createdAt
updatedAt
```

### Why separate Medicine and Batch?

The same medicine can have multiple batches:

```text
Dolo 650
   │
   ├── Batch A
   │   Expiry: 2026
   │   Quantity: 20
   │
   ├── Batch B
   │   Expiry: 2027
   │   Quantity: 100
   │
   └── Batch C
       Expiry: 2028
       Quantity: 50
```

This is much more appropriate for a medical inventory system.

---

# 7. Inventory Features

## Add Medicine

Fields:

```text
Medicine Name
Generic Name
Category
Manufacturer
Barcode
Batch Number
Expiry Date
Purchase Price
Selling Price
Quantity
Minimum Stock
GST
```

## Edit Medicine

Use the same form as Add Medicine.

## Delete Medicine

Before deletion:

- Check whether the medicine has historical sales.
- Prefer soft deletion / inactive status for medicines that have sales history.
- Do not destroy historical sale references.

Example:

```text
isActive: true / false
```

---

# 8. Sales / POS

The New Sale page should be optimized for speed.

```text
New Sale

Search medicine / barcode
[____________________________]

┌─────────────────────────────────────────┐
│ Medicine │ Qty │ Price │ Total         │
├─────────────────────────────────────────┤
│ Dolo 650 │ 2   │ ₹30   │ ₹60           │
│ Crocin   │ 1   │ ₹25   │ ₹25           │
└─────────────────────────────────────────┘

Subtotal                     ₹85
GST                           ₹5
Discount                      ₹0
-------------------------------
TOTAL                        ₹90

Payment:
○ Cash
○ UPI
○ Card

[ Complete Sale ]
```

---

# 9. Sale Processing

When the user clicks **Complete Sale**:

```text
1. Validate cart
        ↓
2. Check stock
        ↓
3. Validate batch/expiry
        ↓
4. Calculate totals
        ↓
5. Create Sale record
        ↓
6. Create SaleItem records
        ↓
7. Deduct inventory
        ↓
8. Generate invoice number
        ↓
9. Show printable bill preview
```

Steps 5–7 must happen in a **database transaction**.

This prevents situations where a sale is created but stock is not deducted.

---

# 10. Billing — Important Requirement

## No PDF generation

The application should **NOT create a PDF file for every sale**.

Instead:

```text
Complete Sale
      ↓
Save sale in database
      ↓
Open Bill Preview
      ↓
Browser Print
      ↓
Physical Printer
```

Use a dedicated print-friendly React component/page.

Example:

```text
┌───────────────────────────────┐
│         MEDICAL SHOP          │
│       ABC Medical Store       │
│       Belagavi, Karnataka     │
│                               │
│ Invoice: INV-2026-000123      │
│ Date: 06-10-2026              │
│                               │
│ Dolo 650     2 × ₹30   ₹60    │
│ Crocin       1 × ₹25   ₹25    │
│                               │
│ Subtotal             ₹85      │
│ GST                   ₹5      │
│ ---------------------------   │
│ TOTAL                ₹90      │
│                               │
│          Thank You!           │
└───────────────────────────────┘

[ Print Bill ]
[ New Sale ]
```

## Printing implementation

Use:

```typescript
window.print()
```

and CSS such as:

```css
@media print {
  .no-print {
    display: none;
  }

  .print-only {
    display: block;
  }
}
```

The application can support:

- Normal printer
- Thermal receipt printer
- Browser print dialog
- Print preview

No PDF needs to be generated or stored.

---

# 11. Invoice Number

Every completed sale should receive a unique invoice number.

Example:

```text
INV-2026-000001
INV-2026-000002
INV-2026-000003
```

Invoice number generation must happen on the backend.

Do not generate invoice numbers only in the frontend.

---

# 12. Sales History

```text
Sales

Search invoice...
[________________]

Date Filter:
[ Today ] [ Week ] [ Month ] [ Custom ]

┌─────────────────────────────────────────────┐
│ Invoice      Date       Amount       Action │
├─────────────────────────────────────────────┤
│ INV-00123   06 Oct      ₹1,250      View   │
│ INV-00122   06 Oct      ₹850        View   │
│ INV-00121   05 Oct      ₹2,450      View   │
└─────────────────────────────────────────────┘
```

Clicking View:

```text
/sales/[id]
```

The sale details page should provide:

```text
View Bill
Print Bill
Back to Sales
```

---

# 13. Database Design

Initial tables:

```text
User
Shop
Medicine
InventoryBatch
Sale
SaleItem
```

Optional tables:

```text
Customer
Payment
```

These can be added when required.

---

# 14. Database Relationships

```text
User
 │
 └── Shop
       │
       ├── Medicine
       │      │
       │      └── InventoryBatch
       │
       └── Sale
              │
              └── SaleItem
                     │
                     ├── Medicine
                     └── InventoryBatch
```

More explicitly:

```text
Shop
 ├── Medicines
 ├── Inventory Batches
 └── Sales

Medicine
 └── Inventory Batches

Sale
 └── Sale Items

SaleItem
 ├── Medicine
 └── InventoryBatch
```

---

# 15. Sale Schema Concept

## Sale

```text
Sale
----
id
shopId
userId
invoiceNumber
subtotal
tax
discount
total
paymentMethod
createdAt
updatedAt
```

## SaleItem

```text
SaleItem
--------
id
saleId
medicineId
batchId
quantity
unitPrice
tax
total
```

---

# 16. Important Inventory Rule

If:

```text
Dolo 650 stock = 50
```

and customer buys:

```text
Dolo 650 × 3
```

then:

```text
50 - 3 = 47
```

After the sale:

```text
Stock = 47
```

This update must happen inside the same database transaction as sale creation.

---

# 17. Expiry Management

Because this is a medical shop, expiry management should be part of the system.

Dashboard alert:

```text
⚠ Alerts

12 medicines low in stock

7 medicines expiring within 30 days

3 medicines already expired
```

Expiry report:

```text
Medicine       Batch       Expiry       Qty
---------------------------------------------
Medicine A     B123        15 Oct 26    20
Medicine B     B456        28 Oct 26    10
```

Do not allow expired inventory to be sold.

The backend should validate expiry before completing a sale.

---

# 18. Low Stock Management

Each inventory batch can have:

```text
minimumStock
```

Example:

```text
Current stock = 8
Minimum stock = 10
```

Status:

```text
LOW STOCK
```

Dashboard:

```text
Low Stock: 12
```

Clicking it should show the affected medicines.

---

# 19. Application Folder Structure

Recommended structure:

```text
medical-shop/
│
├── app/
│   ├── (auth)/
│   │   └── login/
│   │
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   ├── inventory/
│   │   ├── sales/
│   │   │   ├── new/
│   │   │   └── [id]/
│   │   ├── reports/
│   │   └── settings/
│   │
│   └── api/
│       └── trpc/[trpc]/route.ts   # tRPC HTTP handler
│
├── server/
│   ├── trpc.ts                    # initTRPC, context (Clerk user + shop), procedures
│   ├── root.ts                    # appRouter (merges all routers)
│   └── routers/
│       ├── inventory.ts
│       ├── sales.ts
│       ├── dashboard.ts
│       ├── reports.ts
│       └── settings.ts
│
├── components/
│   ├── dashboard/
│   ├── inventory/
│   ├── sales/
│   ├── billing/
│   └── ui/
│
├── lib/
│   ├── db.ts                      # Prisma client singleton
│   ├── trpc-client.ts             # tRPC React client + TanStack Query provider
│   ├── billing.ts
│   └── validations.ts             # shared Zod schemas
│
├── services/
│   ├── inventory.service.ts
│   ├── sales.service.ts
│   └── billing.service.ts
│
├── prisma/
│   └── schema.prisma
│
└── types/
```

---

# 20. tRPC API Structure

All procedures are `protectedProcedure`s: middleware verifies the Clerk session and resolves the user's `shopId` into context. Every query is scoped by that `shopId`.

tRPC procedures:

```text
inventory.list
inventory.getById
inventory.create
inventory.update
inventory.delete

sales.create
sales.list
sales.getById

dashboard.getStats

reports.sales
reports.inventory
reports.expiry

settings.get
settings.update
```

Each procedure validates its input with a Zod schema and delegates to the service layer.

---

# 21. Business Logic Separation

Do not put important business logic inside React components.

Recommended flow:

```text
React UI
   ↓
tRPC client (TanStack Query)
   ↓
tRPC router (Zod + auth middleware)
   ↓
Service Layer
   ↓
Prisma
   ↓
PostgreSQL
```

Example:

```text
sales.create()
      ↓
Sales Service
      ↓
Validate items
      ↓
Check inventory
      ↓
Check expiry
      ↓
Calculate totals
      ↓
Database transaction
      ↓
Create Sale
      ↓
Create SaleItems
      ↓
Deduct Stock
      ↓
Return Sale
```

---

# 22. Security Requirements

The backend must never trust frontend values for:

- Price
- Stock quantity
- Tax
- Total amount
- User/shop ownership

The backend should recalculate important values.

Example:

Do not trust:

```text
Frontend:
total = ₹500
```

Instead:

```text
Backend:
fetch price
× quantity
+ tax
- discount
= final total
```

Also ensure users can only access data belonging to their shop/account.

---

# 23. MVP Development Plan

Build the system in this order.

## Phase 1 — Project Setup

- Create Next.js project
- Configure TypeScript
- Configure Tailwind
- Configure shadcn/ui
- Configure Prisma
- Connect PostgreSQL
- Configure tRPC v11 + TanStack Query + Zod
- Configure environment variables
- Configure Git

---

## Phase 2 — Authentication

- Configure Clerk
- Google login
- Protected routes
- User profile
- Logout

---

## Phase 3 — Database

Create:

```text
User
Shop
Medicine
InventoryBatch
Sale
SaleItem
```

Add relationships and indexes.

---

## Phase 4 — Application Layout

Build:

```text
Sidebar
Header
User menu
Responsive layout
Dashboard layout
```

Sidebar:

```text
Dashboard
Inventory
New Sale
Sales History
Reports
Settings
```

---

## Phase 5 — Inventory

Build:

```text
Inventory list
Search
Filters
Add medicine
Edit medicine
Delete/deactivate medicine
Batch management
Stock status
Expiry status
```

---

## Phase 6 — Sales / POS

Build:

```text
Medicine search
Barcode-ready search
Cart
Quantity management
Batch selection
Price calculation
Tax
Discount
Payment method
Complete sale
```

---

## Phase 7 — Stock Transaction

Implement:

```text
Create Sale
+
Create SaleItems
+
Deduct Inventory
```

inside a PostgreSQL transaction.

---

## Phase 8 — Bill Printing

Build:

```text
Bill component
Print preview
Print CSS
window.print()
Thermal receipt layout
Normal invoice layout
```

No PDF generation.

---

## Phase 9 — Sales History

Build:

```text
Sales table
Search
Date filters
Sale details
Bill preview
Print again
```

---

## Phase 10 — Dashboard

Calculate:

```text
Today's sales
Weekly sales
Monthly sales
Order count
Inventory count
Low-stock count
Expiry alerts
```

Add charts.

---

## Phase 11 — Reports

Build:

```text
Sales report
Inventory report
Expiry report
Top-selling medicines
Date-range reports
```

---

# 24. Version 2 Features

After the MVP works properly, add:

```text
Barcode scanning
Customer management
Supplier management
Purchase management
Purchase invoices
Profit calculation
Stock movement history
Expiry notifications
Low-stock notifications
```

---

# 25. Version 3 Features

Later:

```text
Multiple employees
Role-based access
Multiple shops
Cloud backup
WhatsApp invoice sharing
Advanced analytics
Audit logs
```

---

# 26. Final System Flow

```text
                         LOGIN
                           │
                           ▼
                     DASHBOARD
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
      INVENTORY           SALES           REPORTS
          │                │
          │                ▼
          │             NEW SALE
          │                │
          │                ▼
          │        SELECT MEDICINES
          │                │
          │                ▼
          │          CHECK STOCK
          │                │
          │                ▼
          │          CHECK EXPIRY
          │                │
          │                ▼
          │          CALCULATE TOTAL
          │                │
          │                ▼
          │          DATABASE TX
          │          ┌─────┴─────┐
          │          ▼           ▼
          │       CREATE      DEDUCT
          │        SALE         STOCK
          │          │
          │          ▼
          │      BILL PREVIEW
          │          │
          │          ▼
          │     BROWSER PRINT
          │          │
          │          ▼
          │       PRINTER
          │
          ▼
    STOCK / BATCHES
```

---

# 27. Recommended MVP Scope

Do NOT try to build everything initially.

The first working version should contain exactly:

```text
✓ Google authentication
✓ Dashboard
✓ Medicine CRUD
✓ Batch/stock management
✓ New Sale / POS
✓ Stock deduction
✓ Invoice numbering
✓ Bill preview
✓ Direct printing
✓ Sales history
✓ Daily/weekly/monthly sales
✓ Low-stock alerts
✓ Expiry alerts
✓ Basic reports
✓ Shop settings
```

The application should **not generate PDFs for individual sales**.

---

# 28. Definition of Done

The MVP is complete when this entire scenario works:

```text
Owner logs in
      ↓
Adds Dolo 650
      ↓
Adds batch + expiry + stock
      ↓
Customer buys 2 units
      ↓
Owner creates sale
      ↓
Backend validates stock
      ↓
Backend validates expiry
      ↓
Sale is saved
      ↓
Stock decreases by 2
      ↓
Invoice number is generated
      ↓
Bill preview appears
      ↓
Owner clicks Print
      ↓
Browser print dialog opens
      ↓
Bill prints
      ↓
Dashboard sales amount updates
```

If this workflow works reliably, the core medical-shop inventory system is working.



---

# 29. Decisions & Pending Fixes (handoff notes — 2026-10-06)

## Decisions made

- Stack: **Next.js + tRPC v11 + Zod + TanStack Query + Prisma + PostgreSQL + Clerk**, single project, no Express (chosen for type safety and lower build/token cost).
- Database: **Neon**. `.env` uses `DATABASE_URL` (pooled, `-pooler` host) for runtime and `DIRECT_URL` (direct host) for Prisma migrations. The user pastes the values into `.env` themselves; never commit `.env`.
- Project lives outside OneDrive (e.g. `C:\dev\medical-shop`) to avoid `node_modules` sync issues.
- Work is done in small, verifiable stages; outline stages before starting each phase.
- Authentication is **Google sign-in only** (via Clerk). Mobile number + OTP login was dropped by the owner on 2026-10-06.
- Access is limited to the Google accounts in `ALLOWED_EMAILS` (.env); others see an Access denied page. Email comes from a custom Clerk session-token claim. Roles/staff management stay in Version 3.
- Phase 2's "user profile / logout" UI is built as part of Phase 4's header (Clerk `UserButton`) instead of a throwaway menu.
- **Pricing is GST-inclusive (MRP).** The selling price already includes GST; bills show the GST portion back-calculated
  (`gst = price × rate / (100 + rate)`). Each batch stores its MRP and the backend never allows selling above it.
- **Invoice numbers restart each Indian financial year (1 April).** Format `INV-2026-27-000001`; one counter row per shop per FY.
- **One shared shop.** All `ALLOWED_EMAILS` users belong to the same shop, created automatically on the first sign-in and
  editable in Settings. Multiple shops remain a Version 3 feature.
- **Settings page is built in Phase 8** (§23 never assigned it a phase): bills need the shop name, address, phone and GSTIN.
- **Loose sales are supported.** Each medicine has a `packSize` (units per pack, e.g. 15 tablets per strip; 1 for
  bottles/tubes). Batch `quantity` is counted in **units** (tablets). MRP and prices are entered **per pack**, as printed.
  A sale line is sold either by pack (price = pack price, stock −= qty × packSize) or loose (price per unit =
  pack price ÷ packSize rounded to paise, stock −= qty), so full-pack sales always charge exactly the pack price.
  SaleItem records which way it was sold (Phase 6/7 schema).
- **Automated tests with Vitest**, starting in Phase 5, focused on services (stock, money, validation rules).
- **Discount: one bill-level discount, entered as % or ₹, no cap** (owner's choice; replaces "cap discount" in the
  pending fixes). The backend still rejects a discount above the subtotal and recalculates it. The discount is spread
  across lines in proportion to their value, and GST is back-calculated from each line's discounted amount.
- **Optional customer name, phone and prescribing doctor on each sale**, printed on the bill (useful for Schedule H
  medicines). Blank for walk-in sales. Full customer management stays in Version 2.
- **Prices can't be edited at the counter**: they always come from the batch's selling price (pack) or that price ÷
  pack size (loose), recalculated on the server.
- **Single computer, single user at a time** (owner, 2026-10-06). Concurrency stress tests for sales (Phase 7, Stage 3)
  were skipped at the owner's request. The safeguards stay in place regardless: guarded stock updates, the atomic
  invoice counter (tested with parallel requests in Phase 7 Stage 1) and the one-time request ID against double-clicks.
- **Basic bill printing arrived early, in Phase 7** (owner's request): `/sales/[id]` shows the printable bill with a
  Print button, and the print dialog opens automatically after Complete sale. Phase 8 still adds Settings (shop
  address, phone, GSTIN on the bill), the thermal-receipt layout and print options.
- **POS auto-splits a line across batches** (earliest expiry first) when one batch doesn't have enough stock;
  expired batches are never offered.

## Phase 1 stages

1. Scaffold Next.js (TypeScript, Tailwind, ESLint, App Router) in this folder, keeping `plan.md`
2. shadcn/ui init + base components (button, input, card, table, dialog, form)
3. Prisma + Neon connection, minimal schema, first migration
4. tRPC + TanStack Query + Zod wiring with a `health.ping` test procedure
5. Env setup: `.env.example`, startup env validation, Clerk key placeholders
6. Git `.gitignore`, `CLAUDE.md`, initial commit

## Pending fixes to apply in Phase 3 (schema)

- `Medicine` needs `shopId`, `isActive`, and a `gstRate` field.
- Low-stock threshold (`minimumStock`) should be per medicine, not per batch.
- Generate the invoice number **inside** the sale transaction (per-shop counter row), not after it.
- Deduct stock with a conditional update (`quantity >= n`) and check affected rows, to prevent overselling under concurrent sales.
- Use Prisma `Decimal` (or integer paise) for all money fields.
- `SaleItem` should snapshot medicine name, batch number, expiry, and GST rate at sale time.
- Validate/cap discount on the backend.
- POS: auto-select the batch that expires first (FEFO), with manual override.
- ~~Verify Clerk phone OTP support and SMS pricing for Indian (+91) numbers.~~ Not needed: mobile OTP dropped (see Decisions).
