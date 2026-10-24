import axios from 'axios';

const http = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:5008/api' });

export type Product = {
  _id: string;
  sku: string;
  productCode?: string;
  name: string;
  productType: 'REGULAR' | 'NON_REGULAR';
  category: string;
  unit: string;
  minimumStock: number;
  purchasePrice: number;
  sellingPrice: number;
  status: 'ACTIVE' | 'INACTIVE';
};
export type Farm = { _id: string; code: string; name: string; city?: string; status: string };
export type FarmMoneyTransaction = {
  _id: string;
  date: string;
  transactionType: 'FARM_RECEIPT' | 'WITHDRAWAL';
  marketplace?: 'MEESHO' | 'AMAZON' | 'FLIPKART' | 'OTHER';
  amount: number;
  farmId?: Pick<Farm, '_id' | 'name' | 'code'>;
  bankAccount?: string;
  reference?: string;
  remark?: string;
};
export type FarmMoneySummary = {
  receipts: number;
  withdrawals: number;
  remaining: number;
  byFarm: Array<{ farm?: Farm; total: number; receipts: number; withdrawals: number; remaining: number }>;
  receiptsByMarketplace: Array<{ _id: 'MEESHO' | 'AMAZON' | 'FLIPKART' | 'OTHER' | 'UNSPECIFIED'; total: number }>;
};
export type FarmMoneyPage = { transactions: FarmMoneyTransaction[]; page: number; limit: number; total: number; pageCount: number };
export type FarmMoneyMonth = { month: string; receipts: number; withdrawals: number; receiptCount: number; withdrawalCount: number };
export type ExpenseRecord = { _id: string; date: string; farmId?: Pick<Farm, '_id' | 'name' | 'code'>; category: string; amount: number; description?: string };
export type ExpensePage = { expenses: ExpenseRecord[]; total: number; totalAmount: number; page: number; limit: number; pageCount: number; byCategory: Array<{ category: string; amount: number }> };
export type Company = { _id: string; code: string; name: string; status: string };
export type Vendor = { _id: string; name: string; companyName?: string; mobile?: string; email?: string; address?: string; gstin?: string; notes?: string; isCustomer: boolean; isSupplier: boolean; status: 'ACTIVE' | 'INACTIVE'; customerDue?: number; customerCredit?: number; supplierPayable?: number; supplierCredit?: number };
export type Party = Vendor;
export type Invoice = { _id: string; invoiceNumber: string; invoiceType: 'SALES' | 'STOCK_IN'; status: 'DRAFT' | 'FINALIZED' | 'CANCELLED'; grandTotal: number; invoiceDate: string };
export type InvoiceDetails = Invoice & {
  handlingCompanyId?: Company;
  vendorId?: Vendor;
  customerId?: Pick<Party, '_id' | 'name' | 'companyName'>;
  farmId?: Farm;
  buyer?: Record<string, string>;
  subtotal: number;
  discount: number;
  tax: number;
  remark?: string;
  items: Array<{ productId: string; sku: string; productName: string; quantity: number; unit: string; rate: number; discount?: number; tax?: number; amount: number }>;
};
export type PurchaseRecord = { _id: string; purchaseNumber: string; invoiceNumber?: string; purchaseDate: string; totalAmount: number; status: 'DRAFT' | 'FINALIZED' | 'CANCELLED'; vendorId?: Vendor };
export type PurchaseDetails = PurchaseRecord & { subtotal: number; taxCharges: number; remark?: string; items: Array<{ sku?: string; productName?: string; quantity?: number; unit?: string; rate?: number; amount?: number }> };
export type BusinessSummary = Summary & { todaySalesUnits: number; todayPurchase: number; vendorOutstanding: number; farmMoneyReceived: number; withdrawals: number; remainingFarmMoney: number; salesInvoiceCount: number; stockInInvoiceCount: number };
export type MonthlySalesPoint = { period: string; units: number };
export type CompanyPerformancePoint = { farmId: string; companyName: string; unitsSold: number };
export type SalesBatch = {
  _id: string;
  batchNumber: string;
  salesDate: string;
  marketplace: 'AMAZON' | 'MEESHO' | 'FLIPKART' | 'OTHER' | 'DIRECT';
  customerId?: Pick<Vendor, '_id' | 'name' | 'companyName'>;
  customerName?: string;
  customerCompany?: string;
  totalQuantity: number;
  items: Array<{ sku: string; productName: string; quantity: number }>;
  farmId?: Pick<Farm, 'name' | 'code'>;
};
export type StockRow = {
  _id: string;
  quantity: number;
  averageCost: number;
  productId: Product;
  farmId?: Farm;
  updatedAt: string;
};
export type StockMovement = {
  _id: string;
  transactionType: string;
  quantity: number;
  newBalance: number;
  transactionDate: string;
  reason?: string;
  referenceNumber?: string;
  productId: Pick<Product, 'name' | 'sku' | 'unit'>;
  farmId: Pick<Farm, 'name' | 'code'>;
};
export type ProductStockHistory = {
  product: Pick<Product, '_id' | 'sku' | 'name' | 'unit' | 'purchasePrice'>;
  currentStock: number;
  unitCost: number;
  page: number;
  limit: number;
  totalTransactions: number;
  pageCount: number;
  transactions: Array<{
    _id: string;
    transactionType: string;
    quantity: number;
    previousBalance: number;
    newBalance: number;
    transactionDate: string;
    referenceType?: string;
    referenceNumber?: string;
    reason?: string;
    notes?: string;
    farmId?: Pick<Farm, 'name' | 'code'>;
    handlingCompanyId?: Pick<Company, 'name' | 'code'>;
  }>;
};
export type ProductStockAnalysis = {
  product: Pick<Product, 'name' | 'sku' | 'unit' | 'purchasePrice'>;
  currentStock: number;
  unitCost: number;
  totalIn: number;
  totalOut: number;
  stockOutByFarm: Array<{ farm?: Pick<Farm, 'name' | 'code'>; totalOut: number; sales: number; otherOut: number; transactions: number }>;
  stockInByVendor: Array<{ vendor?: Pick<Vendor, 'name' | 'companyName'>; quantity: number; amount: number; documents: number }>;
};
export type VendorLedger = {
  vendor: Vendor;
  totalPurchases: number;
  totalPaid: number;
  outstanding: number;
  openingBalance: number;
  events: Array<{
    _id: string;
    eventType: 'PURCHASE' | 'STOCK_IN_INVOICE' | 'PAYMENT';
    date: string;
    documentNumber?: string;
    vendorInvoiceNumber?: string;
    amount: number;
    runningBalance: number;
    subtotal?: number;
    discountAmount?: number;
    additionalCharges?: number;
    paymentMethod?: string;
    items?: Array<{ sku?: string; productName?: string; quantity?: number; unit?: string; rate?: number; amount?: number }>;
    remark?: string;
  }>;
  page: number;
  limit: number;
  totalEvents: number;
  pageCount: number;
};
export type CustomerLedger = {
  customer: Party;
  totalBilled: number;
  totalReceived: number;
  openingBalance: number;
  closingBalance: number;
  amountDue: number;
  customerCredit: number;
  products: Array<{ sku?: string; productName: string; unit: string; quantity: number }>;
  allTimeProducts: Array<{ sku?: string; productName: string; unit: string; quantity: number }>;
  events: Array<{
    _id: string;
    eventType: 'SALES_INVOICE' | 'RECEIPT' | 'DIRECT_SALE_BATCH';
    date: string;
    documentNumber?: string;
    referenceNumber?: string;
    sourceId: string;
    amount: number;
    debit: number;
    credit: number;
    runningBalance: number;
    paymentMethod?: string;
    remark?: string;
    items?: Array<{ sku?: string; productName?: string; quantity?: number; unit?: string; rate?: number; amount?: number }>;
  }>;
  page: number;
  limit: number;
  totalEvents: number;
  pageCount: number;
};
export type PartyLedger = (VendorLedger & { role: 'SUPPLIER' }) | (CustomerLedger & { role: 'CUSTOMER' });
export type Summary = {
  productCount: number;
  farmCount: number;
  totalUnits: number;
  stockValue: number;
  lowStockCount: number;
  outOfStockCount: number;
};

type ApiResponse<T> = { success: boolean; data: T };

export const api = {
  companies: async () => (await http.get<ApiResponse<Company[]>>('/companies')).data.data,
  createCompany: async (data: { name: string; code: string }) => (await http.post<ApiResponse<Company>>('/companies', data)).data.data,
  vendors: async () => (await http.get<ApiResponse<Vendor[]>>('/vendors')).data.data,
  parties: async (filters: { role?: 'CUSTOMER' | 'SUPPLIER' | 'ALL'; status?: 'ACTIVE' | 'INACTIVE' | 'ALL'; search?: string } = {}) => (await http.get<ApiResponse<Party[]>>('/parties', { params: filters })).data.data,
  saveParty: async (data: { _id?: string; name: string; companyName?: string; mobile?: string; email?: string; address?: string; gstin?: string; notes?: string; isCustomer: boolean; isSupplier: boolean; status: 'ACTIVE' | 'INACTIVE' }) => {
    const { _id, ...body } = data;
    return (await (_id ? http.patch<ApiResponse<Party>>(`/parties/${_id}`, body) : http.post<ApiResponse<Party>>('/parties', body))).data.data;
  },
  partyLedger: async (partyId: string, role: 'CUSTOMER' | 'SUPPLIER', filters: { from?: string; to?: string; page?: number } = {}) =>
    (await http.get<ApiResponse<CustomerLedger | VendorLedger>>(`/parties/${partyId}/ledger`, { params: { ...filters, role, limit: 20 } })).data.data,
  createCustomerReceipt: async (data: { customerId: string; receiptDate: string; amount: number; paymentMethod?: string; referenceNumber?: string; remark?: string; idempotencyKey: string }) =>
    (await http.post<ApiResponse<unknown>>('/customer-receipts', data)).data.data,
  vendorOutstanding: async () => (await http.get<ApiResponse<Array<{ vendor: Vendor; totalPurchases: number; totalPaid: number; outstanding: number }>>>('/vendors/outstanding')).data.data,
  vendorLedger: async (vendorId: string, page = 1) => (await http.get<ApiResponse<VendorLedger>>(`/vendors/${vendorId}/ledger`, { params: { page, limit: 20 } })).data.data,
  createVendor: async (data: { name: string; companyName?: string; mobile?: string; email?: string }) => (await http.post<ApiResponse<Vendor>>('/vendors', data)).data.data,
  createPurchase: async (data: { purchaseDate: string; vendorId: string; taxCharges?: number; remark?: string; items: Array<{ productId: string; quantity: number; rate: number }> }) => (await http.post<ApiResponse<PurchaseRecord>>('/purchases', data)).data.data,
  purchases: async () => (await http.get<ApiResponse<PurchaseRecord[]>>('/purchases')).data.data,
  purchaseDetails: async (purchaseId: string) => (await http.get<ApiResponse<PurchaseDetails>>(`/purchases/${purchaseId}`)).data.data,
  finalizePurchase: async (purchaseId: string) => (await http.post<ApiResponse<unknown>>(`/purchases/${purchaseId}/finalize`)).data.data,
  createVendorPayment: async (data: { vendorId: string; paymentDate: string; amount: number; paymentMethod: string; referenceNumber?: string; remark?: string }) => (await http.post<ApiResponse<unknown>>('/vendor-payments', data)).data.data,
  createFarmMoney: async (data: { date: string; transactionType: 'FARM_RECEIPT' | 'WITHDRAWAL'; farmId?: string; marketplace?: 'MEESHO' | 'AMAZON' | 'FLIPKART' | 'OTHER'; amount: number; bankAccount?: string; reference?: string; remark?: string }) => (await http.post<ApiResponse<unknown>>('/farm-money', data)).data.data,
  updateFarmMoneyReceipt: async (transactionId: string, data: { date: string; farmId: string; marketplace?: 'MEESHO' | 'AMAZON' | 'FLIPKART' | 'OTHER'; amount: number; bankAccount?: string; reference?: string; remark?: string }) => (await http.patch<ApiResponse<FarmMoneyTransaction>>(`/farm-money/${transactionId}`, data)).data.data,
  farmMoney: async (filters: { from?: string; to?: string; farmId?: string; page?: number; limit?: number }) => (await http.get<ApiResponse<FarmMoneyPage>>('/farm-money', { params: filters })).data.data,
  farmMoneyMonthly: async (farmId: string) => (await http.get<ApiResponse<FarmMoneyMonth[]>>('/farm-money/monthly', { params: { farmId } })).data.data,
  farmMoneySummary: async (from?: string, to?: string, farmId?: string) => (await http.get<ApiResponse<FarmMoneySummary>>('/farm-money/summary', { params: { from, to, farmId } })).data.data,
  invoices: async () => (await http.get<ApiResponse<Invoice[]>>('/invoices')).data.data,
  invoiceDetails: async (invoiceId: string) => (await http.get<ApiResponse<InvoiceDetails>>(`/invoices/${invoiceId}`)).data.data,
  createInvoice: async (data: { invoiceType: 'SALES' | 'STOCK_IN'; invoiceDate: string; handlingCompanyId?: string; marketplace?: string; vendorId?: string; customerId?: string; farmId?: string; buyer?: Record<string, string>; discount?: number; tax?: number; remark?: string; items: Array<{ productId: string; quantity: number; rate: number; discount?: number; tax?: number }> }) => (await http.post<ApiResponse<Invoice>>('/invoices', data)).data.data,
  linkInvoiceCustomer: async (invoiceId: string, customerId: string) => (await http.patch<ApiResponse<Invoice>>(`/invoices/${invoiceId}/customer`, { customerId })).data.data,
  finalizeInvoice: async (invoiceId: string) => (await http.post<ApiResponse<Invoice>>(`/invoices/${invoiceId}/finalize`)).data.data,
  cancelInvoice: async (invoiceId: string) => (await http.post<ApiResponse<Invoice>>(`/invoices/${invoiceId}/cancel`)).data.data,
  invoicePdf: async (invoiceId: string) => (await http.get<Blob>(`/invoices/${invoiceId}/pdf`, { responseType: 'blob' })).data,
  dashboard: async (from?: string, to?: string, handlingCompanyId?: string) => (await http.get<ApiResponse<BusinessSummary>>('/dashboard/summary', { params: { from, to, handlingCompanyId } })).data.data,
  salesTrend: async (from: string, to: string, granularity: 'day' | 'month', handlingCompanyId?: string) => (await http.get<ApiResponse<MonthlySalesPoint[]>>('/dashboard/monthly-sales', { params: { from, to, granularity, handlingCompanyId } })).data.data,
  companyPerformance: async (from: string, to: string, handlingCompanyId?: string) => (await http.get<ApiResponse<CompanyPerformancePoint[]>>('/dashboard/company-performance', { params: { from, to, handlingCompanyId } })).data.data,
  expenses: async (filters: { from?: string; to?: string; page?: number; limit?: number }) => (await http.get<ApiResponse<ExpensePage>>('/expenses', { params: filters })).data.data,
  createExpense: async (data: { date: string; farmId?: string; category: string; amount: number; description?: string }) => (await http.post<ApiResponse<ExpenseRecord>>('/expenses', data)).data.data,
  dailySales: async (filters: { from?: string; to?: string; farmId?: string; handlingCompanyId?: string; marketplace?: string }) => (await http.get<ApiResponse<Array<{ productName: string; sku: string; quantity: number; farm?: Farm; handlingCompany?: Company; marketplace: string }>>>('/dashboard/daily-sales', { params: filters })).data.data,
  farmSales: async (from?: string, to?: string) => (await http.get<ApiResponse<Array<{ farm: Farm; sku: string; productName: string; quantity: number }>>>('/dashboard/farm-sales', { params: { from, to } })).data.data,
  summary: async (companyId: string) => (await http.get<ApiResponse<Summary>>('/inventory/summary', { params: { companyId } })).data.data,
  inventory: async (companyId: string, search: string) => (await http.get<ApiResponse<StockRow[]>>('/inventory', { params: { companyId, search: search || undefined } })).data.data,
  productStockHistory: async (productId: string, page = 1) => (await http.get<ApiResponse<ProductStockHistory>>(`/inventory/products/${productId}/history`, { params: { page, limit: 20 } })).data.data,
  productStockAnalysis: async (productId: string) => (await http.get<ApiResponse<ProductStockAnalysis>>(`/inventory/products/${productId}/analysis`)).data.data,
  movements: async (companyId: string) => (await http.get<ApiResponse<StockMovement[]>>('/inventory/movements', { params: { companyId, limit: 8 } })).data.data,
  salesBatches: async (companyId: string) => (await http.get<ApiResponse<SalesBatch[]>>('/inventory/sales-batches', { params: { companyId } })).data.data,
  products: async (companyId: string) => (await http.get<ApiResponse<Product[]>>('/products', { params: { companyId } })).data.data,
  farms: async (companyId: string) => (await http.get<ApiResponse<Farm[]>>('/farms', { params: { companyId } })).data.data,
  createProduct: async (companyId: string, data: { sku: string; name: string; productType: 'REGULAR' | 'NON_REGULAR'; unit: string; minimumStock: number; purchasePrice: number; sellingPrice: number }) =>
    (await http.post<ApiResponse<Product>>('/products', { ...data, companyId })).data.data,
  createFarm: async (companyId: string, data: { code: string; name: string; city?: string }) =>
    (await http.post<ApiResponse<Farm>>('/farms', { ...data, companyId })).data.data,
  createMovement: async (companyId: string, data: { productId: string; farmId?: string; transactionType: string; quantity: number; unitCost?: number; reason?: string }) =>
    (await http.post<ApiResponse<StockMovement>>('/inventory/transactions', { ...data, companyId })).data.data,
  createSalesBatch: async (companyId: string, data: { farmId?: string; salesDate: string; marketplace: 'AMAZON' | 'MEESHO' | 'FLIPKART' | 'OTHER' | 'DIRECT'; customerId?: string; customerName?: string; customerCompany?: string; reference?: string; notes?: string; items: Array<{ productId: string; quantity: number }> }) =>
    (await http.post<ApiResponse<SalesBatch>>('/inventory/sales-batches', { ...data, companyId })).data.data,
};
