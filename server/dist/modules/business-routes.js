import { Router } from 'express';
import { Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { Company, Expense, Farm, FarmMoneyTransaction, Invoice, Product, Purchase, SalesBatch, Vendor, VendorPayment } from '../models/inventory.js';
import { AppError } from '../middleware/errors.js';
import { cancelInvoice, createInvoiceDraft, farmMoneyMonthly, farmMoneySummary, finalizeInvoice, finalizePurchase, getVendorLedger, getVendorOutstanding, recordFarmMoney, recordPurchase, recordVendorPayment, updateFarmMoneyReceipt } from './business-service.js';
const id = z.string().regex(/^[a-f\d]{24}$/i);
const date = z.string().datetime();
const optionalId = z.preprocess((value) => {
    if (typeof value === 'string' && ['', 'null', 'undefined'].includes(value.trim().toLowerCase()))
        return undefined;
    return value;
}, id.optional());
const lineItems = z.array(z.object({ productId: id, quantity: z.number().positive(), rate: z.number().min(0), discount: z.number().min(0).optional(), tax: z.number().min(0).optional() })).min(1).max(200);
export const businessRouter = Router();
businessRouter.get('/handling-companies', async (_request, response) => {
    response.json({ success: true, data: await Company.find({ status: 'ACTIVE' }).sort({ name: 1 }).lean() });
});
businessRouter.post('/handling-companies', async (request, response) => {
    const parsed = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+/) }).safeParse(request.body);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid handling company', 400, 'VALIDATION_ERROR');
    const company = await Company.create({ ...parsed.data, code: parsed.data.code.toUpperCase() });
    response.status(201).json({ success: true, data: company });
});
businessRouter.patch('/handling-companies/:id', async (request, response) => {
    const parsed = z.object({ name: z.string().trim().min(2).max(120).optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional() }).safeParse(request.body);
    if (!id.safeParse(request.params.id).success || !parsed.success)
        throw new AppError('Invalid handling company update', 400, 'VALIDATION_ERROR');
    const company = await Company.findByIdAndUpdate(request.params.id, parsed.data, { new: true, runValidators: true });
    if (!company)
        throw new AppError('Handling company not found', 404, 'COMPANY_NOT_FOUND');
    response.json({ success: true, data: company });
});
businessRouter.get('/vendors', async (_request, response) => response.json({ success: true, data: await Vendor.find({ status: 'ACTIVE' }).sort({ name: 1 }).lean() }));
businessRouter.post('/vendors', async (request, response) => {
    const parsed = z.object({ name: z.string().trim().min(2).max(120), companyName: z.string().trim().max(120).optional(), mobile: z.string().trim().max(30).optional(), email: z.string().email().optional(), address: z.string().trim().max(500).optional() }).safeParse(request.body);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid vendor', 400, 'VALIDATION_ERROR');
    response.status(201).json({ success: true, data: await Vendor.create(parsed.data) });
});
businessRouter.get('/vendors/outstanding', async (_request, response) => response.json({ success: true, data: await getVendorOutstanding() }));
businessRouter.get('/vendors/:id/outstanding', async (request, response) => {
    if (!id.safeParse(request.params.id).success)
        throw new AppError('Invalid vendor id', 400, 'VALIDATION_ERROR');
    const row = (await getVendorOutstanding()).find((item) => item.vendor._id.toString() === request.params.id);
    if (!row)
        throw new AppError('Vendor not found', 404, 'VENDOR_NOT_FOUND');
    response.json({ success: true, data: row });
});
businessRouter.get('/vendors/:id/ledger', async (request, response) => {
    if (!id.safeParse(request.params.id).success)
        throw new AppError('Invalid vendor id', 400, 'VALIDATION_ERROR');
    const page = Math.max(1, Math.floor(Number(request.query.page) || 1));
    const limit = Math.min(Math.max(Math.floor(Number(request.query.limit) || 20), 1), 100);
    response.json({ success: true, data: await getVendorLedger(request.params.id, page, limit) });
});
const purchaseInput = z.object({ purchaseDate: date, vendorId: id, taxCharges: z.number().min(0).optional(), remark: z.string().trim().max(1000).optional(), items: lineItems });
businessRouter.get('/purchases', async (_request, response) => response.json({ success: true, data: await Purchase.find().populate('vendorId', 'name companyName').sort({ purchaseDate: -1 }).limit(200).lean() }));
businessRouter.post('/purchases', async (request, response) => {
    const parsed = purchaseInput.safeParse(request.body);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid purchase', 400, 'VALIDATION_ERROR');
    if (!await Vendor.exists({ _id: parsed.data.vendorId, status: 'ACTIVE' }))
        throw new AppError('Vendor not found', 404, 'VENDOR_NOT_FOUND');
    response.status(201).json({ success: true, data: await recordPurchase(parsed.data) });
});
businessRouter.get('/purchases/:id', async (request, response) => {
    const purchase = id.safeParse(request.params.id).success ? await Purchase.findById(request.params.id).populate('vendorId', 'name companyName').lean() : null;
    if (!purchase)
        throw new AppError('Purchase not found', 404, 'PURCHASE_NOT_FOUND');
    response.json({ success: true, data: purchase });
});
businessRouter.post('/purchases/:id/finalize', async (request, response) => {
    if (!id.safeParse(request.params.id).success)
        throw new AppError('Invalid purchase id', 400, 'VALIDATION_ERROR');
    response.json({ success: true, data: await finalizePurchase(request.params.id) });
});
businessRouter.get('/vendor-payments', async (_request, response) => response.json({ success: true, data: await VendorPayment.find().populate('vendorId', 'name').sort({ paymentDate: -1 }).limit(300).lean() }));
businessRouter.post('/vendor-payments', async (request, response) => {
    const parsed = z.object({ vendorId: id, paymentDate: date, amount: z.number().positive(), paymentMethod: z.enum(['CASH', 'BANK', 'UPI', 'OTHER']), referenceNumber: z.string().trim().max(100).optional(), remark: z.string().trim().max(500).optional() }).safeParse(request.body);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid vendor payment', 400, 'VALIDATION_ERROR');
    response.status(201).json({ success: true, data: await recordVendorPayment(parsed.data) });
});
businessRouter.get('/farm-money', async (request, response) => {
    const parsed = z.object({
        from: date.optional(),
        to: date.optional(),
        farmId: optionalId,
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
    }).safeParse(request.query);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid farm money filters', 400, 'VALIDATION_ERROR');
    const { from, to, farmId, page, limit } = parsed.data;
    const dateFilter = from || to ? { date: { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) } } : {};
    const filter = { ...dateFilter, ...(farmId ? { farmId } : {}) };
    const [transactions, total] = await Promise.all([
        FarmMoneyTransaction.find(filter).populate('farmId', 'name code').sort({ date: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        FarmMoneyTransaction.countDocuments(filter),
    ]);
    response.json({ success: true, data: { transactions, page, limit, total, pageCount: Math.ceil(total / limit) } });
});
businessRouter.post('/farm-money', async (request, response) => {
    const parsed = z.object({ date, transactionType: z.enum(['FARM_RECEIPT', 'WITHDRAWAL']), farmId: id.optional(), marketplace: z.enum(['MEESHO', 'AMAZON', 'FLIPKART', 'OTHER']).optional(), amount: z.number().positive(), bankAccount: z.string().trim().max(120).optional(), reference: z.string().trim().max(100).optional(), remark: z.string().trim().max(500).optional() }).safeParse(request.body);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid farm money transaction', 400, 'VALIDATION_ERROR');
    response.status(201).json({ success: true, data: await recordFarmMoney(parsed.data) });
});
businessRouter.get('/farm-money/monthly', async (request, response) => {
    const parsed = id.safeParse(request.query.farmId);
    if (!parsed.success)
        throw new AppError('Invalid farm id', 400, 'VALIDATION_ERROR');
    response.json({ success: true, data: await farmMoneyMonthly(parsed.data) });
});
businessRouter.patch('/farm-money/:id', async (request, response) => {
    if (!id.safeParse(request.params.id).success)
        throw new AppError('Invalid farm money transaction id', 400, 'VALIDATION_ERROR');
    const parsed = z.object({
        date,
        farmId: id,
        marketplace: z.enum(['MEESHO', 'AMAZON', 'FLIPKART', 'OTHER']).optional(),
        amount: z.number().positive(),
        bankAccount: z.string().trim().max(120).optional(),
        reference: z.string().trim().max(100).optional(),
        remark: z.string().trim().max(500).optional(),
    }).safeParse(request.body);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid farm receipt update', 400, 'VALIDATION_ERROR');
    response.json({ success: true, data: await updateFarmMoneyReceipt(request.params.id, parsed.data) });
});
businessRouter.get('/farm-money/summary', async (request, response) => {
    const parsed = z.object({ from: date.optional(), to: date.optional(), farmId: optionalId }).safeParse(request.query);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid farm money summary filters', 400, 'VALIDATION_ERROR');
    const { from, to, farmId } = parsed.data;
    response.json({ success: true, data: await farmMoneySummary(from ? new Date(from) : undefined, to ? new Date(to) : undefined, farmId) });
});
businessRouter.get('/expenses', async (request, response) => {
    const parsed = z.object({
        from: date.optional(),
        to: date.optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
    }).safeParse(request.query);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid expense filters', 400, 'VALIDATION_ERROR');
    const { from, to, page, limit } = parsed.data;
    const filter = from || to ? { date: { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) } } : {};
    const [expenses, aggregate, categoryTotals] = await Promise.all([
        Expense.find(filter).populate('farmId', 'name code').sort({ date: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Expense.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
        Expense.aggregate([{ $match: filter }, { $group: { _id: '$category', amount: { $sum: '$amount' } } }, { $sort: { amount: -1 } }]),
    ]);
    const total = aggregate[0]?.count ?? 0;
    response.json({ success: true, data: { expenses, total, totalAmount: aggregate[0]?.total ?? 0, page, limit, pageCount: Math.ceil(total / limit), byCategory: categoryTotals.map((row) => ({ category: row._id, amount: row.amount })) } });
});
businessRouter.post('/expenses', async (request, response) => {
    const parsed = z.object({
        date,
        farmId: optionalId,
        category: z.string().trim().min(2).max(80),
        amount: z.number().positive(),
        description: z.string().trim().max(500).optional(),
    }).safeParse(request.body);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid expense', 400, 'VALIDATION_ERROR');
    if (parsed.data.farmId && !await Farm.exists({ _id: parsed.data.farmId, status: 'ACTIVE' }))
        throw new AppError('Farm not found', 404, 'FARM_NOT_FOUND');
    const expense = await Expense.create({
        ...parsed.data,
        category: parsed.data.category.trim(),
        date: new Date(parsed.data.date),
        farmId: parsed.data.farmId ? new Types.ObjectId(parsed.data.farmId) : undefined,
    });
    response.status(201).json({ success: true, data: expense });
});
const invoiceInput = z.object({
    invoiceType: z.enum(['SALES', 'STOCK_IN']), invoiceDate: date, handlingCompanyId: id.optional(), marketplace: z.enum(['DIRECT', 'AMAZON', 'MEESHO', 'FLIPKART', 'OTHER']).optional(), vendorId: id.optional(), farmId: optionalId,
    buyer: z.record(z.string()).optional(), discount: z.number().min(0).optional(), tax: z.number().min(0).optional(), remark: z.string().trim().max(1000).optional(), items: lineItems,
});
businessRouter.get('/invoices', async (request, response) => {
    const invoiceType = request.query.type === 'SALES' || request.query.type === 'STOCK_IN' ? request.query.type : undefined;
    const rows = await Invoice.find(invoiceType ? { invoiceType } : {}).populate('handlingCompanyId vendorId farmId').sort({ invoiceDate: -1 }).limit(200).lean();
    response.json({ success: true, data: rows });
});
businessRouter.post('/invoices', async (request, response) => {
    const parsed = invoiceInput.safeParse(request.body);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid invoice', 400, 'VALIDATION_ERROR');
    if (parsed.data.handlingCompanyId && !await Company.exists({ _id: parsed.data.handlingCompanyId, status: 'ACTIVE' }))
        throw new AppError('Handling company not found', 404, 'COMPANY_NOT_FOUND');
    if (parsed.data.vendorId && !await Vendor.exists({ _id: parsed.data.vendorId, status: 'ACTIVE' }))
        throw new AppError('Vendor not found', 404, 'VENDOR_NOT_FOUND');
    if (parsed.data.farmId && !await Farm.exists({ _id: parsed.data.farmId, status: 'ACTIVE' }))
        throw new AppError('Farm not found', 404, 'FARM_NOT_FOUND');
    response.status(201).json({ success: true, data: await createInvoiceDraft(parsed.data) });
});
businessRouter.get('/invoices/:id', async (request, response) => {
    const invoice = id.safeParse(request.params.id).success ? await Invoice.findById(request.params.id).populate('handlingCompanyId vendorId farmId').lean() : null;
    if (!invoice)
        throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND');
    response.json({ success: true, data: invoice });
});
businessRouter.get('/invoices/:id/pdf', async (request, response) => {
    const invoice = id.safeParse(request.params.id).success
        ? await Invoice.findById(request.params.id).populate('handlingCompanyId vendorId').lean()
        : null;
    if (!invoice)
        throw new AppError('Invoice not found', 404, 'INVOICE_NOT_FOUND');
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    doc.pipe(response);
    const sales = invoice.invoiceType === 'SALES';
    const company = invoice.handlingCompanyId;
    const vendor = invoice.vendorId;
    doc.fontSize(22).fillColor('#254a37').text(sales ? company?.name ?? 'Sales Invoice' : 'Ashvex', 48, 48);
    doc.fontSize(10).fillColor('#65746a').text(sales ? 'INTERNAL SALES INVOICE' : 'STOCK-IN INVOICE', 48, 79);
    doc.fontSize(10).fillColor('#26352c').text(`Invoice: ${invoice.invoiceNumber}`, 370, 50, { width: 175, align: 'right' });
    doc.text(`Date: ${new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}`, 370, 67, { width: 175, align: 'right' });
    doc.text(`Status: ${invoice.status}`, 370, 84, { width: 175, align: 'right' });
    doc.moveTo(48, 112).lineTo(547, 112).strokeColor('#dce4dc').stroke();
    let detailsY = 130;
    if (sales && invoice.buyer) {
        const buyer = invoice.buyer;
        doc.fontSize(9).fillColor('#748278').text('BILL TO', 48, detailsY);
        doc.fontSize(11).fillColor('#26352c').text(buyer.customerName ?? '', 48, detailsY + 14);
        doc.fontSize(9).fillColor('#65746a').text([buyer.companyName, buyer.mobile, buyer.email, buyer.address, buyer.city, buyer.state, buyer.pincode, buyer.gstin].filter(Boolean).join(' · '), 48, detailsY + 30, { width: 490 });
        detailsY += 78;
    }
    else if (!sales) {
        doc.fontSize(9).fillColor('#748278').text('VENDOR', 48, detailsY);
        doc.fontSize(11).fillColor('#26352c').text(vendor?.companyName || vendor?.name || '', 48, detailsY + 14);
        detailsY += 48;
    }
    const tableY = detailsY + 12;
    doc.rect(48, tableY, 499, 26).fill('#eef3ed');
    doc.fontSize(8).fillColor('#58685d').text('PRODUCT', 56, tableY + 9, { width: 225 });
    doc.text('QTY', 286, tableY + 9, { width: 48, align: 'right' });
    doc.text('RATE', 345, tableY + 9, { width: 65, align: 'right' });
    doc.text('AMOUNT', 426, tableY + 9, { width: 110, align: 'right' });
    let rowY = tableY + 34;
    for (const item of invoice.items) {
        doc.fontSize(9).fillColor('#26352c').text(`${item.productName ?? ''}  (${item.sku ?? ''})`, 56, rowY, { width: 220 });
        doc.fillColor('#46564b').text(String(item.quantity ?? 0), 286, rowY, { width: 48, align: 'right' });
        doc.text(`₹${Number(item.rate ?? 0).toFixed(2)}`, 345, rowY, { width: 65, align: 'right' });
        doc.text(`₹${Number(item.amount ?? 0).toFixed(2)}`, 426, rowY, { width: 110, align: 'right' });
        rowY += 25;
        if (rowY > 680) {
            doc.addPage();
            rowY = 55;
        }
    }
    doc.moveTo(345, rowY + 5).lineTo(547, rowY + 5).strokeColor('#dce4dc').stroke();
    doc.fontSize(9).fillColor('#65746a').text('Subtotal', 380, rowY + 17, { width: 75 });
    doc.text(`₹${Number(invoice.subtotal).toFixed(2)}`, 455, rowY + 17, { width: 82, align: 'right' });
    doc.text('Discount', 380, rowY + 34, { width: 75 });
    doc.text(`₹${Number(invoice.discount ?? 0).toFixed(2)}`, 455, rowY + 34, { width: 82, align: 'right' });
    doc.text('Tax', 380, rowY + 51, { width: 75 });
    doc.text(`₹${Number(invoice.tax ?? 0).toFixed(2)}`, 455, rowY + 51, { width: 82, align: 'right' });
    doc.fontSize(12).fillColor('#254a37').text('Grand total', 365, rowY + 75, { width: 90 });
    doc.text(`₹${Number(invoice.grandTotal).toFixed(2)}`, 455, rowY + 75, { width: 82, align: 'right' });
    if (invoice.remark)
        doc.fontSize(9).fillColor('#65746a').text(`Remark: ${invoice.remark}`, 48, rowY + 118, { width: 490 });
    doc.fontSize(9).fillColor('#65746a').text('Authorized signature', 390, 740, { width: 150, align: 'right' });
    doc.end();
});
businessRouter.patch('/invoices/:id', async (request, response) => {
    if (!id.safeParse(request.params.id).success)
        throw new AppError('Invalid invoice id', 400, 'VALIDATION_ERROR');
    const invoice = await Invoice.findOne({ _id: request.params.id, status: 'DRAFT' });
    if (!invoice)
        throw new AppError('Draft invoice not found', 404, 'DRAFT_INVOICE_NOT_FOUND');
    const parsed = z.object({ remark: z.string().trim().max(1000).optional(), invoiceDate: date.optional(), buyer: z.record(z.string()).optional() }).safeParse(request.body);
    if (!parsed.success)
        throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid invoice update', 400, 'VALIDATION_ERROR');
    invoice.set(parsed.data);
    await invoice.save();
    response.json({ success: true, data: invoice });
});
businessRouter.post('/invoices/:id/finalize', async (request, response) => {
    if (!id.safeParse(request.params.id).success)
        throw new AppError('Invalid invoice id', 400, 'VALIDATION_ERROR');
    response.json({ success: true, data: await finalizeInvoice(request.params.id) });
});
businessRouter.post('/invoices/:id/cancel', async (request, response) => {
    if (!id.safeParse(request.params.id).success)
        throw new AppError('Invalid invoice id', 400, 'VALIDATION_ERROR');
    response.json({ success: true, data: await cancelInvoice(request.params.id) });
});
businessRouter.get('/dashboard/summary', async (request, response) => {
    const from = typeof request.query.from === 'string' ? new Date(request.query.from) : new Date(new Date().setHours(0, 0, 0, 0));
    const to = typeof request.query.to === 'string' ? new Date(request.query.to) : new Date(new Date().setHours(23, 59, 59, 999));
    const selectedCompany = request.query.handlingCompanyId === undefined
        ? undefined
        : id.safeParse(request.query.handlingCompanyId);
    if (selectedCompany && !selectedCompany.success)
        throw new AppError('Invalid handling company id', 400, 'VALIDATION_ERROR');
    const companyFilter = selectedCompany?.success ? { $or: [{ handlingCompanyId: new Types.ObjectId(selectedCompany.data) }, { companyId: new Types.ObjectId(selectedCompany.data) }] } : {};
    const [salesBatches, salesInvoices, purchases, stockInInvoices, vendorSummary, moneySummary, invoiceCounts] = await Promise.all([
        SalesBatch.aggregate([{ $match: { salesDate: { $gte: from, $lte: to }, ...companyFilter } }, { $group: { _id: null, units: { $sum: '$totalQuantity' } } }]),
        Invoice.aggregate([{ $match: { status: 'FINALIZED', invoiceType: 'SALES', invoiceDate: { $gte: from, $lte: to }, ...companyFilter } }, { $group: { _id: null, total: { $sum: '$grandTotal' }, count: { $sum: 1 }, units: { $sum: { $sum: '$items.quantity' } } } }]),
        Purchase.aggregate([{ $match: { status: 'FINALIZED', purchaseDate: { $gte: from, $lte: to } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
        Invoice.aggregate([{ $match: { status: 'FINALIZED', invoiceType: 'STOCK_IN', invoiceDate: { $gte: from, $lte: to } } }, { $group: { _id: null, total: { $sum: '$grandTotal' } } }]),
        getVendorOutstanding(),
        farmMoneySummary(from, to),
        Invoice.aggregate([{ $match: { status: 'FINALIZED', invoiceType: 'STOCK_IN', invoiceDate: { $gte: from, $lte: to } } }, { $group: { _id: '$invoiceType', count: { $sum: 1 } } }]),
    ]);
    const stock = await (await import('./inventory/service.js')).getInventorySummary();
    const invoiceUnits = Number(salesInvoices[0]?.units ?? 0);
    const batchUnits = Number(salesBatches[0]?.units ?? 0);
    response.json({ success: true, data: {
            ...stock,
            todaySalesUnits: batchUnits + invoiceUnits,
            todayPurchase: Number(purchases[0]?.total ?? 0) + Number(stockInInvoices[0]?.total ?? 0),
            vendorOutstanding: vendorSummary.reduce((sum, item) => sum + item.outstanding, 0),
            farmMoneyReceived: moneySummary.receipts,
            withdrawals: moneySummary.withdrawals,
            remainingFarmMoney: moneySummary.remaining,
            salesInvoiceCount: Number(salesInvoices[0]?.count ?? 0),
            stockInInvoiceCount: invoiceCounts.find((item) => item._id === 'STOCK_IN')?.count ?? 0,
        } });
});
businessRouter.get('/dashboard/daily-sales', async (request, response) => {
    const from = typeof request.query.from === 'string' ? new Date(request.query.from) : new Date(new Date().setHours(0, 0, 0, 0));
    const to = typeof request.query.to === 'string' ? new Date(request.query.to) : new Date(new Date().setHours(23, 59, 59, 999));
    const dimensions = {};
    for (const key of ['farmId', 'handlingCompanyId', 'marketplace']) {
        const value = request.query[key];
        if (typeof value === 'string' && key !== 'marketplace') {
            if (!id.safeParse(value).success)
                throw new AppError(`Invalid ${key}`, 400, 'VALIDATION_ERROR');
            dimensions[key] = new Types.ObjectId(value);
        }
        else if (typeof value === 'string')
            dimensions[key] = value.toUpperCase();
    }
    if (typeof request.query.productId === 'string') {
        if (!id.safeParse(request.query.productId).success)
            throw new AppError('Invalid productId', 400, 'VALIDATION_ERROR');
        dimensions['items.productId'] = new Types.ObjectId(request.query.productId);
    }
    const [invoiceRows, batchRows] = await Promise.all([
        Invoice.aggregate([
            { $match: { status: 'FINALIZED', invoiceType: 'SALES', invoiceDate: { $gte: from, $lte: to }, ...(dimensions.marketplace ? dimensions.marketplace === 'DIRECT' ? { $or: [{ marketplace: 'DIRECT' }, { marketplace: { $exists: false } }] } : { marketplace: dimensions.marketplace } : {}), ...Object.fromEntries(Object.entries(dimensions).filter(([key]) => key !== 'marketplace' && !key.startsWith('items.'))) } },
            { $unwind: '$items' },
            ...(dimensions['items.productId'] ? [{ $match: { 'items.productId': dimensions['items.productId'] } }] : []),
            { $group: { _id: '$items.productId', productName: { $first: '$items.productName' }, sku: { $first: '$items.sku' }, quantity: { $sum: '$items.quantity' } } },
            { $sort: { quantity: -1 } },
        ]),
        SalesBatch.aggregate([
            { $match: { salesDate: { $gte: from, $lte: to }, ...Object.fromEntries(Object.entries(dimensions).filter(([key]) => ['farmId', 'handlingCompanyId', 'marketplace'].includes(key))) } },
            { $unwind: '$items' },
            ...(dimensions['items.productId'] ? [{ $match: { 'items.productId': dimensions['items.productId'] } }] : []),
            { $group: { _id: '$items.productId', productName: { $first: '$items.productName' }, sku: { $first: '$items.sku' }, quantity: { $sum: '$items.quantity' } } },
        ]),
    ]);
    const totals = new Map();
    for (const row of [...invoiceRows, ...batchRows]) {
        const productId = row._id;
        const key = productId.toString();
        const item = totals.get(key) ?? { productId, productName: row.productName, sku: row.sku, quantity: 0 };
        item.quantity += row.quantity;
        totals.set(key, item);
    }
    const productIds = [...totals.values()].map((row) => row.productId);
    const products = await Product.find({ _id: { $in: productIds } }).select('name sku unit').lean();
    const productById = new Map(products.map((product) => [product._id.toString(), product]));
    const farm = typeof request.query.farmId === 'string' ? await Farm.findById(request.query.farmId).select('name code').lean() : undefined;
    const handlingCompany = typeof request.query.handlingCompanyId === 'string' ? await Company.findById(request.query.handlingCompanyId).select('name code').lean() : undefined;
    const rows = [...totals.values()].map((row) => ({ ...row, product: productById.get(row.productId.toString()), farm: farm ?? undefined, handlingCompany: handlingCompany ?? undefined, marketplace: dimensions.marketplace ?? 'ALL' })).sort((left, right) => right.quantity - left.quantity);
    response.json({ success: true, data: rows });
});
businessRouter.get('/dashboard/product-sales', async (request, response) => {
    request.url = `/dashboard/daily-sales${request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : ''}`;
    response.redirect(307, `/api${request.url}`);
});
businessRouter.get('/dashboard/farm-sales', async (request, response) => {
    const from = typeof request.query.from === 'string' ? new Date(request.query.from) : new Date(new Date().setHours(0, 0, 0, 0));
    const to = typeof request.query.to === 'string' ? new Date(request.query.to) : new Date(new Date().setHours(23, 59, 59, 999));
    const [batches, invoices] = await Promise.all([
        SalesBatch.aggregate([{ $match: { salesDate: { $gte: from, $lte: to } } }, { $unwind: '$items' }, { $group: { _id: { farmId: '$farmId', productId: '$items.productId' }, productName: { $first: '$items.productName' }, sku: { $first: '$items.sku' }, quantity: { $sum: '$items.quantity' } } }]),
        Invoice.aggregate([{ $match: { status: 'FINALIZED', invoiceType: 'SALES', invoiceDate: { $gte: from, $lte: to }, farmId: { $ne: null } } }, { $unwind: '$items' }, { $group: { _id: { farmId: '$farmId', productId: '$items.productId' }, productName: { $first: '$items.productName' }, sku: { $first: '$items.sku' }, quantity: { $sum: '$items.quantity' } } }]),
    ]);
    const totals = new Map();
    for (const row of [...batches, ...invoices]) {
        const key = `${row._id.farmId.toString()}-${row._id.productId.toString()}`;
        const item = totals.get(key) ?? { farmId: row._id.farmId, productId: row._id.productId, productName: row.productName, sku: row.sku, quantity: 0 };
        item.quantity += row.quantity;
        totals.set(key, item);
    }
    const farmIds = [...new Set([...totals.values()].map((row) => row.farmId.toString()))];
    const farms = await Farm.find({ _id: { $in: farmIds } }).select('name code').lean();
    const farmMap = new Map(farms.map((farm) => [farm._id.toString(), farm]));
    response.json({ success: true, data: [...totals.values()].map((row) => ({ ...row, farm: farmMap.get(row.farmId.toString()) })) });
});
businessRouter.get('/dashboard/vendor-outstanding', async (_request, response) => {
    const rows = await getVendorOutstanding();
    response.json({ success: true, data: { vendors: rows, totalPurchases: rows.reduce((sum, row) => sum + row.totalPurchases, 0), totalPaid: rows.reduce((sum, row) => sum + row.totalPaid, 0), outstanding: rows.reduce((sum, row) => sum + row.outstanding, 0) } });
});
businessRouter.get('/dashboard/farm-money', async (request, response) => {
    const from = typeof request.query.from === 'string' ? new Date(request.query.from) : undefined;
    const to = typeof request.query.to === 'string' ? new Date(request.query.to) : undefined;
    response.json({ success: true, data: await farmMoneySummary(from, to) });
});
