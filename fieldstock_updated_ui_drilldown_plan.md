# Fieldstock — Updated V1 UI, Drill-Down & Navigation Implementation Plan

## 1. Purpose

Update the current Fieldstock application UI and workflows so the system is easier and faster for daily business use.

The current application already has common Ashvex stock, handling companies, farms, products, sales batches, purchases, vendors/payments, farm money, internal invoices, dashboard APIs, and a common stock transaction service. The current business model defines Ashvex as the physical stock owner, while handling companies and farms are reporting dimensions. fileciteturn1file0L5-L13

This is a personal-use application. Prioritize clear stock reconciliation and vendor payable details over multi-user administration or external integrations.

Primary focus:

1. Product stock drill-down: available stock, total in/out, stock out by farm, and stock received by vendor
2. Farm-wise stock-out analysis, with the transaction-level detail behind each farm total
3. Vendor payable drill-down: finalized bills, line items, payments, and chronological running balance
4. Purchase-entry detail so each payable can be explained by what was purchased and its charges

Supporting focus:

5. Simple navigation and dashboard links into these stock and vendor details
6. Loading, empty, error, and pagination states for detailed records

Out of scope for this personal-use project:

- Marketplace integrations or bank integrations
- Authentication or role-based access
- Audit-log screens

Do not rebuild existing business logic unnecessarily or add multi-user/external-service complexity.

---

## 2. Main UX Principle

Use this flow throughout the application:

```text
Dashboard
    ↓
Summary Number / Record
    ↓
Detail View
    ↓
Filtered Details
    ↓
Transaction History
```

The user should not need to search through multiple pages to understand an important number.

Important dashboard values, products, vendors and records should be clickable.

---

# 3. Navigation & Tabbing

## 3.1 Main Sidebar

Use a clean business-oriented structure:

```text
FIELDSTOCK

Dashboard

INVENTORY
  Overview
  Products
  Stock Movement
  Low Stock

SALES
  Sales Batches
  Sales Invoices
  Sales Summary

PURCHASE
  Purchases
  Vendors
  Vendor Payments

FARM MONEY
  Receipts
  Withdrawals
  Summary

SETUP
  Farms
  Handling Companies

REPORTS
  Sales
  Purchases
  Stock
  Vendor Outstanding
  Farm Money
```

Keep the existing independently scrolling desktop sidebar and compact mobile navigation behavior. fileciteturn1file0L43-L46

## 3.2 Contextual Tabs

Use tabs inside major modules.

Inventory:

```text
[ Overview ] [ Products ] [ Stock Movement ] [ Low Stock ]
```

Sales:

```text
[ Sales Batches ] [ Sales Invoices ] [ Sales Summary ]
```

Purchases:

```text
[ Purchases ] [ Vendors ] [ Payments ] [ Outstanding ]
```

Farm Money:

```text
[ Receipts ] [ Withdrawals ] [ Summary ]
```

Tabs must:

- Show active state clearly
- Preserve filters where practical
- Avoid unnecessary page reloads
- Work on desktop and mobile
- Keep navigation consistent

## 3.3 Breadcrumbs

Show the current location.

Example:

```text
Inventory / Products / Product A
Purchases / Vendors / ABC Vendor
Sales / Invoices / INV-2026-0015
```

Provide a clear Back action.

---

# 4. Product List

Show:

```text
Product
SKU
Unit
Current Stock
Minimum Stock
Purchase Cost
Selling Price
Stock Value
Status
```

Each product row/card is clickable.

Example:

```text
Product A
ABC001
850 PCS
IN STOCK
```

Click → Product Details.

---

# 5. Product Details

When the user selects a product:

```text
Product A
SKU: ABC001
Unit: PCS
Current Stock: 850 PCS
```

Show summary cards:

```text
Current Stock     850 PCS
Total Stock IN  1,000 PCS
Total Stock OUT   150 PCS
Stock Value      ₹XX,XXX
```

---

# 6. Product — Stock OUT by Farm

This is a primary requirement.

Do NOT show date-wise transactions first.

Show aggregated farm-wise stock OUT:

```text
Stock OUT by Farm

Farm / Location       Total OUT
--------------------------------
Ganesh                    50 PCS
Ware                      50 PCS
Harsh                     30 PCS
NKGD                      20 PCS
--------------------------------
Total                    150 PCS
```

The initial view must be a summary, not a long transaction list.

---

# 7. Farm Drill-Down

Every farm row should be clickable.

Example:

```text
Ganesh
50 PCS
```

Click:

```text
Product A → Ganesh
Total OUT: 50 PCS
```

Then show transaction history:

```text
Date        Reference        Qty
--------------------------------
01 Sep      Invoice #101      10
05 Sep      Sales Batch       15
12 Sep      Invoice #118      10
20 Sep      Sales Batch       15
--------------------------------
Total                         50
```

Required hierarchy:

```text
Product
   ↓
Farm
   ↓
Date / Transaction
```

---

# 8. Product — Stock IN by Vendor

Also show where stock came from:

```text
Stock IN by Vendor

Vendor              Total IN
-----------------------------
ABC Vendor             500
XYZ Vendor             300
Other Supplier         200
-----------------------------
Total                1,000
```

Clicking a vendor should show the relevant product/vendor purchase details.

---

# 9. Product Detail Layout

Recommended:

```text
------------------------------------------------
Product A
SKU: ABC001
Current Stock: 850 PCS
------------------------------------------------

[ Current Stock ] [ Total IN ] [ Total OUT ]

Stock IN by Vendor
--------------------------------
ABC Vendor          500
XYZ Vendor          300
Other Supplier      200

Stock OUT by Farm
--------------------------------
Ganesh               50
Ware                 50
Harsh                30
NKGD                 20

[ View Full Stock History ]
------------------------------------------------
```

---

# 10. Full Product Stock History

Provide:

```text
[ View Full History ]
```

Then show:

```text
Date
Transaction Type
Reference
Vendor / Farm
Handling Company
Quantity IN
Quantity OUT
Balance
```

Example:

```text
Date       Type       Reference     IN     OUT    Balance
---------------------------------------------------------
01 Sep     PURCHASE   PUR-001       100      -       100
05 Sep     SALE       INV-102         -     20        80
08 Sep     PURCHASE   PUR-004        50      -       130
12 Sep     SALE       BATCH-12        -     30       100
```

Use the existing StockTransaction history as the source of truth. The current application records stock changes through StockTransaction and updates ProductStock. fileciteturn1file0L19-L21

---

# 11. Vendor List

Show:

```text
Vendor
Total Purchases
Total Paid
Outstanding
```

Example:

```text
ABC Vendor
Purchases: ₹2,50,000
Paid: ₹1,58,131
Outstanding: ₹91,869
```

Vendor row/card must be clickable.

---

# 12. Vendor Details

Clicking a vendor opens:

```text
ABC Vendor

Total Purchases     ₹2,50,000
Total Paid          ₹1,58,131
Outstanding           ₹91,869
```

Tabs:

```text
[ Summary ] [ Purchases ] [ Payments ]
```

---

# 13. Vendor Purchases Tab

Show individual purchase entries:

```text
Date        Invoice       Amount       Paid       Due
-----------------------------------------------------
01 Sep      INV-1001      ₹50,000      ₹20,000    ₹30,000
08 Sep      INV-1020      ₹75,000      ₹50,000    ₹25,000
15 Sep      INV-1045      ₹40,000      ₹10,000    ₹30,000
```

Each purchase should be clickable.

---

# 14. Purchase Detail

Clicking a purchase shows:

```text
Purchase Details

Vendor:
ABC Vendor

Purchase Date:
15 Sep 2026

Invoice:
INV-1045
```

Items:

```text
Product A    100 PCS    ₹50
Product B     50 PCS    ₹80
```

Totals:

```text
Subtotal
Tax / Charges
Grand Total
Paid
Outstanding
```

If finalized, show the stock impact.

---

# 15. Vendor Payments Tab

Show:

```text
Date        Amount       Method       Reference
------------------------------------------------
05 Sep      ₹50,000      Bank         TXN001
15 Sep      ₹30,000      Cash         -
25 Sep      ₹78,131      Bank         TXN023
```

This must make the outstanding calculation understandable.

The current system calculates vendor outstanding from finalized purchases/stock-in invoices minus payments. fileciteturn1file0L29-L31

---

# 16. Vendor Summary

Show:

```text
Total Purchases
₹2,50,000

Total Paid
₹1,58,131

Outstanding
₹91,869
```

Optional:

```text
Purchase Count
Payment Count
Last Purchase Date
Last Payment Date
```

---

# 17. Dashboard Drill-Down

Make dashboard cards clickable.

Examples:

```text
Active Products → Products
Units in Stock → Stock Overview
Stock Value → Stock Details
Needs Attention → Low Stock / Out of Stock
Today Sales Units → Today's Sales
Today Purchases → Today's Purchases
Vendor Outstanding → Vendor Outstanding
Farm Money Remaining → Farm Money Summary
```

The current dashboard already exposes these summary/reporting areas through dashboard APIs. fileciteturn1file0L98-L100

---

# 18. Dashboard Product Movement

Keep the current product-unit sales reporting with filters:

```text
All Farms / Specific Farm
All Handling Companies / Specific Company
All Marketplaces / Specific Marketplace
```

Show:

```text
Product
Units Sold
```

Clicking a product opens Product Details.

The current implementation already supports date presets and product-unit sales reporting by farm, handling company and marketplace. fileciteturn1file0L25-L27

---

# 19. Farm Sales Drill-Down

Example:

```text
Farm Performance

Ganesh
Total Units Sold: 250

Ware
Total Units Sold: 180

Harsh
Total Units Sold: 125
```

Clicking a farm:

```text
Farm
   ↓
Product Sales
   ↓
Individual Sales Entries
```

Farm remains a reporting dimension, not a physical stock owner.

---

# 20. Invoice UX Completion

The existing invoice API already supports create/list, detail/update, finalize, cancel and PDF endpoints. fileciteturn1file0L96-L100

Complete the UI.

Draft invoices must allow editing:

```text
Buyer
Handling Company
Date
Remark
Products
Quantity
Rate
Discount
Tax
```

Allow:

```text
+ Add Product
Remove Product
Edit Quantity
Edit Rate
Edit Discount
Edit Tax
```

Draft changes must not affect stock.

---

# 21. Finalized Invoice

After Finalize:

```text
Validate
↓
Check Ashvex common stock
↓
Create/update invoice
↓
Create StockTransaction
↓
Update ProductStock
↓
Commit MongoDB transaction
```

Finalized invoices are locked.

Only finalized invoices affect stock and business totals.

---

# 22. Invoice Cancellation

Do not delete finalized invoices.

Sales cancellation:

```text
SALE
 ↓
CANCEL
 ↓
REVERSAL IN
```

Stock-in cancellation:

```text
PURCHASE
 ↓
CANCEL
 ↓
REVERSAL OUT
```

Keep the original invoice and transaction history.

---

# 23. Negative Stock Behavior

The current implementation allows a sales batch to become negative when a sale exceeds stock. fileciteturn1file0L23-L27

Before changing this, verify the business requirement.

If negative stock is NOT required, preferred behavior:

```text
Available Stock: 50
Requested: 70

ERROR

Insufficient stock.
Available: 50 PCS
Requested: 70 PCS
```

Do not finalize.

If negative inventory is intentionally required, make it an explicit configurable setting rather than silently allowing it.

Do not change this behavior without confirming the business requirement.

---

# 24. Reusable Detail Drawer

Where practical, use a reusable right-side drawer.

Example:

```text
Click Product
    ↓
Product Detail Drawer
```

Show:

```text
Product
SKU
Current Stock
Total IN
Total OUT

Stock IN by Vendor
Stock OUT by Farm

[View Full Details]
```

For large datasets, use a full detail page.

Use the same pattern for:

```text
Product
Vendor
Farm
Invoice
Purchase
```

---

# 25. Clickable Business Data

Make these clickable wherever displayed:

```text
Product
Vendor
Farm
Invoice
Purchase
Dashboard Card
Sales Total
Vendor Outstanding
Farm Money Balance
```

Example:

```text
₹91,869 Vendor Outstanding
        ↓
Vendor Outstanding List
        ↓
ABC Vendor
        ↓
Vendor Details
        ↓
Purchases / Payments
```

---

# 26. Required Product Drill-Down

```text
Products
   ↓
Product A
   ↓
Product Details
   ↓
Stock OUT by Farm
   ↓
Ganesh
   ↓
Transaction History
```

Default view = aggregated summary.

Date-wise history = only after drill-down.

---

# 27. Required Vendor Drill-Down

```text
Vendors
   ↓
ABC Vendor
   ↓
Vendor Details
   ↓
Purchases
   ↓
Purchase Entry
```

Payments:

```text
ABC Vendor
   ↓
Payments
   ↓
Payment Details
```

---

# 28. Product "Where Did Stock Go?" Summary

Product details should answer:

```text
Where did this product go?
```

Example:

```text
Product A

Stock IN
ABC Vendor        +500
XYZ Vendor        +300
Other Supplier    +200

Stock OUT
Ganesh Farm        -50
Ware Farm          -50
Harsh Farm         -30
NKGD Farm          -20

Current Stock       850
```

---

# 29. Stock Reconciliation

Make it easy to understand:

```text
Opening / Previous Stock
+ Stock IN
- Stock OUT
+/- Adjustments
= Current Stock
```

If adjustments exist, show them separately.

---

# 30. API Strategy

Reuse existing APIs where possible.

Current APIs include:

```text
GET /api/inventory
GET /api/inventory/summary
GET /api/inventory/movements

GET /api/vendors/outstanding
GET /api/vendors/:id/outstanding

GET /api/dashboard/summary
GET /api/dashboard/daily-sales
GET /api/dashboard/product-sales
GET /api/dashboard/farm-sales
GET /api/dashboard/vendor-outstanding
GET /api/dashboard/farm-money
```

fileciteturn1file0L92-L100

Only add APIs that are actually missing.

Recommended if not already covered:

```text
GET /api/products/:id/details
GET /api/products/:id/stock-by-farm
GET /api/products/:id/stock-by-vendor

GET /api/products/:id/farm/:farmId/movements

GET /api/vendors/:id/details
GET /api/vendors/:id/purchases
GET /api/vendors/:id/payments
```

If an existing endpoint can efficiently provide the same result, reuse it instead of creating duplicates.

---

# 31. Backend Aggregation

Do not load all historical transactions into the browser.

Use MongoDB aggregation for:

```text
Product stock by farm
Product stock by vendor
Vendor purchase history
Vendor payment history
Dashboard totals
```

Example Product Stock OUT query:

```text
Filter:
productId
transactionType = SALE / relevant stock-out types

Group:
farmId

Return:
farmId
farmName
totalQuantityOut
```

Example Product Stock IN:

```text
Filter:
productId
transactionType = PURCHASE / relevant stock-in types

Group:
vendorId

Return:
vendorId
vendorName
totalQuantityIn
totalPurchaseAmount
```

---

# 32. Pagination

Use server-side pagination for:

```text
Product transaction history
Vendor purchase history
Vendor payment history
```

Example:

```text
Showing 1–20 of 154
[Previous] [1] [2] [3] [Next]
```

Summary aggregation must not be affected by pagination.

---

# 33. Filters

Product details:

```text
Farm
Date Range
Transaction Type
Handling Company
```

Vendor details:

```text
Date Range
Purchase Status
Payment Method
```

Keep default views simple.

Advanced filters can be opened when needed.

---

# 34. Loading / Empty / Error States

Every detail screen must have proper states.

Loading:

```text
Loading product details...
```

Empty:

```text
No stock-out records found.
```

Error:

```text
Unable to load details.
[Retry]
```

Do not show blank screens.

---

# 35. Performance and Indexes

Verify indexes for common queries.

Potential fields:

```text
StockTransaction:
productId
transactionType
farmId
vendorId
createdAt
referenceId

Purchase:
vendorId
status
purchaseDate

VendorPayment:
vendorId
paymentDate

Sales:
farmId
handlingCompanyId
saleDate
```

Use compound indexes according to actual query patterns.

Do not add unnecessary indexes.

---

# 36. Phase-Based Implementation

Do not implement all changes in one large change.

## Phase 1 — Navigation & UI Foundation

Implement:

- Main workspace tabs: Dashboard, Stock & Products, Sales, Vendors & Payables, and Farms
- Keep Dashboard as the default entry screen
- Keep the main tabs accessible while scrolling through a workspace section
- Paginate large product lists (25 per page) and vendor payable lists (10 per page)
- Direct navigation from the stock table and vendor payable list into details
- Clear section headings and summary-to-detail navigation for stock and payables
- Mobile-friendly detail views and usable back/close behavior

Acceptance:

User can open any main section directly without scrolling past another section's records. Product and vendor lists remain usable as the catalog grows.

---

## Phase 2 — Product Drill-Down

Implement:

- Clickable product list
- Product detail page/drawer
- Current stock
- Total IN
- Total OUT
- Stock IN by vendor
- Stock OUT by farm
- Farm drill-down
- Full transaction history
- Server-side aggregation
- Pagination

Acceptance:

User can select any product and understand:

```text
How much stock is available?
How much came in?
Which vendors supplied it?
How much went out?
Which farms received/sold it?
```

---

## Phase 3 — Vendor Drill-Down

Implement:

- Clickable vendors
- Vendor summary
- Purchases tab
- Payments tab
- Purchase detail
- Payment detail
- Chronological payable ledger with running balance
- Per-bill product quantities, rates, charges, and total
- Outstanding calculation sourced only from finalized bills and recorded payments
- Pagination

Acceptance:

User can select a vendor and step through the records explaining:

```text
How much did we purchase?
How much did we pay?
What is outstanding?
Which purchases created the balance?
Which payments reduced it, and how the balance changed after each entry?

Payments are not allocated to individual bills in the current data model. The ledger must state this and show a chronological running balance rather than implying bill-level allocation.
```

---

## Phase 4 — Dashboard Drill-Down

Make dashboard cards and major numbers clickable.

Implement:

```text
Products
Stock
Sales
Purchases
Vendor Outstanding
Farm Money
Invoices
```

Acceptance:

Every important dashboard number leads to relevant detailed data.

---

## Phase 5 — Invoice UX Completion (Secondary)

Implement:

- Draft line-item editing
- Add/remove product
- Quantity/rate editing
- Discount/tax editing
- Finalize
- Stock validation
- PDF
- Print
- Cancel/reversal

Do not add email, WhatsApp, SMS or external sending.

---

## Phase 6 — Reports (After Stock and Vendor Workflows)

After the above flows are stable:

```text
Sales Report
Purchase Report
Stock Report
Vendor Outstanding Report
Farm Money Report
```

Common filters:

```text
Date
Product
Farm
Handling Company
Vendor
Customer
Marketplace
```

---

# 37. Do Not Break Existing Functionality

Preserve:

- Product management
- Common stock
- Sales batches
- Purchases
- Vendor payments
- Farm money
- Invoices
- Dashboard APIs
- MongoDB transaction support

The current system intentionally uses MongoDB transactions for stock-changing workflows including sales batches, purchase/invoice finalization, and finalized-invoice cancellation. fileciteturn1file0L64-L69

Do not replace transactional stock logic with frontend calculations.

---

# 38. Final UX Goal

The application should behave like:

```text
                    DASHBOARD
                        |
        +---------------+---------------+
        |               |               |
      PRODUCT         VENDOR           FARM
        |               |               |
     850 PCS        ₹91,869          Sales
        |               |               |
        ↓               ↓               ↓
 Product Details   Vendor Details   Farm Details
        |               |
    +---+---+       +---+---+
    |       |       |       |
   IN      OUT   Purchases Payments
    |       |
 Vendors   Farms
            |
         History
```

Core UX rule:

> **Do not make the user hunt for details. Important numbers, products, vendors and records should be clickable and should drill down to the exact underlying information.**

The default view should always be a clean summary. Detailed/date-wise records should appear only when the user drills down.
