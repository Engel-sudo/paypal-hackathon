// In-memory PayPal with the same interface as SandboxPayPal, plus demo helpers.
// It behaves like the sandbox where it matters: refunds can't exceed the captured amount,
// paid invoices turn into incoming transactions, reminders only work on sent invoices.
import { seedMockTransactions } from '../seed.js';
import { round2 } from '../util.js';

let counter = 0;
const pid = (prefix) => `${prefix}${Date.now().toString(36).toUpperCase()}${(++counter).toString().padStart(4, '0')}`;

export class MockPayPal {
  constructor({ seed = true } = {}) {
    this.kind = 'mock';
    this.reset(seed);
  }

  reset(seed = true) {
    this.transactions = seed ? seedMockTransactions() : [];
    this.refunds = [];
    this.invoices = [];
    this.calls = [];
  }

  async listTransactions({ start, end = new Date() }) {
    this.calls.push(['listTransactions']);
    const s = new Date(start), e = new Date(end);
    return this.transactions
      .filter((t) => new Date(t.date) >= s && new Date(t.date) <= e && t.status === 'COMPLETED')
      .map((t) => ({ ...t }));
  }

  async refundCapture(captureId, { amount, currency, note }) {
    this.calls.push(['refundCapture', captureId, amount]);
    const tx = this.transactions.find((t) => t.id === captureId);
    if (!tx) throw new Error(`PayPal refund failed (404): capture ${captureId} not found`);
    const already = this.refunds.filter((r) => r.captureId === captureId).reduce((s, r) => s + r.amount, 0);
    if (round2(already + amount) > tx.amount) throw new Error('PayPal refund failed (422): REFUND_AMOUNT_EXCEEDED');
    const refund = { id: pid('RF'), captureId, amount, currency, note, status: 'COMPLETED' };
    this.refunds.push(refund);
    return { id: refund.id, status: refund.status };
  }

  async createAndSendInvoice({ member, amount, currency, note, dueDate }) {
    this.calls.push(['createAndSendInvoice', member.id, amount]);
    if (!member.email) throw new Error('PayPal invoice failed (422): recipient email required');
    const inv = {
      id: `INV2-${pid('').slice(-4)}-${pid('').slice(-4)}-DEMO`,
      status: 'SENT', amount, currency, memberId: member.id, recipientEmail: member.email,
      note, dueDate, reminders: 0, url: null,
    };
    this.invoices.push(inv);
    return { ...inv };
  }

  async remindInvoice(invoiceId) {
    this.calls.push(['remindInvoice', invoiceId]);
    const inv = this.invoices.find((i) => i.id === invoiceId);
    if (!inv) throw new Error(`PayPal remind failed (404): invoice ${invoiceId} not found`);
    if (!['SENT', 'UNPAID', 'PARTIALLY_PAID'].includes(inv.status)) {
      throw new Error(`PayPal remind failed (422): invoice is ${inv.status}`);
    }
    inv.reminders++;
    return { ok: true };
  }

  async listInvoices() {
    this.calls.push(['listInvoices']);
    return this.invoices.map((i) => ({ ...i }));
  }

  async verifyWebhook() {
    return true;
  }

  // ---- demo helpers (not part of the shared interface) ----
  simulateIncoming({ payerName, payerEmail = '', amount, note, currency = 'EUR' }) {
    const tx = {
      id: pid('8MC'), date: new Date().toISOString(), payerName, payerEmail,
      amount: round2(amount), currency, note, status: 'COMPLETED',
    };
    this.transactions.push(tx);
    return tx;
  }

  simulatePayInvoice(invoiceId, payer) {
    const inv = this.invoices.find((i) => i.id === invoiceId);
    if (!inv) throw new Error(`Invoice ${invoiceId} not found`);
    if (inv.status === 'PAID') throw new Error('Invoice already paid');
    inv.status = 'PAID';
    const tx = this.simulateIncoming({
      payerName: payer?.name || inv.recipientEmail, payerEmail: inv.recipientEmail,
      amount: inv.amount, currency: inv.currency, note: `Invoice ${inv.id}`,
    });
    tx.invoiceId = inv.id;
    return tx;
  }
}
