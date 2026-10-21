# Fieldstock Inventory Management

Fieldstock is a MERN + TypeScript internal inventory and daily operations application. MongoDB is the system of record. The current V1 build implements shared Ashvex stock, sales reporting dimensions, vendor purchasing and payments, farm cash tracking, and internal invoices.

## Business Model

- **Ashvex owns the physical stock.** There is one common quantity and average cost per product in `ProductStock`.
- **Handling companies** (Ashvex, Ware, Harsh Enterprises, NKGD, Gabanis, Other) identify which business handled a sale. They do not have separate stock balances.
- **Farms** are sales and receipt reporting dimensions. They do not own or partition stock.
- **Vendors** supply stock to Ashvex. Finalized purchases and stock-in invoices add units to the same common balance.
- **Customers/buyers** are captured on sales invoices. Farm money receipts and withdrawals are separate financial tracking and never change inventory.

A sale through Ware, a marketplace batch associated with a farm, or a sales invoice all deduct from the same Ashvex common stock.

## Implemented Workflows

### Products and Common Stock

Create products with a globally unique SKU, a **Regular** or **Non-regular / occasional** type, unit, minimum stock, purchase cost, and selling price. The Stock & Products section shows common available units, minimum stock, unit purchase cost, selling price, estimated stock value, and stock status. Products without a balance record are displayed with zero stock. The list is paginated in the UI.

Every stock change writes a `StockTransaction` and updates the single `ProductStock` document for that product. Purchases, sales batches, finalized invoices, adjustments, and reversals use the same stock-change service.

### Handling Companies, Farms, and Sales Batches

Select a handling company in the sidebar for sales attribution. Add farms for reporting. Use **Enter sales batch** to enter a date, farm, marketplace, reference, and multiple product quantities in one record. Each batch deducts its lines from Ashvex common stock and preserves farm, handler, and marketplace details for reporting. All lines save or fail together. Sales and other stock-out operations that exceed current common stock are rejected with an insufficient-stock error; negative stock is not allowed.

The dashboard has date presets (today, yesterday, this week, this month, last month, custom) and product-unit sales reports filterable by farm, handling company, and marketplace. Product totals aggregate across farms by default; farm performance breaks totals down by product and farm. Direct sales invoices can also be tagged with a marketplace.

### Purchases and Vendors

Add vendors and record a purchase draft with multiple products, quantities, rates, tax/charges, and a vendor invoice reference. Saving the draft does not change stock or vendor outstanding. Review the purchase in the dashboard's **Purchases** list and explicitly **Finalize** it to add stock and update the vendor balance. Record manual vendor payments with date, method, reference, and remark. Vendor outstanding is calculated from finalized purchases and finalized stock-in invoices less payments; it is not stored as a manually maintained purchase field.

### Farm Money

Record multiple daily farm receipts with farm, amount, bank/account, reference, and remark. Record actual withdrawals separately. The dashboard shows received, withdrawn, remaining, and farm-wise receipts. These are manual internal cash-flow records and do not change stock or connect to a bank.

### Internal Invoices

Create sales or stock-in invoice drafts. Sales invoices capture handling company, direct/marketplace attribution, buyer details, optional farm, line quantities/rates/discounts/tax, and remarks. Stock-in invoices capture a vendor and purchased lines.

Drafts do not affect stock or totals. Finalize to post the invoice and stock movements atomically. Cancelled finalized invoices remain in history and create reversal stock transactions. The invoice list provides an on-screen invoice preview, printable A4 PDF preview, and PDF download. No email, WhatsApp, SMS, payment gateway, or marketplace invoice integration is included.

## MongoDB and Transaction Support

The API runs on `http://localhost:5008`; the Vite app runs on `http://localhost:1429`.
The workspace opens on Dashboard and uses sticky top-level tabs for Dashboard, Stock & Products, Sales, Vendors & Payables, and Farms, so modules are directly accessible without scrolling past other sections. The sidebar contains only these main destinations, handling-company selection, and database status. Product and vendor lists are paginated.

Copy `server/.env.example` to `server/.env` and set `MONGO_URI` to the intended database. Atlas SRV URIs (`mongodb+srv://...`) are supported. If the machine's configured DNS resolver refuses Atlas SRV lookups, the API retries discovery through fallback DNS servers `1.1.1.1` and `8.8.8.8`. Set `MONGO_DNS_SERVERS` to a comma-separated list of DNS server IPs to override those defaults. The fallback is used only when normal SRV lookup fails and only affects the API process.

The local single-node replica set remains available for offline development:

```env
MONGO_URI=mongodb://127.0.0.1:27018/inventory_management?replicaSet=rs0
```

If the API reports `ECONNREFUSED` at `127.0.0.1:27018`, the local replica-set process is stopped. Start it from PowerShell (using the existing data directory):

```powershell
& "C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe" --replSet rs0 --port 27018 --bind_ip 127.0.0.1 --dbpath "$env:LOCALAPPDATA\Fieldstock\MongoDB-rs0" --logpath "$env:LOCALAPPDATA\Fieldstock\MongoDB-rs0\mongod.log"
```

Leave that process running, then restart the API with `npm run dev:server`. The API now reports a short, actionable startup message instead of only the full replica-set topology trace when this local process is unavailable.

The existing MongoDB service at `localhost:27017` is standalone and has been left untouched as a backup. Its current Fieldstock collections were copied to the replica-set database on port `27018`.

The replica set is not needed for every database action. Reads, product/farm/vendor/company creation, draft invoice/purchase creation, vendor payments, and farm-money entries are ordinary MongoDB operations. It **is** required for stock-changing workflows: opening stock/adjustments, sales batches, purchase/invoice finalization, and finalized-invoice cancellation. Those operations update balances, transaction history, and source-document status together. Without a transaction, a failure halfway through could leave incorrect stock or history, so the app intentionally does not downgrade them to independent writes. Both Atlas replica sets and the local replica set support these transactions.

If recreating the local replica set, start `mongod` with `--replSet rs0 --port 27018 --bind_ip 127.0.0.1` and initialize it with `rs.initiate()` once. The URI must include the replica-set name:

```env
MONGO_URI=mongodb://127.0.0.1:27018/inventory_management?replicaSet=rs0
```

Do not store Atlas credentials in source files or commit `.env`.

## Run the App

Requirements: Node.js 20+ and npm.

```sh
npm install
npm run dev
```

Open:

- Frontend: `http://localhost:1429`
- API health: `http://localhost:5008/api/health`

Services can also be started separately with `npm run dev:client` and `npm run dev:server`.
The API process calls its health endpoint every 2 minutes while running. By default it uses the local `/api/health` URL; set `HEALTH_CHECK_URL` to a deployed health URL if it should call a specific address. This in-process check does not keep a stopped or suspended hosting service alive.

## Current API Surface

- Handling companies: `GET/POST /api/handling-companies`, `PATCH /api/handling-companies/:id` (the app also retains `GET/POST /api/companies` for compatibility)
- Products and farms: `GET/POST /api/products`, `GET/POST /api/farms`
- Common stock: `GET /api/inventory`, `GET /api/inventory/summary`, `GET /api/inventory/movements`, `POST /api/inventory/transactions`
- Sales batches: `GET/POST /api/inventory/sales-batches`
- Purchases: `GET/POST /api/purchases` (POST creates a draft), `GET /api/purchases/:id`, `POST /api/purchases/:id/finalize`
- Vendors/payments: `GET/POST /api/vendors`, `GET /api/vendors/outstanding`, `GET /api/vendors/:id/outstanding`, `POST /api/vendor-payments`
- Farm money: `GET/POST /api/farm-money`, `GET /api/farm-money/summary`
- Invoices: `GET/POST /api/invoices`, `GET/PATCH /api/invoices/:id`, `POST /api/invoices/:id/finalize`, `POST /api/invoices/:id/cancel`, `GET /api/invoices/:id/pdf`
- Dashboard: `GET /api/dashboard/summary`, `/daily-sales`, `/product-sales`, `/farm-sales`, `/vendor-outstanding`, `/farm-money`

All sales and stock reports read historical sale and stock-transaction records; dashboard sales include sales batches and finalized sales invoices.

## Data Migration

At startup, the API seeds the standard handling-company list and deactivates the legacy `Main Company`. Legacy company/farm-owned `ProductStock` rows are consolidated into one balance per product: quantities are summed and average cost is weighted by each prior quantity. If old companies contained duplicate SKUs, the oldest product is kept as canonical and stock/history/invoice references are redirected to it before duplicate product records are removed. Farm and product records are preserved as common catalog/reporting data. Historical transactions and sales batches remain available with their original farm/company references. The migration is idempotent and creates the new indexes after consolidation.

## Build and Type-Check

```sh
npm run typecheck
npm run build
```

## Project Review and Recommended Updates

This is a personal-use application. Authentication/role-based access, audit-log screens, marketplace integrations, and bank integrations are intentionally out of scope.

The current product view includes stock out by farm, stock in by vendor, totals, and paginated movement history. Vendor payables show finalized purchase/invoice lines, recorded payments, and a chronological running balance. Payments are not currently allocated to individual purchase bills, so the payable view explains the overall balance without implying bill-level payment allocation. Invoices can be previewed on screen and as printable PDFs before download.

Recommended next updates, in order:

1. **Farm-level stock-out drill-down:** make each farm total clickable and show the exact dated stock transactions and sales batches that contribute to that product/farm total. The aggregate exists; the click-through to its source records is not complete.
2. **Purchase detail and draft editing:** expose the existing purchase detail endpoint in the UI and allow correcting a purchase draft before finalization. Invoice drafts currently support basic header updates through the API, but not line-item editing in the UI.
3. **Server-side list pagination and filters:** products are currently fetched as a catalog (up to 500), while the UI paginates that already-loaded data; purchase and invoice lists are limited at the API. Add query-driven pages/date/status filters if these histories grow substantially.
4. **Automated tests:** no test runner or automated test files are currently configured. Add focused service/API tests for stock balance reconciliation, purchase finalization, vendor payable totals, invoice preview, and transaction rollback.
5. **Confirm sales attribution rules:** sales batches always require a farm, but sales invoices can omit one. Decide whether farm reporting should include farm-less direct invoices separately or require farm attribution for those sales.

Other capabilities not currently included are sales returns as a dedicated workflow, transfer workflows, invoice email/WhatsApp delivery, CSV/Excel import/export, advanced reports, and a full accounting ledger. These can remain deferred unless they become necessary for personal operations.
