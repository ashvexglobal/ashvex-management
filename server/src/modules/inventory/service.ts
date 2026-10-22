import mongoose, { Types } from 'mongoose';
import { Farm, Product, ProductStock, SalesBatch, StockTransaction, Vendor } from '../../models/inventory.js';
import { AppError } from '../../middleware/errors.js';

const inboundTypes = new Set(['OPENING', 'PURCHASE', 'SALES_RETURN', 'TRANSFER_IN', 'ADJUSTMENT_IN']);
const outboundTypes = new Set(['SALE', 'PURCHASE_RETURN', 'TRANSFER_OUT', 'DAMAGE', 'LOST', 'ADJUSTMENT_OUT']);

export type StockChange = {
  companyId?: string;
  handlingCompanyId?: string;
  productId: string;
  farmId?: string;
  transactionType: string;
  quantity: number;
  unitCost?: number;
  transactionDate?: string;
  reason?: string;
  notes?: string;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
};

export async function applyStockChangeInSession(session: mongoose.ClientSession, input: StockChange) {
  if (!inboundTypes.has(input.transactionType) && !outboundTypes.has(input.transactionType)) {
    throw new AppError('Unsupported stock transaction type', 400, 'INVALID_TRANSACTION_TYPE');
  }
  if (input.transactionType.startsWith('ADJUSTMENT') && !input.reason?.trim()) {
    throw new AppError('A reason is required for manual adjustments', 400, 'REASON_REQUIRED');
  }
  const [product, farm] = await Promise.all([
    Product.findOne({ _id: input.productId, status: 'ACTIVE' }).session(session),
    input.farmId ? Farm.findOne({ _id: input.farmId, status: 'ACTIVE' }).session(session) : Promise.resolve(null),
  ]);
  if (!product) throw new AppError('Active product not found', 404, 'PRODUCT_NOT_FOUND');
  if (input.farmId && !farm) throw new AppError('Active farm not found', 404, 'FARM_NOT_FOUND');

  const key = { productId: new Types.ObjectId(input.productId) };
  const current = await ProductStock.findOne(key).session(session);
  const previousBalance = current?.quantity ?? 0;
  const isInbound = inboundTypes.has(input.transactionType);
  const newBalance = previousBalance + (isInbound ? input.quantity : -input.quantity);
  if (newBalance < 0) throw new AppError('Insufficient Ashvex common stock', 409, 'INSUFFICIENT_STOCK');

  if (current) {
    const nextAverageCost = isInbound && input.unitCost !== undefined
      ? previousBalance < 0
        ? input.unitCost
        : ((previousBalance * current.averageCost) + (input.quantity * input.unitCost)) / newBalance
      : current.averageCost;
    const updated = await ProductStock.updateOne(
      { ...key, ...(!isInbound ? { quantity: { $gte: input.quantity } } : {}) },
      { $inc: { quantity: isInbound ? input.quantity : -input.quantity }, ...(isInbound && input.unitCost !== undefined ? { $set: { averageCost: nextAverageCost } } : {}) },
      { session },
    );
    if (updated.modifiedCount !== 1) throw new AppError('Stock changed concurrently; retry this operation', 409, 'STOCK_CONFLICT');
  } else if (isInbound) {
    await ProductStock.create([{ ...key, quantity: input.quantity, averageCost: input.unitCost ?? 0 }], { session });
  } else {
    throw new AppError('Insufficient Ashvex common stock', 409, 'INSUFFICIENT_STOCK');
  }

  const { companyId: legacyCompanyId, ...movementInput } = input;
  const [transaction] = await StockTransaction.create([{
    ...movementInput,
    handlingCompanyId: input.handlingCompanyId
      ? new Types.ObjectId(input.handlingCompanyId)
      : legacyCompanyId ? new Types.ObjectId(legacyCompanyId) : undefined,
    productId: key.productId,
    farmId: input.farmId ? new Types.ObjectId(input.farmId) : undefined,
    referenceId: input.referenceId ? new Types.ObjectId(input.referenceId) : undefined,
    previousBalance,
    newBalance,
    transactionDate: input.transactionDate ? new Date(input.transactionDate) : new Date(),
  }], { session });
  return { transaction, previousBalance, newBalance };
}

export async function recordStockChange(input: StockChange) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => applyStockChangeInSession(session, input));
  } finally {
    await session.endSession();
  }
}

export async function getInventory(query: { companyId?: string; farmId?: string; search?: string }) {
  const [products, balances] = await Promise.all([
    Product.find({ status: 'ACTIVE' }).sort({ name: 1 }).lean(),
    ProductStock.find().lean(),
  ]);
  const balanceByProduct = new Map(balances.map((balance) => [balance.productId.toString(), balance]));
  const normalized = products.map((product) => {
    const balance = balanceByProduct.get(product._id.toString());
    return {
      _id: product._id,
      productId: product,
      quantity: balance?.quantity ?? 0,
      averageCost: balance?.averageCost ?? 0,
      updatedAt: balance?.updatedAt ?? product.updatedAt,
    };
  });
  if (!query.search) return normalized;
  const search = query.search.toLocaleLowerCase();
  return normalized.filter((row) => {
    const product = row.productId as unknown as { name: string; sku: string };
    return product.name.toLocaleLowerCase().includes(search) || product.sku.toLocaleLowerCase().includes(search);
  });
}

export async function getInventorySummary(_companyId?: string) {
  const [products, balanceRows, farmCount] = await Promise.all([
    Product.find({ status: 'ACTIVE' }).select('_id minimumStock purchasePrice').lean(),
    ProductStock.find().select('productId quantity averageCost').lean(),
    Farm.countDocuments({ status: 'ACTIVE' }),
  ]);
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));
  const byProduct = new Map<string, { quantity: number; minimumStock: number; stockValue: number }>(
    products.map((product) => [product._id.toString(), { quantity: 0, minimumStock: product.minimumStock ?? 0, stockValue: 0 }]),
  );
  for (const row of balanceRows) {
    const id = row.productId.toString();
    const product = productMap.get(id);
    const current = byProduct.get(id);
    if (!product || !current) continue;
    current.quantity += row.quantity;
    current.stockValue += Math.max(0, row.quantity) * (row.averageCost || product.purchasePrice || 0);
  }
  const lowStockCount = [...byProduct.values()].filter((item) => item.quantity <= item.minimumStock).length;
  return {
    productCount: products.length,
    farmCount,
    totalUnits: [...byProduct.values()].reduce((sum, item) => sum + item.quantity, 0),
    stockValue: [...byProduct.values()].reduce((sum, item) => sum + item.stockValue, 0),
    lowStockCount,
    outOfStockCount: [...byProduct.values()].filter((item) => item.quantity <= 0).length,
  };
}

export type SalesBatchInput = {
  companyId: string;
  farmId?: string;
  salesDate: string;
  marketplace: 'AMAZON' | 'MEESHO' | 'FLIPKART' | 'OTHER' | 'DIRECT';
  customerId?: string;
  customerName?: string;
  customerCompany?: string;
  reference?: string;
  notes?: string;
  items: Array<{ productId: string; quantity: number }>;
};

export async function createSalesBatch(input: SalesBatchInput) {
  const session = await mongoose.startSession();
  let result: unknown;
  try {
    await session.withTransaction(async () => {
      const farmId = input.farmId ? new Types.ObjectId(input.farmId) : undefined;
      if (farmId) {
        const farm = await Farm.findOne({ _id: farmId, status: 'ACTIVE' }).session(session);
        if (!farm) throw new AppError('Farm not found', 404, 'FARM_NOT_FOUND');
      }
      const customer = input.customerId
        ? await Vendor.findOne({ _id: input.customerId, status: 'ACTIVE', isCustomer: true }).session(session)
        : null;
      if (input.customerId && !customer) throw new AppError('Active customer not found', 404, 'CUSTOMER_NOT_FOUND');
      if (input.customerId && input.marketplace !== 'DIRECT') throw new AppError('A party can only be selected for direct/offline sales', 400, 'CUSTOMER_REQUIRES_DIRECT_SALE');
      const handlingCompanyId = new Types.ObjectId(input.companyId);
      const handlingCompany = await mongoose.model('Company').findOne({ _id: handlingCompanyId, status: 'ACTIVE' }).session(session);
      if (!handlingCompany) throw new AppError('Select a valid handling company', 404, 'HANDLING_COMPANY_NOT_FOUND');

      const combinedItems = new Map<string, number>();
      for (const item of input.items) combinedItems.set(item.productId, (combinedItems.get(item.productId) ?? 0) + item.quantity);
      const productIds = [...combinedItems.keys()].map((id) => new Types.ObjectId(id));
      const products = await Product.find({ _id: { $in: productIds }, status: 'ACTIVE' }).session(session);
      if (products.length !== productIds.length) throw new AppError('One or more products are unavailable', 404, 'PRODUCT_NOT_FOUND');
      const productsById = new Map(products.map((product) => [product._id.toString(), product]));
      const batchNumber = `SB-${new Date(input.salesDate).toISOString().slice(0, 10).replaceAll('-', '')}-${new Types.ObjectId().toString().slice(-6).toUpperCase()}`;
      const batchItems = [...combinedItems].map(([productId, quantity]) => {
        const product = productsById.get(productId)!;
        return { productId: product._id, sku: product.sku, productName: product.name, unit: product.unit, quantity };
      });
      const [batch] = await SalesBatch.create([{
        handlingCompanyId,
        batchNumber,
        salesDate: new Date(input.salesDate),
        farmId,
        marketplace: input.marketplace,
        customerId: input.marketplace === 'DIRECT' ? customer?._id : undefined,
        customerName: input.marketplace === 'DIRECT' ? customer?.name ?? input.customerName : undefined,
        customerCompany: input.marketplace === 'DIRECT' ? customer?.companyName ?? input.customerCompany : undefined,
        reference: input.reference,
        notes: input.notes,
        totalQuantity: batchItems.reduce((sum, item) => sum + item.quantity, 0),
        items: batchItems,
      }], { session });

      for (const item of batchItems) {
        await applyStockChangeInSession(session, {
          handlingCompanyId: handlingCompanyId.toString(),
          farmId: farmId?.toString(),
          transactionType: 'SALE',
          productId: item.productId.toString(),
          quantity: item.quantity,
          transactionDate: input.salesDate,
          referenceType: 'SALES_BATCH',
          referenceId: batch!._id.toString(),
          referenceNumber: batchNumber,
          reason: input.marketplace === 'DIRECT' ? 'Direct sale to customer' : `Marketplace sale: ${input.marketplace}`,
          notes: input.notes,
        });
      }
      result = batch;
    });
    return result;
  } finally {
    await session.endSession();
  }
}
