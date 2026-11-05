/* Club Treasurer Assistant — single page app. Plain JS, AG Grid Community 32.3.3 (global agGrid). */
(() => {
  'use strict';

  // ---------- small helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  const ICON = {
    spark: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor;stroke:none"><path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z"/></svg>',
    check: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    x: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    alert: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5m0 3.5v.01M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
    eye: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    refund: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    bell: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
    link: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    trash: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" style="width:16px;height:16px"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    paypal: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/></svg>',
    user: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    info: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.01"/></svg>',
  };

  // ---------- state ----------
  let state = null;
  const ui = {
    tab: 'members',
    memberFilter: 'all',
    paymentFilter: 'all',
    openPaymentId: null,
    assignDraft: null,        // { paymentId, rows: [{ memberId, amount }] }
    drafts: {},               // proposalId -> edited message
    seenProposals: null,      // Set of proposal ids rendered before (for entry animation)
    busy: false,
  };

  // ---------- formatting ----------
  const currency = () => (state && state.settings && state.settings.currency) || 'EUR';
  const moneyFmt = {};
  function money(v, cur = currency()) {
    if (v === null || v === undefined || v === '') return '–';
    if (!moneyFmt[cur]) {
      try { moneyFmt[cur] = new Intl.NumberFormat('en-IE', { style: 'currency', currency: cur, minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
      catch { moneyFmt[cur] = { format: (n) => `${n} ${cur}` }; }
    }
    return moneyFmt[cur].format(num(v));
  }
  function date(iso, withYear = false) {
    if (!iso) return '–';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return esc(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  }
  function dateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  const pct = (c) => Math.round(Math.max(0, Math.min(1, num(c))) * 100);
  function confHtml(c, label = '') {
    if (c === null || c === undefined) return '<span class="zero">–</span>';
    const p = pct(c);
    const lvl = p >= 85 ? 'hi' : p >= 60 ? 'mid' : 'low';
    return `<span class="conf ${lvl}" title="AI confidence ${p}%"><span class="conf-bar"><span style="width:${p}%"></span></span><b>${p}%${label ? ' ' + esc(label) : ''}</b></span>`;
  }
  const STATUS_LABEL = {
    paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid', overpaid: 'Overpaid',
    matched: 'Matched', needs_review: 'Needs review', unmatched: 'Unmatched', refunded: 'Refunded', ignored: 'Ignored',
    pending: 'Pending', done: 'Done', rejected: 'Rejected', failed: 'Failed',
  };
  function pill(status, label) {
    const s = String(status ?? '');
    const text = label || STATUS_LABEL[s] || s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    return `<span class="pill pill-${esc(s)}">${esc(text)}</span>`;
  }
  const memberById = (id) => (state && state.members || []).find((m) => m.id === id);
  const paymentById = (id) => (state && state.payments || []).find((p) => p.id === id);

  // ---------- admin token ----------
  const TOKEN_KEY = 'treasurer.adminToken';
  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ui.tokenMem || ''; } }
  function setToken(t) { ui.tokenMem = t; try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ } }

  // ---------- API ----------
  async function api(method, path, body, retried = false) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers['x-admin-token'] = token;
    let res;
    try {
      res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new Error('Cannot reach the server. Is it running?');
    }
    if (res.status === 401) {
      if (!retried) {
        const t = window.prompt(token ? 'That admin token was not accepted. Enter the admin token:' : 'This action needs the admin token (ADMIN_TOKEN):');
        if (t && t.trim()) { setToken(t.trim()); return api(method, path, body, true); }
      } else {
        setToken('');
      }
      throw new Error('Admin token required');
    }
    let data = null;
    const text = await res.text();
    if (text) { try { data = JSON.parse(text); } catch { data = null; } }
    if (!res.ok) throw new Error((data && data.error) || `${res.status} ${res.statusText}`);
    return data;
  }
  // Writes return the full State; fall back to a refresh when they don't.
  async function write(method, path, body) {
    const data = await api(method, path, body);
    if (data && Array.isArray(data.members) && data.summary) setState(data);
    else await refresh();
    return state;
  }
  async function refresh() {
    try {
      const data = await api('GET', '/api/state');
      setState(data);
    } catch (e) {
      toast(e.message, 'err');
    }
    return state;
  }

  // ---------- toasts ----------
  function toast(message, kind = 'ok', ms) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    el.innerHTML = `${kind === 'err' ? ICON.alert : kind === 'info' ? ICON.info : ICON.check}<div>${esc(message)}</div>`;
    box.appendChild(el);
    while (box.children.length > 4) box.firstElementChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms || (kind === 'err' ? 6500 : 4200));
  }

  // ---------- grids ----------
  let membersApi = null;
  let paymentsApi = null;
  const darkMql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyGridTheme() {
    const dark = !!(darkMql && darkMql.matches);
    for (const el of [$('#members-grid'), $('#payments-grid')]) {
      el.classList.toggle('ag-theme-quartz-dark', dark);
      el.classList.toggle('ag-theme-quartz', !dark);
    }
  }

  function invoiceCell(p) {
    const m = p.data; if (!m) return '';
    const inv = m.invoice;
    if (!inv) return '<span class="zero">–</span>';
    const rem = num(inv.reminders);
    const pay = inv.status === 'SENT' && state.mode && state.mode.paypal === 'mock'
      ? `<button type="button" class="mini-btn pay-invoice" data-invoice-id="${esc(inv.id)}" aria-label="Simulate ${esc(m.name)} pays invoice">Simulate member pays</button>` : '';
    const link = inv.url ? ` title="${esc(inv.id)}"` : '';
    return `<div class="inv"><span${link}>${pill(inv.status)}</span>${rem ? `<small>${rem} reminder${rem === 1 ? '' : 's'}</small>` : ''}${pay}</div>`;
  }

  function buildMembersGrid() {
    const columnDefs = [
      { headerName: 'Name', field: 'name', minWidth: 150, flex: 1.2, cellClass: 'name-cell' },
      { headerName: 'Email', field: 'email', editable: true, minWidth: 180, flex: 1.3 },
      {
        headerName: 'Nicknames', colId: 'nicknames', editable: true, minWidth: 100, flex: 0.7,
        valueGetter: (p) => (p.data && Array.isArray(p.data.nicknames) ? p.data.nicknames.join(', ') : ''),
        valueSetter: (p) => {
          const next = String(p.newValue ?? '').split(',').map((s) => s.trim()).filter(Boolean);
          if (next.join(', ') === (p.data.nicknames || []).join(', ')) return false;
          p.data.nicknames = next; return true;
        },
        cellRenderer: (p) => (p.value ? esc(p.value) : '<span class="zero">–</span>'),
      },
      {
        headerName: 'Dues', field: 'dues', editable: true, width: 84, type: 'rightAligned', cellClass: 'num',
        cellEditor: 'agNumberCellEditor', cellEditorParams: { min: 0, precision: 2 },
        valueParser: (p) => (p.newValue === '' || p.newValue === null ? p.oldValue : Number(p.newValue)),
        valueFormatter: (p) => money(p.value),
      },
      { headerName: 'Paid', field: 'paid', width: 84, type: 'rightAligned', cellClass: 'num', valueFormatter: (p) => money(p.value) },
      {
        headerName: 'Outstanding', field: 'outstanding', width: 116, type: 'rightAligned', cellClass: 'num',
        cellRenderer: (p) => {
          const m = p.data || {};
          if (num(m.credit) > 0) return `<span class="credit" title="Paid beyond dues">+${esc(money(m.credit))} credit</span>`;
          return num(p.value) > 0 ? `<span class="owed">${esc(money(p.value))}</span>` : `<span class="zero">${esc(money(0))}</span>`;
        },
      },
      { headerName: 'Status', field: 'status', width: 108, cellRenderer: (p) => pill(p.value), getQuickFilterText: (p) => STATUS_LABEL[p.value] || p.value },
      { headerName: 'Last payment', field: 'lastPaymentAt', width: 120, valueFormatter: (p) => (p.value ? date(p.value) : '–'), comparator: (a, b) => String(a || '').localeCompare(String(b || '')) },
      {
        headerName: 'Invoice', colId: 'invoice', minWidth: 232, flex: 1.1,
        valueGetter: (p) => (p.data && p.data.invoice ? `${p.data.invoice.status} ${p.data.invoice.reminders || 0}` : ''),
        cellRenderer: invoiceCell, sortable: false,
      },
      {
        headerName: '', colId: 'actions', width: 56, sortable: false, resizable: false, suppressMovable: true,
        cellRenderer: (p) => (p.data ? `<div class="cell-actions"><button type="button" class="mini-btn del-btn delete-member" data-member-id="${esc(p.data.id)}" aria-label="Delete ${esc(p.data.name)}" title="Delete member">${ICON.trash}</button></div>` : ''),
      },
    ];
    membersApi = agGrid.createGrid($('#members-grid'), {
      columnDefs,
      rowData: [],
      getRowId: (p) => p.data.id,
      defaultColDef: { sortable: true, resizable: true, suppressHeaderMenuButton: true },
      singleClickEdit: false,
      stopEditingWhenCellsLoseFocus: true,
      animateRows: true,
      suppressCellFocus: false,
      isExternalFilterPresent: () => ui.memberFilter !== 'all',
      doesExternalFilterPass: (node) => node.data && node.data.status === ui.memberFilter,
      onCellValueChanged: onMemberEdited,
      overlayNoRowsTemplate: '<span class="muted">No members yet. Add one to get started.</span>',
    });
  }

  async function onMemberEdited(e) {
    const m = e.data;
    const col = e.colDef.colId || e.colDef.field;
    let patch;
    if (col === 'nicknames') patch = { nicknames: m.nicknames };
    else if (col === 'dues') {
      const v = Number(e.newValue);
      if (!Number.isFinite(v) || v < 0) { toast('Dues must be a number of 0 or more', 'err'); renderGrids(); return; }
      patch = { dues: v };
    } else if (col === 'email') patch = { email: String(e.newValue || '').trim() };
    else return;
    try {
      await write('PUT', `/api/members/${encodeURIComponent(m.id)}`, patch);
      toast(`Saved ${m.name}`);
    } catch (err) {
      toast(`Could not save ${m.name}: ${err.message}`, 'err');
      renderGrids();
    }
  }

  function allocationNames(p) {
    const list = (p.allocations && p.allocations.length ? p.allocations : null);
    if (list) return list.map((a) => a.memberName || (memberById(a.memberId) || {}).name || a.memberId);
    return [];
  }

  function buildPaymentsGrid() {
    const columnDefs = [
      { headerName: 'Date', field: 'date', width: 96, sort: 'desc', valueFormatter: (p) => date(p.value), comparator: (a, b) => String(a || '').localeCompare(String(b || '')) },
      {
        headerName: 'Payer', field: 'payerName', minWidth: 170, flex: 1,
        cellRenderer: (p) => {
          const d = p.data || {};
          return `<div class="cell-stack"><span class="name-cell">${esc(d.payerName || 'Unknown payer')}</span>${d.payerEmail ? `<small>${esc(d.payerEmail)}</small>` : ''}</div>`;
        },
        getQuickFilterText: (p) => `${p.data.payerName || ''} ${p.data.payerEmail || ''}`,
      },
      {
        headerName: 'Amount', field: 'amount', width: 108, type: 'rightAligned', cellClass: 'num',
        cellRenderer: (p) => {
          const d = p.data || {};
          const r = num(d.refunded);
          return r > 0
            ? `<div class="cell-stack" style="align-items:flex-end"><span>${esc(money(d.amount, d.currency))}</span><small>−${esc(money(r, d.currency))} refunded</small></div>`
            : esc(money(d.amount, d.currency));
        },
      },
      {
        headerName: 'Note', field: 'note', minWidth: 200, flex: 1.4, tooltipField: 'note',
        cellRenderer: (p) => (p.value ? `<span class="note">${esc(p.value)}</span>` : '<span class="zero">no note</span>'),
      },
      {
        headerName: 'AI intent', colId: 'intent', width: 116,
        valueGetter: (p) => (p.data && p.data.intent ? p.data.intent.label : ''),
        cellRenderer: (p) => {
          const it = p.data && p.data.intent;
          if (!it || !it.label) return '<span class="zero">–</span>';
          return `<span class="intent" title="Intent score ${pct(it.score)}%">${esc(it.label)}</span>`;
        },
      },
      {
        headerName: 'Matched to', colId: 'members', minWidth: 190, flex: 1.2,
        valueGetter: (p) => {
          const d = p.data; if (!d) return '';
          const names = allocationNames(d);
          if (names.length) return names.join(', ');
          if (d.match && d.match.allocations && d.match.allocations.length) return 'guess ' + d.match.allocations.map((a) => a.memberName).join(', ');
          return '';
        },
        cellRenderer: (p) => {
          const d = p.data || {};
          const al = d.allocations || [];
          if (al.length) {
            if (al.length === 1) return esc(al[0].memberName || al[0].memberId);
            return `<div class="cell-stack"><span>${al.map((a) => esc(a.memberName || a.memberId)).join(' + ')}</span><small>${al.map((a) => esc(money(a.amount, d.currency))).join(' + ')}</small></div>`;
          }
          if (d.status === 'refunded') return '<span class="zero">refunded</span>';
          if (d.status === 'ignored') return '<span class="zero">ignored</span>';
          const g = d.match && d.match.allocations;
          if (g && g.length) return `<span class="guess">AI guess: ${g.map((a) => esc(a.memberName || a.memberId)).join(' + ')}?</span>`;
          return '<span class="zero">no member</span>';
        },
      },
      {
        headerName: 'Confidence', colId: 'confidence', width: 132,
        valueGetter: (p) => (p.data && p.data.match ? num(p.data.match.confidence) : null),
        cellRenderer: (p) => confHtml(p.value),
        getQuickFilterText: () => '',
      },
      { headerName: 'Status', field: 'status', width: 150, cellRenderer: (p) => pill(p.value), getQuickFilterText: (p) => STATUS_LABEL[p.value] || p.value },
    ];
    paymentsApi = agGrid.createGrid($('#payments-grid'), {
      columnDefs,
      rowData: [],
      getRowId: (p) => p.data.id,
      defaultColDef: { sortable: true, resizable: true, suppressHeaderMenuButton: true },
      animateRows: true,
      tooltipShowDelay: 400,
      isExternalFilterPresent: () => ui.paymentFilter !== 'all',
      doesExternalFilterPass: (node) => {
        const s = node.data && node.data.status;
        if (ui.paymentFilter === 'attention') return s === 'needs_review' || s === 'unmatched';
        return s === ui.paymentFilter;
      },
      onRowClicked: (e) => { if (e.data) openPayment(e.data.id); },
      onCellKeyDown: (e) => { if (e.event && e.event.key === 'Enter' && e.data) openPayment(e.data.id); },
      overlayNoRowsTemplate: '<span class="muted">No payments yet. Run the treasurer agent to sync from PayPal.</span>',
    });
  }

  function renderGrids() {
    if (!membersApi || !state) return;
    membersApi.setGridOption('rowData', state.members.map((m) => ({ ...m, nicknames: [...(m.nicknames || [])] })));
    paymentsApi.setGridOption('rowData', state.payments.map((p) => ({ ...p })));
  }

  // ---------- header / KPIs ----------
  function renderHeader() {
    const s = state.settings || {};
    const sum = state.summary || {};
    const mode = state.mode || {};
    $('#club-name').textContent = s.clubName || 'Your club';
    document.title = `${s.clubName ? s.clubName + ' · ' : ''}Club Treasurer Assistant`;
    $('#club-period').textContent = [s.period, s.dueDate ? `dues by ${date(s.dueDate, true)}` : null].filter(Boolean).join(' · ');

    const sandbox = mode.paypal === 'sandbox';
    const localAi = mode.ai === 'local-model';
    $('#mode-badges').innerHTML = [
      `<span class="badge ${sandbox ? 'is-live' : 'is-mock'}" title="${sandbox ? 'Connected to the PayPal sandbox' : 'In-memory PayPal for the demo'}"><span class="led"></span>PayPal <b>${sandbox ? 'Sandbox' : 'Mock'}</b></span>`,
      `<span class="badge is-ai" title="${esc(mode.aiModel || '')}"><span class="led"></span>AI <b>${localAi ? 'Local model' : 'Hashed n-grams'}</b></span>`,
      mode.adminRequired ? '<span class="badge is-lock" title="Write actions need the admin token"><span class="led"></span><b>Admin token</b></span>' : '',
    ].join('');
    document.body.classList.toggle('hidden-demo', sandbox);
    $('#footer-ai').textContent = localAi
      ? `AI runs on the club's own server (${mode.aiModel || 'local sentence-embedding model'}). No payment data goes to an AI provider.`
      : 'AI runs on the club’s own server (hashed n-gram embeddings, offline). No payment data goes to an AI provider.';

    const expected = num(sum.expected), collected = num(sum.collected);
    const p = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0;
    $('#kpi-collected').textContent = money(collected);
    $('#kpi-expected').textContent = money(expected);
    const bar = $('#kpi-progress');
    bar.firstElementChild.style.width = `${p}%`;
    bar.setAttribute('aria-valuenow', String(p));
    $('#kpi-progress-text').textContent = `${p}% collected · ${money(Math.max(0, expected - collected))} still open`;
    $('#kpi-paid').textContent = num(sum.paid) + num(sum.overpaid);
    $('#kpi-partial').textContent = num(sum.partial);
    $('#kpi-unpaid').textContent = num(sum.unpaid);
    const total = Math.max(1, num(sum.paid) + num(sum.overpaid) + num(sum.partial) + num(sum.unpaid));
    $('#kpi-stack').innerHTML = [['var(--ok)', num(sum.paid) + num(sum.overpaid)], ['var(--warn)', num(sum.partial)], ['var(--bad)', num(sum.unpaid)]]
      .map(([c, n]) => `<span style="background:${c};flex-grow:${n / total}"></span>`).join('');
    $('#kpi-proposals').textContent = num(sum.openProposals);
    $('#kpi-unmatched').textContent = num(sum.unmatchedPayments);
    $('#kpi-proposals').closest('.kpi').classList.toggle('has-attention', num(sum.openProposals) > 0);
    $('#kpi-unmatched').closest('.kpi').classList.toggle('has-warning', num(sum.unmatchedPayments) > 0);

    const pending = (state.proposals || []).filter((x) => x.status === 'pending').length;
    $('#count-inbox').textContent = pending ? String(pending) : '';
    $('#count-members').textContent = String(state.members.length || '');
    const attention = state.payments.filter((x) => x.status === 'needs_review' || x.status === 'unmatched').length;
    $('#count-payments').textContent = state.payments.length ? String(state.payments.length) : '';
    $('#count-payments').title = attention ? `${attention} need attention` : '';
  }

  function renderChips() {
    const counts = { all: state.members.length, paid: 0, partial: 0, unpaid: 0, overpaid: 0 };
    for (const m of state.members) counts[m.status] = (counts[m.status] || 0) + 1;
    const mchips = [['all', 'All'], ['paid', 'Paid'], ['partial', 'Partial'], ['unpaid', 'Unpaid'], ['overpaid', 'Overpaid']]
      .filter(([k]) => k === 'all' || k !== 'overpaid' || counts.overpaid > 0 || ui.memberFilter === 'overpaid');
    $('#member-chips').innerHTML = mchips.map(([k, label]) =>
      `<button type="button" class="chip" data-filter="${k}" aria-pressed="${ui.memberFilter === k}">${k !== 'all' ? `<span class="dot dot-${k}" style="margin-right:0"></span>` : ''}${label} <span class="n">${counts[k] || 0}</span></button>`).join('');

    const pc = { all: state.payments.length, attention: 0, matched: 0, refunded: 0, ignored: 0 };
    for (const p of state.payments) {
      if (p.status === 'needs_review' || p.status === 'unmatched') pc.attention++;
      else pc[p.status] = (pc[p.status] || 0) + 1;
    }
    $('#payment-chips').innerHTML = [['all', 'All'], ['attention', 'Needs attention'], ['matched', 'Matched'], ['refunded', 'Refunded'], ['ignored', 'Ignored']]
      .filter(([k]) => ['all', 'attention', 'matched'].includes(k) || pc[k] > 0 || ui.paymentFilter === k)
      .map(([k, label]) => `<button type="button" class="chip" data-filter="${k}" aria-pressed="${ui.paymentFilter === k}">${label} <span class="n">${pc[k] || 0}</span></button>`).join('');
  }

  // ---------- inbox ----------
  const GROUPS = [
    { type: 'review', title: 'Review needed', sub: 'The AI is unsure. Check its guess or assign by hand.', icon: ICON.eye },
    { type: 'refund', title: 'Refunds', sub: 'Duplicates and payments that are not club dues. Approving sends a PayPal refund.', icon: ICON.refund },
    { type: 'reminder', title: 'Reminders', sub: 'Members who still owe dues. Approving creates and sends a PayPal invoice.', icon: ICON.bell },
    { type: 'match', title: 'Matches', sub: 'Matches the agent wants you to confirm before booking.', icon: ICON.link },
  ];

  function approveLabel(pr) {
    switch (pr.type) {
      case 'refund': return pr.amount ? `Refund ${money(pr.amount)}` : 'Approve refund';
      case 'reminder': {
        const m = memberById(pr.memberId);
        return m && m.invoice ? 'Send reminder' : 'Send invoice';
      }
      case 'match': return 'Apply match';
      case 'review': return 'Accept AI suggestion';
      default: return 'Approve';
    }
  }

  function cardHtml(pr, isNew) {
    const decided = pr.status !== 'pending';
    const m = pr.memberId ? memberById(pr.memberId) : null;
    const pay = pr.paymentId ? paymentById(pr.paymentId) : null;
    const hasMsg = (pr.type === 'reminder' || pr.type === 'refund') && (pr.message !== null && pr.message !== undefined);
    const draft = Object.prototype.hasOwnProperty.call(ui.drafts, pr.id) ? ui.drafts[pr.id] : pr.message;
    const meta = [];
    if (pr.amount !== null && pr.amount !== undefined) meta.push(`<span class="amount-tag">${esc(money(pr.amount))}</span>`);
    if (pr.confidence !== null && pr.confidence !== undefined) meta.push(`<span class="ai-tag">${ICON.spark.replace('class="ico"', 'class="ico"')}${confHtml(pr.confidence)}</span>`);
    if (m) meta.push(`<span>${esc(m.name)}</span>`);
    if (pay) meta.push(`<button type="button" class="link-btn open-payment" data-payment-id="${esc(pay.id)}">${pr.type === 'review' && !decided ? 'View payment or assign by hand' : 'View payment'}</button>`);

    let body = '';
    if (!decided && hasMsg) {
      const label = pr.type === 'reminder' ? 'Message on the PayPal invoice' : 'Note to the payer with the refund';
      body += `<label class="msg-label" for="msg-${esc(pr.id)}">${ICON.user.replace('class="ico"', 'class="ico" style="width:14px;height:14px"')}${label}</label>
        <textarea class="msg" id="msg-${esc(pr.id)}" data-proposal-id="${esc(pr.id)}" rows="4">${esc(draft || '')}</textarea>`;
    } else if (decided && hasMsg && pr.message) {
      body += `<div class="card-detail" style="font-style:italic">“${esc(pr.message)}”</div>`;
    }
    if (decided) {
      const cls = pr.status === 'done' ? 'ok' : pr.status === 'failed' ? 'bad' : '';
      const ico = pr.status === 'done' ? ICON.check : pr.status === 'failed' ? ICON.alert : ICON.x;
      const fallback = pr.status === 'rejected' ? 'Rejected. Nothing was sent.' : pr.status === 'done' ? 'Done.' : 'Failed.';
      body += `<div class="result ${cls}">${ico}<span>${esc(pr.result || fallback)}${pr.decidedAt ? ` <span class="muted" style="font-size:12px">· ${esc(dateTime(pr.decidedAt))}</span>` : ''}</span></div>`;
    } else {
      const assign = '';
      body += `<div class="card-actions">
        <button type="button" class="btn btn-sm btn-primary approve" data-proposal-id="${esc(pr.id)}" aria-label="${esc(approveLabel(pr))}: ${esc(pr.title)}">${ICON.check}${esc(approveLabel(pr))}</button>
        <button type="button" class="btn btn-sm btn-danger-ghost reject" data-proposal-id="${esc(pr.id)}" aria-label="Reject: ${esc(pr.title)}">Reject</button>
        ${assign}
      </div>`;
    }
    return `<article class="card${decided ? ' is-decided' : ''}${isNew ? ' is-new' : ''}" data-proposal-id="${esc(pr.id)}" data-proposal-type="${esc(pr.type)}" data-status="${esc(pr.status)}">
      <div class="card-top"><h4 class="card-title">${esc(pr.title)}</h4>${decided ? pill(pr.status) : ''}</div>
      ${pr.detail ? `<p class="card-detail">${esc(pr.detail)}</p>` : ''}
      ${meta.length ? `<div class="card-meta">${meta.join('')}</div>` : ''}
      ${body}
    </article>`;
  }

  function renderInbox() {
    const root = $('#inbox');
    // keep focus inside a textarea across re-renders
    const active = document.activeElement;
    const focusId = active && active.classList && active.classList.contains('msg') ? active.dataset.proposalId : null;
    const caret = focusId ? [active.selectionStart, active.selectionEnd] : null;

    const proposals = state.proposals || [];
    const firstRender = ui.seenProposals === null;
    const seen = ui.seenProposals || new Set();
    const pending = proposals.filter((p) => p.status === 'pending');

    if (!proposals.length) {
      root.innerHTML = `<div class="empty"><h3>No proposals yet</h3><p>Run the treasurer agent. It reads new PayPal payments, matches them to members and lists everything it wants to do here, for your approval.</p>
        <button type="button" class="btn btn-primary" data-action="run-agent">${ICON.spark}Run treasurer agent</button></div>`;
    } else {
      const pendingReminders = pending.filter((p) => p.type === 'reminder').length;
      const head = `<div class="inbox-head"><div><h2>${pending.length ? `${pending.length} decision${pending.length === 1 ? '' : 's'} waiting for you` : 'All caught up'}</h2>
        <p>${pending.length ? 'Nothing reaches PayPal or a member until you approve it.' : 'Every proposal is decided. Run the agent again after new payments arrive.'}</p></div>
        ${pendingReminders > 1 ? `<button type="button" class="btn btn-primary" id="approve-all-reminders">${ICON.bell}Approve all reminders (${pendingReminders})</button>` : ''}</div>`;
      const groups = GROUPS.concat(
        [...new Set(proposals.map((p) => p.type))].filter((t) => !GROUPS.some((g) => g.type === t)).map((t) => ({ type: t, title: t, sub: '', icon: ICON.info })),
      ).map((g) => {
        const items = proposals.filter((p) => p.type === g.type);
        if (!items.length) return '';
        const open = items.filter((p) => p.status === 'pending');
        const done = items.filter((p) => p.status !== 'pending')
          .sort((a, b) => String(b.decidedAt || '').localeCompare(String(a.decidedAt || '')));
        const shownDone = done.slice(0, 4), olderDone = done.slice(4);
        const cards = (list) => list.map((p) => cardHtml(p, !firstRender && !seen.has(p.id))).join('');
        const allBtn = '';
        return `<section class="group g-${esc(g.type)}" data-group="${esc(g.type)}" aria-labelledby="gh-${esc(g.type)}">
          <div class="group-head"><h3 id="gh-${esc(g.type)}"><span class="gico">${g.icon}</span>${esc(g.title)}</h3>
            <span class="count${open.length ? ' count-hot' : ''}">${open.length ? `${open.length} open` : 'done'}</span>
            <span class="muted" style="font-size:13px">${esc(g.sub)}</span><span class="spacer"></span>${allBtn}</div>
          <div class="cards">${cards(open)}${cards(shownDone)}</div>
          ${olderDone.length ? `<details class="decided"><summary>${olderDone.length} older decided</summary><div class="cards">${cards(olderDone)}</div></details>` : ''}
        </section>`;
      }).join('');
      root.innerHTML = head + `<div class="inbox-groups">${groups}</div>`;
    }
    ui.seenProposals = new Set(proposals.map((p) => p.id));
    if (focusId) {
      const ta = root.querySelector(`textarea.msg[data-proposal-id="${CSS.escape(focusId)}"]`);
      if (ta) { ta.focus(); try { ta.setSelectionRange(caret[0], caret[1]); } catch { /* ignore */ } }
    }
  }

  // ---------- activity ----------
  function renderActivity() {
    const log = (state.log || []).slice().sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    const icon = { agent: ICON.spark, paypal: ICON.paypal, user: ICON.user, error: ICON.alert };
    const label = { agent: 'Agent', paypal: 'PayPal', user: 'You', error: 'Error' };
    $('#activity').innerHTML = log.length
      ? log.map((e) => `<li class="tl-${esc(e.kind)}"><span class="tl-dot">${icon[e.kind] || ICON.info}</span>
          <div class="tl-meta"><span class="tl-kind">${esc(label[e.kind] || e.kind)}</span><time datetime="${esc(e.at)}">${esc(dateTime(e.at))}</time></div>
          <div class="tl-msg">${esc(e.message)}</div></li>`).join('')
      : '<li class="empty" style="padding:40px 20px">Nothing has happened yet.</li>';
  }

  // ---------- payment side panel ----------
  function openPayment(id) {
    const p = paymentById(id);
    if (!p) return;
    if (!ui.assignDraft || ui.assignDraft.paymentId !== id) {
      const base = (p.allocations && p.allocations.length ? p.allocations : (p.match && p.match.allocations) || []);
      ui.assignDraft = { paymentId: id, rows: base.length ? base.map((a) => ({ memberId: a.memberId, amount: num(a.amount) })) : [{ memberId: '', amount: num(p.amount) - num(p.refunded) }] };
    }
    ui.openPaymentId = id;
    ui.lastFocus = document.activeElement;
    $('#scrim').hidden = false;
    $('#payment-panel').hidden = false;
    renderPanel();
    $('#pp-close').focus();
  }
  function closePayment() {
    ui.openPaymentId = null;
    ui.assignDraft = null;
    $('#scrim').hidden = true;
    $('#payment-panel').hidden = true;
    if (ui.lastFocus && ui.lastFocus.focus && document.contains(ui.lastFocus)) ui.lastFocus.focus();
  }

  function memberOptions(selected) {
    const ms = state.members.slice().sort((a, b) => a.name.localeCompare(b.name));
    return `<option value="">Choose member…</option>` + ms.map((m) =>
      `<option value="${esc(m.id)}"${m.id === selected ? ' selected' : ''}>${esc(m.name)}${num(m.outstanding) > 0 ? ` (owes ${esc(money(m.outstanding))})` : ''}</option>`).join('');
  }

  function renderPanel() {
    const p = paymentById(ui.openPaymentId);
    if (!p) { closePayment(); return; }
    const cur = p.currency || currency();
    $('#pp-title').textContent = p.payerName || 'Unknown payer';
    const match = p.match;
    const reasons = (match && match.reasons) || [];
    const alts = (match && match.alternatives) || [];
    const related = (state.proposals || []).filter((x) => x.paymentId === p.id && x.status === 'pending');
    const rows = ui.assignDraft.rows;
    const sum = rows.reduce((s, r) => s + num(r.amount), 0);
    const available = num(p.amount) - num(p.refunded);
    const off = Math.abs(sum - available) > 0.005;

    $('#pp-body').innerHTML = `
      <div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="pp-amount">${esc(money(p.amount, cur))}</span>${pill(p.status)}${p.intent && p.intent.label ? `<span class="intent">${esc(p.intent.label)}<small>${pct(p.intent.score)}%</small></span>` : ''}</div>
        <dl class="pp-facts" style="margin-top:12px">
          <dt>Date</dt><dd>${esc(date(p.date, true))}</dd>
          <dt>From</dt><dd>${esc(p.payerName || '–')}${p.payerEmail ? ` · <span class="muted">${esc(p.payerEmail)}</span>` : ''}</dd>
          <dt>Source</dt><dd>${p.source === 'invoice' ? 'PayPal invoice' : 'PayPal payment'}</dd>
          ${num(p.refunded) > 0 ? `<dt>Refunded</dt><dd>${esc(money(p.refunded, cur))}</dd>` : ''}
          <dt>ID</dt><dd class="muted" style="font-family:var(--mono);font-size:12.5px">${esc(p.id)}</dd>
        </dl>
      </div>
      <div><div class="section-title">Payment note</div><div class="pp-note">${p.note ? esc(p.note) : '<span class="muted">(no note)</span>'}</div></div>
      ${(p.allocations && p.allocations.length) ? `<div><div class="section-title">Booked to</div><div class="alloc-list">${p.allocations.map((a) => `<div class="alloc"><span>${esc(a.memberName || a.memberId)}</span><b class="num">${esc(money(a.amount, cur))}</b></div>`).join('')}</div></div>` : ''}
      <div class="ai-box">
        <div class="section-title" style="margin:0;color:var(--ai)">${ICON.spark.replace('class="ico"', 'class="ico" style="width:14px;height:14px"')}AI reasoning ${match ? confHtml(match.confidence) : ''}</div>
        ${match ? `
          ${!(match.allocations && match.allocations.length) ? '<p class="muted" style="margin-top:8px">No member fits this payment.</p>'
            : sameAlloc(match.allocations, p.allocations) ? '<p class="muted" style="margin-top:8px">Booked exactly as the AI suggested.</p>'
            : `<div class="alloc-list">${match.allocations.map((a) => `<div class="alloc"><span>${esc(a.memberName || a.memberId)}</span><b class="num">${esc(money(a.amount, cur))}</b></div>`).join('')}</div>`}
          ${reasons.length ? `<ul class="reasons">${reasons.map((r) => `<li>${ICON.check}<span>${esc(r)}</span></li>`).join('')}</ul>` : ''}
        ` : '<p class="muted" style="margin-top:8px">The agent has not analysed this payment yet. Run the treasurer agent.</p>'}
      </div>
      ${alts.length ? `<div><div class="section-title">Alternatives</div><div class="alts">${alts.map((a) => `
        <div class="alt"><span class="alt-name">${esc(a.memberName || a.memberId)}</span>${confHtml(a.score)}<button type="button" class="mini-btn use-alt" data-member-id="${esc(a.memberId)}" aria-label="Use ${esc(a.memberName)}">Use</button></div>`).join('')}</div></div>` : ''}
      ${related.length ? `<div><div class="section-title">Open proposals</div>${related.map((r) => `<p class="card-detail" style="margin-bottom:4px">• ${esc(r.title)}</p>`).join('')}<button type="button" class="link-btn" data-goto="inbox">Open agent inbox</button></div>` : ''}
      <div>
        <div class="section-title">Assign manually</div>
        <div class="assign-rows">${rows.map((r, i) => `
          <div class="assign-row" data-row="${i}">
            <select aria-label="Member ${i + 1}" data-field="memberId">${memberOptions(r.memberId)}</select>
            <input type="number" step="0.01" min="0" aria-label="Amount for member ${i + 1}" data-field="amount" value="${esc(r.amount)}">
            <button type="button" class="icon-btn remove-row" aria-label="Remove member ${i + 1}">${ICON.x}</button>
          </div>`).join('')}</div>
        <button type="button" class="link-btn" id="add-row" style="margin-top:10px">+ Add another member</button>
        <div class="assign-sum${off ? ' off' : ''}"><span>Allocated <b>${esc(money(sum, cur))}</b> of ${esc(money(available, cur))}</span>${off ? '<span>Totals differ</span>' : ''}</div>
        <div class="assign-actions">
          <button type="button" class="btn btn-primary" id="save-assign">${ICON.check}Save assignment</button>
          <button type="button" class="btn btn-danger-ghost" id="ignore-payment" title="Not club dues; leave it out of the ledger">Ignore payment</button>
        </div>
      </div>`;
  }

  function sameAlloc(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    const k = (l) => l.map((x) => `${x.memberId}:${num(x.amount)}`).sort().join('|');
    return k(a) === k(b);
  }

  // ---------- render ----------
  function setState(next) {
    state = next;
    state.members = state.members || [];
    state.payments = state.payments || [];
    state.proposals = state.proposals || [];
    state.log = state.log || [];
    window.app.state = state;
    render();
  }
  function render() {
    if (!state) return;
    renderHeader();
    renderChips();
    renderGrids();
    renderInbox();
    renderActivity();
    if (ui.openPaymentId) renderPanel();
  }

  // ---------- tabs ----------
  const TABS = ['members', 'payments', 'inbox', 'activity'];
  function showTab(name, focus = false) {
    if (!TABS.includes(name)) name = 'members';
    ui.tab = name;
    for (const t of TABS) {
      const btn = $(`#tab-${t}`);
      const on = t === name;
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
      $(`#panel-${t}`).hidden = !on;
    }
    if (focus) $(`#tab-${name}`).focus();
    try { history.replaceState(null, '', `#/${name}`); } catch { /* ignore */ }
  }

  // ---------- actions ----------
  function setBusy(btn, busy, label) {
    btn.disabled = busy;
    btn.classList.toggle('is-busy', busy);
    btn.setAttribute('aria-busy', String(busy));
    const l = btn.querySelector('.label');
    if (l && label) l.textContent = label;
  }

  async function runAgent() {
    if (ui.busy) return;
    ui.busy = true;
    const btn = $('#run-agent');
    setBusy(btn, true, 'Agent is working…');
    const before = state ? {
      matched: state.payments.filter((p) => p.status === 'matched').length,
      payments: state.payments.length,
      proposals: new Set(state.proposals.map((p) => p.id)),
    } : { matched: 0, payments: 0, proposals: new Set() };
    try {
      await write('POST', '/api/agent/run');
      const matched = state.payments.filter((p) => p.status === 'matched').length - before.matched;
      const newPayments = state.payments.length - before.payments;
      const fresh = state.proposals.filter((p) => !before.proposals.has(p.id) && p.status === 'pending').length;
      const parts = [];
      if (newPayments > 0) parts.push(`${newPayments} new payment${newPayments === 1 ? '' : 's'} synced`);
      if (matched > 0) parts.push(`${matched} matched automatically`);
      parts.push(fresh > 0 ? `${fresh} proposal${fresh === 1 ? '' : 's'} for you to review` : 'no new proposals');
      toast(`Agent finished: ${parts.join(', ')}.`);
    } catch (e) {
      toast(`Agent run failed: ${e.message}`, 'err');
    } finally {
      ui.busy = false;
      setBusy(btn, false, 'Run treasurer agent');
    }
  }

  async function decide(id, action, btn) {
    const card = btn && btn.closest('.card');
    if (card) card.classList.add('is-working');
    if (btn) btn.classList.add('is-busy');
    const pr = state.proposals.find((p) => p.id === id);
    try {
      let body;
      if (action === 'approve') {
        const ta = card && card.querySelector('textarea.msg');
        body = ta ? { message: ta.value } : {};
      }
      await write('POST', `/api/proposals/${encodeURIComponent(id)}/${action}`, body);
      delete ui.drafts[id];
      const after = state.proposals.find((p) => p.id === id);
      if (action === 'reject') toast(`Rejected: ${pr ? pr.title : id}`, 'info');
      else if (after && after.status === 'failed') toast(after.result || 'PayPal reported an error', 'err');
      else toast(after && after.result ? after.result : `Approved: ${pr ? pr.title : id}`);
    } catch (e) {
      if (card) card.classList.remove('is-working');
      if (btn) btn.classList.remove('is-busy');
      toast(e.message, 'err');
    }
  }

  async function approveAll(type, btn) {
    const ids = state.proposals.filter((p) => p.status === 'pending' && (!type || p.type === type)).map((p) => p.id);
    // send the edited messages first? The API takes no per-proposal messages here, so approve
    // edited cards one by one and the rest in bulk.
    const edited = ids.filter((id) => Object.prototype.hasOwnProperty.call(ui.drafts, id));
    if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
    $$('.card').filter((c) => ids.includes(c.dataset.proposalId)).forEach((c) => c.classList.add('is-working'));
    try {
      for (const id of edited) {
        await api('POST', `/api/proposals/${encodeURIComponent(id)}/approve`, { message: ui.drafts[id] });
        delete ui.drafts[id];
      }
      await write('POST', '/api/proposals/approve-all', type ? { type } : {});
      const done = state.proposals.filter((p) => ids.includes(p.id));
      const ok = done.filter((p) => p.status === 'done').length;
      const failed = done.filter((p) => p.status === 'failed').length;
      toast(`${ok} ${type || 'proposal'}${ok === 1 ? '' : 's'} sent through PayPal${failed ? `, ${failed} failed` : ''}.`, failed ? 'err' : 'ok');
    } catch (e) {
      toast(e.message, 'err');
      await refresh();
    }
  }

  async function payInvoice(id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Paying…'; }
    const m = state.members.find((x) => x.invoice && x.invoice.id === id);
    try {
      await write('POST', `/api/demo/pay-invoice/${encodeURIComponent(id)}`);
      toast(`${m ? m.name : 'Member'} paid the invoice through PayPal.`);
    } catch (e) {
      toast(e.message, 'err');
      if (btn) { btn.disabled = false; btn.textContent = 'Simulate member pays'; }
    }
  }

  async function deleteMember(id) {
    const m = memberById(id);
    if (!window.confirm(`Delete ${m ? m.name : 'this member'}? Their payments stay in the payment list.`)) return;
    try { await write('DELETE', `/api/members/${encodeURIComponent(id)}`); toast(`Deleted ${m ? m.name : id}`, 'info'); }
    catch (e) { toast(e.message, 'err'); }
  }

  async function saveAssign(ignore) {
    const p = paymentById(ui.openPaymentId);
    if (!p) return;
    let allocations = [];
    if (!ignore) {
      allocations = ui.assignDraft.rows.filter((r) => r.memberId).map((r) => ({ memberId: r.memberId, amount: num(r.amount) }));
      if (!allocations.length) { toast('Choose at least one member, or ignore the payment', 'err'); return; }
      if (allocations.some((a) => !(a.amount > 0))) { toast('Every amount must be above zero', 'err'); return; }
    }
    try {
      await write('POST', `/api/payments/${encodeURIComponent(p.id)}/assign`, { allocations });
      toast(ignore ? `Ignored payment from ${p.payerName}` : `Assigned ${money(p.amount)} from ${p.payerName} to ${allocations.map((a) => (memberById(a.memberId) || {}).name || a.memberId).join(' + ')}`);
      ui.assignDraft = null;
      closePayment();
    } catch (e) { toast(e.message, 'err'); }
  }

  async function resetDemo() {
    if (!window.confirm('Reset the demo club? This reseeds members and the mock PayPal account.')) return;
    const btn = $('#reset-demo');
    btn.disabled = true;
    try {
      ui.drafts = {};
      ui.seenProposals = null;
      closePayment();
      await write('POST', '/api/demo/reset');
      toast('Demo reset. Fresh club, fresh PayPal inbox.', 'info');
    } catch (e) { toast(e.message, 'err'); }
    finally { btn.disabled = false; }
  }

  async function simulate(body) {
    const before = new Set(state.payments.map((p) => p.id));
    const btn = $('#sim-submit');
    btn.disabled = true;
    try {
      await write('POST', '/api/demo/simulate-payment', body);
      $('#sim-dialog').close();
      $('#sim-form').reset();
      const added = state.payments.find((p) => !before.has(p.id));
      if (added) {
        const who = added.allocations?.length ? `matched to ${added.allocations.map((a) => a.memberName).join(' + ')}`
          : added.status === 'needs_review' ? 'sent to the Agent inbox for review' : 'not matched yet';
        toast(`New PayPal payment: ${money(added.amount)} from ${added.payerName}${added.note ? ` “${added.note}”` : ''}, ${who}.`);
      } else {
        toast('Payment sent to the mock PayPal account.');
      }
    } catch (e) { toast(e.message, 'err'); }
    finally { btn.disabled = false; }
  }

  // ---------- event wiring ----------
  function wire() {
    $('#run-agent').addEventListener('click', runAgent);
    $('#reset-demo').addEventListener('click', resetDemo);
    $('#simulate-payment').addEventListener('click', () => {
      const d = $('#sim-dialog');
      if (d.showModal) d.showModal(); else d.setAttribute('open', '');
      d.querySelector('input[name="payerName"]').focus();
    });
    $('#sim-cancel').addEventListener('click', () => $('#sim-dialog').close());
    $('#sim-random').addEventListener('click', () => simulate({}));
    $('#sim-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const body = {};
      for (const k of ['payerName', 'payerEmail', 'note']) { const v = String(f.get(k) || '').trim(); if (v) body[k] = v; }
      const amt = String(f.get('amount') || '').trim();
      if (amt) {
        const n = Number(amt);
        if (!(n > 0)) { toast('Amount must be above zero', 'err'); return; }
        body.amount = n;
      }
      simulate(body);
    });

    $('#add-member').addEventListener('click', () => {
      const d = $('#member-dialog');
      const f = $('#member-form');
      f.reset();
      f.elements.dues.value = state && state.settings ? state.settings.defaultDues : '';
      if (d.showModal) d.showModal(); else d.setAttribute('open', '');
      f.elements.name.focus();
    });
    $('#member-cancel').addEventListener('click', () => $('#member-dialog').close());
    $('#member-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const body = {
        name: String(f.get('name') || '').trim(),
        email: String(f.get('email') || '').trim(),
        nicknames: String(f.get('nicknames') || '').split(',').map((s) => s.trim()).filter(Boolean),
      };
      const dues = String(f.get('dues') || '').trim();
      if (dues) body.dues = Number(dues);
      if (!body.name || !body.email) { toast('Name and email are required', 'err'); return; }
      try {
        await write('POST', '/api/members', body);
        $('#member-dialog').close();
        toast(`Added ${body.name}`);
      } catch (err) { toast(err.message, 'err'); }
    });

    $('#members-search').addEventListener('input', (e) => membersApi && membersApi.setGridOption('quickFilterText', e.target.value));
    $('#payments-search').addEventListener('input', (e) => paymentsApi && paymentsApi.setGridOption('quickFilterText', e.target.value));
    $('#member-chips').addEventListener('click', (e) => {
      const c = e.target.closest('.chip'); if (!c) return;
      ui.memberFilter = c.dataset.filter; renderChips(); membersApi && membersApi.onFilterChanged();
    });
    $('#payment-chips').addEventListener('click', (e) => {
      const c = e.target.closest('.chip'); if (!c) return;
      ui.paymentFilter = c.dataset.filter; renderChips(); paymentsApi && paymentsApi.onFilterChanged();
    });

    // grid cell buttons (event delegation)
    $('#members-grid').addEventListener('click', (e) => {
      const pay = e.target.closest('.pay-invoice');
      if (pay) { e.stopPropagation(); payInvoice(pay.dataset.invoiceId, pay); return; }
      const del = e.target.closest('.delete-member');
      if (del) { e.stopPropagation(); deleteMember(del.dataset.memberId); }
    });

    // tabs
    const tablist = $('.tabs');
    tablist.addEventListener('click', (e) => {
      const t = e.target.closest('[role="tab"]'); if (t) showTab(t.id.replace('tab-', ''));
    });
    tablist.addEventListener('keydown', (e) => {
      const i = TABS.indexOf(ui.tab);
      if (e.key === 'ArrowRight') { e.preventDefault(); showTab(TABS[(i + 1) % TABS.length], true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); showTab(TABS[(i + TABS.length - 1) % TABS.length], true); }
    });

    // global delegation: goto links, inbox actions, panel actions
    document.addEventListener('click', (e) => {
      const go = e.target.closest('[data-goto]');
      if (go) { if (ui.openPaymentId) closePayment(); showTab(go.dataset.goto); return; }
      const ra = e.target.closest('[data-action="run-agent"]');
      if (ra) { runAgent(); return; }
      const ap = e.target.closest('.approve');
      if (ap && ap.dataset.proposalId) { decide(ap.dataset.proposalId, 'approve', ap); return; }
      const rj = e.target.closest('.reject');
      if (rj && rj.dataset.proposalId) { decide(rj.dataset.proposalId, 'reject', rj); return; }
      const all = e.target.closest('#approve-all-reminders, .approve-all');
      if (all) { approveAll(all.dataset.type || 'reminder', all); return; }
      const op = e.target.closest('.open-payment');
      if (op) { openPayment(op.dataset.paymentId); }
    });
    $('#inbox').addEventListener('input', (e) => {
      if (e.target.matches('textarea.msg')) ui.drafts[e.target.dataset.proposalId] = e.target.value;
    });

    // side panel
    $('#pp-close').addEventListener('click', closePayment);
    $('#scrim').addEventListener('click', closePayment);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ui.openPaymentId && !document.querySelector('dialog[open]')) closePayment();
    });
    const body = $('#pp-body');
    body.addEventListener('change', (e) => {
      const row = e.target.closest('.assign-row'); if (!row) return;
      const r = ui.assignDraft.rows[Number(row.dataset.row)];
      if (e.target.dataset.field === 'memberId') {
        r.memberId = e.target.value;
        const m = memberById(r.memberId);
        // a fresh row with nothing typed: suggest what the member owes
        if (m && ui.assignDraft.rows.length > 1 && !(num(r.amount) > 0)) r.amount = num(m.outstanding) || num(m.dues);
      } else r.amount = e.target.value === '' ? 0 : Number(e.target.value);
      renderPanel();
    });
    body.addEventListener('click', (e) => {
      if (e.target.closest('#add-row')) {
        const p = paymentById(ui.openPaymentId);
        const used = ui.assignDraft.rows.reduce((s, r) => s + num(r.amount), 0);
        ui.assignDraft.rows.push({ memberId: '', amount: Math.max(0, num(p.amount) - num(p.refunded) - used) });
        renderPanel();
        const sels = $$('.assign-row select', body); sels[sels.length - 1].focus();
        return;
      }
      const rm = e.target.closest('.remove-row');
      if (rm) {
        ui.assignDraft.rows.splice(Number(rm.closest('.assign-row').dataset.row), 1);
        if (!ui.assignDraft.rows.length) ui.assignDraft.rows.push({ memberId: '', amount: 0 });
        renderPanel(); return;
      }
      const alt = e.target.closest('.use-alt');
      if (alt) {
        const p = paymentById(ui.openPaymentId);
        ui.assignDraft.rows = [{ memberId: alt.dataset.memberId, amount: num(p.amount) - num(p.refunded) }];
        renderPanel(); return;
      }
      if (e.target.closest('#save-assign')) { saveAssign(false); return; }
      if (e.target.closest('#ignore-payment')) { saveAssign(true); }
    });

    if (darkMql) {
      const onChange = () => applyGridTheme();
      if (darkMql.addEventListener) darkMql.addEventListener('change', onChange); else if (darkMql.addListener) darkMql.addListener(onChange);
    }
  }

  // ---------- boot ----------
  window.app = { refresh, state: null, showTab, openPayment };

  function boot() {
    wire();
    const fromHash = (location.hash || '').replace(/^#\/?/, '');
    showTab(TABS.includes(fromHash) ? fromHash : 'members');
    applyGridTheme();
    if (window.agGrid && agGrid.createGrid) {
      buildMembersGrid();
      buildPaymentsGrid();
    } else {
      for (const id of ['#members-grid', '#payments-grid']) {
        $(id).innerHTML = '<div class="empty" style="margin:16px">The table library (AG Grid) could not load. Check your internet connection and reload.</div>';
      }
      toast('AG Grid failed to load from the CDN', 'err');
    }
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
