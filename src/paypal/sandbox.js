// Real PayPal REST client (sandbox by default). Only uses fetch, no SDK.
//
// Interface shared with MockPayPal:
//   listTransactions({ start, end })      -> Payment[]   (incoming, completed)
//   refundCapture(captureId, { amount, currency, note }) -> { id, status }
//   createAndSendInvoice({ member, amount, currency, note, clubName, dueDate }) -> Invoice
//   remindInvoice(invoiceId, { subject, note }) -> { ok: true }
//   listInvoices() -> Invoice[]
//   verifyWebhook(headers, body) -> boolean

const DAY = 86_400_000;

export class SandboxPayPal {
  constructor({ clientId, clientSecret, baseUrl = 'https://api-m.sandbox.paypal.com', webhookId, fetchImpl = fetch } = {}) {
    this.kind = 'sandbox';
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl = baseUrl;
    this.webhookId = webhookId;
    this.fetch = fetchImpl;
    this.token = null;
    this.tokenExpires = 0;
  }

  async accessToken() {
    if (this.token && Date.now() < this.tokenExpires - 60_000) return this.token;
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await this.fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`PayPal auth failed (${res.status}): ${await res.text()}`);
    const json = await res.json();
    this.token = json.access_token;
    this.tokenExpires = Date.now() + json.expires_in * 1000;
    return this.token;
  }

  async request(method, path, body, extraHeaders = {}) {
    const token = await this.accessToken();
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? safeJson(text) : {};
    if (!res.ok) {
      const msg = json?.message || json?.error_description || text || res.statusText;
      const detail = json?.details?.map((d) => d.description || d.issue).join('; ');
      throw new Error(`PayPal ${method} ${path.split('?')[0]} failed (${res.status}): ${msg}${detail ? ` — ${detail}` : ''}`);
    }
    return json;
  }

  // Transaction Search allows at most 31 days per request, so walk the range in windows.
  async listTransactions({ start, end = new Date() }) {
    const out = [];
    let from = new Date(start);
    const until = new Date(end);
    while (from < until) {
      const to = new Date(Math.min(from.getTime() + 30 * DAY, until.getTime()));
      let page = 1, totalPages = 1;
      do {
        const q = new URLSearchParams({
          start_date: from.toISOString().replace(/\.\d{3}Z$/, 'Z'),
          end_date: to.toISOString().replace(/\.\d{3}Z$/, 'Z'),
          fields: 'transaction_info,payer_info',
          page_size: '500',
          page: String(page),
        });
        const json = await this.request('GET', `/v1/reporting/transactions?${q}`);
        totalPages = json.total_pages || 1;
        for (const d of json.transaction_details || []) {
          const p = fromTransaction(d);
          if (p) out.push(p);
        }
        page++;
      } while (page <= totalPages);
      from = to;
    }
    return out;
  }

  async refundCapture(captureId, { amount, currency, note }) {
    const json = await this.request('POST', `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
      amount: { value: amount.toFixed(2), currency_code: currency },
      note_to_payer: note?.slice(0, 255),
    }, { 'PayPal-Request-Id': `refund-${captureId}-${amount}`, Prefer: 'return=representation' });
    return { id: json.id, status: json.status };
  }

  async createAndSendInvoice({ member, amount, currency, note, clubName, period, dueDate }) {
    const [given, ...rest] = member.name.split(' ');
    const draft = await this.request('POST', '/v2/invoicing/invoices', {
      detail: {
        currency_code: currency,
        note: note?.slice(0, 4000),
        memo: `member:${member.id}`,
        payment_term: dueDate ? { due_date: dueDate } : undefined,
      },
      invoicer: { business_name: clubName?.slice(0, 300) },
      primary_recipients: [{
        billing_info: { name: { given_name: given, surname: rest.join(' ') || given }, email_address: member.email },
      }],
      items: [{
        name: `Membership dues ${period || ''}`.trim().slice(0, 200),
        quantity: '1',
        unit_amount: { currency_code: currency, value: amount.toFixed(2) },
        unit_of_measure: 'AMOUNT',
      }],
      configuration: { allow_tip: false, partial_payment: { allow_partial_payment: false } },
    }, { Prefer: 'return=representation' });
    const id = draft.id || draft.href?.split('/').pop();
    const sent = await this.request('POST', `/v2/invoicing/invoices/${id}/send`, { send_to_invoicer: false, send_to_recipient: true });
    const url = sent?.href || draft.detail?.metadata?.recipient_view_url || null;
    return { id, status: 'SENT', amount, currency, memberId: member.id, url, reminders: 0 };
  }

  async remindInvoice(invoiceId, { subject, note }) {
    await this.request('POST', `/v2/invoicing/invoices/${invoiceId}/remind`, {
      subject: subject?.slice(0, 4000), note: note?.slice(0, 4000), send_to_invoicer: false,
    });
    return { ok: true };
  }

  async listInvoices() {
    const out = [];
    let page = 1, totalPages = 1;
    do {
      const json = await this.request('GET', `/v2/invoicing/invoices?page=${page}&page_size=100&total_required=true`);
      totalPages = json.total_pages || 1;
      for (const inv of json.items || []) out.push(fromInvoice(inv));
      page++;
    } while (page <= totalPages && page <= 20);
    return out;
  }

  // Asks PayPal to verify the webhook signature. Without PAYPAL_WEBHOOK_ID we refuse.
  async verifyWebhook(headers, body) {
    if (!this.webhookId) return false;
    const json = await this.request('POST', '/v1/notifications/verify-webhook-signature', {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: this.webhookId,
      webhook_event: body,
    });
    return json.verification_status === 'SUCCESS';
  }
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return { message: text }; }
}

// Map a Transaction Search entry to our Payment shape. Only incoming completed money.
export function fromTransaction(d) {
  const t = d.transaction_info || {};
  const amount = Number(t.transaction_amount?.value);
  if (!(amount > 0)) return null;
  if (t.transaction_status && t.transaction_status !== 'S') return null;
  const p = d.payer_info || {};
  const pn = p.payer_name || {};
  const payerName = pn.alternate_full_name || [pn.given_name, pn.surname].filter(Boolean).join(' ') || p.email_address || 'Unknown payer';
  return {
    id: t.transaction_id,
    date: t.transaction_initiation_date,
    payerName,
    payerEmail: p.email_address || '',
    amount,
    currency: t.transaction_amount?.currency_code || 'USD',
    note: [t.transaction_note, t.transaction_subject, t.custom_field].filter(Boolean).join(' | '),
    status: 'COMPLETED',
    invoiceId: t.invoice_id || null,
  };
}

export function fromInvoice(inv) {
  const memo = inv.detail?.memo || '';
  const memberId = memo.startsWith('member:') ? memo.slice(7) : null;
  return {
    id: inv.id,
    status: inv.status,
    amount: Number(inv.amount?.value ?? 0),
    currency: inv.amount?.currency_code || 'USD',
    memberId,
    recipientEmail: inv.primary_recipients?.[0]?.billing_info?.email_address || '',
    url: inv.links?.find((l) => l.rel === 'payer-view')?.href || null,
  };
}

