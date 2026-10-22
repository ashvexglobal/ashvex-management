import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus, Search, Users, X } from 'lucide-react';
import { api, type CustomerLedger, type Party, type VendorLedger } from './lib/api';
import './parties.css';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const quantity = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
type PartyRole = 'CUSTOMER' | 'SUPPLIER';

function errorMessage(error: unknown) {
  if (axios.isAxiosError<{ message?: string }>(error)) return error.response?.data.message ?? 'Could not save changes.';
  return 'Could not save changes.';
}

export default function PartiesWorkspace({ onOpenInvoice, onOpenPurchase }: { onOpenInvoice: (invoiceId: string) => void; onOpenPurchase: (purchaseId: string) => void }) {
  const [role, setRole] = useState<'ALL' | PartyRole>('ALL');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Party | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<{ party: Party; role: PartyRole } | null>(null);
  const [receiptCustomer, setReceiptCustomer] = useState<Party | null>(null);
  const queryClient = useQueryClient();
  const parties = useQuery({ queryKey: ['parties', role, status, search], queryFn: () => api.parties({ role, status, search: search || undefined }) });
  const saveParty = useMutation({
    mutationFn: api.saveParty,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['parties'] });
      setShowForm(false);
      setEditing(null);
    },
  });
  const receipt = useMutation({
    mutationFn: api.createCustomerReceipt,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['parties'] });
      await queryClient.invalidateQueries({ queryKey: ['party-ledger'] });
      setReceiptCustomer(null);
    },
  });

  function beginCreate() {
    setEditing(null);
    setShowForm(true);
  }

  return <section className="panel parties-panel">
    <div className="panel-head parties-head">
      <div><span className="panel-kicker">CUSTOMERS & SUPPLIERS</span><h2>Business parties</h2></div>
      <button className="button button-primary" onClick={beginCreate}><Plus size={15} /> Add party</button>
    </div>
    <div className="parties-toolbar">
      <label className="search-field"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, company, phone or email" /></label>
      <select aria-label="Filter party roles" value={role} onChange={(event) => setRole(event.target.value as 'ALL' | PartyRole)}><option value="ALL">All roles</option><option value="CUSTOMER">Customers</option><option value="SUPPLIER">Suppliers</option></select>
      <select aria-label="Filter party status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ALL">All statuses</option></select>
    </div>
    {parties.isLoading ? <div className="empty-inline">Loading parties…</div> : parties.isError ? <div className="form-error">Could not load parties. Check the server connection and retry.</div> : parties.data?.length ? <div className="parties-table-wrap"><table className="parties-table"><thead><tr><th>PARTY</th><th>CONTACT</th><th>ROLES</th><th>ACCOUNT BALANCE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{parties.data.map((party) => <tr key={party._id}>
      <td><strong>{party.name}</strong><small>{party.companyName || '—'}</small></td>
      <td>{party.mobile || party.email || '—'}<small>{party.mobile && party.email ? party.email : party.gstin ? `GSTIN ${party.gstin}` : ''}</small></td>
      <td><div className="party-role-tags">{party.isCustomer && <span>Customer</span>}{party.isSupplier !== false && <span>Supplier</span>}</div></td>
      <td><div className="party-balances">{party.isCustomer && (party.customerDue ?? 0) > 0 && <small>Customer owes us <strong>{money.format(party.customerDue ?? 0)}</strong></small>}{party.isCustomer && (party.customerCredit ?? 0) > 0 && <small>Customer credit <strong>{money.format(party.customerCredit ?? 0)}</strong></small>}{party.isSupplier !== false && (party.supplierPayable ?? 0) > 0 && <small>We owe supplier <strong>{money.format(party.supplierPayable ?? 0)}</strong></small>}{party.isSupplier !== false && (party.supplierCredit ?? 0) > 0 && <small>Supplier advance / credit <strong>{money.format(party.supplierCredit ?? 0)}</strong></small>}{(party.isCustomer ? (party.customerDue ?? 0) === 0 && (party.customerCredit ?? 0) === 0 : true) && (party.isSupplier === false || ((party.supplierPayable ?? 0) === 0 && (party.supplierCredit ?? 0) === 0)) && <small>No current balance</small>}</div></td>
      <td><span className={`status-pill status-${party.status === 'ACTIVE' ? 'healthy' : 'low'}`}>{party.status}</span></td>
      <td><div className="party-actions">{party.isCustomer && <button className="text-button" onClick={() => setSelected({ party, role: 'CUSTOMER' })}>Customer ledger</button>}{party.isSupplier !== false && <button className="text-button" onClick={() => setSelected({ party, role: 'SUPPLIER' })}>Supplier ledger</button>}<button className="party-edit" aria-label={`Edit ${party.name}`} onClick={() => { setEditing(party); setShowForm(true); }}><Pencil size={14} /></button></div></td>
    </tr>)}</tbody></table></div> : <div className="parties-empty"><Users size={22} /><strong>No parties found</strong><span>Try changing the filters or add a customer or supplier.</span></div>}

    {showForm && <PartyForm party={editing} busy={saveParty.isPending} error={saveParty.error ? errorMessage(saveParty.error) : ''} onClose={() => { setShowForm(false); setEditing(null); }} onSubmit={(data) => saveParty.mutate({ ...data, _id: editing?._id })} />}
    {selected && <PartyLedger party={selected.party} role={selected.role} onClose={() => setSelected(null)} onReceipt={() => setReceiptCustomer(selected.party)} onOpenInvoice={onOpenInvoice} onOpenPurchase={onOpenPurchase} />}
    {receiptCustomer && <ReceiptForm party={receiptCustomer} busy={receipt.isPending} error={receipt.error ? errorMessage(receipt.error) : ''} onClose={() => { receipt.reset(); setReceiptCustomer(null); }} onSubmit={(data) => receipt.mutate(data)} />}
  </section>;
}

function PartyForm({ party, busy, error, onClose, onSubmit }: { party: Party | null; busy: boolean; error: string; onClose: () => void; onSubmit: (data: Omit<Party, '_id' | 'customerDue' | 'customerCredit' | 'supplierPayable' | 'supplierCredit'>) => void }) {
  const [customerRole, setCustomerRole] = useState(party?.isCustomer ?? true);
  const [supplierRole, setSupplierRole] = useState(party ? party.isSupplier !== false : false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      name: String(form.get('name')).trim(),
      companyName: String(form.get('companyName')).trim() || undefined,
      mobile: String(form.get('mobile')).trim() || undefined,
      email: String(form.get('email')).trim() || undefined,
      address: String(form.get('address')).trim() || undefined,
      gstin: String(form.get('gstin')).trim() || undefined,
      notes: String(form.get('notes')).trim() || undefined,
      isCustomer: customerRole,
      isSupplier: supplierRole,
      status: String(form.get('status')) as Party['status'],
    });
  }
  return <div className="party-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="party-modal" role="dialog" aria-modal="true" aria-label={party ? 'Edit party' : 'Add party'}>
    <div className="modal-head"><div><span className="panel-kicker">PARTY PROFILE</span><h2>{party ? 'Edit party' : 'Add party'}</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
    <form className="form-stack" onSubmit={submit}><div className="form-grid">
      <label className="form-field"><span>Name *</span><input name="name" required maxLength={120} defaultValue={party?.name ?? ''} /></label>
      <label className="form-field"><span>Company name</span><input name="companyName" maxLength={120} defaultValue={party?.companyName ?? ''} /></label>
      <label className="form-field"><span>Mobile</span><input name="mobile" maxLength={30} defaultValue={party?.mobile ?? ''} /></label>
      <label className="form-field"><span>Email</span><input name="email" type="email" defaultValue={party?.email ?? ''} /></label>
      <label className="form-field"><span>GSTIN</span><input name="gstin" maxLength={30} defaultValue={party?.gstin ?? ''} /></label>
      <label className="form-field"><span>Status</span><select name="status" defaultValue={party?.status ?? 'ACTIVE'}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
      <label className="form-field party-field-wide"><span>Address</span><textarea name="address" maxLength={500} defaultValue={party?.address ?? ''} /></label>
      <label className="form-field party-field-wide"><span>Notes</span><textarea name="notes" maxLength={1000} defaultValue={party?.notes ?? ''} /></label>
    </div><div className="party-role-options"><label><input type="checkbox" checked={customerRole} onChange={(event) => setCustomerRole(event.target.checked)} /> Customer</label><label><input type="checkbox" checked={supplierRole} onChange={(event) => setSupplierRole(event.target.checked)} /> Supplier</label></div>
      {error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || (!customerRole && !supplierRole)}>{busy ? 'Saving…' : party ? 'Save changes' : 'Create party'}</button></div>
    </form>
  </section></div>;
}

function ReceiptForm({ party, busy, error, onClose, onSubmit }: { party: Party; busy: boolean; error: string; onClose: () => void; onSubmit: (data: Parameters<typeof api.createCustomerReceipt>[0]) => void }) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      customerId: party._id,
      receiptDate: new Date(`${String(form.get('date'))}T12:00:00`).toISOString(),
      amount: Number(form.get('amount')),
      paymentMethod: String(form.get('method')) || undefined,
      referenceNumber: String(form.get('reference')).trim() || undefined,
      remark: String(form.get('remark')).trim() || undefined,
      idempotencyKey,
    });
  }
  return <div className="party-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="party-modal party-receipt-modal" role="dialog" aria-modal="true" aria-label="Record customer receipt">
    <div className="modal-head"><div><span className="panel-kicker">CUSTOMER PAYMENT</span><h2>Record receipt · {party.name}</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
    <form className="form-stack" onSubmit={submit}><div className="form-grid">
      <label className="form-field"><span>Receipt date</span><input name="date" type="date" required defaultValue={localDate()} /></label>
      <label className="form-field"><span>Amount (₹)</span><input name="amount" type="number" min="0.01" step="0.01" required /></label>
      <label className="form-field"><span>Payment method</span><select name="method" defaultValue=""><option value="">Not specified</option><option value="CASH">Cash</option><option value="BANK">Bank</option><option value="UPI">UPI</option><option value="OTHER">Other</option></select></label>
      <label className="form-field"><span>Reference</span><input name="reference" maxLength={100} /></label>
      <label className="form-field party-field-wide"><span>Note (optional)</span><textarea name="remark" maxLength={500} /></label>
    </div>{error && <div className="form-error">{error}</div>}<p className="form-hint">Receipts reduce the customer’s overall account balance and are not allocated to individual invoices.</p><div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Record receipt'}</button></div></form>
  </section></div>;
}

function PartyLedger({ party, role, onClose, onReceipt, onOpenInvoice, onOpenPurchase }: { party: Party; role: PartyRole; onClose: () => void; onReceipt: () => void; onOpenInvoice: (id: string) => void; onOpenPurchase: (id: string) => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const ledger = useQuery({
    queryKey: ['party-ledger', party._id, role, from, to, page],
    queryFn: () => api.partyLedger(party._id, role, { from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined, page }),
  });
  const customer = role === 'CUSTOMER' ? ledger.data as CustomerLedger | undefined : undefined;
  const supplier = role === 'SUPPLIER' ? ledger.data as VendorLedger | undefined : undefined;
  const events = ledger.data?.events ?? [];
  const pageCount = ledger.data?.pageCount ?? 1;
  const due = customer?.amountDue ?? 0;
  const credit = customer?.customerCredit ?? 0;
  return <div className="party-modal-backdrop party-ledger-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="party-modal party-ledger-modal" role="dialog" aria-modal="true" aria-label={`${party.name} ${role.toLowerCase()} ledger`}>
    <div className="modal-head"><div><span className="panel-kicker">{role === 'CUSTOMER' ? 'CUSTOMER RECEIVABLES' : 'SUPPLIER PAYABLES'}</span><h2>{party.name} · Ledger</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
    <div className="party-ledger-toolbar"><label className="form-field"><span>From</span><input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label><label className="form-field"><span>To</span><input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>{role === 'CUSTOMER' && <button className="button button-primary" onClick={onReceipt}><ArrowDownLeft size={15} /> Record receipt</button>}</div>
    {ledger.isLoading ? <div className="empty-inline">Loading ledger…</div> : ledger.isError ? <div className="form-error">Could not load this party ledger. Check the date range and try again.</div> : <>
      {customer ? <div className="ledger-summary-grid">
        <div><small>BILLED IN PERIOD</small><strong>{money.format(customer.totalBilled)}</strong></div>
        <div><small>RECEIVED IN PERIOD</small><strong>{money.format(customer.totalReceived)}</strong></div>
        <div><small>CUSTOMER OWES US</small><strong>{money.format(due)}</strong></div>
        <div><small>CUSTOMER CREDIT / ADVANCE</small><strong>{money.format(credit)}</strong></div>
      </div> : supplier && <div className="ledger-summary-grid">
        <div><small>PURCHASES IN PERIOD</small><strong>{money.format(supplier.totalPurchases)}</strong></div>
        <div><small>PAYMENTS IN PERIOD</small><strong>{money.format(supplier.totalPaid)}</strong></div>
        <div><small>WE OWE SUPPLIER</small><strong>{money.format(Math.max(supplier.outstanding, 0))}</strong></div>
        <div><small>SUPPLIER ADVANCE / CREDIT</small><strong>{money.format(Math.max(-supplier.outstanding, 0))}</strong></div>
      </div>}
      <p className="ledger-explanation">{money.format(customer?.openingBalance ?? supplier?.openingBalance ?? 0)} opening balance before the selected period. Receipts/payments are account-level and shown chronologically.</p>
      {customer && <div className="party-product-totals"><section><strong>Products in selected period</strong>{customer.products.length ? customer.products.map((item) => <span key={`${item.sku ?? item.productName}-${item.unit}`}>{item.productName} · {item.sku ? `${item.sku} · ` : ''}{quantity.format(item.quantity)} {item.unit}</span>) : <small>No finalized customer invoices in this period.</small>}</section><section><strong>All-time product quantities</strong>{customer.allTimeProducts.length ? customer.allTimeProducts.map((item) => <span key={`${item.sku ?? item.productName}-${item.unit}`}>{item.productName} · {item.sku ? `${item.sku} · ` : ''}{quantity.format(item.quantity)} {item.unit}</span>) : <small>No finalized linked sales.</small>}</section></div>}
      {events.length ? <div className="party-ledger-events">{events.map((event) => {
        const isReceipt = event.eventType === 'RECEIPT' || event.eventType === 'PAYMENT';
        const isCustomerInvoice = event.eventType === 'SALES_INVOICE';
        const isDirectBatch = event.eventType === 'DIRECT_SALE_BATCH';
        const sourceId = 'sourceId' in event ? event.sourceId : event._id;
        return <article className="vendor-ledger-event" key={event._id}>
          <div className={`ledger-event-mark ${isReceipt ? 'ledger-payment' : 'ledger-purchase'}`}>{isReceipt ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}</div>
          <div className="ledger-event-content">
            <div className="ledger-event-heading"><span><strong>{isCustomerInvoice ? 'Sales invoice' : isDirectBatch ? 'Direct / offline sales batch · not billed' : isReceipt ? role === 'CUSTOMER' ? 'Receipt' : 'Payment' : event.eventType === 'PURCHASE' ? 'Purchase' : 'Stock-in invoice'}</strong><small>{new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(event.date))}{event.documentNumber ? ` · ${event.documentNumber}` : ''}</small></span><strong className={isReceipt ? 'ledger-amount-paid' : 'ledger-amount-billed'}>{isDirectBatch ? 'Quantity only' : isReceipt ? '−' : '+'}{!isDirectBatch && money.format(Math.abs(event.amount))}</strong></div>
            {(isReceipt || isCustomerInvoice) && <small className="ledger-event-meta">{('paymentMethod' in event ? event.paymentMethod : undefined) || 'Payment method not recorded'}{'referenceNumber' in event && event.referenceNumber ? ` · Ref ${event.referenceNumber}` : ''}{event.remark ? ` · ${event.remark}` : ''}</small>}
            {event.items?.length ? <div className="ledger-line-items">{event.items.map((item, index) => <span key={`${item.sku ?? item.productName}-${index}`}>{item.productName ?? item.sku} · {quantity.format(item.quantity ?? 0)} {item.unit ?? ''}{isDirectBatch ? ' sold' : ` × ${money.format(item.rate ?? 0)} = ${money.format(item.amount ?? 0)}`}</span>)}</div> : null}
            <div className="ledger-running-balance">{role === 'CUSTOMER' ? event.runningBalance > 0 ? 'Customer owes us after entry' : event.runningBalance < 0 ? 'Customer credit after entry' : 'Customer balance after entry' : 'We owe supplier after entry'} <strong>{money.format(event.runningBalance)}</strong></div>
            {(isCustomerInvoice || event.eventType === 'STOCK_IN_INVOICE') && <button className="text-button party-source-link" onClick={() => onOpenInvoice(sourceId)}>Open source invoice</button>}
            {event.eventType === 'PURCHASE' && <button className="text-button party-source-link" onClick={() => onOpenPurchase(event._id)}>Open source purchase</button>}
          </div>
        </article>;
      })}</div> : <div className="empty-inline">No ledger events recorded for this period.</div>}
      {pageCount > 1 && <div className="ledger-pagination"><span>Page {page} of {pageCount} · {ledger.data?.totalEvents ?? 0} entries</span><div><button className="button button-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className="button button-outline" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button></div></div>}
    </>}
  </section></div>;
}

function localDate() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
