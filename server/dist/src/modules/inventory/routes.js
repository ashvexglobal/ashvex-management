import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Company, Farm, Invoice, Product, ProductStock, Purchase, SalesBatch, StockTransaction, Vendor } from '../../models/inventory.js';
import { AppError } from '../../middleware/errors.js';
import { createSalesBatch, getInventory, getInventorySummary, recordStockChange } from './service.js';
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const companyIdFromQuery = (value) => {
    const parsed = objectId.safeParse(value);
    if (!parsed.success)
        throw new AppError('Select a company first', 400, 'COMPANY_REQUIRED');
    return parsed.data;
};
export const inventoryRouter = Router();
const stockInput = z.object({
    companyId: objectId,
    productId: z.string().regex(/^[a-f\d]{24}$/i),
    farmId: objectId.optional(),
    transactionType: z.enum(['OPENING', 'DAMAGE', 'LOST', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']),
    quantity: z.number().positive(),
    unitCost: z.number().min(0).optional(),
    transactionDate: z.string().datetime().optional(),
    reason: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(1000).optional(),
    referenceType: z.string().trim().max(80).optional(),
    referenceNumber: z.string().trim().max(100).optional(),
});
inventoryRouter.get('/summary', async (request, response) => {
    response.json({ success: true, data: await getInventorySummary() });
});
inventoryRouter.get('/', async (request, response) => {
    const search = typeof request.query.search === 'string' ? request.query.search.trim() : undefined;
    response.json({ success: true, data: await getInventory({ search }) });
});
inventoryRouter.get('/products/:productId/history', async (request, response) => {
    if (!objectId.safeParse(request.params.productId).success)
        throw new AppError('Invalid product id', 400, 'VALIDATION_ERROR');
    const product = await Product.findOne({ _id: request.params.productId, status: 'ACTIVE' }).select('name sku unit').lean();
    if (!product)
        throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    const page = Math.max(1, Math.floor(Number(request.query.page) || 1));
    const limit = Math.min(Math.max(Math.floor(Number(request.query.limit) || 20), 1), 100);
    const skip = (page - 1) * limit;
    const [stock, transactions, totalTransactions] = await Promise.all([
        ProductStock.findOne({ productId: product._id }).lean(),
        StockTransaction.find({ productId: product._id })
            .populate('farmId', 'name code')
            .populate('handlingCompanyId', 'name code')
            .sort({ transactionDate: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        StockTransaction.countDocuments({ productId: product._id }),
    ]);
    response.json({ success: true, data: { product, currentStock: stock?.quantity ?? 0, unitCost: stock?.averageCost ?? product.purchasePrice ?? 0, transactions, page, limit, totalTransactions, pageCount: Math.ceil(totalTransactions / limit) } });
});
inventoryRouter.get('/products/:productId/analysis', async (request, response) => {
    if (!objectId.safeParse(request.params.productId).success)
        throw new AppError('Invalid product id', 400, 'VALIDATION_ERROR');
    const product = await Product.findOne({ _id: request.params.productId, status: 'ACTIVE' }).select('name sku unit purchasePrice').lean();
    if (!product)
        throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    const productObjectId = new Types.ObjectId(request.params.productId);
    const [stock, movementTotals, farmOutRows, purchaseRows, invoiceRows] = await Promise.all([
        ProductStock.findOne({ productId: productObjectId }).lean(),
        StockTransaction.aggregate([
            { $match: { productId: productObjectId } },
            { $group: { _id: '$transactionType', quantity: { $sum: '$quantity' } } },
        ]),
        StockTransaction.aggregate([
            { $match: { productId: productObjectId, transactionType: { $in: ['SALE', 'PURCHASE_RETURN', 'TRANSFER_OUT', 'DAMAGE', 'LOST', 'ADJUSTMENT_OUT'] } } },
            { $group: { _id: { farmId: '$farmId', transactionType: '$transactionType' }, quantity: { $sum: '$quantity' }, count: { $sum: 1 } } },
        ]),
        Purchase.aggregate([
            { $match: { status: 'FINALIZED' } },
            { $unwind: '$items' },
            { $match: { 'items.productId': productObjectId } },
            { $group: { _id: '$vendorId', quantity: { $sum: '$items.quantity' }, amount: { $sum: '$items.amount' }, documents: { $addToSet: '$_id' } } },
        ]),
        Invoice.aggregate([
            { $match: { status: 'FINALIZED', invoiceType: 'STOCK_IN', vendorId: { $ne: null } } },
            { $unwind: '$items' },
            { $match: { 'items.productId': productObjectId } },
            { $group: { _id: '$vendorId', quantity: { $sum: '$items.quantity' }, amount: { $sum: '$items.amount' }, documents: { $addToSet: '$_id' } } },
        ]),
    ]);
    const farmIds = [...new Set(farmOutRows.map((row) => row._id.farmId?.toString()).filter((value) => Boolean(value)))].map((value) => new Types.ObjectId(value));
    const vendorIds = [...new Set([...purchaseRows, ...invoiceRows].map((row) => row._id?.toString()).filter((value) => Boolean(value)))].map((value) => new Types.ObjectId(value));
    const [farms, vendors] = await Promise.all([
        Farm.find({ _id: { $in: farmIds } }).select('name code').lean(),
        Vendor.find({ _id: { $in: vendorIds } }).select('name companyName').lean(),
    ]);
    const farmMap = new Map(farms.map((farm) => [farm._id.toString(), farm]));
    const vendorMap = new Map(vendors.map((vendor) => [vendor._id.toString(), vendor]));
    const vendorTotals = new Map();
    for (const row of [...purchaseRows, ...invoiceRows]) {
        const vendorId = row._id?.toString();
        if (!vendorId)
            continue;
        const current = vendorTotals.get(vendorId) ?? { vendor: vendorMap.get(vendorId), quantity: 0, amount: 0, documents: 0 };
        current.quantity += row.quantity;
        current.amount += row.amount;
        current.documents += row.documents.length;
        vendorTotals.set(vendorId, current);
    }
    const inboundTypes = new Set(['OPENING', 'PURCHASE', 'SALES_RETURN', 'TRANSFER_IN', 'ADJUSTMENT_IN']);
    const outboundTypes = new Set(['SALE', 'PURCHASE_RETURN', 'TRANSFER_OUT', 'DAMAGE', 'LOST', 'ADJUSTMENT_OUT']);
    const totalIn = movementTotals.filter((row) => inboundTypes.has(row._id)).reduce((sum, row) => sum + row.quantity, 0);
    const totalOut = movementTotals.filter((row) => outboundTypes.has(row._id)).reduce((sum, row) => sum + row.quantity, 0);
    const byFarm = new Map();
    for (const row of farmOutRows) {
        const farmId = row._id.farmId?.toString() ?? 'unassigned';
        const current = byFarm.get(farmId) ?? { farm: farmMap.get(farmId), totalOut: 0, sales: 0, otherOut: 0, transactions: 0 };
        current.totalOut += row.quantity;
        current.transactions += row.count;
        if (row._id.transactionType === 'SALE')
            current.sales += row.quantity;
        else
            current.otherOut += row.quantity;
        byFarm.set(farmId, current);
    }
    response.json({
        success: true,
        data: {
            product,
            currentStock: stock?.quantity ?? 0,
            unitCost: stock?.averageCost ?? product.purchasePrice ?? 0,
            totalIn,
            totalOut,
            stockOutByFarm: [...byFarm.values()].sort((left, right) => right.totalOut - left.totalOut),
            stockInByVendor: [...vendorTotals.values()].sort((left, right) => right.quantity - left.quantity),
        },
    });
});
inventoryRouter.get('/movements', async (request, response) => {
    const handlingCompanyId = typeof request.query.companyId === 'string' && objectId.safeParse(request.query.companyId).success
        ? new Types.ObjectId(request.query.companyId)
        : undefined;
    const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200);
    const transactions = await StockTransaction.find(handlingCompanyId ? { $or: [{ handlingCompanyId }, { companyId: handlingCompanyId }] } : {})
        .populate('productId', 'name sku unit')
        .populate('farmId', 'name code')
        .sort({ transactionDate: -1 })
        .limit(limit)
        .lean();
    response.json({ success: true, data: transactions });
});
inventoryRouter.get('/sales-batches', async (request, response) => {
    const companyId = companyIdFromQuery(request.query.companyId);
    const salesDate = typeof request.query.date === 'string' ? new Date(request.query.date) : undefined;
    const batches = await SalesBatch.find({ $or: [{ handlingCompanyId: companyId }, { companyId }], ...(salesDate ? { salesDate: { $gte: new Date(salesDate.setHours(0, 0, 0, 0)), $lt: new Date(salesDate.setHours(24, 0, 0, 0)) } } : {}) })
        .populate('farmId', 'name code')
        .sort({ salesDate: -1, createdAt: -1 })
        .limit(100)
        .lean();
    response.json({ success: true, data: batches });
});
inventoryRouter.post('/transactions', async (request, response) => {
    const parsed = stockInput.safeParse(request.body);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid stock transaction', 400, 'VALIDATION_ERROR');
    response.status(201).json({ success: true, data: await recordStockChange(parsed.data) });
});
const salesBatchInput = z.object({
    companyId: objectId,
    farmId: objectId.optional(),
    salesDate: z.string().datetime(),
    marketplace: z.enum(['AMAZON', 'MEESHO', 'FLIPKART', 'OTHER', 'DIRECT']),
    customerName: z.string().trim().max(120).optional(),
    customerCompany: z.string().trim().max(120).optional(),
    reference: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(1000).optional(),
    items: z.array(z.object({ productId: objectId, quantity: z.number().positive() })).min(1).max(200),
});
inventoryRouter.post('/sales-batches', async (request, response) => {
    const parsed = salesBatchInput.safeParse(request.body);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid sales batch', 400, 'VALIDATION_ERROR');
    response.status(201).json({ success: true, data: await createSalesBatch(parsed.data) });
});
export const masterRouter = Router();
const companyInput = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/) });
const productInput = z.object({
    sku: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(160),
    productCode: z.string().trim().max(60).optional(),
    category: z.string().trim().max(80).optional(),
    productType: z.enum(['REGULAR', 'NON_REGULAR']).default('REGULAR'),
    unit: z.string().trim().min(1).max(20).default('PCS'),
    minimumStock: z.number().min(0).default(0),
    purchasePrice: z.number().min(0).default(0),
    sellingPrice: z.number().min(0).default(0),
});
const farmInput = z.object({ code: z.string().trim().min(1).max(20), name: z.string().trim().min(1).max(120), city: z.string().trim().max(100).optional() });
masterRouter.get('/companies', async (_request, response) => {
    const companies = await Company.find({ status: 'ACTIVE' }).sort({ name: 1 }).lean();
    response.json({ success: true, data: companies });
});
masterRouter.post('/companies', async (request, response) => {
    const parsed = companyInput.safeParse(request.body);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid company', 400, 'VALIDATION_ERROR');
    const company = await Company.create({ ...parsed.data, code: parsed.data.code.toUpperCase() });
    response.status(201).json({ success: true, data: company });
});
masterRouter.get('/products', async (request, response) => {
    const products = await Product.find({ status: 'ACTIVE' }).sort({ name: 1 }).limit(500).lean();
    response.json({ success: true, data: products });
});
masterRouter.post('/products', async (request, response) => {
    const parsed = productInput.safeParse(request.body);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid product', 400, 'VALIDATION_ERROR');
    const sku = parsed.data.sku.toUpperCase();
    if (await Product.exists({ sku }))
        throw new AppError('SKU already exists in the common product catalog', 409, 'DUPLICATE_SKU');
    const product = await Product.create({ ...parsed.data, sku });
    response.status(201).json({ success: true, data: product });
});
masterRouter.get('/farms', async (request, response) => {
    const farms = await Farm.find({ status: 'ACTIVE' }).sort({ name: 1 }).lean();
    response.json({ success: true, data: farms });
});
masterRouter.post('/farms', async (request, response) => {
    const parsed = farmInput.safeParse(request.body);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid farm', 400, 'VALIDATION_ERROR');
    const farm = await Farm.create(parsed.data);
    response.status(201).json({ success: true, data: farm });
});
