import { model, Schema, Types } from 'mongoose';
const companySchema = new Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
}, { timestamps: true });
companySchema.index({ code: 1 }, { unique: true });
companySchema.index({ name: 1 }, { unique: true });
const productSchema = new Schema({
    sku: { type: String, required: true, trim: true, uppercase: true },
    productCode: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    productType: { type: String, enum: ['REGULAR', 'NON_REGULAR'], default: 'REGULAR', index: true },
    category: { type: String, trim: true, default: 'Uncategorized' },
    unit: { type: String, required: true, default: 'PCS' },
    minimumStock: { type: Number, min: 0, default: 0 },
    purchasePrice: { type: Number, min: 0, default: 0 },
    sellingPrice: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
}, { timestamps: true });
productSchema.index({ name: 'text', sku: 'text', productCode: 'text' });
productSchema.index({ sku: 1 }, { unique: true });
const farmSchema = new Schema({
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    contactPerson: { type: String, trim: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
}, { timestamps: true });
farmSchema.index({ code: 1 }, { unique: true });
const productStockSchema = new Schema({
    productId: { type: Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, default: 0 },
    averageCost: { type: Number, min: 0, default: 0 },
}, { timestamps: true });
productStockSchema.index({ productId: 1 }, { unique: true });
const stockTransactionSchema = new Schema({
    companyId: { type: Types.ObjectId, ref: 'Company', index: true },
    handlingCompanyId: { type: Types.ObjectId, ref: 'Company', index: true },
    transactionType: {
        type: String,
        enum: ['OPENING', 'PURCHASE', 'SALE', 'PURCHASE_RETURN', 'SALES_RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'DAMAGE', 'LOST', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'],
        required: true,
    },
    productId: { type: Types.ObjectId, ref: 'Product', required: true, index: true },
    farmId: { type: Types.ObjectId, ref: 'Farm', index: true },
    quantity: { type: Number, required: true, min: 0.000001 },
    previousBalance: { type: Number, required: true },
    newBalance: { type: Number, required: true },
    unitCost: { type: Number, min: 0, default: 0 },
    referenceType: { type: String, trim: true },
    referenceId: { type: Types.ObjectId },
    referenceNumber: { type: String, trim: true },
    transactionDate: { type: Date, required: true, default: Date.now, index: true },
    reason: { type: String, trim: true },
    notes: { type: String, trim: true },
}, { timestamps: true });
stockTransactionSchema.index({ productId: 1, farmId: 1, transactionDate: -1 });
stockTransactionSchema.index({ referenceType: 1, referenceId: 1 });
const salesBatchSchema = new Schema({
    companyId: { type: Types.ObjectId, ref: 'Company', index: true },
    handlingCompanyId: { type: Types.ObjectId, ref: 'Company', index: true },
    batchNumber: { type: String, required: true, trim: true },
    salesDate: { type: Date, required: true, index: true },
    farmId: { type: Types.ObjectId, ref: 'Farm' },
    marketplace: { type: String, enum: ['AMAZON', 'MEESHO', 'FLIPKART', 'OTHER', 'DIRECT'], required: true },
    customerId: { type: Types.ObjectId, ref: 'Vendor', index: true },
    customerName: { type: String, trim: true, maxlength: 120 },
    customerCompany: { type: String, trim: true, maxlength: 120 },
    reference: { type: String, trim: true },
    notes: { type: String, trim: true },
    totalQuantity: { type: Number, required: true, min: 0 },
    items: [{
            productId: { type: Types.ObjectId, ref: 'Product', required: true },
            sku: { type: String, required: true },
            productName: { type: String, required: true },
            unit: { type: String, trim: true },
            quantity: { type: Number, required: true, min: 0.000001 },
        }],
}, { timestamps: true });
salesBatchSchema.index({ companyId: 1, batchNumber: 1 }, { unique: true });
salesBatchSchema.index({ companyId: 1, salesDate: -1, farmId: 1, marketplace: 1 });
const vendorSchema = new Schema({
    name: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    mobile: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    gstin: { type: String, trim: true, uppercase: true },
    notes: { type: String, trim: true, maxlength: 1000 },
    isCustomer: { type: Boolean, default: false, index: true },
    isSupplier: { type: Boolean, default: true, index: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
}, { timestamps: true });
vendorSchema.index({ name: 1 });
const purchaseSchema = new Schema({
    purchaseNumber: { type: String, required: true, unique: true },
    purchaseDate: { type: Date, required: true, index: true },
    handlingCompanyId: { type: Types.ObjectId, ref: 'Company', required: true, index: true },
    vendorId: { type: Types.ObjectId, ref: 'Vendor', required: true, index: true },
    invoiceNumber: { type: String, trim: true },
    subtotal: { type: Number, required: true, min: 0 },
    taxCharges: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    remark: { type: String, trim: true },
    status: { type: String, enum: ['DRAFT', 'FINALIZED', 'CANCELLED'], default: 'DRAFT', index: true },
    items: [{ productId: { type: Types.ObjectId, ref: 'Product', required: true }, sku: String, productName: String, quantity: { type: Number, min: 0.000001 }, unit: String, rate: { type: Number, min: 0 }, amount: { type: Number, min: 0 } }],
}, { timestamps: true });
const vendorPaymentSchema = new Schema({
    paymentDate: { type: Date, required: true, index: true },
    vendorId: { type: Types.ObjectId, ref: 'Vendor', required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMethod: { type: String, enum: ['CASH', 'BANK', 'UPI', 'OTHER'], required: true },
    referenceNumber: { type: String, trim: true },
    remark: { type: String, trim: true },
}, { timestamps: true });
const customerReceiptSchema = new Schema({
    receiptDate: { type: Date, required: true, index: true },
    customerId: { type: Types.ObjectId, ref: 'Vendor', required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMethod: { type: String, enum: ['CASH', 'BANK', 'UPI', 'OTHER'] },
    referenceNumber: { type: String, trim: true, maxlength: 100 },
    remark: { type: String, trim: true, maxlength: 500 },
    idempotencyKey: { type: String, trim: true, maxlength: 100 },
}, { timestamps: true });
customerReceiptSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
const farmMoneyTransactionSchema = new Schema({
    date: { type: Date, required: true, index: true },
    farmId: { type: Types.ObjectId, ref: 'Farm' },
    transactionType: { type: String, enum: ['FARM_RECEIPT', 'WITHDRAWAL'], required: true, index: true },
    marketplace: { type: String, enum: ['MEESHO', 'AMAZON', 'FLIPKART', 'OTHER'] },
    amount: { type: Number, required: true, min: 0.01 },
    bankAccount: { type: String, trim: true },
    reference: { type: String, trim: true },
    remark: { type: String, trim: true },
}, { timestamps: true });
const expenseSchema = new Schema({
    date: { type: Date, required: true, index: true },
    farmId: { type: Types.ObjectId, ref: 'Farm', index: true },
    category: { type: String, required: true, trim: true, maxlength: 80, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    description: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true });
expenseSchema.index({ date: -1, farmId: 1 });
const invoiceSchema = new Schema({
    invoiceNumber: { type: String, required: true, unique: true },
    invoiceType: { type: String, enum: ['SALES', 'STOCK_IN'], required: true, index: true },
    invoiceDate: { type: Date, required: true, index: true },
    handlingCompanyId: { type: Types.ObjectId, ref: 'Company', required: true },
    marketplace: { type: String, enum: ['DIRECT', 'AMAZON', 'MEESHO', 'FLIPKART', 'OTHER'] },
    vendorId: { type: Types.ObjectId, ref: 'Vendor' },
    customerId: { type: Types.ObjectId, ref: 'Vendor', index: true },
    farmId: { type: Types.ObjectId, ref: 'Farm' },
    buyer: { customerName: String, companyName: String, mobile: String, email: String, address: String, city: String, state: String, pincode: String, gstin: String },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, min: 0, default: 0 },
    tax: { type: Number, min: 0, default: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    remark: { type: String, trim: true },
    status: { type: String, enum: ['DRAFT', 'FINALIZED', 'CANCELLED'], default: 'DRAFT', index: true },
    items: [{ productId: { type: Types.ObjectId, ref: 'Product', required: true }, sku: String, productName: String, quantity: { type: Number, min: 0.000001 }, unit: String, rate: { type: Number, min: 0 }, discount: { type: Number, min: 0, default: 0 }, tax: { type: Number, min: 0, default: 0 }, amount: { type: Number, min: 0 } }],
}, { timestamps: true });
invoiceSchema.index({ invoiceType: 1, invoiceDate: -1 });
export const Company = model('Company', companySchema);
export const Product = model('Product', productSchema);
export const Farm = model('Farm', farmSchema);
export const ProductStock = model('ProductStock', productStockSchema);
export const StockTransaction = model('StockTransaction', stockTransactionSchema);
export const SalesBatch = model('SalesBatch', salesBatchSchema);
export const Vendor = model('Vendor', vendorSchema);
export const Purchase = model('Purchase', purchaseSchema);
export const VendorPayment = model('VendorPayment', vendorPaymentSchema);
export const CustomerReceipt = model('CustomerReceipt', customerReceiptSchema);
export const FarmMoneyTransaction = model('FarmMoneyTransaction', farmMoneyTransactionSchema);
export const Expense = model('Expense', expenseSchema);
export const Invoice = model('Invoice', invoiceSchema);
