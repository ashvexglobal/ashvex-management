import { Types } from 'mongoose';
import { Company, CustomerReceipt, Expense, Farm, FarmMoneyTransaction, Invoice, Product, ProductStock, Purchase, SalesBatch, StockTransaction, Vendor, VendorPayment } from '../models/inventory.js';

async function dropIndexIfPresent(collectionName: string, indexName: string): Promise<void> {
  const collection = Product.db.collection(collectionName);
  try {
    const indexes = await collection.listIndexes().toArray();
    const legacyIndex = indexes.find((index) => index.name === indexName);
    if (legacyIndex) await collection.dropIndex(indexName);
  } catch (error) {
    if ((error as { code?: number }).code !== 26) throw error;
  }
}

export async function migrateLegacyCompanyData(): Promise<void> {
  const handlingCompanies = [
    ['Ashvex', 'ASHVEX'],
    ['Other', 'OTHER'],
  ];
  for (const [name, code] of handlingCompanies) {
    await Company.updateOne({ code }, { $setOnInsert: { name, code, status: 'ACTIVE' } }, { upsert: true });
  }
  const ashvex = await Company.findOne({ code: 'ASHVEX', status: 'ACTIVE' }).select('_id').lean();
  if (!ashvex) throw new Error('Ashvex handling company seed failed');
  await Company.updateOne({ code: 'MAIN' }, { $set: { status: 'INACTIVE' } });
  await Promise.all([
    Purchase.updateMany({ handlingCompanyId: { $exists: false } }, { $set: { handlingCompanyId: ashvex._id } }),
    Invoice.updateMany({ handlingCompanyId: { $exists: false } }, { $set: { handlingCompanyId: ashvex._id } }),
  ]);

  const legacyProducts = await Product.collection.find({}, { projection: { sku: 1, createdAt: 1 } }).sort({ createdAt: 1, _id: 1 }).toArray();
  const canonicalBySku = new Map<string, Types.ObjectId>();
  const duplicateProducts = new Map<string, Types.ObjectId>();
  for (const product of legacyProducts) {
    const sku = String(product.sku ?? '').trim().toUpperCase();
    if (!sku) continue;
    const canonical = canonicalBySku.get(sku);
    if (canonical) duplicateProducts.set(String(product._id), canonical);
    else canonicalBySku.set(sku, product._id as Types.ObjectId);
  }
  for (const [duplicateId, canonicalId] of duplicateProducts) {
    const duplicateObjectId = new Types.ObjectId(duplicateId);
    await Promise.all([
      StockTransaction.collection.updateMany({ productId: duplicateObjectId }, { $set: { productId: canonicalId } }),
      SalesBatch.collection.updateMany({ 'items.productId': duplicateObjectId }, { $set: { 'items.$[line].productId': canonicalId } }, { arrayFilters: [{ 'line.productId': duplicateObjectId }] }),
      Purchase.collection.updateMany({ 'items.productId': duplicateObjectId }, { $set: { 'items.$[line].productId': canonicalId } }, { arrayFilters: [{ 'line.productId': duplicateObjectId }] }),
      Invoice.collection.updateMany({ 'items.productId': duplicateObjectId }, { $set: { 'items.$[line].productId': canonicalId } }, { arrayFilters: [{ 'line.productId': duplicateObjectId }] }),
    ]);
  }

  const stockCollection = ProductStock.collection;
  const legacyBalances = await stockCollection.find({}).toArray();
  const totals = new Map<string, { productId: Types.ObjectId; quantity: number; costValue: number }>();
  for (const balance of legacyBalances) {
    const originalProductId = balance.productId as Types.ObjectId;
    const productId = duplicateProducts.get(originalProductId.toString()) ?? originalProductId;
    const key = productId.toString();
    const aggregate = totals.get(key) ?? { productId, quantity: 0, costValue: 0 };
    const quantity = Number(balance.quantity ?? 0);
    aggregate.quantity += quantity;
    aggregate.costValue += quantity * Number(balance.averageCost ?? 0);
    totals.set(key, aggregate);
  }
  if (legacyBalances.some((balance) => balance.farmId || balance.companyId) || duplicateProducts.size > 0) {
    await stockCollection.deleteMany({});
    if (totals.size) {
      await stockCollection.insertMany([...totals.values()].map((balance) => ({
        productId: balance.productId,
        quantity: balance.quantity,
        averageCost: balance.quantity ? balance.costValue / balance.quantity : 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })));
    }
  }

  await Promise.all([
    Product.collection.updateMany({}, { $unset: { companyId: '' } }),
    Farm.collection.updateMany({}, { $unset: { companyId: '' } }),
    stockCollection.updateMany({}, { $unset: { companyId: '', farmId: '' } }),
  ]);
  if (duplicateProducts.size) {
    await Product.deleteMany({ _id: { $in: [...duplicateProducts.keys()].map((productId) => new Types.ObjectId(productId)) } });
  }

  await Promise.all([
    dropIndexIfPresent('products', 'companyId_1_sku_1'),
    dropIndexIfPresent('products', 'sku_1'),
    dropIndexIfPresent('farms', 'companyId_1_code_1'),
    dropIndexIfPresent('productstocks', 'companyId_1_productId_1_farmId_1'),
  ]);

  const directSalesWithNames = await SalesBatch.collection.find(
    { marketplace: 'DIRECT', customerId: { $exists: false }, customerName: { $type: 'string', $ne: '' } },
    { projection: { customerName: 1 } },
  ).toArray();
  const vendors = await Vendor.collection.find({}, { projection: { name: 1, isCustomer: 1 } }).toArray();
  const vendorByName = new Map<string, typeof vendors>();
  for (const vendor of vendors) {
    const normalizedName = String(vendor.name ?? '').trim().toLocaleLowerCase();
    if (!normalizedName) continue;
    vendorByName.set(normalizedName, [...(vendorByName.get(normalizedName) ?? []), vendor]);
  }
  const matchedCustomerIds = new Set<string>();
  let linkedDirectSales = 0;
  let ambiguousDirectSales = 0;
  for (const sale of directSalesWithNames) {
    const normalizedName = String(sale.customerName ?? '').trim().toLocaleLowerCase();
    const matches = vendorByName.get(normalizedName) ?? [];
    if (matches.length !== 1) {
      if (matches.length > 1) ambiguousDirectSales += 1;
      continue;
    }
    const party = matches[0];
    if (!party?._id) continue;
    await SalesBatch.collection.updateOne(
      { _id: sale._id, marketplace: 'DIRECT', customerId: { $exists: false } },
      { $set: { customerId: party._id } },
    );
    matchedCustomerIds.add(String(party._id));
    linkedDirectSales += 1;
  }
  if (matchedCustomerIds.size) {
    await Vendor.collection.updateMany(
      { _id: { $in: [...matchedCustomerIds].map((partyId) => new Types.ObjectId(partyId)) } },
      { $set: { isCustomer: true } },
    );
  }
  if (ambiguousDirectSales) {
    console.warn(`Skipped ${ambiguousDirectSales} historical direct sales batches because customer names match multiple parties.`);
  }
  if (linkedDirectSales) {
    console.info(`Linked ${linkedDirectSales} historical direct sales batches to uniquely matching parties by exact normalized name.`);
  }

  await Promise.all([Company, CustomerReceipt, Expense, Farm, FarmMoneyTransaction, Invoice, Product, ProductStock, Purchase, SalesBatch, StockTransaction, Vendor, VendorPayment].map((model) => model.createIndexes()));
}
