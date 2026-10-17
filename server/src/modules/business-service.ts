import mongoose, { Types } from 'mongoose';
import { AppError } from '../middleware/errors.js';
import { Company, FarmMoneyTransaction, Farm, Invoice, Product, Purchase, Vendor, VendorPayment } from '../models/inventory.js';
import { applyStockChangeInSession } from './inventory/service.js';

async function getAshvexCompany(session?: mongoose.ClientSession) {
  const query = Company.findOne({ code: 'ASHVEX', status: 'ACTIVE' });
  const company = session ? await query.session(session) : await query;
  if (!company) throw new AppError('Ashvex handling company is not configured', 500, 'ASHVEX_NOT_CONFIGURED');
  return company;
}

export async function recordPurchase(input: {
  purchaseDate: string; vendorId: string; taxCharges?: number; remark?: string;
  items: Array<{ productId: string; quantity: number; rate: number }>;
}) {
  const ashvex = await getAshvexCompany();
  const products = await Product.find({ _id: { $in: input.items.map((item) => item.productId) }, status: 'ACTIVE' });
  const byId = new Map(products.map((product) => [product._id.toString(), product]));
  if (products.length !== new Set(input.items.map((item) => item.productId)).size) throw new AppError('One or more products were not found', 404, 'PRODUCT_NOT_FOUND');
  const items = input.items.map((item) => {
    const product = byId.get(item.productId)!;
    return { productId: product._id, sku: product.sku, productName: product.name, quantity: item.quantity, unit: product.unit, rate: item.rate, amount: item.quantity * item.rate };
  });
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const taxCharges = input.taxCharges ?? 0;
  const purchaseNumber = `PUR-${Date.now().toString(36).toUpperCase()}`;
  return withSession(async (session) => {
    const [purchase] = await Purchase.create([{
      ...input,
      handlingCompanyId: ashvex._id,
      purchaseNumber,
      invoiceNumber: purchaseNumber,
      items,
      subtotal,
      taxCharges,
      totalAmount: subtotal + taxCharges,
      status: 'FINALIZED',
    }], { session });
    if (!purchase) throw new AppError('Could not create purchase record', 500, 'PURCHASE_CREATE_FAILED');
    await applyPurchaseStock(purchase, session);
    return purchase;
  });
}

export async function finalizePurchase(id: string) {
  return withSession(async (session) => {
    const purchase = await Purchase.findById(id).session(session);
    if (!purchase) throw new AppError('Purchase not found', 404, 'PURCHASE_NOT_FOUND');
    if (purchase.status !== 'DRAFT') throw new AppError('Only draft purchases can be finalized', 409, 'INVALID_STATUS');
    await applyPurchaseStock(purchase, session);
    purchase.status = 'FINALIZED';
    await purchase.save({ session });
    return purchase;
  });
}

async function applyPurchaseStock(purchase: InstanceType<typeof Purchase>, session: mongoose.ClientSession) {
  for (const item of purchase.items) {
    await applyStockChangeInSession(session, {
      productId: item.productId.toString(), transactionType: 'PURCHASE', quantity: Number(item.quantity ?? 0),
      unitCost: Number(item.rate ?? 0), transactionDate: purchase.purchaseDate.toISOString(), handlingCompanyId: purchase.handlingCompanyId.toString(),
      referenceType: 'PURCHASE', referenceId: purchase._id.toString(), referenceNumber: purchase.purchaseNumber,
      reason: `Purchase from vendor ${purchase.vendorId}`,
    });
  }
}

export async function getVendorOutstanding() {
  const vendors = await Vendor.find({ status: 'ACTIVE' }).sort({ name: 1 }).lean();
  const [purchases, invoices, payments] = await Promise.all([
    Purchase.aggregate([{ $match: { status: 'FINALIZED' } }, { $group: { _id: '$vendorId', total: { $sum: '$totalAmount' } } }]),
    Invoice.aggregate([{ $match: { status: 'FINALIZED', invoiceType: 'STOCK_IN', vendorId: { $ne: null } } }, { $group: { _id: '$vendorId', total: { $sum: '$grandTotal' } } }]),
    VendorPayment.aggregate([{ $group: { _id: '$vendorId', total: { $sum: '$amount' } } }]),
  ]);
  const sumByVendor = (rows: Array<{ _id: Types.ObjectId; total: number }>) => new Map(rows.map((row) => [row._id.toString(), row.total]));
  const purchaseTotals = sumByVendor(purchases);
  const invoiceTotals = sumByVendor(invoices);
  const paymentTotals = sumByVendor(payments);
  return vendors.map((vendor) => {
    const id = vendor._id.toString();
    const totalPurchases = (purchaseTotals.get(id) ?? 0) + (invoiceTotals.get(id) ?? 0);
    const totalPaid = paymentTotals.get(id) ?? 0;
    return { vendor, totalPurchases, totalPaid, outstanding: totalPurchases - totalPaid };
  });
}

export async function getVendorLedger(vendorId: string, page: number, limit: number) {
  const vendor = await Vendor.findOne({ _id: vendorId, status: 'ACTIVE' }).lean();
  if (!vendor) throw new AppError('Vendor not found', 404, 'VENDOR_NOT_FOUND');
  const skip = (page - 1) * limit;
  const [result] = await VendorPayment.aggregate([
    { $match: { vendorId: vendor._id } },
    {
      $project: {
        eventType: { $literal: 'PAYMENT' },
        date: '$paymentDate',
        documentNumber: '$referenceNumber',
        amount: { $multiply: ['$amount', -1] },
        paymentMethod: 1,
        remark: 1,
        sortOrder: { $literal: 0 },
      },
    },
    {
      $unionWith: {
        coll: Purchase.collection.name,
        pipeline: [
          { $match: { vendorId: vendor._id, status: 'FINALIZED' } },
          {
            $project: {
              eventType: { $literal: 'PURCHASE' },
              date: '$purchaseDate',
              documentNumber: '$purchaseNumber',
              vendorInvoiceNumber: '$invoiceNumber',
              amount: '$totalAmount',
              subtotal: '$subtotal',
              discountAmount: { $literal: 0 },
              additionalCharges: '$taxCharges',
              paymentMethod: { $literal: null },
              items: 1,
              remark: 1,
              sortOrder: { $literal: 1 },
            },
          },
        ],
      },
    },
    {
      $unionWith: {
        coll: Invoice.collection.name,
        pipeline: [
          { $match: { vendorId: vendor._id, invoiceType: 'STOCK_IN', status: 'FINALIZED' } },
          {
            $project: {
              eventType: { $literal: 'STOCK_IN_INVOICE' },
              date: '$invoiceDate',
              documentNumber: '$invoiceNumber',
              amount: '$grandTotal',
              subtotal: '$subtotal',
              discountAmount: '$discount',
              additionalCharges: '$tax',
              paymentMethod: { $literal: null },
              items: 1,
              remark: 1,
              sortOrder: { $literal: 2 },
            },
          },
        ],
      },
    },
    { $sort: { date: 1, sortOrder: 1, _id: 1 } },
    {
      $facet: {
        summary: [{
          $group: {
            _id: null,
            totalPurchases: { $sum: { $cond: [{ $in: ['$eventType', ['PURCHASE', 'STOCK_IN_INVOICE']] }, '$amount', 0] } },
            totalPaid: { $sum: { $cond: [{ $eq: ['$eventType', 'PAYMENT'] }, { $abs: '$amount' }, 0] } },
          },
        }],
        events: [
          {
            $setWindowFields: {
              sortBy: { date: 1, sortOrder: 1, _id: 1 },
              output: { runningBalance: { $sum: '$amount', window: { documents: ['unbounded', 'current'] } } },
            },
          },
          { $skip: skip },
          { $limit: limit },
          { $project: { sortOrder: 0 } },
        ],
        count: [{ $count: 'total' }],
      },
    },
  ]);
  const summary = result?.summary?.[0] ?? { totalPurchases: 0, totalPaid: 0 };
  const totalEvents = result?.count?.[0]?.total ?? 0;
  return {
    vendor,
    totalPurchases: summary.totalPurchases,
    totalPaid: summary.totalPaid,
    outstanding: summary.totalPurchases - summary.totalPaid,
    events: result?.events ?? [],
    page,
    limit,
    totalEvents,
    pageCount: Math.ceil(totalEvents / limit),
  };
}

export async function recordVendorPayment(input: { vendorId: string; paymentDate: string; amount: number; paymentMethod: string; referenceNumber?: string; remark?: string }) {
  const vendor = await Vendor.findOne({ _id: input.vendorId, status: 'ACTIVE' });
  if (!vendor) throw new AppError('Vendor not found', 404, 'VENDOR_NOT_FOUND');
  return VendorPayment.create({ ...input, paymentDate: new Date(input.paymentDate) });
}

export async function recordFarmMoney(input: { date: string; transactionType: 'FARM_RECEIPT' | 'WITHDRAWAL'; farmId?: string; marketplace?: 'MEESHO' | 'AMAZON' | 'FLIPKART' | 'OTHER'; amount: number; bankAccount?: string; reference?: string; remark?: string }) {
  if (input.transactionType === 'FARM_RECEIPT') {
    if (!input.farmId) throw new AppError('Farm is required for a receipt', 400, 'FARM_REQUIRED');
  }
  if (input.farmId && !await Farm.exists({ _id: input.farmId, status: 'ACTIVE' })) throw new AppError('Farm not found', 404, 'FARM_NOT_FOUND');
  return FarmMoneyTransaction.create({
    ...input,
    date: new Date(input.date),
    farmId: input.farmId ? new Types.ObjectId(input.farmId) : undefined,
    marketplace: input.transactionType === 'FARM_RECEIPT' ? input.marketplace ?? 'MEESHO' : undefined,
  });
}

export async function updateFarmMoneyReceipt(id: string, input: { date: string; farmId: string; marketplace?: 'MEESHO' | 'AMAZON' | 'FLIPKART' | 'OTHER'; amount: number; bankAccount?: string; reference?: string; remark?: string }) {
  if (!await Farm.exists({ _id: input.farmId, status: 'ACTIVE' })) throw new AppError('Farm not found', 404, 'FARM_NOT_FOUND');
  const transaction = await FarmMoneyTransaction.findOneAndUpdate(
    { _id: id, transactionType: 'FARM_RECEIPT' },
    { ...input, date: new Date(input.date), farmId: new Types.ObjectId(input.farmId), marketplace: input.marketplace },
    { new: true, runValidators: true },
  );
  if (!transaction) throw new AppError('Farm receipt not found', 404, 'FARM_MONEY_NOT_FOUND');
  return transaction;
}

export async function farmMoneyMonthly(farmId: string) {
  const rows = await FarmMoneyTransaction.aggregate([
    { $match: { farmId: new Types.ObjectId(farmId) } },
    {
      $group: {
        _id: { month: { $dateToString: { format: '%Y-%m', date: '$date' } }, transactionType: '$transactionType' },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.month': -1 } },
  ]);
  const months = new Map<string, { month: string; receipts: number; withdrawals: number; receiptCount: number; withdrawalCount: number }>();
  for (const row of rows) {
    const entry = months.get(row._id.month) ?? { month: row._id.month, receipts: 0, withdrawals: 0, receiptCount: 0, withdrawalCount: 0 };
    if (row._id.transactionType === 'FARM_RECEIPT') {
      entry.receipts = row.total;
      entry.receiptCount = row.count;
    } else {
      entry.withdrawals = row.total;
      entry.withdrawalCount = row.count;
    }
    months.set(row._id.month, entry);
  }
  return [...months.values()];
}

export async function farmMoneySummary(from?: Date, to?: Date, farmId?: string) {
  const dateFilter = from || to ? { date: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {};
  const match = { ...dateFilter, ...(farmId ? { farmId: new Types.ObjectId(farmId) } : {}) };
  const rows = await FarmMoneyTransaction.aggregate([
    { $match: match },
    { $group: { _id: { transactionType: '$transactionType', farmId: '$farmId' }, total: { $sum: '$amount' } } },
  ]);
  const receiptsByMarketplace = await FarmMoneyTransaction.aggregate([
    { $match: { ...match, transactionType: 'FARM_RECEIPT' } },
    { $group: { _id: { $ifNull: ['$marketplace', 'UNSPECIFIED'] }, total: { $sum: '$amount' } } },
    { $sort: { total: -1 } },
  ]);
  const farmIds = rows.map((row) => row._id.farmId).filter(Boolean);
  const farms = await Farm.find({ _id: { $in: farmIds } }).select('name code').lean();
  const farmMap = new Map(farms.map((farm) => [farm._id.toString(), farm]));
  const receipts = rows.filter((row) => row._id.transactionType === 'FARM_RECEIPT').reduce((sum, row) => sum + row.total, 0);
  const withdrawals = rows.filter((row) => row._id.transactionType === 'WITHDRAWAL').reduce((sum, row) => sum + row.total, 0);
  const farmTotals = new Map<string, { receipts: number; withdrawals: number }>();
  for (const row of rows) {
    if (!row._id.farmId) continue;
    const key = row._id.farmId.toString();
    const totals = farmTotals.get(key) ?? { receipts: 0, withdrawals: 0 };
    if (row._id.transactionType === 'FARM_RECEIPT') totals.receipts = row.total;
    if (row._id.transactionType === 'WITHDRAWAL') totals.withdrawals = row.total;
    farmTotals.set(key, totals);
  }
  const byFarm = [...farmTotals.entries()].map(([id, totals]) => ({
    farm: farmMap.get(id),
    total: totals.receipts,
    receipts: totals.receipts,
    withdrawals: totals.withdrawals,
    remaining: totals.receipts - totals.withdrawals,
  }));
  return { receipts, withdrawals, remaining: receipts - withdrawals, byFarm, receiptsByMarketplace };
}

export async function createInvoiceDraft(input: {
  invoiceType: 'SALES' | 'STOCK_IN'; invoiceDate: string; handlingCompanyId?: string; marketplace?: string; vendorId?: string; farmId?: string;
  buyer?: Record<string, string>; discount?: number; tax?: number; remark?: string;
  items: Array<{ productId: string; quantity: number; rate: number; discount?: number; tax?: number }>;
}) {
  if (input.invoiceType === 'SALES' && !input.handlingCompanyId) throw new AppError('Handling company is required for a sales invoice', 400, 'HANDLING_COMPANY_REQUIRED');
  if (input.invoiceType === 'STOCK_IN' && !input.vendorId) throw new AppError('Vendor is required for a stock-in invoice', 400, 'VENDOR_REQUIRED');
  const handlingCompanyId = input.invoiceType === 'STOCK_IN'
    ? (await getAshvexCompany())._id
    : new Types.ObjectId(input.handlingCompanyId!);
  const products = await Product.find({ _id: { $in: input.items.map((item) => item.productId) }, status: 'ACTIVE' });
  const byId = new Map(products.map((product) => [product._id.toString(), product]));
  if (products.length !== new Set(input.items.map((item) => item.productId)).size) throw new AppError('One or more products were not found', 404, 'PRODUCT_NOT_FOUND');
  const items = input.items.map((item) => {
    const product = byId.get(item.productId)!;
    const amount = Math.max(0, item.quantity * item.rate - (item.discount ?? 0) + (item.tax ?? 0));
    return { productId: product._id, sku: product.sku, productName: product.name, quantity: item.quantity, unit: product.unit, rate: item.rate, discount: item.discount ?? 0, tax: item.tax ?? 0, amount };
  });
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const discount = input.discount ?? items.reduce((sum, item) => sum + item.discount, 0);
  const tax = input.tax ?? items.reduce((sum, item) => sum + item.tax, 0);
  const grandTotal = Math.max(0, subtotal - discount + tax);
  const invoiceNumber = `INV-${input.invoiceType === 'SALES' ? 'S' : 'I'}-${Date.now().toString(36).toUpperCase()}`;
  return Invoice.create({ ...input, handlingCompanyId, invoiceNumber, invoiceDate: new Date(input.invoiceDate), items, subtotal, discount, tax, grandTotal, status: 'DRAFT' });
}

export async function finalizeInvoice(id: string) {
  return withSession(async (session) => {
    const invoice = await Invoice.findById(id).session(session);
    if (!invoice) throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND');
    if (invoice.status !== 'DRAFT') throw new AppError('Only draft invoices can be finalized', 409, 'INVALID_STATUS');
    for (const item of invoice.items) {
      await applyStockChangeInSession(session, {
        productId: item.productId.toString(), transactionType: invoice.invoiceType === 'SALES' ? 'SALE' : 'PURCHASE',
        quantity: Number(item.quantity ?? 0), unitCost: invoice.invoiceType === 'STOCK_IN' ? Number(item.rate ?? 0) : undefined,
        transactionDate: invoice.invoiceDate.toISOString(), handlingCompanyId: invoice.handlingCompanyId?.toString(),
        farmId: invoice.farmId?.toString(), referenceType: 'INVOICE', referenceId: invoice._id.toString(),
        referenceNumber: invoice.invoiceNumber ?? '', reason: `${invoice.invoiceType} invoice finalization`, notes: invoice.remark ?? undefined,
      });
    }
    invoice.status = 'FINALIZED';
    await invoice.save({ session });
    return invoice;
  });
}

export async function cancelInvoice(id: string) {
  return withSession(async (session) => {
    const invoice = await Invoice.findById(id).session(session);
    if (!invoice) throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND');
    if (invoice.status === 'CANCELLED') throw new AppError('Invoice is already cancelled', 409, 'INVALID_STATUS');
    if (invoice.status === 'FINALIZED') {
      for (const item of invoice.items) {
        await applyStockChangeInSession(session, {
          productId: item.productId.toString(), transactionType: invoice.invoiceType === 'SALES' ? 'SALES_RETURN' : 'PURCHASE_RETURN',
          quantity: Number(item.quantity ?? 0), unitCost: invoice.invoiceType === 'STOCK_IN' ? Number(item.rate ?? 0) : undefined,
          transactionDate: new Date().toISOString(), handlingCompanyId: invoice.handlingCompanyId?.toString(),
          farmId: invoice.farmId?.toString(), referenceType: 'INVOICE_REVERSAL', referenceId: invoice._id.toString(),
          referenceNumber: invoice.invoiceNumber, reason: `Cancellation reversal for ${invoice.invoiceNumber}`,
        });
      }
    }
    invoice.status = 'CANCELLED';
    await invoice.save({ session });
    return invoice;
  });
}

async function withSession<T>(operation: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => operation(session));
  } finally {
    await session.endSession();
  }
}
