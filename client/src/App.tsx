import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Boxes, CircleAlert, Clock3, Command, Download, Eye, Leaf, MapPin, Minus, PackagePlus, Plus, Search, Sprout, Wallet, Warehouse, X } from 'lucide-react';
import { api, type Farm, type FarmMoneyMonth, type FarmMoneyTransaction, type Product, type StockRow, type VendorLedger } from './lib/api';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const quantity = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

function mutationErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<{ message?: string }>(error)) return error.response?.data.message ?? fallback;
  return fallback;
}

type ModalName = 'company' | 'product' | 'farm' | 'movement' | 'sales' | 'purchase' | 'vendor' | 'payment' | 'farmMoney' | 'invoice' | 'expense' | null;
type DatePreset = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'LAST_MONTH' | 'LAST_6_MONTHS' | 'THIS_YEAR' | 'CUSTOM';
type WorkspaceTab = 'dashboard' | 'stock' | 'sales' | 'vendors' | 'farms' | 'cashflow' | 'expenses';
type FarmMoneyInput = { date: string; transactionType: 'FARM_RECEIPT' | 'WITHDRAWAL'; farmId?: string; marketplace?: 'MEESHO' | 'AMAZON' | 'FLIPKART' | 'OTHER'; amount: number; bankAccount?: string; reference?: string; remark?: string };

const workspaceTabs: Array<{ id: Exclude<WorkspaceTab, 'expenses'>; label: string; icon: ReactNode }> = [
  { id: 'dashboard', label: 'Dashboard', icon: <Boxes size={16} /> },
  { id: 'stock', label: 'Products & Stock', icon: <Warehouse size={16} /> },
  { id: 'farms', label: 'Companies & Channels', icon: <MapPin size={16} /> },
  { id: 'sales', label: 'Sales', icon: <ArrowUpRight size={16} /> },
  { id: 'vendors', label: 'Purchases & Suppliers', icon: <PackagePlus size={16} /> },
  { id: 'cashflow', label: 'Payouts & Cash', icon: <Wallet size={16} /> },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard');
  const [search, setSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [vendorPage, setVendorPage] = useState(1);
  const [datePreset, setDatePreset] = useState<DatePreset>('TODAY');
  const [customFrom, setCustomFrom] = useState(localDate());
  const [customTo, setCustomTo] = useState(localDate());
  const [salesFarmFilter, setSalesFarmFilter] = useState('');
  const [salesCompanyFilter, setSalesCompanyFilter] = useState('');
  const [salesMarketplaceFilter, setSalesMarketplaceFilter] = useState('');
  const [cashFlowFarmFilter, setCashFlowFarmFilter] = useState('');
  const [cashFlowPage, setCashFlowPage] = useState(1);
  const [expensePage, setExpensePage] = useState(1);
  const [companyId, setCompanyId] = useState('');
  const [modal, setModal] = useState<ModalName>(null);
  const [farmMoneyInitialType, setFarmMoneyInitialType] = useState<'FARM_RECEIPT' | 'WITHDRAWAL'>('FARM_RECEIPT');
  const [selectedFarmMoneyFarm, setSelectedFarmMoneyFarm] = useState<Farm | null>(null);
  const [farmMoneyEdit, setFarmMoneyEdit] = useState<FarmMoneyTransaction | null>(null);
  const [previewInvoiceId, setPreviewInvoiceId] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [vendorLedgerPage, setVendorLedgerPage] = useState(1);
  const [notice, setNotice] = useState('');
  const queryClient = useQueryClient();
  const companies = useQuery({ queryKey: ['companies'], queryFn: api.companies });
  useEffect(() => {
    if (!companyId && companies.data?.[0]) setCompanyId(companies.data[0]._id);
  }, [companyId, companies.data]);
  const dateRange = getDateRange(datePreset, customFrom, customTo);
  const summary = useQuery({ queryKey: ['summary', dateRange.from, dateRange.to, companyId], queryFn: () => api.dashboard(dateRange.from, dateRange.to, companyId || undefined) });
  const inventory = useQuery({ queryKey: ['inventory', companyId, search], queryFn: () => api.inventory(companyId, search), enabled: Boolean(companyId) });
  const movements = useQuery({ queryKey: ['movements', companyId], queryFn: () => api.movements(companyId), enabled: Boolean(companyId) });
  const products = useQuery({ queryKey: ['products', companyId], queryFn: () => api.products(companyId), enabled: Boolean(companyId) });
  const farms = useQuery({ queryKey: ['farms', companyId], queryFn: () => api.farms(companyId), enabled: Boolean(companyId) });
  const salesBatches = useQuery({ queryKey: ['sales-batches', companyId], queryFn: () => api.salesBatches(companyId), enabled: Boolean(companyId) });
  const vendors = useQuery({ queryKey: ['vendors'], queryFn: api.vendors });
  const purchases = useQuery({ queryKey: ['purchases'], queryFn: api.purchases });
  const vendorOutstanding = useQuery({ queryKey: ['vendor-outstanding'], queryFn: api.vendorOutstanding });
  const vendorLedger = useQuery({
    queryKey: ['vendor-ledger', selectedVendorId, vendorLedgerPage],
    queryFn: () => api.vendorLedger(selectedVendorId, vendorLedgerPage),
    enabled: Boolean(selectedVendorId),
  });
  const farmMoney = useQuery({ queryKey: ['farm-money-summary', dateRange.from, dateRange.to], queryFn: () => api.farmMoneySummary(dateRange.from, dateRange.to) });
  const cashFlowSummary = useQuery({ queryKey: ['cash-flow-summary', dateRange.from, dateRange.to, cashFlowFarmFilter], queryFn: () => api.farmMoneySummary(dateRange.from, dateRange.to, cashFlowFarmFilter || undefined) });
  const allFarmMoneySummary = useQuery({ queryKey: ['farm-money-summary-all-time'], queryFn: () => api.farmMoneySummary() });
  const farmMoneyTransactions = useQuery({
    queryKey: ['farm-money-transactions', dateRange.from, dateRange.to, cashFlowFarmFilter, cashFlowPage],
    queryFn: () => api.farmMoney({ from: dateRange.from, to: dateRange.to, farmId: cashFlowFarmFilter || undefined, page: cashFlowPage, limit: 20 }),
  });
  const expenses = useQuery({
    queryKey: ['expenses', dateRange.from, dateRange.to, expensePage],
    queryFn: () => api.expenses({ from: dateRange.from, to: dateRange.to, page: expensePage, limit: 20 }),
  });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: api.invoices });
  const dailySales = useQuery({ queryKey: ['daily-sales', dateRange.from, dateRange.to, salesFarmFilter, salesCompanyFilter, salesMarketplaceFilter], queryFn: () => api.dailySales({ from: dateRange.from, to: dateRange.to, farmId: salesFarmFilter || undefined, handlingCompanyId: salesCompanyFilter || undefined, marketplace: salesMarketplaceFilter || undefined }) });
  const farmSales = useQuery({ queryKey: ['farm-sales', dateRange.from, dateRange.to], queryFn: () => api.farmSales(dateRange.from, dateRange.to) });

  const refresh = async () => {
    await queryClient.invalidateQueries();
    setModal(null);
    setNotice('Changes saved to MongoDB.');
    window.setTimeout(() => setNotice(''), 3200);
  };
  const createProduct = useMutation({ mutationFn: (data: Parameters<typeof api.createProduct>[1]) => api.createProduct(companyId, data), onSuccess: refresh });
  const createFarm = useMutation({ mutationFn: (data: Parameters<typeof api.createFarm>[1]) => api.createFarm(companyId, data), onSuccess: refresh });
  const createMovement = useMutation({ mutationFn: (data: Parameters<typeof api.createMovement>[1]) => api.createMovement(companyId, data), onSuccess: refresh });
  const createSalesBatch = useMutation({ mutationFn: (data: Parameters<typeof api.createSalesBatch>[1]) => api.createSalesBatch(companyId, data), onSuccess: refresh });
  const createVendor = useMutation({ mutationFn: api.createVendor, onSuccess: refresh });
  const createPurchase = useMutation({ mutationFn: api.createPurchase, onSuccess: refresh });
  const finalizePurchase = useMutation({ mutationFn: api.finalizePurchase, onSuccess: refresh });
  const createPayment = useMutation({ mutationFn: api.createVendorPayment, onSuccess: refresh });
  const createFarmMoney = useMutation({ mutationFn: api.createFarmMoney, onSuccess: refresh });
  const createExpense = useMutation({ mutationFn: api.createExpense, onSuccess: refresh });
  const updateFarmMoneyReceipt = useMutation({
    mutationFn: ({ transactionId, data }: { transactionId: string; data: Parameters<typeof api.updateFarmMoneyReceipt>[1] }) => api.updateFarmMoneyReceipt(transactionId, data),
    onSuccess: async () => { setFarmMoneyEdit(null); await refresh(); },
  });
  const createInvoice = useMutation({ mutationFn: api.createInvoice, onSuccess: refresh });
  const finalizeInvoice = useMutation({ mutationFn: api.finalizeInvoice, onSuccess: refresh });
  const cancelInvoice = useMutation({ mutationFn: api.cancelInvoice, onSuccess: refresh });
  const downloadInvoicePdf = async (invoiceId: string, invoiceNumber: string) => {
    try {
      const url = URL.createObjectURL(await api.invoicePdf(invoiceId));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoiceNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice('Could not download invoice PDF.');
    }
  };
  const createCompany = useMutation({ mutationFn: api.createCompany, onSuccess: async (company) => { await queryClient.invalidateQueries({ queryKey: ['companies'] }); setCompanyId(company._id); setModal(null); setNotice(`${company.name} is ready.`); } });
  const rows = inventory.data ?? [];
  const hasError = companies.isError || summary.isError || inventory.isError || farms.isError;
  const currentCompany = companies.data?.find((company) => company._id === companyId);
  const productPageSize = 30;
  const vendorPageSize = 10;
  const productPageCount = Math.max(1, Math.ceil(rows.length / productPageSize));
  const vendorRows = vendorOutstanding.data ?? [];
  const vendorPageCount = Math.max(1, Math.ceil(vendorRows.length / vendorPageSize));
  const visibleRows = rows.slice((productPage - 1) * productPageSize, productPage * productPageSize);
  const visibleVendorRows = vendorRows.slice((vendorPage - 1) * vendorPageSize, vendorPage * vendorPageSize);
  const companySales = useMemo(() => {
    const totals = new Map<string, { units: number; products: Set<string> }>();
    for (const sale of farmSales.data ?? []) {
      const company = totals.get(sale.farm._id) ?? { units: 0, products: new Set<string>() };
      company.units += sale.quantity;
      company.products.add(sale.sku);
      totals.set(sale.farm._id, company);
    }
    return {
      totals,
      units: [...totals.values()].reduce((sum, company) => sum + company.units, 0),
      companiesWithSales: totals.size,
      products: new Set([...totals.values()].flatMap((company) => [...company.products])).size,
    };
  }, [farmSales.data]);
  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const navigateTo = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Leaf size={19} strokeWidth={2.4} /></span><span>field<span className="brand-light">stock</span></span></div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          {workspaceTabs.map((tab) => {
            const selected = activeTab === tab.id || (tab.id === 'cashflow' && activeTab === 'expenses');
            return <button key={tab.id} className={`nav-item ${selected ? 'active' : ''}`} aria-current={selected ? 'page' : undefined} onClick={() => navigateTo(tab.id)}>{tab.icon}<span>{tab.label}</span>{selected && <span className="nav-active-dot" />}</button>;
          })}
        </nav>
        <div className="sidebar-bottom"><div className="database-status"><span className={hasError ? 'status-led status-led-error' : 'status-led'} /><div><strong>{hasError ? 'API unavailable' : 'Database connected'}</strong><small>{hasError ? 'Check server connection' : 'Live data connection'}</small></div></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> {activeTab === 'expenses' ? 'Payouts & Cash' : workspaceTabs.find((tab) => tab.id === activeTab)?.label}</div><div className="topbar-actions"><label className="topbar-company"><span className="sr-only">Select inventory company</span><select aria-label="Select inventory company" value={companyId} onChange={(event) => setCompanyId(event.target.value)} disabled={companies.isLoading || !companies.data?.length}><option value="">{companies.isLoading ? 'Loading company…' : 'Choose company'}</option>{companies.data?.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}</select></label><span className="date-chip"><Clock3 size={14} />{today}</span></div></header>
        <div className="page-wrap">
          {hasError && <div className="connection-alert"><CircleAlert size={17} /><span>Could not load live inventory. Start the API and connect MongoDB to view and save business data.</span><a href="/">Retry</a></div>}
          {notice && <div className="toast-note">{notice}</div>}
          <section className="page-heading"><div><div className="eyebrow"><span className="eyebrow-mark" />{currentCompany?.name.toUpperCase() ?? 'INVENTORY CONTROL'}</div><h1>{activeTab === 'dashboard' ? 'Inventory, in good order.' : activeTab === 'expenses' ? 'Operating expenses' : workspaceTabs.find((tab) => tab.id === activeTab)?.label}</h1><p>{activeTab === 'dashboard' ? 'A clear view of physical stock, sales channels, supplier balances, and platform payouts.' : activeTab === 'stock' ? 'Search products, review physical inventory, and open a product to see its movement history.' : activeTab === 'sales' ? 'Review product sales across companies and marketplaces.' : activeTab === 'vendors' ? 'Review supplier balances, purchase bills, and payments.' : activeTab === 'cashflow' ? 'Keep platform receipts, bank cash, withdrawals, and operating costs distinct.' : activeTab === 'expenses' ? 'Record and review operating expenses by date and category.' : 'Review selling companies, channel performance, and sales attribution.'}</p></div><div className="heading-actions">{activeTab === 'stock' ? <button className="button button-primary" onClick={() => setModal('purchase')}><ArrowDownLeft size={16} /> Record purchase / stock-in</button> : activeTab === 'vendors' ? <><button className="button button-quiet" onClick={() => setModal('vendor')}><Plus size={16} /> Add supplier</button><button className="button button-primary" onClick={() => setModal('purchase')}><ArrowDownLeft size={16} /> Record purchase</button></> : activeTab === 'cashflow' ? <><button className="button button-quiet" onClick={() => { setFarmMoneyInitialType('FARM_RECEIPT'); setModal('farmMoney'); }}><ArrowDownLeft size={16} /> Add payout receipt</button><button className="button button-primary" onClick={() => { setFarmMoneyInitialType('WITHDRAWAL'); setModal('farmMoney'); }}><ArrowUpRight size={16} /> Record withdrawal</button></> : activeTab === 'expenses' ? <button className="button button-primary" onClick={() => setModal('expense')}><Plus size={16} /> Add expense</button> : activeTab === 'farms' ? <><button className="button button-quiet" onClick={() => setModal('company')}><Plus size={16} /> Add inventory company</button><button className="button button-primary" onClick={() => setModal('farm')}><Plus size={16} /> Add sales company</button></> : activeTab === 'sales' ? <button className="button button-primary" onClick={() => setModal('sales')}><ArrowUpRight size={16} /> Enter sales batch</button> : <><button className="button button-quiet" onClick={() => { navigateTo('farms'); setModal('farm'); }}><Plus size={16} /> Add sales company</button><button className="button button-primary" onClick={() => { navigateTo('sales'); setModal('sales'); }}><ArrowUpRight size={16} /> Enter sales batch</button></>}</div></section>
          {(activeTab === 'cashflow' || activeTab === 'expenses') && <nav className="finance-subnav" aria-label="Payouts and cash sections"><button className={`workspace-tab ${activeTab === 'cashflow' ? 'selected' : ''}`} aria-current={activeTab === 'cashflow' ? 'page' : undefined} onClick={() => navigateTo('cashflow')}><Wallet size={16} /><span>Payouts & Cash</span></button><button className={`workspace-tab ${activeTab === 'expenses' ? 'selected' : ''}`} aria-current={activeTab === 'expenses' ? 'page' : undefined} onClick={() => navigateTo('expenses')}><ArrowUpRight size={16} /><span>Operating expenses</span></button></nav>}

          {(activeTab === 'dashboard' || activeTab === 'cashflow' || activeTab === 'expenses') && <section className="date-filter-bar"><label className="form-field"><span>{activeTab === 'cashflow' ? 'Payout period' : activeTab === 'expenses' ? 'Expense period' : 'Dashboard period'}</span><select value={datePreset} onChange={(event) => { setDatePreset(event.target.value as DatePreset); setCashFlowPage(1); setExpensePage(1); }}><option value="TODAY">Today</option><option value="YESTERDAY">Yesterday</option><option value="THIS_WEEK">This week</option><option value="THIS_MONTH">This month</option><option value="LAST_MONTH">Last month</option><option value="LAST_6_MONTHS">Last 6 months</option><option value="THIS_YEAR">This year</option><option value="CUSTOM">Custom range</option></select></label>{datePreset === 'CUSTOM' && <><label className="form-field"><span>From</span><input type="date" value={customFrom} onChange={(event) => { setCustomFrom(event.target.value); setCashFlowPage(1); setExpensePage(1); }} /></label><label className="form-field"><span>To</span><input type="date" value={customTo} onChange={(event) => { setCustomTo(event.target.value); setCashFlowPage(1); setExpensePage(1); }} /></label></>}{activeTab === 'cashflow' && <label className="form-field"><span>Sales company</span><select value={cashFlowFarmFilter} onChange={(event) => { setCashFlowFarmFilter(event.target.value); setCashFlowPage(1); }}><option value="">All companies</option>{farms.data?.map((farm) => <option key={farm._id} value={farm._id}>{farm.name}</option>)}</select></label>}<span className="date-range-caption">{dateRange.label}</span></section>}

          {activeTab === 'dashboard' && <section className="metrics-grid" aria-label="Daily business summary">
            <Metric label="Active products" value={summary.data?.productCount ?? 0} icon={<PackagePlus size={18} />} accent="green" note="Browse product balances" loading={summary.isLoading} onClick={() => navigateTo('stock')} />
            <Metric label="Physical stock" value={quantity.format(summary.data?.totalUnits ?? 0)} icon={<Boxes size={18} />} accent="blue" note="Available quantity · open stock" loading={summary.isLoading} onClick={() => navigateTo('stock')} />
            <Metric label="Stock value" value={money.format(summary.data?.stockValue ?? 0)} icon={<Sprout size={18} />} accent="orange" note="Estimated at purchase cost" loading={summary.isLoading} onClick={() => navigateTo('stock')} />
            <Metric label="Needs attention" value={summary.data?.lowStockCount ?? 0} icon={<CircleAlert size={18} />} accent="red" note={`${summary.data?.outOfStockCount ?? 0} out of stock`} loading={summary.isLoading} onClick={() => navigateTo('stock')} />
            <Metric label={`${dateRange.shortLabel} sales units`} value={quantity.format(summary.data?.todaySalesUnits ?? 0)} icon={<ArrowUpRight size={18} />} accent="blue" note={`${currentCompany?.name ?? 'Selected company'} · ${summary.data?.salesInvoiceCount ?? 0} finalized sales invoices`} loading={summary.isLoading} onClick={() => navigateTo('sales')} />
            <Metric label={`${dateRange.shortLabel} purchases`} value={money.format(summary.data?.todayPurchase ?? 0)} icon={<ArrowDownLeft size={18} />} accent="green" note="Finalized stock-in purchases" loading={summary.isLoading} onClick={() => navigateTo('vendors')} />
            <Metric label="Supplier outstanding" value={money.format(summary.data?.vendorOutstanding ?? 0)} icon={<Warehouse size={18} />} accent="orange" note="Purchases less payments · view suppliers" loading={summary.isLoading} onClick={() => navigateTo('vendors')} />
            <Metric label="Payout balance" value={money.format(summary.data?.remainingFarmMoney ?? 0)} icon={<Sprout size={18} />} accent="red" note={`${money.format(summary.data?.farmMoneyReceived ?? 0)} received · ${money.format(summary.data?.withdrawals ?? 0)} withdrawn`} loading={summary.isLoading} onClick={() => navigateTo('cashflow')} />
          </section>}

          {activeTab === 'cashflow' && <>
            <section className="metrics-grid cash-flow-metrics" aria-label="Payout and cash summary">
              <Metric label={cashFlowFarmFilter ? 'Company available balance' : 'Total available balance'} value={money.format(cashFlowFarmFilter ? allFarmMoneySummary.data?.byFarm.find((item) => item.farm?._id === cashFlowFarmFilter)?.remaining ?? 0 : allFarmMoneySummary.data?.remaining ?? 0)} icon={<Wallet size={18} />} accent="green" note={cashFlowFarmFilter ? `${farms.data?.find((farm) => farm._id === cashFlowFarmFilter)?.name ?? 'Selected company'} · all time` : 'All payout receipts · all time'} loading={allFarmMoneySummary.isLoading} />
              <Metric label="Received this period" value={money.format(cashFlowSummary.data?.receipts ?? 0)} icon={<ArrowDownLeft size={18} />} accent="blue" note={dateRange.shortLabel} loading={cashFlowSummary.isLoading} />
              <Metric label="Withdrawn this period" value={money.format(cashFlowSummary.data?.withdrawals ?? 0)} icon={<ArrowUpRight size={18} />} accent="orange" note={dateRange.shortLabel} loading={cashFlowSummary.isLoading} />
              <Metric label="Net cash flow" value={money.format(cashFlowSummary.data?.remaining ?? 0)} icon={<Sprout size={18} />} accent="red" note="Received less withdrawals" loading={cashFlowSummary.isLoading} />
            </section>
            {(cashFlowSummary.isError || allFarmMoneySummary.isError || farmMoneyTransactions.isError) && <div className="connection-alert"><CircleAlert size={17} /><span>Could not load cash flow records. Check the API connection and try again.</span><button className="text-button" onClick={() => { void queryClient.invalidateQueries({ queryKey: ['farm-money-transactions'] }); void queryClient.invalidateQueries({ queryKey: ['cash-flow-summary'] }); void queryClient.invalidateQueries({ queryKey: ['farm-money-summary-all-time'] }); }}>Retry</button></div>}
            <section className="cash-flow-grid">
              <div className="panel business-list-panel cash-flow-balance-panel">
                <div className="panel-head"><div><span className="panel-kicker">CURRENT BALANCE</span><h2>Available by sales company</h2></div><button className="text-button" onClick={() => { setFarmMoneyInitialType('FARM_RECEIPT'); setModal('farmMoney'); }}>Add receipt <Plus size={14} /></button></div>
                {allFarmMoneySummary.isLoading ? <div className="empty-inline">Loading company balances…</div> : allFarmMoneySummary.data?.byFarm.length ? allFarmMoneySummary.data.byFarm.map((item, index) => item.farm ? <button className="business-row business-row-clickable cash-flow-farm-row" key={item.farm._id} onClick={() => setSelectedFarmMoneyFarm(item.farm ?? null)} aria-label={`View monthly cash entries for ${item.farm.name}`}><span><strong>{item.farm.name}</strong><small>{money.format(item.receipts)} received · {money.format(item.withdrawals)} withdrawn · View by month</small></span><strong>{money.format(item.remaining)}</strong></button> : <div className="business-row" key={`archived-farm-${index}`}><span><strong>Archived company</strong><small>{money.format(item.receipts)} received · {money.format(item.withdrawals)} withdrawn</small></span><strong>{money.format(item.remaining)}</strong></div>) : <div className="empty-inline">Record payout receipts to see available balances by company.</div>}
                {(allFarmMoneySummary.data?.withdrawals ?? 0) > (allFarmMoneySummary.data?.byFarm.reduce((total, item) => total + item.withdrawals, 0) ?? 0) && <p className="form-hint">Unassigned withdrawals are included in the total available balance, but not in an individual farm balance.</p>}
              </div>
              <div className="panel business-list-panel cash-flow-source-panel">
                <div className="panel-head"><div><span className="panel-kicker">RECEIPTS THIS PERIOD</span><h2>By marketplace</h2></div></div>
                {cashFlowSummary.isLoading ? <div className="empty-inline">Loading receipt sources…</div> : cashFlowSummary.data?.receiptsByMarketplace.length ? cashFlowSummary.data.receiptsByMarketplace.map((item) => <div className="business-row" key={item._id}><span>{item._id === 'UNSPECIFIED' ? 'Not specified' : marketplaceLabel(item._id)}</span><strong>{money.format(item.total)}</strong></div>) : <div className="empty-inline">Marketplace totals appear when receipts are recorded.</div>}
              </div>
              <div className="panel business-list-panel cash-flow-transactions">
                <div className="panel-head"><div><span className="panel-kicker">CASH MOVEMENTS</span><h2>Transactions</h2></div><span className="small-count">{farmMoneyTransactions.data?.total ?? 0} entries</span></div>
                {farmMoneyTransactions.isLoading ? <div className="empty-inline">Loading cash flow transactions…</div> : farmMoneyTransactions.data?.transactions.length ? <div className="cash-flow-transaction-list">{farmMoneyTransactions.data.transactions.map((transaction) => {
                  const receipt = transaction.transactionType === 'FARM_RECEIPT';
                  return <article className="cash-flow-transaction" key={transaction._id}>
                    <span className={`movement-icon ${receipt ? 'movement-in' : 'movement-out'}`}>{receipt ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
                    <div className="movement-main"><strong>{receipt ? `${marketplaceLabel(transaction.marketplace)} payment received` : 'Withdrawal'} · {transaction.farmId?.name ?? 'No farm assigned'}</strong><small>{new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(transaction.date))}{transaction.bankAccount ? ` · ${transaction.bankAccount}` : ''}{transaction.reference ? ` · Ref ${transaction.reference}` : ''}{transaction.remark ? ` · ${transaction.remark}` : ''}</small></div>
                    <strong className={`movement-amount ${receipt ? 'amount-in' : 'amount-out'}`}>{receipt ? '+' : '−'}{money.format(transaction.amount)}</strong>
                  </article>;
                })}</div> : <div className="empty-inline">No cash flow transactions for {dateRange.label.toLowerCase()}.</div>}
                {farmMoneyTransactions.data && farmMoneyTransactions.data.pageCount > 1 && <Pagination page={cashFlowPage} pageCount={farmMoneyTransactions.data.pageCount} onChange={setCashFlowPage} />}
              </div>
            </section>
          </>}

          {activeTab === 'expenses' && <section className="panel expense-panel">
            <div className="panel-head expense-panel-head"><div><span className="panel-kicker">OPERATING COSTS</span><h2>Expenses</h2></div><span className="small-count">{expenses.data?.total ?? 0} entries · {dateRange.label}</span></div>
            {expenses.isError && <div className="connection-alert"><CircleAlert size={17} /><span>Could not load expenses. Check the API connection and try again.</span><button className="text-button" onClick={() => { void queryClient.invalidateQueries({ queryKey: ['expenses'] }); }}>Retry</button></div>}
            <section className="metrics-grid expense-metrics" aria-label="Expense summary">
              <Metric label="Total expenses" value={money.format(expenses.data?.totalAmount ?? 0)} icon={<ArrowUpRight size={18} />} accent="orange" note={dateRange.shortLabel} loading={expenses.isLoading} />
              <Metric label="Expense entries" value={expenses.data?.total ?? 0} icon={<Boxes size={18} />} accent="blue" note="For selected period" loading={expenses.isLoading} />
              <Metric label="Top expense category" value={expenses.data?.byCategory[0]?.category ?? '—'} icon={<CircleAlert size={18} />} accent="green" note={money.format(expenses.data?.byCategory[0]?.amount ?? 0)} loading={expenses.isLoading} />
            </section>
            <div className="expense-category-strip">{expenses.data?.byCategory.map((item) => <span className="expense-category-chip" key={item.category}>{item.category}<strong>{money.format(item.amount)}</strong></span>)}</div>
            {expenses.isLoading ? <div className="empty-inline">Loading expenses…</div> : expenses.data?.expenses.length ? <div className="expense-list">{expenses.data.expenses.map((expense) => <article className="expense-row" key={expense._id}>
              <span className="movement-icon movement-out"><ArrowUpRight size={16} /></span>
              <div className="movement-main"><strong>{expense.category}</strong><small>{new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(expense.date))}{expense.farmId ? ` · ${expense.farmId.name}` : ' · General'}{expense.description ? ` · ${expense.description}` : ''}</small></div>
              <strong className="movement-amount amount-out">−{money.format(expense.amount)}</strong>
            </article>)}</div> : <div className="empty-inline">No expenses recorded for {dateRange.label.toLowerCase()}. Add a bill to get started.</div>}
            {expenses.data && expenses.data.pageCount > 1 && <Pagination page={expensePage} pageCount={expenses.data.pageCount} onChange={setExpensePage} />}
            <p className="form-hint expense-balance-note">Expenses are tracked separately from payout receipts, withdrawals, and physical stock.</p>
          </section>}

          {activeTab === 'sales' && <section className="sales-report-grid"><div className="panel business-list-panel sales-report-panel"><div className="panel-head"><div><span className="panel-kicker">PRODUCT MOVEMENT</span><h2>Units sold</h2></div><span className="small-count">{dailySales.data?.length ?? 0} lines</span></div><div className="sales-dimension-filters"><select aria-label="Filter sales by sales company" value={salesFarmFilter} onChange={(event) => setSalesFarmFilter(event.target.value)}><option value="">All sales companies</option>{farms.data?.map((farm) => <option key={farm._id} value={farm._id}>{farm.name}</option>)}</select><select aria-label="Filter sales by inventory company" value={salesCompanyFilter} onChange={(event) => setSalesCompanyFilter(event.target.value)}><option value="">All inventory companies</option>{companies.data?.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}</select><select aria-label="Filter sales by marketplace" value={salesMarketplaceFilter} onChange={(event) => setSalesMarketplaceFilter(event.target.value)}><option value="">All marketplaces</option><option value="AMAZON">Amazon</option><option value="MEESHO">Meesho</option><option value="FLIPKART">Flipkart</option><option value="DIRECT">Direct</option></select></div>{dailySales.data?.length ? dailySales.data.slice(0, 8).map((row, index) => <div className="business-row sales-product-row" key={`${row.sku}-${row.farm?.code ?? 'direct'}-${index}`}><span><strong>{row.productName}</strong><small>{row.sku} · {row.farm?.name ?? 'No sales company'} · {row.handlingCompany?.name ?? 'Direct'} · {row.marketplace}</small></span><strong>{quantity.format(row.quantity)} units</strong></div>) : <div className="empty-inline">Finalized sales will be grouped here by company and marketplace.</div>}</div><div className="panel business-list-panel sales-report-panel"><div className="panel-head"><div><span className="panel-kicker">COMPANY PERFORMANCE</span><h2>Sales by company</h2></div><span className="small-count">All companies</span></div>{farmSales.data?.length ? farmSales.data.map((row) => <div className="business-row" key={`${row.farm.code}-${row.sku}`}><span><strong>{row.productName}</strong><small>{row.sku} · {row.farm.name}</small></span><small>Sold</small><strong>{quantity.format(row.quantity)} units</strong></div>) : <div className="empty-inline">Company totals appear when sales are finalized.</div>}</div></section>}

          {(activeTab === 'dashboard' || activeTab === 'farms') && <section className="overview-grid"><div className="panel company-sales-panel"><div className="panel-head"><div><span className="panel-kicker">SALES SUMMARY · {dateRange.label.toUpperCase()}</span><h2>Sales by company</h2></div><button className="text-button" onClick={() => setModal('farm')}>Add sales company <Plus size={14} /></button></div><div className="company-sales-summary" aria-label="Sales summary"><div><strong>{farmSales.isLoading ? '—' : quantity.format(companySales.units)}</strong><span>Units sold</span></div><div><strong>{farmSales.isLoading ? '—' : companySales.products}</strong><span>Products sold</span></div><div><strong>{farmSales.isLoading ? '—' : companySales.companiesWithSales}</strong><span>Companies with sales</span></div></div>{farmSales.isError && <div className="form-error">Could not load sales totals by company.</div>}{farms.data?.length ? <div className="location-strip">{(activeTab === 'farms' ? farms.data : farms.data.slice(0, 4)).map((farm) => { const sales = companySales.totals.get(farm._id); return <LocationTile key={farm._id} farm={farm} unitsSold={sales?.units ?? 0} productsSold={sales?.products.size ?? 0} loading={farmSales.isLoading} />; })}</div> : farms.isLoading ? <div className="empty-inline">Loading sales companies…</div> : <button className="add-location-tile" onClick={() => setModal('farm')}><span><Plus size={18} /></span><strong>Add your first sales company</strong><small>Track sales totals for each company</small></button>}</div>
            <div className="panel attention-panel"><div className="panel-head"><div><span className="panel-kicker">STOCK HEALTH</span><h2>Reorder watch</h2></div><span className="small-count">{summary.data?.lowStockCount ?? 0} items</span></div>{rows.filter((row) => row.quantity <= (row.productId?.minimumStock ?? 0)).slice(0, 3).length ? rows.filter((row) => row.quantity <= (row.productId?.minimumStock ?? 0)).slice(0, 3).map((row) => <div className="watch-row" key={row._id}><span className="watch-indicator" /><div><strong>{row.productId.name}</strong><small>Ashvex common stock</small></div><span className="watch-quantity">{quantity.format(row.quantity)} <small>{row.productId.unit}</small></span></div>) : <div className="attention-empty"><span className="healthy-icon"><Sprout size={18} /></span><div><strong>All clear for now</strong><small>Low stock items will appear here.</small></div></div>}</div>
          </section>}

          {activeTab === 'stock' && <section className="panel table-panel" id="stock-table"><div className="table-title-row"><div><span className="panel-kicker">PHYSICAL INVENTORY</span><h2>Product balances</h2></div><button className="button button-outline" onClick={() => setModal('product')}><Plus size={15} /> New product</button></div><div className="table-toolbar"><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); setProductPage(1); }} placeholder="Search product or SKU" /><kbd><Command size={11} /> K</kbd></label><span className="common-stock-note">Physical stock is shared across sales companies and channels</span><button className="button button-outline export-button" title="Export is planned for the import/export phase" disabled><Download size={15} /> Export</button></div>
            <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>ON HAND</th><th>MIN. STOCK</th><th>PURCHASE COST</th><th>SELLING PRICE</th><th>STOCK VALUE</th><th>STATUS</th><th>DETAILS</th></tr></thead><tbody>{inventory.isLoading ? <tr><td colSpan={8} className="table-state">Loading physical inventory…</td></tr> : rows.length ? visibleRows.map((row) => <StockTableRow key={row._id} row={row} />) : <tr><td colSpan={8} className="table-state"><div className="table-empty"><span className="empty-symbol"><Boxes size={20} /></span><strong>{search ? 'No matching products found' : 'No stock balances yet'}</strong><small>{search ? 'Try a different product or SKU.' : 'Add products, then enter opening stock.'}</small>{!search && <button className="text-button" onClick={() => setModal('product')}>Create first product <Plus size={14} /></button>}</div></td></tr>}</tbody></table></div><div className="table-footer"><span>Showing <strong>{rows.length ? (productPage - 1) * productPageSize + 1 : 0}–{Math.min(productPage * productPageSize, rows.length)}</strong> of {rows.length} products</span><span>Sales companies and channels do not create separate stock pools</span></div>{productPageCount > 1 && <Pagination page={productPage} pageCount={productPageCount} onChange={setProductPage} />}
          </section>}

          {activeTab === 'sales' && <section className="panel movement-panel"><div className="panel-head"><div><span className="panel-kicker">DAILY SALES</span><h2>Sales batches</h2></div><button className="text-button" onClick={() => setModal('sales')}>New batch <Plus size={14} /></button></div>{salesBatches.isLoading ? <div className="empty-inline">Loading sales batches…</div> : salesBatches.data?.length ? <div className="movement-list">{salesBatches.data.map((batch) => <div className="movement-row" key={batch._id}><span className="movement-icon movement-out"><ArrowUpRight size={16} /></span><div className="movement-main"><strong>{batch.marketplace === 'DIRECT' ? 'Direct sale' : batch.marketplace} · {batch.farmId?.name ?? 'No farm assigned'}</strong><small>{batch.customerName || batch.customerCompany ? [batch.customerName, batch.customerCompany].filter(Boolean).join(' · ') + ' · ' : ''}{batch.items.map((item) => `${item.sku} × ${quantity.format(item.quantity)}`).join('  ·  ')}</small></div><span className="movement-amount amount-out">−{quantity.format(batch.totalQuantity)}</span><time>{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(batch.salesDate))}</time></div>)}</div> : <div className="empty-inline movement-empty">Record one batch per farm and marketplace, or a direct offline sale.</div>}</section>}
          {(activeTab === 'vendors' || activeTab === 'farms') && <section className="business-panels">
            {activeTab === 'vendors' && <div className="panel business-list-panel" id="vendor-payables"><div className="panel-head"><div><span className="panel-kicker">SUPPLIER PAYABLES</span><h2>Outstanding by supplier</h2></div><div className="panel-actions"><button className="text-button" onClick={() => setModal('vendor')}>Add supplier <Plus size={14} /></button><button className="text-button" onClick={() => setModal('payment')}>Record payment <Plus size={14} /></button></div></div>{vendorOutstanding.data?.length ? <>{visibleVendorRows.map((item) => <button className="business-row business-row-clickable" key={item.vendor._id} onClick={() => { setSelectedVendorId(item.vendor._id); setVendorLedgerPage(1); }}><span>{item.vendor.name}<small>{money.format(item.totalPurchases)} purchased</small></span><small>{money.format(item.totalPaid)} paid</small><strong>{money.format(item.outstanding)}</strong></button>)}{vendorPageCount > 1 && <Pagination page={vendorPage} pageCount={vendorPageCount} onChange={setVendorPage} />}</> : <div className="empty-inline">Add suppliers and finalize purchases to see balances.</div>}</div>}
            {activeTab === 'farms' && <div className="panel business-list-panel"><div className="panel-head"><div><span className="panel-kicker">PAYOUT SUMMARY</span><h2>Receipts by sales company</h2></div><button className="text-button" onClick={() => { setFarmMoneyInitialType('FARM_RECEIPT'); setModal('farmMoney'); }}>Add receipt <Plus size={14} /></button></div>{farmMoney.data?.byFarm.length ? farmMoney.data.byFarm.map((item, index) => <div className="business-row" key={item.farm?.code ?? index}><span>{item.farm?.name ?? 'Sales company'}</span><small>Received</small><strong>{money.format(item.total)}</strong></div>) : <div className="empty-inline">No payout receipts recorded for this period.</div>}</div>}
          </section>}
          {activeTab === 'vendors' && <section className="panel movement-panel"><div className="panel-head"><div><span className="panel-kicker">STOCK IN</span><h2>Purchases</h2></div><button className="text-button" onClick={() => setModal('purchase')}>New purchase <Plus size={14} /></button></div>{purchases.data?.length ? <div className="movement-list">{purchases.data.map((purchase) => <div className="movement-row invoice-row" key={purchase._id}><span className={`status-pill status-${purchase.status === 'FINALIZED' ? 'healthy' : purchase.status === 'DRAFT' ? 'low' : 'out'}`}>{purchase.status === 'DRAFT' ? 'LEGACY DRAFT' : purchase.status}</span><div className="movement-main"><strong>{purchase.purchaseNumber} · {purchase.vendorId?.name ?? 'Vendor'}</strong><small>Vendor invoice {purchase.invoiceNumber ?? purchase.purchaseNumber} · {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(purchase.purchaseDate))}</small></div><strong className="invoice-total">{money.format(purchase.totalAmount)}</strong>{purchase.status === 'DRAFT' ? <button className="invoice-action" onClick={() => finalizePurchase.mutate(purchase._id)} disabled={finalizePurchase.isPending}>Post legacy draft</button> : <span />}</div>)}</div> : <div className="empty-inline">New purchases are posted to stock and vendor balances immediately.</div>}</section>}
          {activeTab === 'vendors' && <section className="panel movement-panel"><div className="panel-head"><div><span className="panel-kicker">INTERNAL DOCUMENTS</span><h2>Invoices</h2></div><button className="text-button" onClick={() => setModal('invoice')}>Create invoice <Plus size={14} /></button></div>{invoices.data?.length ? <div className="movement-list">{invoices.data.map((invoice) => <div className="movement-row invoice-row" key={invoice._id}><span className={`status-pill status-${invoice.status === 'FINALIZED' ? 'healthy' : invoice.status === 'DRAFT' ? 'low' : 'out'}`}>{invoice.status}</span><div className="movement-main"><strong>{invoice.invoiceNumber} · {invoice.invoiceType === 'SALES' ? 'Sales' : 'Stock in'}</strong><small>{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(invoice.invoiceDate))}</small></div><strong className="invoice-total">{money.format(invoice.grandTotal)}</strong><button className="invoice-action" onClick={() => setPreviewInvoiceId(invoice._id)} title={`Preview ${invoice.invoiceNumber}`}><Eye size={13} /> Preview</button><button className="invoice-action" onClick={() => void downloadInvoicePdf(invoice._id, invoice.invoiceNumber)} title="Download invoice PDF"><Download size={13} /> PDF</button>{invoice.status === 'DRAFT' ? <button className="invoice-action" onClick={() => finalizeInvoice.mutate(invoice._id)} disabled={finalizeInvoice.isPending}>Finalize</button> : invoice.status === 'FINALIZED' ? <button className="invoice-action invoice-cancel" onClick={() => cancelInvoice.mutate(invoice._id)} disabled={cancelInvoice.isPending}>Cancel</button> : <span />}</div>)}</div> : <div className="empty-inline">Create a sales or stock-in invoice draft to begin.</div>}</section>}
          {activeTab === 'stock' && <section className="panel movement-panel"><div className="panel-head"><div><span className="panel-kicker">STOCK HISTORY</span><h2>Recent movements</h2></div><button className="text-button" onClick={() => setModal('movement')}>Manual adjustment <Plus size={14} /></button></div>{movements.isLoading ? <div className="empty-inline">Loading movement history…</div> : movements.data?.length ? <div className="movement-list">{movements.data.map((movement) => { const inbound = ['OPENING', 'PURCHASE', 'SALES_RETURN', 'TRANSFER_IN', 'ADJUSTMENT_IN'].includes(movement.transactionType); return <div className="movement-row" key={movement._id}><span className={`movement-icon ${inbound ? 'movement-in' : 'movement-out'}`}>{inbound ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span><div className="movement-main"><strong>{movement.productId?.name ?? 'Product'}</strong><small>{movement.transactionType.replaceAll('_', ' ')} · {movement.farmId?.name ?? 'Physical stock'}</small></div><span className={`movement-amount ${inbound ? 'amount-in' : 'amount-out'}`}>{inbound ? '+' : '-'}{quantity.format(movement.quantity)}</span><time>{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(movement.transactionDate))}</time></div>; })}</div> : <div className="empty-inline movement-empty">Transactions will appear here once stock is recorded.</div>}</section>}
        </div>
      </main>
      {modal && <Modal title={modal === 'company' ? 'Add inventory company' : modal === 'product' ? 'New product' : modal === 'farm' ? 'Add sales company' : modal === 'sales' ? 'Enter sales batch' : modal === 'purchase' ? 'Record purchase' : modal === 'vendor' ? 'Add supplier' : modal === 'payment' ? 'Record supplier payment' : modal === 'farmMoney' ? 'Payout or withdrawal' : modal === 'invoice' ? 'Create invoice draft' : modal === 'expense' ? 'Add expense' : 'Record stock movement'} onClose={() => setModal(null)}>
        {modal === 'company' && <CompanyForm busy={createCompany.isPending} error={createCompany.error ? 'Could not create inventory company. Name and code must be unique.' : ''} onSubmit={(data) => createCompany.mutate(data)} />}
        {modal === 'product' && <ProductForm busy={createProduct.isPending} error={createProduct.error ? 'Could not save product. Check SKU uniqueness and server connection.' : ''} onSubmit={(data) => createProduct.mutate(data)} />}
        {modal === 'farm' && <FarmForm busy={createFarm.isPending} error={createFarm.error ? 'Could not save sales company. The code may already exist.' : ''} onSubmit={(data) => createFarm.mutate(data)} />}
        {modal === 'movement' && <MovementForm products={products.data ?? []} farms={farms.data ?? []} busy={createMovement.isPending} error={createMovement.error ? mutationErrorMessage(createMovement.error, 'Stock update rejected. Check available stock and try again.') : ''} onSubmit={(data) => createMovement.mutate(data)} />}
        {modal === 'sales' && <SalesBatchForm products={products.data ?? []} farms={farms.data ?? []} busy={createSalesBatch.isPending} error={createSalesBatch.error ? mutationErrorMessage(createSalesBatch.error, 'Could not record batch. Verify available stock at this farm.') : ''} onSubmit={(data) => createSalesBatch.mutate(data)} />}
        {modal === 'vendor' && <VendorForm busy={createVendor.isPending} error={createVendor.error ? mutationErrorMessage(createVendor.error, 'Could not save supplier.') : ''} onSubmit={(data) => createVendor.mutate(data)} />}
        {modal === 'purchase' && <PurchaseForm products={products.data ?? []} vendors={vendors.data ?? []} busy={createPurchase.isPending} error={createPurchase.error ? mutationErrorMessage(createPurchase.error, 'Could not save purchase draft.') : ''} onSubmit={(data) => createPurchase.mutate(data)} />}
        {modal === 'payment' && <VendorPaymentForm vendors={vendors.data ?? []} busy={createPayment.isPending} error={createPayment.error ? mutationErrorMessage(createPayment.error, 'Could not record payment.') : ''} onSubmit={(data) => createPayment.mutate(data)} />}
        {modal === 'farmMoney' && <FarmMoneyForm farms={farms.data ?? []} initialType={farmMoneyInitialType} busy={createFarmMoney.isPending} error={createFarmMoney.error ? mutationErrorMessage(createFarmMoney.error, 'Could not save payout or withdrawal.') : ''} onSubmit={(data) => createFarmMoney.mutate(data)} />}
        {modal === 'invoice' && <InvoiceForm products={products.data ?? []} farms={farms.data ?? []} vendors={vendors.data ?? []} handlingCompanies={companies.data ?? []} busy={createInvoice.isPending} error={createInvoice.error ? mutationErrorMessage(createInvoice.error, 'Could not save invoice draft.') : ''} onSubmit={(data) => createInvoice.mutate(data)} />}
        {modal === 'expense' && <ExpenseForm farms={farms.data ?? []} busy={createExpense.isPending} error={createExpense.error ? mutationErrorMessage(createExpense.error, 'Could not save expense.') : ''} onSubmit={(data) => createExpense.mutate(data)} />}
      </Modal>}
      {previewInvoiceId && <InvoicePreview invoiceId={previewInvoiceId} invoiceNumber={invoices.data?.find((invoice) => invoice._id === previewInvoiceId)?.invoiceNumber ?? 'Invoice'} onClose={() => setPreviewInvoiceId('')} onDownload={downloadInvoicePdf} />}
      {selectedFarmMoneyFarm && <Modal title={`${selectedFarmMoneyFarm.name} · Monthly cash entries`} onClose={() => setSelectedFarmMoneyFarm(null)}>
        <FarmMonthlyLedger farm={selectedFarmMoneyFarm} onEdit={setFarmMoneyEdit} />
      </Modal>}
      {farmMoneyEdit && <Modal title="Edit payment received" onClose={() => setFarmMoneyEdit(null)}>
        <FarmMoneyForm
          farms={farms.data ?? []}
          initialType="FARM_RECEIPT"
          transaction={farmMoneyEdit}
          busy={updateFarmMoneyReceipt.isPending}
          error={updateFarmMoneyReceipt.error ? mutationErrorMessage(updateFarmMoneyReceipt.error, 'Could not update receipt.') : ''}
          onSubmit={(data) => {
            if (!data.farmId) return;
            updateFarmMoneyReceipt.mutate({
              transactionId: farmMoneyEdit._id,
              data: {
                date: data.date,
                farmId: data.farmId,
                marketplace: data.marketplace,
                amount: data.amount,
                bankAccount: data.bankAccount,
                reference: data.reference,
                remark: data.remark,
              },
            });
          }}
        />
      </Modal>}
      {selectedVendorId && <Modal title={`Supplier ledger · ${vendorLedger.data?.vendor.name ?? 'Supplier'}`} onClose={() => setSelectedVendorId('')}>
        <VendorLedgerDetails
          ledger={vendorLedger.data}
          loading={vendorLedger.isLoading}
          error={vendorLedger.isError}
          page={vendorLedgerPage}
          onPageChange={setVendorLedgerPage}
        />
      </Modal>}
    </div>
  );
}

function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return <nav className="record-pagination" aria-label="Record pages">
    <span>Page {page} of {pageCount}</span>
    <div>
      <button className="button button-outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
      <button className="button button-outline" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  </nav>;
}

function FarmMonthlyLedger({ farm, onEdit }: { farm: Farm; onEdit: (transaction: FarmMoneyTransaction) => void }) {
  const [selectedMonth, setSelectedMonth] = useState(localMonth());
  const [page, setPage] = useState(1);
  const monthly = useQuery({
    queryKey: ['farm-money-monthly', farm._id],
    queryFn: () => api.farmMoneyMonthly(farm._id),
  });
  const monthRange = getMonthRange(selectedMonth);
  const entries = useQuery({
    queryKey: ['farm-money-month-entries', farm._id, selectedMonth, page],
    queryFn: () => api.farmMoney({ farmId: farm._id, ...monthRange, page, limit: 20 }),
    enabled: Boolean(selectedMonth),
  });
  useEffect(() => {
    if (monthly.data?.length && !monthly.data.some((item) => item.month === selectedMonth)) {
      setSelectedMonth(monthly.data[0].month);
      setPage(1);
    }
  }, [monthly.data, selectedMonth]);
  const monthData: FarmMoneyMonth | undefined = monthly.data?.find((item) => item.month === selectedMonth);
  return <>
    <div className="farm-month-toolbar">
      <label className="form-field"><span>Month</span><select value={selectedMonth} onChange={(event) => { setSelectedMonth(event.target.value); setPage(1); }}>
        {!monthly.data?.some((item) => item.month === selectedMonth) && <option value={selectedMonth}>{formatMonth(selectedMonth)}</option>}
        {monthly.data?.map((item) => <option key={item.month} value={item.month}>{formatMonth(item.month)}</option>)}
      </select></label>
      {monthly.isError && <span className="form-error">Could not load monthly totals.</span>}
    </div>
    <div className="ledger-summary-grid farm-month-summary">
      <div><small>PAYMENTS RECEIVED</small><strong>{money.format(monthData?.receipts ?? 0)}</strong></div>
      <div><small>WITHDRAWALS</small><strong>{money.format(monthData?.withdrawals ?? 0)}</strong></div>
      <div><small>RECEIPT ENTRIES</small><strong>{monthData?.receiptCount ?? 0}</strong></div>
    </div>
    <div className="farm-month-entry-heading"><strong>{formatMonth(selectedMonth)} entries</strong><span>{entries.data?.total ?? 0} entries</span></div>
    {entries.isLoading ? <div className="empty-inline">Loading monthly cash entries…</div> : entries.isError ? <div className="form-error">Could not load this month’s entries.</div> : entries.data?.transactions.length ? <div className="farm-month-entry-list">
      {entries.data.transactions.map((transaction) => {
        const receipt = transaction.transactionType === 'FARM_RECEIPT';
        return <article className="farm-month-entry" key={transaction._id}>
          <span className={`movement-icon ${receipt ? 'movement-in' : 'movement-out'}`}>{receipt ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
          <div className="movement-main"><strong>{receipt ? `${marketplaceLabel(transaction.marketplace)} payment received` : 'Withdrawal'}</strong><small>{new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(transaction.date))}{transaction.reference ? ` · Ref ${transaction.reference}` : ''}{transaction.remark ? ` · ${transaction.remark}` : ''}</small></div>
          <strong className={`movement-amount ${receipt ? 'amount-in' : 'amount-out'}`}>{receipt ? '+' : '−'}{money.format(transaction.amount)}</strong>
          {receipt && <button className="button button-outline farm-entry-edit" onClick={() => onEdit(transaction)}>Edit</button>}
        </article>;
      })}
    </div> : <div className="empty-inline">No cash entries recorded for this month.</div>}
    {entries.data && entries.data.pageCount > 1 && <Pagination page={page} pageCount={entries.data.pageCount} onChange={setPage} />}
  </>;
}

function Metric({ label, value, icon, accent, note, loading, onClick }: { label: string; value: string | number; icon: ReactNode; accent: string; note: string; loading: boolean; onClick?: () => void }) {
  const content = <><span className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></span><strong className="metric-value">{loading ? '—' : value}</strong><span className="metric-note"><span className="metric-dot" />{note}</span></>;
  return onClick
    ? <button type="button" className={`metric-card metric-${accent} metric-clickable`} onClick={onClick}>{content}</button>
    : <div className={`metric-card metric-${accent}`}>{content}</div>;
}

function LocationTile({ farm, unitsSold, productsSold, loading }: { farm: Farm; unitsSold: number; productsSold: number; loading: boolean }) {
  return <article className="location-tile"><div className="location-top"><span className="location-pin"><MapPin size={15} /></span><span className="location-code">{farm.code}</span></div><strong>{farm.name}</strong><small>{farm.city || 'Sales company'}</small><div className="location-sales-total"><strong>{loading ? '—' : quantity.format(unitsSold)}</strong><span>units sold</span></div><div className="location-sales-products">{loading ? 'Loading sales…' : `${productsSold} ${productsSold === 1 ? 'product' : 'products'} sold`}</div></article>;
}

function StockTableRow({ row }: { row: StockRow }) {
  const [expanded, setExpanded] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const analysis = useQuery({
    queryKey: ['product-stock-analysis', row.productId._id],
    queryFn: () => api.productStockAnalysis(row.productId._id),
    enabled: expanded,
  });
  const history = useQuery({
    queryKey: ['product-stock-history', row.productId._id, historyPage],
    queryFn: () => api.productStockHistory(row.productId._id, historyPage),
    enabled: expanded,
  });
  const status = row.quantity < 0 ? 'negative' : row.quantity === 0 ? 'out' : row.quantity <= (row.productId?.minimumStock ?? 0) ? 'low' : 'healthy';
  const unitCost = row.averageCost || row.productId?.purchasePrice || 0;
  return <>
    <tr className={expanded ? 'stock-row stock-row-expanded' : 'stock-row'}>
      <td><div className="product-cell"><span className="product-thumb"><PackagePlus size={17} /></span><div><strong>{row.productId?.name ?? 'Archived product'}</strong><small>{row.productId?.sku ?? '—'}{row.productId?.productType === 'NON_REGULAR' && <span className="product-type-tag">NON-REGULAR</span>}</small></div></div></td>
      <td><strong className="stock-number">{quantity.format(row.quantity)}</strong><span className="unit-label"> {row.productId?.unit}</span></td>
      <td>{quantity.format(row.productId?.minimumStock ?? 0)} <span className="unit-label">{row.productId?.unit}</span></td>
      <td>{money.format(unitCost)}</td><td>{money.format(row.productId?.sellingPrice ?? 0)}</td><td>{money.format(row.quantity * unitCost)}</td>
      <td><span className={`status-pill status-${status}`}><i />{status === 'healthy' ? 'In stock' : status === 'low' ? 'Low stock' : status === 'negative' ? 'Below zero' : 'Out of stock'}</span></td>
      <td><button className="stock-expand-button" aria-label={`${expanded ? 'Hide' : 'Show'} ${row.productId.name} stock details`} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? <Minus size={15} /> : <Plus size={15} />}</button></td>
    </tr>
    {expanded && <tr className="stock-detail-row"><td colSpan={8}><div className="stock-detail-panel">
      <div className="stock-detail-heading"><div><span className="panel-kicker">STOCK HISTORY · {row.productId.sku}</span><strong>{row.productId.name}</strong></div><div className="stock-current-total"><small>CURRENT COMMON STOCK</small><strong>{quantity.format(history.data?.currentStock ?? row.quantity)} <span>{row.productId.unit}</span></strong></div></div>
      <div className="stock-flow-totals"><div><small>TOTAL STOCK IN</small><strong>{analysis.isLoading ? '—' : `${quantity.format(analysis.data?.totalIn ?? 0)} ${row.productId.unit}`}</strong></div><div><small>TOTAL STOCK OUT</small><strong>{analysis.isLoading ? '—' : `${quantity.format(analysis.data?.totalOut ?? 0)} ${row.productId.unit}`}</strong></div></div>
      <div className="stock-analysis-grid">
        <section className="stock-analysis-section">
          <div className="stock-analysis-title"><strong>Stock out by sales company</strong><span>Total: {quantity.format(analysis.data?.totalOut ?? 0)} {row.productId.unit}</span></div>
          {analysis.isLoading ? <div className="empty-inline">Calculating stock-out summary…</div> : analysis.isError ? <div className="form-error">Could not load stock-by-farm summary.</div> : analysis.data?.stockOutByFarm.length ? <div className="stock-analysis-list">{analysis.data.stockOutByFarm.map((item, index) => <div className="stock-analysis-row" key={item.farm?.code ?? `unassigned-${index}`}><span><strong>{item.farm?.name ?? 'No farm recorded'}</strong><small>{quantity.format(item.sales)} sales · {quantity.format(item.otherOut)} other stock out</small></span><strong>{quantity.format(item.totalOut)} {row.productId.unit}</strong></div>)}</div> : <div className="empty-inline">No stock-out transactions recorded for this product.</div>}
        </section>
        <section className="stock-analysis-section">
          <div className="stock-analysis-title"><strong>Stock in by supplier</strong><span>Units received</span></div>
          {analysis.isLoading ? <div className="empty-inline">Calculating vendor summary…</div> : analysis.isError ? <div className="form-error">Could not load stock-by-vendor summary.</div> : analysis.data?.stockInByVendor.length ? <div className="stock-analysis-list">{analysis.data.stockInByVendor.map((item, index) => <div className="stock-analysis-row" key={item.vendor?.name ?? `vendor-${index}`}><span><strong>{item.vendor?.name ?? 'Archived vendor'}</strong><small>{item.documents} finalized purchase document{item.documents === 1 ? '' : 's'} · {money.format(item.amount)} item value</small></span><strong>{quantity.format(item.quantity)} {row.productId.unit}</strong></div>)}</div> : <div className="empty-inline">No finalized vendor stock-in records found.</div>}
        </section>
      </div>
      {history.isLoading ? <div className="empty-inline">Loading dated stock history…</div> : history.isError ? <div className="form-error">Could not load this product's stock history.</div> : history.data?.transactions.length ? <><div className="stock-history-scroll"><table className="stock-history-table"><thead><tr><th>DATE</th><th>TYPE / SOURCE</th><th>STOCK IN</th><th>STOCK OUT</th><th>RUNNING TOTAL</th><th>DETAIL</th></tr></thead><tbody>{history.data.transactions.map((movement) => { const stockIn = ['OPENING', 'PURCHASE', 'SALES_RETURN', 'TRANSFER_IN', 'ADJUSTMENT_IN'].includes(movement.transactionType); const reversal = movement.referenceType === 'INVOICE_REVERSAL'; const label = reversal ? `${movement.transactionType === 'SALES_RETURN' ? 'Sales cancellation' : 'Stock-in cancellation'} reversal` : movement.transactionType.replaceAll('_', ' '); return <tr key={movement._id}><td>{new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(movement.transactionDate))}</td><td><strong>{label}</strong>{movement.referenceNumber && <small>{movement.referenceNumber}</small>}{movement.farmId && <small>{movement.farmId.name}</small>}</td><td className="history-in">{stockIn ? `+${quantity.format(movement.quantity)}` : '—'}</td><td className="history-out">{stockIn ? '—' : `−${quantity.format(movement.quantity)}`}</td><td><strong>{quantity.format(movement.newBalance)} {row.productId.unit}</strong></td><td>{movement.reason || movement.notes || '—'}</td></tr>; })}</tbody></table></div><div className="history-pagination"><span>Showing {(historyPage - 1) * 20 + 1}–{Math.min(historyPage * 20, history.data.totalTransactions)} of {history.data.totalTransactions} movements</span><div><button className="button button-outline" disabled={historyPage <= 1} onClick={() => setHistoryPage((value) => value - 1)}>Previous</button><button className="button button-outline" disabled={historyPage >= history.data.pageCount} onClick={() => setHistoryPage((value) => value + 1)}>Next</button></div></div></> : <div className="stock-no-history"><span>No stock-in, sale, return, or adjustment transactions recorded for this product yet.</span><strong>Current stock: {quantity.format(history.data?.currentStock ?? row.quantity)} {row.productId.unit}</strong></div>}
    </div></td></tr>}
  </>;
}

function VendorLedgerDetails({ ledger, loading, error, page, onPageChange }: { ledger?: VendorLedger; loading: boolean; error: boolean; page: number; onPageChange: (page: number) => void }) {
  if (loading) return <div className="empty-inline">Loading vendor payable history…</div>;
  if (error || !ledger) return <div className="form-error">Could not load this vendor's payable history.</div>;
  return <>
    <div className="ledger-summary-grid">
      <div><small>FINALIZED PURCHASES</small><strong>{money.format(ledger.totalPurchases)}</strong></div>
      <div><small>PAYMENTS RECORDED</small><strong>{money.format(ledger.totalPaid)}</strong></div>
      <div><small>CURRENT PAYABLE</small><strong>{money.format(ledger.outstanding)}</strong></div>
    </div>
    <p className="ledger-explanation">Payable is calculated as finalized purchase bills and stock-in invoices minus recorded payments. Payments are not assigned to a specific bill; the balance below is a chronological running total.</p>
    {ledger.events.length ? <div className="vendor-ledger-list">
      {ledger.events.map((event) => {
        const payment = event.eventType === 'PAYMENT';
        const date = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(event.date));
        return <article className="vendor-ledger-event" key={event._id}>
          <div className={`ledger-event-mark ${payment ? 'ledger-payment' : 'ledger-purchase'}`}>{payment ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}</div>
          <div className="ledger-event-content">
            <div className="ledger-event-heading"><span><strong>{payment ? 'Payment' : event.eventType === 'PURCHASE' ? 'Purchase' : 'Stock-in invoice'}</strong><small>{date}{event.documentNumber ? ` · ${event.documentNumber}` : ''}{event.vendorInvoiceNumber ? ` · Vendor invoice ${event.vendorInvoiceNumber}` : ''}</small></span><strong className={payment ? 'ledger-amount-paid' : 'ledger-amount-billed'}>{payment ? '−' : '+'}{money.format(Math.abs(event.amount))}</strong></div>
            {payment && <small className="ledger-event-meta">{event.paymentMethod ?? 'Payment method not recorded'}{event.remark ? ` · ${event.remark}` : ''}</small>}
            {event.items?.length ? <div className="ledger-line-items">{event.items.map((item, index) => <span key={`${item.sku ?? item.productName}-${index}`}>{item.productName ?? item.sku} · {quantity.format(item.quantity ?? 0)} {item.unit ?? ''} × {money.format(item.rate ?? 0)} = {money.format(item.amount ?? 0)}</span>)}</div> : null}
            {!payment && <div className="ledger-document-breakdown"><span>Items subtotal <strong>{money.format(event.subtotal ?? 0)}</strong></span>{(event.discountAmount ?? 0) > 0 && <span>Discount <strong>−{money.format(event.discountAmount ?? 0)}</strong></span>}<span>{event.eventType === 'PURCHASE' ? 'Tax / charges' : 'Tax'} <strong>+{money.format(event.additionalCharges ?? 0)}</strong></span><span>Bill total <strong>{money.format(event.amount)}</strong></span></div>}
            {!payment && event.remark && <small className="ledger-event-meta">{event.remark}</small>}
            <div className="ledger-running-balance">Payable after entry <strong>{money.format(event.runningBalance)}</strong></div>
          </div>
        </article>;
      })}
    </div> : <div className="empty-inline">No finalized purchases or payments recorded for this vendor.</div>}
    {ledger.pageCount > 1 && <div className="ledger-pagination"><span>Page {page} of {ledger.pageCount} · {ledger.totalEvents} entries</span><div><button className="button button-outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button><button className="button button-outline" disabled={page >= ledger.pageCount} onClick={() => onPageChange(page + 1)}>Next</button></div></div>}
  </>;
}

function InvoicePreview({ invoiceId, invoiceNumber, onClose, onDownload }: { invoiceId: string; invoiceNumber: string; onClose: () => void; onDownload: (invoiceId: string, invoiceNumber: string) => Promise<void> }) {
  const details = useQuery({ queryKey: ['invoice-details', invoiceId], queryFn: () => api.invoiceDetails(invoiceId) });
  const pdf = useQuery({ queryKey: ['invoice-preview-pdf', invoiceId], queryFn: () => api.invoicePdf(invoiceId) });
  const [pdfUrl, setPdfUrl] = useState('');
  useEffect(() => {
    if (!pdf.data) return;
    const url = URL.createObjectURL(pdf.data);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdf.data]);
  const invoice = details.data;
  return <Modal title={`Preview · ${invoice?.invoiceNumber ?? invoiceNumber}`} onClose={onClose} className="invoice-preview-modal">
    {details.isLoading ? <div className="empty-inline">Loading invoice details…</div> : details.isError || !invoice ? <div className="form-error">Could not load this invoice. Close the preview and try again.</div> : <>
      <div className="invoice-preview-toolbar">
        <div><span className={`status-pill status-${invoice.status === 'FINALIZED' ? 'healthy' : invoice.status === 'DRAFT' ? 'low' : 'out'}`}>{invoice.status}</span><span className="invoice-preview-kind">{invoice.invoiceType === 'SALES' ? 'Sales invoice' : 'Stock-in invoice'}</span></div>
        <button className="button button-outline" onClick={() => void onDownload(invoice._id, invoice.invoiceNumber)}><Download size={14} /> Download PDF</button>
      </div>
      <div className="invoice-preview-summary">
        <div><small>DATE</small><strong>{new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(invoice.invoiceDate))}</strong></div>
        <div><small>{invoice.invoiceType === 'SALES' ? 'HANDLING COMPANY' : 'VENDOR'}</small><strong>{invoice.invoiceType === 'SALES' ? invoice.handlingCompanyId?.name ?? '—' : invoice.vendorId?.name ?? '—'}</strong></div>
        {invoice.invoiceType === 'SALES' ? <div><small>BUYER</small><strong>{invoice.buyer?.customerName || invoice.buyer?.companyName || '—'}</strong></div> : null}
        {invoice.farmId && <div><small>FARM</small><strong>{invoice.farmId.name}</strong></div>}
      </div>
      <div className="invoice-preview-lines">
        <table><thead><tr><th>PRODUCT</th><th>QTY</th><th>RATE</th><th>AMOUNT</th></tr></thead><tbody>
          {invoice.items.map((item, index) => <tr key={`${item.productId}-${index}`}><td><strong>{item.productName}</strong><small>{item.sku}</small></td><td>{quantity.format(item.quantity)} {item.unit}</td><td>{money.format(item.rate)}</td><td>{money.format(item.amount)}</td></tr>)}
        </tbody></table>
        <div className="invoice-preview-totals"><span>Subtotal <strong>{money.format(invoice.subtotal)}</strong></span>{invoice.discount > 0 && <span>Discount <strong>−{money.format(invoice.discount)}</strong></span>}<span>Tax <strong>+{money.format(invoice.tax)}</strong></span><span className="invoice-preview-grand-total">Grand total <strong>{money.format(invoice.grandTotal)}</strong></span></div>
      </div>
      <div className="invoice-pdf-preview">
        <div className="invoice-pdf-heading"><strong>Printable A4 preview</strong>{pdf.isError && <span className="form-error">Could not load PDF preview.</span>}</div>
        {pdf.isLoading ? <div className="empty-inline">Preparing printable invoice…</div> : pdfUrl ? <iframe title={`Printable PDF preview for ${invoice.invoiceNumber}`} src={pdfUrl} /> : null}
      </div>
    </>}
  </Modal>;
}

function Modal({ title, onClose, children, className = '' }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><span className="panel-kicker">INVENTORY RECORD</span><h2 id="modal-title">{title}</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>{children}</section></div>;
}

function CompanyForm({ busy, error, onSubmit }: { busy: boolean; error: string; onSubmit: (data: { name: string; code: string }) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({ name: String(form.get('name')).trim(), code: String(form.get('code')).trim().toUpperCase() });
  }
  return <form className="form-stack" onSubmit={submit}><div className="form-grid"><Field label="Inventory company name"><input name="name" required minLength={2} maxLength={120} placeholder="e.g. Fieldstock Trading" /></Field><Field label="Short code"><input name="code" required minLength={2} maxLength={20} pattern="[A-Za-z0-9_-]+" placeholder="e.g. FST" /></Field></div><p className="form-hint">Inventory companies keep their sales reporting separate while physical stock remains shared.</p>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button className="button button-primary" disabled={busy}><Plus size={15} />{busy ? 'Creating…' : 'Create inventory company'}</button></div></form>;
}

function ProductLineFields({ products, prefix }: { products: Product[]; prefix: string }) {
  const [lineIds, setLineIds] = useState([0]);
  const includeTax = prefix === 'invoice';
  return <div className="form-stack"><div className="batch-items-heading"><div><strong>Products</strong><small>Enter quantity and unit rate for each product.</small></div><span>{lineIds.length} lines</span></div><div className="batch-lines">{lineIds.map((lineId, index) => <div className={`document-line ${includeTax ? 'document-line-invoice' : ''}`} key={lineId}><span className="batch-line-number">{String(index + 1).padStart(2, '0')}</span><select name={`${prefix}-product-${lineId}`} required aria-label={`${prefix} product ${index + 1}`}><option value="" disabled>Select product</option>{products.map((product) => <option key={product._id} value={product._id}>{product.sku} · {product.name}</option>)}</select><input name={`${prefix}-quantity-${lineId}`} type="number" min="0.000001" step="any" required placeholder="Qty" aria-label={`${prefix} quantity ${index + 1}`} /><input name={`${prefix}-rate-${lineId}`} type="number" min="0" step="0.01" required placeholder="Rate" aria-label={`${prefix} rate ${index + 1}`} />{includeTax && <><input name={`${prefix}-discount-${lineId}`} type="number" min="0" step="0.01" placeholder="Discount" aria-label={`Line ${index + 1} discount`} /><input name={`${prefix}-tax-${lineId}`} type="number" min="0" step="0.01" placeholder="Tax" aria-label={`Line ${index + 1} tax`} /></>}{lineIds.length > 1 && <button className="batch-remove" type="button" aria-label={`Remove ${prefix} line ${index + 1}`} onClick={() => setLineIds((ids) => ids.filter((id) => id !== lineId))}><X size={15} /></button>}</div>)}</div><button className="batch-add-line" type="button" disabled={lineIds.length >= 30} onClick={() => setLineIds((ids) => [...ids, Math.max(...ids) + 1])}><Plus size={14} /> Add product line</button></div>;
}

function readProductLines(form: FormData, prefix: string) {
  const lineIds = [...form.keys()].flatMap((key) => {
    const match = key.match(new RegExp(`^${prefix}-product-(\\d+)$`));
    return match ? [match[1]!] : [];
  });
  return lineIds.map((lineId) => ({ productId: String(form.get(`${prefix}-product-${lineId}`)), quantity: Number(form.get(`${prefix}-quantity-${lineId}`)), rate: Number(form.get(`${prefix}-rate-${lineId}`)), discount: Number(form.get(`${prefix}-discount-${lineId}`)) || undefined, tax: Number(form.get(`${prefix}-tax-${lineId}`)) || undefined }));
}

function PurchaseForm({ products, vendors, busy, error, onSubmit }: { products: Product[]; vendors: Array<{ _id: string; name: string }>; busy: boolean; error: string; onSubmit: (data: { purchaseDate: string; vendorId: string; taxCharges?: number; remark?: string; items: Array<{ productId: string; quantity: number; rate: number }> }) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ purchaseDate: new Date(`${String(form.get('date'))}T12:00:00`).toISOString(), vendorId: String(form.get('vendorId')), taxCharges: Number(form.get('taxCharges')) || 0, remark: String(form.get('remark')).trim() || undefined, items: readProductLines(form, 'purchase') }); }
  return <form className="form-stack" onSubmit={submit}><div className="form-grid"><Field label="Purchase date"><input name="date" type="date" required defaultValue={localDate()} /></Field><Field label="Supplier"><select name="vendorId" required defaultValue=""><option value="" disabled>Select supplier</option>{vendors.map((vendor) => <option key={vendor._id} value={vendor._id}>{vendor.name}</option>)}</select></Field><Field label="Tax / charges"><input name="taxCharges" type="number" min="0" step="0.01" defaultValue="0" /></Field></div><ProductLineFields products={products} prefix="purchase" /><Field label="Remark"><input name="remark" maxLength={1000} /></Field>{error && <div className="form-error">{error}</div>}<p className="form-hint">A supplier invoice number is generated automatically. Saving adds the purchased quantities to physical stock and updates the supplier balance.</p><div className="modal-actions"><button className="button button-primary" disabled={busy || !vendors.length || !products.length}><ArrowDownLeft size={15} />{busy ? 'Saving purchase…' : 'Record purchase & add stock'}</button></div></form>;
}

function VendorForm({ busy, error, onSubmit }: { busy: boolean; error: string; onSubmit: (data: { name: string; companyName?: string; mobile?: string; email?: string }) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ name: String(form.get('name')).trim(), companyName: String(form.get('companyName')).trim() || undefined, mobile: String(form.get('mobile')).trim() || undefined, email: String(form.get('email')).trim() || undefined }); }
  return <form className="form-stack" onSubmit={submit}><div className="form-grid"><Field label="Supplier name"><input name="name" required /></Field><Field label="Company"><input name="companyName" /></Field><Field label="Mobile"><input name="mobile" inputMode="tel" /></Field><Field label="Email"><input name="email" type="email" /></Field></div>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button className="button button-primary" disabled={busy}><Plus size={15} />{busy ? 'Saving…' : 'Add supplier'}</button></div></form>;
}

function VendorPaymentForm({ vendors, busy, error, onSubmit }: { vendors: Array<{ _id: string; name: string }>; busy: boolean; error: string; onSubmit: (data: { vendorId: string; paymentDate: string; amount: number; paymentMethod: string; referenceNumber?: string; remark?: string }) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ vendorId: String(form.get('vendorId')), paymentDate: new Date(`${String(form.get('date'))}T12:00:00`).toISOString(), amount: Number(form.get('amount')), paymentMethod: String(form.get('method')), referenceNumber: String(form.get('reference')).trim() || undefined, remark: String(form.get('remark')).trim() || undefined }); }
  return <form className="form-stack" onSubmit={submit}><div className="form-grid"><Field label="Payment date"><input name="date" type="date" required defaultValue={localDate()} /></Field><Field label="Supplier"><select name="vendorId" required defaultValue=""><option value="" disabled>Select supplier</option>{vendors.map((vendor) => <option key={vendor._id} value={vendor._id}>{vendor.name}</option>)}</select></Field><Field label="Amount (₹)"><input name="amount" type="number" min="0.01" step="0.01" required /></Field><Field label="Payment method"><select name="method"><option value="BANK">Bank</option><option value="CASH">Cash</option><option value="UPI">UPI</option><option value="OTHER">Other</option></select></Field><Field label="Reference"><input name="reference" /></Field><Field label="Remark"><input name="remark" /></Field></div>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button className="button button-primary" disabled={busy || !vendors.length}>{busy ? 'Saving…' : 'Record supplier payment'}</button></div></form>;
}

function FarmMoneyForm({ farms, initialType, transaction, busy, error, onSubmit }: { farms: Farm[]; initialType: 'FARM_RECEIPT' | 'WITHDRAWAL'; transaction?: FarmMoneyTransaction; busy: boolean; error: string; onSubmit: (data: FarmMoneyInput) => void }) {
  const [type, setType] = useState<'FARM_RECEIPT' | 'WITHDRAWAL'>(initialType);
  const activeType = transaction ? 'FARM_RECEIPT' : type;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const farmId = String(form.get('farmId') ?? '').trim();
    const marketplace = String(form.get('marketplace') ?? '');
    onSubmit({
      date: new Date(`${String(form.get('date'))}T12:00:00`).toISOString(),
      transactionType: activeType,
      farmId: farmId || undefined,
      marketplace: activeType === 'FARM_RECEIPT' && marketplace ? marketplace as FarmMoneyInput['marketplace'] : undefined,
      amount: Number(form.get('amount')),
      bankAccount: String(form.get('account')).trim() || undefined,
      reference: String(form.get('reference')).trim() || undefined,
      remark: String(form.get('remark')).trim() || undefined,
    });
  }
  return <form className="form-stack" onSubmit={submit}>
    {!transaction && <div className="segmented-control"><button type="button" className={type === 'FARM_RECEIPT' ? 'selected' : ''} onClick={() => setType('FARM_RECEIPT')}><ArrowDownLeft size={15} /> Payout received</button><button type="button" className={type === 'WITHDRAWAL' ? 'selected' : ''} onClick={() => setType('WITHDRAWAL')}><ArrowUpRight size={15} /> Withdrawal</button></div>}
    <div className="form-grid">
      <Field label="Date"><input name="date" type="date" required defaultValue={localDate(transaction ? new Date(transaction.date) : new Date())} /></Field>
      {activeType === 'FARM_RECEIPT' && <Field label="Received from"><select name="marketplace" defaultValue={transaction ? transaction.marketplace ?? '' : 'MEESHO'}><option value="">Not specified</option><option value="MEESHO">Meesho</option><option value="AMAZON">Amazon</option><option value="FLIPKART">Flipkart</option><option value="OTHER">Other</option></select></Field>}
      <Field label={activeType === 'FARM_RECEIPT' ? 'Sales company' : 'Sales company (optional)'}><select name="farmId" required={activeType === 'FARM_RECEIPT'} defaultValue={transaction?.farmId?._id ?? ''}><option value="">{activeType === 'FARM_RECEIPT' ? 'Select company' : 'No company assigned'}</option>{farms.map((farm) => <option key={farm._id} value={farm._id}>{farm.name}</option>)}</select></Field>
      <Field label="Amount (₹)"><input name="amount" type="number" min="0.01" step="0.01" required defaultValue={transaction?.amount} /></Field>
      <Field label="Bank / account"><input name="account" maxLength={120} defaultValue={transaction?.bankAccount ?? ''} /></Field>
      <Field label="Reference"><input name="reference" defaultValue={transaction?.reference ?? ''} /></Field>
      <Field label="Remark"><input name="remark" defaultValue={transaction?.remark ?? ''} /></Field>
    </div>
    {error && <div className="form-error">{error}</div>}
    <p className="form-hint">Payout receipts and withdrawals are tracked separately from physical stock and supplier payments.</p>
    <div className="modal-actions"><button className="button button-primary" disabled={busy || (activeType === 'FARM_RECEIPT' && !farms.length)}>{busy ? 'Saving…' : transaction ? 'Save changes' : activeType === 'FARM_RECEIPT' ? 'Record payout receipt' : 'Record withdrawal'}</button></div>
  </form>;
}

function ExpenseForm({ farms, busy, error, onSubmit }: { farms: Farm[]; busy: boolean; error: string; onSubmit: (data: { date: string; farmId?: string; category: string; amount: number; description?: string }) => void }) {
  const [category, setCategory] = useState('Water bill');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const customCategory = String(form.get('customCategory') ?? '').trim();
    onSubmit({
      date: new Date(`${String(form.get('date'))}T12:00:00`).toISOString(),
      farmId: String(form.get('farmId') ?? '') || undefined,
      category: category === 'Other' ? customCategory : category,
      amount: Number(form.get('amount')),
      description: String(form.get('description')).trim() || undefined,
    });
  }
  return <form className="form-stack" onSubmit={submit}>
    <div className="form-grid">
      <Field label="Date"><input name="date" type="date" required defaultValue={localDate()} /></Field>
      <Field label="Category"><select value={category} onChange={(event) => setCategory(event.target.value)}><option>Water bill</option><option>Cleaning bill</option><option>Packaging bill</option><option>Snacks</option><option>Other</option></select></Field>
      {category === 'Other' && <Field label="Expense category"><input name="customCategory" required maxLength={80} placeholder="Enter category" /></Field>}
      <Field label="Farm (optional)"><select name="farmId" defaultValue=""><option value="">General expense</option>{farms.map((farm) => <option key={farm._id} value={farm._id}>{farm.name}</option>)}</select></Field>
      <Field label="Amount (₹)"><input name="amount" type="number" min="0.01" step="0.01" required /></Field>
      <Field label="Details (optional)"><input name="description" maxLength={500} placeholder="Bill number or note" /></Field>
    </div>
    {error && <div className="form-error">{error}</div>}
    <p className="form-hint">Expenses are recorded separately and do not change farm cash balances.</p>
    <div className="modal-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</button></div>
  </form>;
}

function marketplaceLabel(marketplace?: 'MEESHO' | 'AMAZON' | 'FLIPKART' | 'OTHER' | 'UNSPECIFIED') {
  if (marketplace === 'MEESHO') return 'Meesho';
  if (marketplace === 'AMAZON') return 'Amazon';
  if (marketplace === 'FLIPKART') return 'Flipkart';
  if (marketplace === 'OTHER') return 'Other';
  return 'Not specified';
}

function InvoiceForm({ products, farms, vendors, handlingCompanies, busy, error, onSubmit }: { products: Product[]; farms: Farm[]; vendors: Array<{ _id: string; name: string }>; handlingCompanies: Array<{ _id: string; name: string }>; busy: boolean; error: string; onSubmit: (data: { invoiceType: 'SALES' | 'STOCK_IN'; invoiceDate: string; handlingCompanyId?: string; marketplace?: string; vendorId?: string; farmId?: string; buyer?: Record<string, string>; remark?: string; items: Array<{ productId: string; quantity: number; rate: number; discount?: number; tax?: number }> }) => void }) {
  const [type, setType] = useState<'SALES' | 'STOCK_IN'>('SALES');
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const buyer = type === 'SALES' ? { customerName: String(form.get('customerName')).trim(), companyName: String(form.get('buyerCompany')).trim(), mobile: String(form.get('mobile')).trim(), email: String(form.get('email')).trim(), address: String(form.get('address')).trim(), city: String(form.get('city')).trim(), state: String(form.get('state')).trim(), pincode: String(form.get('pincode')).trim(), gstin: String(form.get('gstin')).trim() } : undefined; const farmValue = type === 'SALES' ? String(form.get('farmId') ?? '').trim() : ''; onSubmit({ invoiceType: type, invoiceDate: new Date(`${String(form.get('date'))}T12:00:00`).toISOString(), handlingCompanyId: type === 'SALES' ? String(form.get('handlingCompanyId')) : undefined, marketplace: type === 'SALES' ? String(form.get('marketplace')) : undefined, vendorId: type === 'STOCK_IN' ? String(form.get('vendorId')) : undefined, farmId: farmValue && farmValue !== 'null' ? farmValue : undefined, buyer, remark: String(form.get('remark')).trim() || undefined, items: readProductLines(form, 'invoice') }); }
  return <form className="form-stack" onSubmit={submit}><div className="segmented-control"><button type="button" className={type === 'SALES' ? 'selected' : ''} onClick={() => setType('SALES')}><ArrowUpRight size={15} /> Sales invoice</button><button type="button" className={type === 'STOCK_IN' ? 'selected' : ''} onClick={() => setType('STOCK_IN')}><ArrowDownLeft size={15} /> Stock-in invoice</button></div><div className="form-grid"><Field label="Invoice date"><input name="date" type="date" required defaultValue={localDate()} /></Field>{type === 'SALES' ? <><Field label="Inventory company"><select name="handlingCompanyId" required defaultValue=""><option value="" disabled>Select company</option>{handlingCompanies.map((company) => <option key={company._id} value={company._id}>{company.name}</option>)}</select></Field><Field label="Marketplace"><select name="marketplace" defaultValue="DIRECT"><option value="DIRECT">Direct</option><option value="AMAZON">Amazon</option><option value="MEESHO">Meesho</option><option value="FLIPKART">Flipkart</option><option value="OTHER">Other</option></select></Field><Field label="Sales company (optional)"><select name="farmId" defaultValue=""><option value="">None</option>{farms.map((farm) => <option key={farm._id} value={farm._id}>{farm.name}</option>)}</select></Field><Field label="Buyer name"><input name="customerName" required /></Field><Field label="Buyer company"><input name="buyerCompany" /></Field><Field label="Mobile"><input name="mobile" /></Field><Field label="Email"><input name="email" type="email" /></Field><Field label="Address"><input name="address" /></Field><Field label="City"><input name="city" /></Field><Field label="State"><input name="state" /></Field><Field label="Pincode"><input name="pincode" /></Field><Field label="GSTIN"><input name="gstin" /></Field></> : <Field label="Supplier"><select name="vendorId" required defaultValue=""><option value="" disabled>Select supplier</option>{vendors.map((vendor) => <option key={vendor._id} value={vendor._id}>{vendor.name}</option>)}</select></Field>}</div><ProductLineFields products={products} prefix="invoice" /><Field label="Remark"><input name="remark" /></Field>{error && <div className="form-error">{error}</div>}<p className="form-hint">{type === 'STOCK_IN' ? 'The inventory company is automatically assigned as stock owner. Saving creates a draft only; finalize it to add the purchased quantities to physical stock.' : 'This saves a draft only. Drafts do not affect stock; finalize from Recent invoices to post stock changes.'}</p><div className="modal-actions"><button className="button button-primary" disabled={busy || !products.length || (type === 'SALES' ? !handlingCompanies.length : !vendors.length)}>{busy ? 'Saving draft…' : 'Save invoice draft'}</button></div></form>;
}

function localDate(date = new Date()) { return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); }
function localMonth() { return localDate().slice(0, 7); }
function getMonthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const from = new Date(year, monthNumber - 1, 1);
  const to = new Date(year, monthNumber, 0, 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}
function formatMonth(month: string) {
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`));
}

function getDateRange(preset: DatePreset, customFrom: string, customTo: string) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let from = new Date(start);
  let to = new Date(start);
  let label = 'Today';
  let shortLabel = 'Today';
  if (preset === 'YESTERDAY') {
    from.setDate(from.getDate() - 1);
    to = new Date(from);
    label = shortLabel = 'Yesterday';
  } else if (preset === 'THIS_WEEK') {
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    to = new Date(start);
    label = shortLabel = 'This week';
  } else if (preset === 'THIS_MONTH') {
    from = new Date(start.getFullYear(), start.getMonth(), 1);
    to = new Date(start);
    label = shortLabel = 'This month';
  } else if (preset === 'LAST_MONTH') {
    from = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    to = new Date(start.getFullYear(), start.getMonth(), 0);
    label = shortLabel = 'Last month';
  } else if (preset === 'LAST_6_MONTHS') {
    from = new Date(start.getFullYear(), start.getMonth() - 5, 1);
    to = new Date(start);
    label = shortLabel = 'Last 6 months';
  } else if (preset === 'THIS_YEAR') {
    from = new Date(start.getFullYear(), 0, 1);
    to = new Date(start);
    label = shortLabel = 'This year';
  } else if (preset === 'CUSTOM' && customFrom && customTo) {
    from = new Date(`${customFrom}T00:00:00`);
    to = new Date(`${customTo}T00:00:00`);
    if (from > to) [from, to] = [to, from];
    label = `${customFrom} to ${customTo}`;
    shortLabel = 'Selected period';
  }
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString(), label, shortLabel };
}

function SalesBatchForm({ products, farms, busy, error, onSubmit }: { products: Product[]; farms: Farm[]; busy: boolean; error: string; onSubmit: (data: { farmId?: string; salesDate: string; marketplace: 'AMAZON' | 'MEESHO' | 'FLIPKART' | 'OTHER' | 'DIRECT'; customerName?: string; customerCompany?: string; reference?: string; notes?: string; items: Array<{ productId: string; quantity: number }> }) => void }) {
  const [lineIds, setLineIds] = useState([0]);
  const [marketplace, setMarketplace] = useState<'AMAZON' | 'MEESHO' | 'FLIPKART' | 'OTHER' | 'DIRECT'>('MEESHO');
  const lineCount = lineIds.length;
  const defaultDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const items = lineIds.map((lineId) => ({
      productId: String(form.get(`product-${lineId}`) ?? ''),
      quantity: Number(form.get(`quantity-${lineId}`)),
    })).filter((item) => item.productId && item.quantity > 0);
    onSubmit({
      farmId: String(form.get('farmId') ?? '').trim() || undefined,
      salesDate: new Date(`${String(form.get('salesDate'))}T12:00:00`).toISOString(),
      marketplace,
      customerName: marketplace === 'DIRECT' ? String(form.get('customerName')).trim() || undefined : undefined,
      customerCompany: marketplace === 'DIRECT' ? String(form.get('customerCompany')).trim() || undefined : undefined,
      reference: String(form.get('reference')).trim() || undefined,
      notes: String(form.get('notes')).trim() || undefined,
      items,
    });
  }
  return <form className="form-stack" onSubmit={submit}>
    <div className="form-grid"><Field label="Sales date"><input name="salesDate" type="date" required defaultValue={defaultDate} /></Field><Field label="Marketplace"><select name="marketplace" value={marketplace} onChange={(event) => setMarketplace(event.target.value as typeof marketplace)}><option value="AMAZON">Amazon</option><option value="MEESHO">Meesho</option><option value="FLIPKART">Flipkart</option><option value="DIRECT">Direct / offline</option></select></Field>{marketplace !== 'DIRECT' && <Field label="Farm / location (optional)"><select name="farmId" defaultValue=""><option value="">No farm selected</option>{farms.map((farm) => <option key={farm._id} value={farm._id}>{farm.name}</option>)}</select></Field>}<Field label="Batch / order reference"><input name="reference" maxLength={100} placeholder="Optional settlement or export reference" /></Field>{marketplace === 'DIRECT' && <><Field label="Customer name (optional)"><input name="customerName" maxLength={120} placeholder="Person who purchased" /></Field><Field label="Company name (optional)"><input name="customerCompany" maxLength={120} placeholder="Customer’s company" /></Field></>}</div>
    <div className="batch-items-heading"><div><strong>Products sold</strong><small>Enter each SKU once with its total quantity for this batch.</small></div><span>{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span></div>
    <div className="batch-lines">{lineIds.map((lineId, index) => <div className="batch-line" key={lineId}><span className="batch-line-number">{String(index + 1).padStart(2, '0')}</span><select name={`product-${lineId}`} required aria-label={`Product ${index + 1}`} defaultValue=""><option value="" disabled>Choose SKU / product</option>{products.filter((product) => product.status === 'ACTIVE').map((product) => <option key={product._id} value={product._id}>{product.sku} · {product.name}</option>)}</select><input name={`quantity-${lineId}`} type="number" min="0.000001" step="any" required placeholder="Qty" aria-label={`Quantity ${index + 1}`} />{lineCount > 1 && <button className="batch-remove" type="button" aria-label={`Remove line ${index + 1}`} onClick={() => setLineIds((ids) => ids.filter((id) => id !== lineId))}><X size={15} /></button>}</div>)}</div>
    <button className="batch-add-line" type="button" onClick={() => setLineIds((ids) => [...ids, Math.max(...ids) + 1])} disabled={lineCount >= 30}><Plus size={14} /> Add product line</button>
    <Field label="Notes"><input name="notes" maxLength={1000} placeholder={marketplace === 'DIRECT' ? 'Optional notes for this offline sale' : 'Optional notes for this farm and platform batch'} /></Field>
    {error && <div className="form-error">{error}</div>}
    <p className="form-hint">One submission records the batch and deducts every line from Ashvex common stock. The batch is rejected if any product does not have enough available stock.</p>
    <div className="modal-actions"><button className="button button-primary" disabled={busy || !products.length}><ArrowUpRight size={15} />{busy ? 'Recording batch…' : 'Record sales batch'}</button></div>
  </form>;
}

function ProductForm({ busy, error, onSubmit }: { busy: boolean; error: string; onSubmit: (data: { sku: string; name: string; productType: 'REGULAR' | 'NON_REGULAR'; unit: string; minimumStock: number; purchasePrice: number; sellingPrice: number }) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ sku: String(form.get('sku')).trim(), name: String(form.get('name')).trim(), productType: String(form.get('productType')) as 'REGULAR' | 'NON_REGULAR', unit: String(form.get('unit')), minimumStock: Number(form.get('minimumStock')), purchasePrice: Number(form.get('purchasePrice')), sellingPrice: Number(form.get('sellingPrice')) }); }
  return <form className="form-stack" onSubmit={submit}><div className="form-grid"><Field label="Product name"><input name="name" required maxLength={160} placeholder="e.g. Ceramic serving bowl set" /></Field><Field label="SKU"><input name="sku" required maxLength={40} placeholder="e.g. KT-104" /></Field><Field label="Product type"><select name="productType" defaultValue="REGULAR"><option value="REGULAR">Regular</option><option value="NON_REGULAR">Non-regular / occasional</option></select></Field><Field label="Unit"><select name="unit"><option>PCS</option><option>BOX</option><option>KG</option><option>GRAM</option><option>LITER</option><option>PACK</option><option>SET</option></select></Field><Field label="Minimum stock"><input name="minimumStock" type="number" min="0" step="any" defaultValue="0" /></Field><Field label="Purchase price (₹)"><input name="purchasePrice" type="number" min="0" step="0.01" defaultValue="0" /></Field><Field label="Selling price (₹)"><input name="sellingPrice" type="number" min="0" step="0.01" defaultValue="0" /></Field></div>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button className="button button-primary" disabled={busy}><Plus size={15} />{busy ? 'Saving…' : 'Create product'}</button></div></form>;
}

function FarmForm({ busy, error, onSubmit }: { busy: boolean; error: string; onSubmit: (data: { code: string; name: string; city?: string }) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ code: String(form.get('code')).trim(), name: String(form.get('name')).trim(), city: String(form.get('city')).trim() || undefined }); }
  return <form className="form-stack" onSubmit={submit}><div className="form-grid"><Field label="Sales company name"><input name="name" required placeholder="e.g. Fieldstock Home" /></Field><Field label="Company code"><input name="code" required placeholder="e.g. FSH-01" /></Field><Field label="City"><input name="city" placeholder="Optional" /></Field></div>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button className="button button-primary" disabled={busy}><Plus size={15} />{busy ? 'Saving…' : 'Add sales company'}</button></div></form>;
}

function MovementForm({ products, farms, busy, error, onSubmit }: { products: Product[]; farms: Farm[]; busy: boolean; error: string; onSubmit: (data: { productId: string; farmId?: string; transactionType: string; quantity: number; unitCost?: number; reason?: string }) => void }) {
  const [direction, setDirection] = useState('OPENING');
  const isInbound = direction === 'OPENING' || direction === 'ADJUSTMENT_IN';
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const selectedFarm = String(form.get('farmId')).trim(); onSubmit({ productId: String(form.get('productId')), farmId: selectedFarm || undefined, transactionType: direction, quantity: Number(form.get('quantity')), unitCost: Number(form.get('unitCost')) || undefined, reason: String(form.get('reason')).trim() || undefined }); }
  return <form className="form-stack" onSubmit={submit}><div className="segmented-control"><button type="button" className={isInbound ? 'selected' : ''} onClick={() => setDirection(direction === 'OPENING' ? 'OPENING' : 'ADJUSTMENT_IN')}><ArrowDownLeft size={15} /> Stock in</button><button type="button" className={!isInbound ? 'selected' : ''} onClick={() => setDirection('ADJUSTMENT_OUT')}><ArrowUpRight size={15} /> Stock out</button></div><div className="form-grid"><Field label="Product"><select name="productId" required defaultValue=""><option value="" disabled>Select product</option>{products.filter((product) => product.status === 'ACTIVE').map((product) => <option key={product._id} value={product._id}>{product.name} · {product.sku}</option>)}</select></Field><Field label="Farm for reporting (optional)"><select name="farmId" defaultValue=""><option value="">Common stock / no farm</option>{farms.map((farm) => <option key={farm._id} value={farm._id}>{farm.name}</option>)}</select></Field><Field label="Quantity"><input name="quantity" type="number" min="0.000001" step="any" required placeholder="0" /></Field>{isInbound && <Field label="Unit cost (₹)"><input name="unitCost" type="number" min="0" step="0.01" placeholder="Optional" /></Field>}<Field label="Reason"><input name="reason" maxLength={500} required={direction !== 'OPENING'} placeholder={direction === 'OPENING' ? 'Opening stock (optional)' : 'Required for stock adjustments'} /></Field></div>{error && <div className="form-error">{error}</div>}<p className="form-hint">This changes Ashvex common stock. Sales batches may go below zero and can be covered by future purchases.</p><div className="modal-actions"><button className="button button-primary" disabled={busy || !products.length}><ArrowDownLeft size={15} />{busy ? 'Recording…' : 'Record transaction'}</button></div></form>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="form-field"><span>{label}</span>{children}</label>; }
