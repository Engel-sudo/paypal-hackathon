/* Clubkeep — the AI treasurer for clubs. Plain JS single page app, AG Grid Community 32.3.3 (global agGrid). */
(() => {
  'use strict';

  // ---------- small helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduceMql = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduceMotion = () => !!(reduceMql && reduceMql.matches);
  const narrowMql = window.matchMedia ? window.matchMedia('(max-width: 640px)') : null;
  const isNarrow = () => !!(narrowMql && narrowMql.matches);
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch { /* storage blocked */ } },
    del(k) { try { window.localStorage.removeItem(k); } catch { /* storage blocked */ } },
  };

  const svg = (d, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICON = {
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    minus: svg('<path d="M6 12h12"/>'),
    alert: svg('<path d="M12 8v5m0 3.5v.01M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
    match: svg('<path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/>'),
    refund: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
    invoice: svg('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>'),
    review: svg('<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.8v.01"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 'ico ico-sm'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8v.01"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 'ico ico-sm'),
  };
  const TICKMARK = '<svg class="tickmark" viewBox="0 0 32 32" aria-hidden="true"><path d="M23.1 8.5A10 10 0 1 0 25.9 19.6" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linecap="round"/><path d="M11.5 16.2l3.6 3.6L27 7.6" fill="none" stroke="var(--brand)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // ---------- state ----------
  let state = null;
  const ui = {
    tab: 'inbox',
    memberFilter: 'all',
    paymentFilter: 'all',
    openPaymentId: null,
    assignDraft: null,        // { paymentId, rows: [{ memberId, amount }] }
    drafts: {},               // proposalId -> edited message
    editing: new Set(),       // proposal ids with the message editor open
    confirming: null,         // refund proposal id waiting for the confirm click
    batchOff: new Set(),      // reminder ids unticked in the batch
    previewOpen: false,
    seen: null,               // proposal ids rendered before (entry animation)
    justDone: new Set(),
    busy: false,
    run: null,                // agent-run timeline { phase, steps, revealed, at, summary, collapsed, userToggled }
    hideFirstrun: false,
    loadedAt: new Date().toISOString(),
    lastCollected: null,
  };

  // ---------- formatting ----------
  const currency = () => (state && state.settings && state.settings.currency) || 'USD';
  const fmtCache = {};
  function fmt(cur, min, max) {
    const k = `${cur}|${min}|${max}`;
    if (!fmtCache[k]) {
      try { fmtCache[k] = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: min, maximumFractionDigits: max }); }
      catch { fmtCache[k] = { format: (n) => `${n.toFixed(max)} ${cur}` }; }
    }
    return fmtCache[k];
  }
  /** $30 or $12.50, for prose */
  function money(v, cur = currency()) {
    const n = num(v);
    return fmt(cur, Number.isInteger(n) ? 0 : 2, 2).format(n);
  }
  /** $30.00, for columns of numbers */
  const money2 = (v, cur = currency()) => fmt(cur, 2, 2).format(num(v));
  function day(iso, withYear = false) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
  }
  function clock(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  const first = (name) => String(name || '').trim().split(/\s+/)[0] || '';
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  function listNames(names) {
    const n = names.filter(Boolean);
    if (n.length <= 1) return n[0] || '';
    return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
  }
  const clubName = () => String((state && state.settings && state.settings.clubName) || 'Your club').replace(/\s*\(demo\)\s*$/i, '');

  const MEMBER_ST = { paid: 'Paid', partial: 'Partial', unpaid: 'Owes dues', overpaid: 'Overpaid' };
  const PAY_ST = { matched: 'Matched', needs_review: 'Needs you', unmatched: 'Unsorted', refunded: 'Refunded', ignored: 'Not dues' };
  const INV_ST = { SENT: 'Invoice sent', PAID: 'Invoice paid', DRAFT: 'Draft', CANCELLED: 'Cancelled', UNPAID: 'Unpaid', SCHEDULED: 'Scheduled', PARTIALLY_PAID: 'Part paid' };
  const INTENT = { dues: 'Dues', event: 'Trip or event', donation: 'Donation', other: 'Other' };
  const st = (status, label) => `<span class="st st-${esc(status)}">${esc(label || status)}</span>`;
  const pct = (c) => Math.round(Math.max(0, Math.min(1, num(c))) * 100);
  function meter(c, { word = true } = {}) {
    if (c === null || c === undefined) return '';
    const p = pct(c);
    const on = Math.max(p > 0 ? 1 : 0, Math.round(p / 20));
    const low = p < 60;
    const ticks = [0, 1, 2, 3, 4].map((i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('');
    return `<span class="conf${low ? ' low' : ''}" title="Match confidence ${p}%">${word ? `<span class="conf-word">${low ? 'Unsure' : 'Likely match'}</span>` : ''}<span class="ticks" aria-hidden="true">${ticks}</span><b>${p}</b><span class="sr-only"> percent</span></span>`;
  }
  const memberById = (id) => (state && state.members || []).find((m) => m.id === id);
  const paymentById = (id) => (state && state.payments || []).find((p) => p.id === id);
  const modeIsMock = () => !state || !state.mode || state.mode.paypal !== 'sandbox';

  // Words in the payment note that the matcher relied on: quoted tokens in the reasons, plus the
  // names and nicknames of the members it picked.
  function noteTokens(p) {
    const toks = new Set();
    const m = p && p.match;
    for (const r of (m && m.reasons) || []) for (const q of String(r).matchAll(/"([^"]{2,40})"/g)) toks.add(q[1]);
    const allocs = ((p && p.allocations && p.allocations.length ? p.allocations : m && m.allocations) || []);
    for (const a of allocs) {
      const mem = memberById(a.memberId);
      const name = (mem && mem.name) || a.memberName || '';
      for (const part of name.split(/\s+/)) if (part.length > 1) toks.add(part);
      for (const nick of (mem && mem.nicknames) || []) if (nick.length > 1) toks.add(nick);
    }
    return [...toks];
  }
  function highlight(text, tokens) {
    const s = String(text || '');
    const t = tokens.filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
    if (!s || !t.length) return esc(s);
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${t.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'giu');
    let out = ''; let last = 0;
    for (const mt of s.matchAll(re)) {
      const start = mt.index + mt[1].length;
      out += esc(s.slice(last, start)) + `<mark class="hl">${esc(mt[2])}</mark>`;
      last = start + mt[2].length;
    }
    return out + esc(s.slice(last));
  }
  const cleanReason = (r) => String(r).replace(/\s*\(family member\?\)/, '');
  const negReason = (r) => /^no\b/i.test(r);

  // ---------- admin token ----------
  const TOKEN_KEY = 'treasurer.adminToken';
  const getToken = () => store.get(TOKEN_KEY) || ui.tokenMem || '';
  function setToken(t) { ui.tokenMem = t; if (t) store.set(TOKEN_KEY, t); else store.del(TOKEN_KEY); }

  // ---------- API ----------
  async function api(method, path, body, retried = false) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers['x-admin-token'] = token;
    let res;
    try {
      res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error('Can’t reach the Clubkeep server. Check that it is running, then try again.');
    }
    if (res.status === 401) {
      if (!retried) {
        const t = window.prompt(token ? 'That admin token wasn’t accepted. Enter the admin token:' : 'This action needs the club’s admin token:');
        if (t && t.trim()) { setToken(t.trim()); return api(method, path, body, true); }
      } else setToken('');
      throw new Error('This action needs the admin token.');
    }
    let data = null;
    const text = await res.text();
    if (text) { try { data = JSON.parse(text); } catch { data = null; } }
    if (!res.ok) throw new Error((data && data.error) || `${res.status} ${res.statusText}`);
    return data;
  }
  const isState = (d) => d && Array.isArray(d.members) && d.summary;
  async function write(method, path, body) {
    const data = await api(method, path, body);
    if (isState(data)) setState(data); else await refresh();
    return data;
  }
  async function refresh() {
    try { setState(await api('GET', '/api/state')); }
    catch (e) { fail(e.message); }
    return state;
  }

  // ---------- one polite status region, one alert region ----------
  let toastTimer = null; let alertTimer = null;
  function announce(message, ms = 4800, kind = 'ok') {
    const box = $('#status');
    box.innerHTML = `<div class="toast ${kind}">${kind === 'info' ? '<span class="spin" aria-hidden="true"></span>' : ICON.check}<div>${esc(message)}</div></div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { const t = box.firstElementChild; if (t) { t.classList.add('out'); setTimeout(() => { if (box.firstElementChild === t) box.innerHTML = ''; }, 320); } }, ms);
  }
  function fail(message) {
    const box = $('#alert');
    box.innerHTML = `<div class="toast err">${ICON.alert}<div>${esc(message)}</div></div>`;
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => { box.innerHTML = ''; }, 8000);
  }

  // ---------- grids ----------
  let membersApi = null;
  let paymentsApi = null;
  const GRID_KEY = { members: 'clubkeep.grid.members.v1', payments: 'clubkeep.grid.payments.v1' };
  const NARROW_HIDE = { members: ['nicknames', 'dues', 'outstanding', 'lastPaymentAt', 'actions'], payments: ['note', 'intent', 'confidence', 'members'] };

  function saveColumns(which, gridApi) {
    if (ui.applyingColumns) return;
    const cols = gridApi.getColumnState().map(({ hide, ...rest }) => rest); // visibility is responsive, not saved
    store.set(GRID_KEY[which], JSON.stringify(cols));
    const btn = $(`#${which}-reset-view`); if (btn) btn.hidden = false;
  }
  function restoreColumns(which, gridApi) {
    const raw = store.get(GRID_KEY[which]);
    if (!raw) return;
    try {
      ui.applyingColumns = true;
      gridApi.applyColumnState({ state: JSON.parse(raw), applyOrder: true });
      const btn = $(`#${which}-reset-view`); if (btn) btn.hidden = false;
    } catch { store.del(GRID_KEY[which]); }
    finally { ui.applyingColumns = false; }
  }
  function resetColumns(which, gridApi) {
    ui.applyingColumns = true;
    gridApi.resetColumnState();
    ui.applyingColumns = false;
    store.del(GRID_KEY[which]);
    applyResponsiveColumns();
    $(`#${which}-reset-view`).hidden = true;
    announce('Table view reset.');
  }
  function applyResponsiveColumns() {
    const narrow = isNarrow();
    ui.applyingColumns = true;
    if (membersApi) {
      membersApi.setColumnsVisible(NARROW_HIDE.members, !narrow);
      if (narrow || ui.wasNarrow) membersApi.setColumnWidths([{ key: 'paid', newWidth: narrow ? 96 : 132 }, { key: 'status', newWidth: narrow ? 112 : 124 }]);
    }
    ui.wasNarrow = narrow;
    if (paymentsApi) { paymentsApi.setColumnsVisible(NARROW_HIDE.payments, !narrow); paymentsApi.refreshCells({ force: true, columns: ['payerName'] }); }
    ui.applyingColumns = false;
  }
  const gridStateEvents = (which) => {
    const save = (e) => saveColumns(which, e.api);
    return {
      onSortChanged: save,
      onColumnMoved: (e) => { if (e.finished !== false) save(e); },
      onColumnResized: (e) => { if (e.finished && e.source === 'uiColumnResized') save(e); },
    };
  };

  function invoiceCell(p) {
    const m = p.data; if (!m) return '';
    if (p.node.rowPinned) {
      const sent = (state.members || []).filter((x) => x.invoice).length;
      return sent ? `<span class="cell-muted">${plural(sent, 'invoice')} out</span>` : '';
    }
    const inv = m.invoice;
    if (!inv) return '';
    const rem = num(inv.reminders);
    const pay = inv.status === 'SENT' && modeIsMock()
      ? `<button type="button" class="mini-btn pay-invoice" data-invoice-id="${esc(inv.id)}" aria-label="Demo: ${esc(m.name)} pays invoice ${esc(inv.id)}">Member pays</button>` : '';
    const label = INV_ST[inv.status] || inv.status;
    const idTxt = inv.url ? `<a class="inv-id" href="${esc(inv.url)}" target="_blank" rel="noopener">${esc(inv.id)}</a>` : `<span class="inv-id">${esc(inv.id)}</span>`;
    return `<div class="inv"><div class="cell-stack">${st(inv.status, label + (rem ? ` · ${plural(rem, 'reminder')}` : ''))}${idTxt}</div>${pay}</div>`;
  }

  function totalRow() {
    const ms = state.members || [];
    const sum = (k) => ms.reduce((s, m) => s + num(m[k]), 0);
    return [{ id: '__total', name: 'Total', email: '', nicknames: [], dues: sum('dues'), paid: sum('paid'), outstanding: sum('outstanding'), credit: 0, status: '__total', lastPaymentAt: null, invoice: null }];
  }

  function buildMembersGrid() {
    const pinned = (p) => !!(p.node && p.node.rowPinned);
    const columnDefs = [
      {
        headerName: 'Name', field: 'name', colId: 'name', minWidth: 140, flex: 1.2,
        cellRenderer: (p) => {
          if (pinned(p)) return `<span class="name-cell">Total</span> <span class="cell-muted">&nbsp;${plural((state.members || []).length, 'member')}</span>`;
          const d = p.data || {};
          return `<div class="cell-stack"><span class="name-cell">${esc(d.name)}</span><small>${esc(d.email || '')}</small></div>`;
        },
        getQuickFilterText: (p) => `${p.data.name || ''} ${p.data.email || ''}`,
      },
      { headerName: 'Email', field: 'email', colId: 'email', hide: true, suppressMovable: true }, // shown under the name; kept for the CSV
      {
        headerName: 'Nicknames', colId: 'nicknames', editable: (p) => !pinned(p), width: 100,
        valueGetter: (p) => (p.data && Array.isArray(p.data.nicknames) ? p.data.nicknames.join(', ') : ''),
        valueSetter: (p) => {
          const next = String(p.newValue ?? '').split(',').map((s) => s.trim()).filter(Boolean);
          if (next.join(', ') === (p.data.nicknames || []).join(', ')) return false;
          p.data.nicknames = next; return true;
        },
        cellClass: 'cell-muted',
      },
      {
        headerName: 'Dues', field: 'dues', colId: 'dues', editable: (p) => !pinned(p), width: 96, type: 'rightAligned', cellClass: 'num',
        cellEditor: 'agNumberCellEditor', cellEditorParams: { min: 0, precision: 2 },
        valueParser: (p) => (p.newValue === '' || p.newValue === null ? p.oldValue : Number(p.newValue)),
        valueFormatter: (p) => money2(p.value),
      },
      {
        headerName: 'Paid', field: 'paid', colId: 'paid', width: 132, type: 'rightAligned', cellClass: 'num', enableCellChangeFlash: true,
        cellRenderer: (p) => {
          const d = p.data || {};
          const dues = num(d.dues); const paid = num(d.paid);
          const w = dues > 0 ? Math.min(100, Math.round((paid / dues) * 100)) : 0;
          return `<span class="paidbar"><span class="pb${w > 0 && w < 100 ? ' part' : ''}" aria-hidden="true"><i style="width:${w}%"></i></span><span>${esc(money2(paid))}</span></span>`;
        },
      },
      {
        headerName: 'Outstanding', field: 'outstanding', colId: 'outstanding', width: 124, type: 'rightAligned', cellClass: 'num', enableCellChangeFlash: true,
        cellRenderer: (p) => {
          const m = p.data || {};
          if (num(m.credit) > 0) return `<span class="credit" title="Paid more than the dues">+${esc(money2(m.credit))}</span>`;
          return num(p.value) > 0 ? `<span class="owed">${esc(money2(p.value))}</span>` : '';
        },
      },
      {
        headerName: 'Status', field: 'status', colId: 'status', width: 124, enableCellChangeFlash: true,
        cellRenderer: (p) => {
          if (pinned(p)) {
            const s = state.summary || {};
            return `<span class="cell-muted">${num(s.paid) + num(s.overpaid)} paid · ${num(s.unpaid) + num(s.partial)} owe</span>`;
          }
          return st(p.value, MEMBER_ST[p.value] || p.value);
        },
        getQuickFilterText: (p) => MEMBER_ST[p.value] || p.value,
        comparator: (a, b) => ['unpaid', 'partial', 'paid', 'overpaid'].indexOf(a) - ['unpaid', 'partial', 'paid', 'overpaid'].indexOf(b),
      },
      {
        headerName: 'Last paid', field: 'lastPaymentAt', colId: 'lastPaymentAt', width: 108, enableCellChangeFlash: true,
        valueFormatter: (p) => (p.value ? day(p.value) : ''), comparator: (a, b) => String(a || '').localeCompare(String(b || '')),
      },
      {
        headerName: 'Invoice', colId: 'invoice', minWidth: 272, flex: 1.1, enableCellChangeFlash: true,
        valueGetter: (p) => (p.data && p.data.invoice ? `${p.data.invoice.status} ${p.data.invoice.id}` : ''),
        cellRenderer: invoiceCell, sortable: false,
      },
      {
        headerName: '', colId: 'actions', width: 52, sortable: false, resizable: false, suppressMovable: true,
        cellRenderer: (p) => (p.data && !pinned(p) ? `<button type="button" class="icon-btn row-del delete-member" data-member-id="${esc(p.data.id)}" aria-label="Remove ${esc(p.data.name)}" title="Remove member">${ICON.trash}</button>` : ''),
      },
    ];
    membersApi = agGrid.createGrid($('#members-grid'), {
      columnDefs,
      rowData: [],
      pinnedBottomRowData: [],
      getRowId: (p) => p.data.id,
      defaultColDef: { sortable: true, resizable: true, suppressHeaderMenuButton: true },
      cellFlashDuration: 900,
      cellFadeDuration: 900,
      singleClickEdit: false,
      stopEditingWhenCellsLoseFocus: true,
      animateRows: !reduceMotion(),
      isExternalFilterPresent: () => ui.memberFilter !== 'all',
      doesExternalFilterPass: (node) => {
        const s = node.data && node.data.status;
        if (ui.memberFilter === 'owe') return s === 'unpaid' || s === 'partial';
        return s === ui.memberFilter;
      },
      onCellValueChanged: onMemberEdited,
      overlayNoRowsTemplate: '<span>No members yet. Add one to get started.</span>',
      onGridReady: (e) => restoreColumns('members', e.api),
      ...gridStateEvents('members'),
    });
  }

  async function onMemberEdited(e) {
    const m = e.data;
    const col = e.colDef.colId || e.colDef.field;
    let patch;
    if (col === 'nicknames') patch = { nicknames: m.nicknames };
    else if (col === 'dues') {
      const v = Number(e.newValue);
      if (!Number.isFinite(v) || v < 0) { fail('Dues must be a number of 0 or more.'); renderGrids(); return; }
      patch = { dues: v };
    } else if (col === 'email') patch = { email: String(e.newValue || '').trim() };
    else return;
    try {
      await write('PUT', `/api/members/${encodeURIComponent(m.id)}`, patch);
      announce(`Saved ${m.name}.`);
    } catch (err) {
      fail(`Couldn’t save ${m.name}: ${err.message}`);
      renderGrids();
    }
  }

  const allocNames = (list) => (list || []).map((a) => a.memberName || (memberById(a.memberId) || {}).name || a.memberId);

  function buildPaymentsGrid() {
    const columnDefs = [
      { headerName: 'Date', field: 'date', colId: 'date', width: 100, sort: 'desc', valueFormatter: (p) => day(p.value), comparator: (a, b) => String(a || '').localeCompare(String(b || '')) },
      {
        headerName: 'Payer', field: 'payerName', colId: 'payerName', minWidth: 170, flex: 1,
        cellRenderer: (p) => {
          const d = p.data || {};
          const second = isNarrow() ? (d.note ? `“${esc(d.note)}”` : '') : esc(d.payerEmail || '');
          return `<div class="cell-stack"><span class="name-cell">${esc(d.payerName || 'Unknown payer')}</span>${second ? `<small>${second}</small>` : ''}</div>`;
        },
        getQuickFilterText: (p) => `${p.data.payerName || ''} ${p.data.payerEmail || ''}`,
      },
      {
        headerName: 'Amount', field: 'amount', colId: 'amount', width: 120, type: 'rightAligned', cellClass: 'num',
        cellRenderer: (p) => {
          const d = p.data || {};
          const r = num(d.refunded);
          return r > 0
            ? `<div class="cell-stack" style="justify-items:end"><span>${esc(money2(d.amount, d.currency))}</span><small>−${esc(money2(r, d.currency))} back</small></div>`
            : esc(money2(d.amount, d.currency));
        },
      },
      {
        headerName: 'Note', field: 'note', colId: 'note', minWidth: 200, flex: 1.3, tooltipField: 'note',
        cellRenderer: (p) => (p.value ? `<span class="note-cell">${highlight(p.value, noteTokens(p.data))}</span>` : '<span class="cell-muted">no note</span>'),
      },
      {
        headerName: 'Looks like', colId: 'intent', width: 136,
        valueGetter: (p) => (p.data && p.data.intent ? INTENT[p.data.intent.label] || p.data.intent.label : ''),
        tooltipValueGetter: (p) => {
          const it = p.data && p.data.intent;
          if (!it) return 'Not read yet';
          return `The AI reads this note as ${INTENT[it.label] || it.label} (${pct(it.score)}% sure).`;
        },
        cellRenderer: (p) => (p.value ? `<span class="intent-word">${esc(p.value)}</span>` : ''),
      },
      {
        headerName: 'Matched to', colId: 'members', minWidth: 190, flex: 1.2, enableCellChangeFlash: true,
        valueGetter: (p) => {
          const d = p.data; if (!d) return '';
          const names = allocNames(d.allocations);
          if (names.length) return names.join(', ');
          if (d.match && d.match.allocations && d.match.allocations.length) return `${allocNames(d.match.allocations).join(', ')}?`;
          return '';
        },
        cellRenderer: (p) => {
          const d = p.data || {};
          const al = d.allocations || [];
          if (al.length) {
            if (al.length === 1) return esc(allocNames(al)[0]);
            return `<div class="cell-stack"><span>${allocNames(al).map(esc).join(' + ')}</span><small class="num">${al.map((a) => esc(money(a.amount, d.currency))).join(' + ')}</small></div>`;
          }
          if (d.status === 'refunded') return '<span class="cell-muted">Sent back</span>';
          if (d.status === 'ignored') return '<span class="cell-muted">Club income</span>';
          const g = d.match && d.match.allocations;
          if (g && g.length) return `<span><span class="guess">${allocNames(g).map(esc).join(' + ')}</span><span class="guess-q">?</span></span>`;
          return '<span class="cell-muted">No member</span>';
        },
      },
      {
        headerName: 'Confidence', colId: 'confidence', width: 128, enableCellChangeFlash: true,
        valueGetter: (p) => (p.data && p.data.match ? num(p.data.match.confidence) : null),
        comparator: (a, b) => (a ?? -1) - (b ?? -1),
        cellRenderer: (p) => (p.value === null || p.value === undefined ? '' : meter(p.value, { word: false })),
        tooltipValueGetter: (p) => (p.value === null || p.value === undefined ? null : `Match confidence ${pct(p.value)}%. Below ${pct((state.settings || {}).autoApplyThreshold || 0.8)}% it waits for your OK.`),
        getQuickFilterText: () => '',
      },
      {
        headerName: 'Status', field: 'status', colId: 'status', width: 132, enableCellChangeFlash: true,
        cellRenderer: (p) => st(p.value, PAY_ST[p.value] || p.value),
        getQuickFilterText: (p) => PAY_ST[p.value] || p.value,
      },
    ];
    paymentsApi = agGrid.createGrid($('#payments-grid'), {
      columnDefs,
      rowData: [],
      getRowId: (p) => p.data.id,
      defaultColDef: { sortable: true, resizable: true, suppressHeaderMenuButton: true },
      cellFlashDuration: 900,
      cellFadeDuration: 900,
      animateRows: !reduceMotion(),
      tooltipShowDelay: 300,
      rowClassRules: { 'needs-review': (p) => !!(p.data && (p.data.status === 'needs_review' || p.data.status === 'unmatched')) },
      isExternalFilterPresent: () => ui.paymentFilter !== 'all',
      doesExternalFilterPass: (node) => {
        const s = node.data && node.data.status;
        if (ui.paymentFilter === 'attention') return s === 'needs_review' || s === 'unmatched';
        return s === ui.paymentFilter;
      },
      onRowClicked: (e) => { if (e.data) openPayment(e.data.id); },
      onCellKeyDown: (e) => { if (e.event && (e.event.key === 'Enter' || e.event.key === ' ') && e.data) { e.event.preventDefault(); openPayment(e.data.id); } },
      overlayNoRowsTemplate: '<span>No payments yet. Check PayPal payments to bring them in.</span>',
      onGridReady: (e) => restoreColumns('payments', e.api),
      ...gridStateEvents('payments'),
    });
  }

  function renderGrids() {
    if (!membersApi || !state) return;
    const pinnedBefore = membersApi.getPinnedBottomRow(0);
    const prevTotals = pinnedBefore && pinnedBefore.data ? { paid: pinnedBefore.data.paid, outstanding: pinnedBefore.data.outstanding } : null;
    membersApi.setGridOption('rowData', state.members.map((m) => ({ ...m, nicknames: [...(m.nicknames || [])] })));
    const tot = totalRow();
    membersApi.setGridOption('pinnedBottomRowData', state.members.length ? tot : []);
    if (prevTotals && (prevTotals.paid !== tot[0].paid || prevTotals.outstanding !== tot[0].outstanding)) {
      const node = membersApi.getPinnedBottomRow(0);
      if (node) setTimeout(() => membersApi.flashCells({ rowNodes: [node], columns: ['paid', 'outstanding', 'status'] }), 30);
    }
    paymentsApi.setGridOption('rowData', state.payments.map((p) => ({ ...p })));
  }

  // ---------- header, first run, hero ----------
  const isFirstRun = () => !!state && !state.payments.length && !state.proposals.length && !state.log.some((e) => e.kind === 'agent');

  function placeRunButton(inFirstRun) {
    const btn = $('#run-agent');
    const target = inFirstRun ? $('#fr-cta-slot') : $('#actionbar');
    if (btn.parentElement === target) return;
    const hadFocus = document.activeElement === btn;
    target.appendChild(btn);
    if (inFirstRun && !$('#fr-cta-slot .fr-promise')) target.insertAdjacentHTML('beforeend', '<span class="fr-promise">Takes a few seconds. Nothing is sent without you.</span>');
    if (hadFocus) btn.focus();
  }

  function renderHeader() {
    const s = state.settings || {};
    const sum = state.summary || {};
    const mode = state.mode || {};
    const name = clubName();
    $('#club-name').textContent = name;
    document.title = `${name} · Clubkeep`;
    $('#club-period').innerHTML = [esc(s.period), s.dueDate ? `dues due ${esc(day(s.dueDate))}` : null, plural(state.members.length, 'member')].filter(Boolean).join(' · ');

    const sandbox = mode.paypal === 'sandbox';
    const ai = mode.ai === 'local-model' ? 'On-server AI (MiniLM)' : 'Built-in matcher (offline)';
    $('#mode-chip').classList.toggle('is-live', sandbox);
    $('#mode-text').innerHTML = `${sandbox ? '<b>PayPal sandbox</b>' : '<b>Demo data</b> · mock PayPal'} · ${esc(ai)}${mode.adminRequired ? ' · admin token' : ''}`;
    $('#mode-chip').title = mode.ai === 'local-model' ? `AI model ${mode.aiModel || ''} runs on the club’s server` : 'Matching runs offline on the club’s server';
    $('.menu-wrap').hidden = sandbox;
    $('#footer-mode').textContent = `${sandbox ? 'Connected to the PayPal sandbox' : 'Demo: mock PayPal account'} · ${mode.ai === 'local-model' ? `AI model ${mode.aiModel || 'on the server'}` : 'AI: hashed n-gram matcher, offline'}`;

    const first = isFirstRun() && !ui.hideFirstrun;
    document.body.classList.toggle('is-firstrun', first);
    $('#firstrun').hidden = !first;
    $('#hero').hidden = first || isFirstRun();
    placeRunButton(first);

    if (first) {
      $('#fr-ledger').innerHTML = [
        ['Members', String(state.members.length)],
        ['Dues to collect', money2(sum.expected)],
        ['Due date', s.dueDate ? day(s.dueDate, true) : '–'],
        ['Booked so far', money2(sum.collected)],
      ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    } else renderHero();

    const pending = state.proposals.filter((x) => x.status === 'pending').length;
    const ci = $('#count-inbox');
    ci.textContent = pending ? String(pending) : '';
    ci.classList.toggle('hot', pending > 0);
    $('#bar-inbox-count').textContent = pending ? `(${pending})` : '';
    $('#count-members').textContent = String(state.members.length || '');
    $('#count-payments').textContent = state.payments.length ? String(state.payments.length) : '';
  }

  function renderHero() {
    const sum = state.summary || {};
    const expected = num(sum.expected); const collected = num(sum.collected);
    const ms = state.members || [];
    const paidPart = ms.filter((m) => m.status === 'paid' || m.status === 'overpaid').reduce((s, m) => s + Math.min(num(m.paid), num(m.dues)), 0);
    const partialPart = ms.filter((m) => m.status === 'partial').reduce((s, m) => s + num(m.paid), 0);
    const open = Math.max(0, expected - paidPart - partialPart);
    const paidN = num(sum.paid) + num(sum.overpaid); const partN = num(sum.partial); const oweN = num(sum.unpaid);

    const amt = $('#hero-collected');
    const prev = ui.lastCollected;
    if (prev !== null && prev !== collected && !reduceMotion()) countUp(amt, prev, collected);
    else amt.textContent = money(collected);
    $('#hero-expected').textContent = money(expected);
    const bar = $('#hero-bar');
    const total = Math.max(1, paidPart + partialPart + open);
    const segs = [['s-paid', paidPart], ['s-partial', partialPart], ['s-open', open]];
    if (bar.children.length !== 3) bar.innerHTML = segs.map(([c]) => `<span class="${c}"></span>`).join('');
    segs.forEach(([, v], i) => { bar.children[i].style.flexGrow = String(v / total); bar.children[i].style.display = v > 0 ? '' : 'none'; });
    if (prev !== null && prev < collected) { const seg = bar.children[0]; seg.classList.remove('flash'); void seg.offsetWidth; seg.classList.add('flash'); }
    bar.setAttribute('aria-label', `${money(collected)} of ${money(expected)} collected: ${paidN} paid in full, ${partN} partial, ${oweN} still owe.`);
    $('#hero-legend').innerHTML = [
      `<span><i style="background:var(--seg-paid)"></i><b>${paidN}</b> paid</span>`,
      partN ? `<span><i style="background:var(--seg-partial)"></i><b>${partN}</b> partial</span>` : '',
      `<span><i style="background:var(--seg-open)"></i><b>${oweN}</b> owe dues</span>`,
      `<span><b>${esc(money(Math.max(0, expected - collected)))}</b> to collect</span>`,
    ].join('');
    ui.lastCollected = collected;

    const pending = state.proposals.filter((p) => p.status === 'pending');
    const by = (fn) => pending.filter(fn).length;
    const card = $('#hero-decide');
    card.classList.toggle('is-clear', !pending.length);
    $('#hero-open').textContent = String(pending.length);
    $('#hero-open-label').textContent = pending.length ? (pending.length === 1 ? 'decision waiting for you' : 'decisions waiting for you') : 'Nothing needs you';
    $('#hero-open-sub').textContent = pending.length
      ? [[by((p) => p.type === 'match' || p.type === 'review'), 'to check'], [by((p) => p.type === 'refund'), 'refund', 'refunds'], [by((p) => p.type === 'reminder'), 'invoice to send', 'invoices to send']]
        .filter(([n]) => n).map(([n, a, b]) => (b ? plural(n, a, b) : `${n} ${a}`)).join(' · ')
      : 'We’ll flag new payments next time you check.';
    card.setAttribute('aria-label', pending.length ? `${pending.length} ${pending.length === 1 ? 'thing needs' : 'things need'} your OK. Review in To approve.` : 'Nothing needs you. Open To approve.');
  }

  function countUp(el, from, to) {
    const t0 = performance.now(); const dur = 650;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = money(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step); else el.textContent = money(to);
    };
    requestAnimationFrame(step);
  }

  function renderChips() {
    const counts = { all: state.members.length, paid: 0, partial: 0, unpaid: 0, overpaid: 0, owe: 0 };
    for (const m of state.members) { counts[m.status] = (counts[m.status] || 0) + 1; if (m.status === 'unpaid' || m.status === 'partial') counts.owe++; }
    const mchips = [['all', 'All'], ['paid', 'Paid'], ['owe', 'Owe dues'], ['overpaid', 'Overpaid']]
      .filter(([k]) => k !== 'overpaid' || counts.overpaid > 0 || ui.memberFilter === 'overpaid');
    $('#member-chips').innerHTML = mchips.map(([k, label]) =>
      `<button type="button" class="chip" data-filter="${k}" aria-pressed="${ui.memberFilter === k}">${label} <span class="n">${counts[k] || 0}</span></button>`).join('');

    const pc = { all: state.payments.length, attention: 0, matched: 0, refunded: 0, ignored: 0 };
    for (const p of state.payments) {
      if (p.status === 'needs_review' || p.status === 'unmatched') pc.attention++;
      else pc[p.status] = (pc[p.status] || 0) + 1;
    }
    $('#payment-chips').innerHTML = [['all', 'All'], ['attention', 'Need you'], ['matched', 'Matched'], ['refunded', 'Refunded'], ['ignored', 'Not dues']]
      .filter(([k]) => ['all', 'attention', 'matched'].includes(k) || pc[k] > 0 || ui.paymentFilter === k)
      .map(([k, label]) => `<button type="button" class="chip" data-filter="${k}" aria-pressed="${ui.paymentFilter === k}">${label} <span class="n">${pc[k] || 0}</span></button>`).join('');
  }

  // ---------- agent-run timeline ----------
  const STEP_DEFAULTS = [
    { key: 'invoices', label: 'Checking invoice status', api: 'GET /v2/invoicing/invoices' },
    { key: 'transactions', label: 'Fetching incoming payments', api: 'GET /v1/reporting/transactions' },
    { key: 'match', label: 'Reading notes and matching members', api: 'AI matcher' },
    { key: 'plan', label: 'Planning next steps', api: 'Needs your approval' },
  ];
  const STEP_UNIT = { invoices: 'invoices', transactions: 'payments', match: 'booked', plan: 'for you' };
  const RUN_KEY = 'clubkeep.lastRun.v1';

  function renderTimeline() {
    const el = $('#run-timeline');
    const r = ui.run;
    if (!r) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    const live = r.phase === 'live';
    el.classList.toggle('is-live', live);
    el.classList.toggle('is-collapsed', !live && r.collapsed);
    const totalMs = (r.steps || []).reduce((s, x) => s + num(x.ms), 0);
    const sm = r.summary || {};
    let head;
    if (live) {
      const n = Math.min(r.steps.length, r.revealed + 1);
      head = `<span class="rt-pulse" aria-hidden="true"></span><span class="rt-title">Checking PayPal</span><span class="rt-sum">Step <b>${n}</b> of ${r.steps.length}</span>`;
    } else if (r.phase === 'error') {
      head = `<span class="rt-pulse" style="background:var(--bad)" aria-hidden="true"></span><span class="rt-title">The check didn’t finish</span><span class="rt-sum">${esc(r.error || '')}</span>`;
    } else {
      const need = Math.max(0, num(sm.newPayments) - num(sm.autoMatched));
      head = `<span class="rt-pulse" aria-hidden="true"></span><span class="rt-title">Last check · ${esc(clock(r.at))}</span>
        <span class="rt-sum"><b>${num(sm.newPayments)}</b> new ${num(sm.newPayments) === 1 ? 'payment' : 'payments'} · <b>${num(sm.autoMatched)}</b> booked automatically · <b>${need}</b> need you${totalMs ? ` · <b>${totalMs}</b> ms` : ''}</span>
        <span class="spacer"></span>
        <button type="button" class="link-btn subtle rt-toggle" aria-expanded="${!r.collapsed}" aria-controls="rt-steps">${r.collapsed ? 'Show steps' : 'Hide steps'}</button>`;
    }
    const steps = (r.steps || []).map((s, i) => {
      const cls = live ? (i < r.revealed ? 'is-done' : i === r.revealed ? 'is-active' : 'is-waiting') : 'is-done';
      const done = cls === 'is-done';
      const label = done ? s.label : ((STEP_DEFAULTS.find((d) => d.key === s.key) || s).label);
      const ms = num(s.ms) < 1 ? '&lt;1' : esc(s.ms);
      return `<li class="rt-step ${cls}" data-key="${esc(s.key)}">
        <span class="rt-mark">${done ? ICON.check : cls === 'is-active' ? '' : i + 1}</span>
        <div class="rt-body"><span class="rt-label">${esc(label)}</span>${done && s.detail ? ` <span class="rt-detail">· ${esc(s.detail)}</span>` : ''}<br><code class="rt-api">${esc(s.api || '')}</code></div>
        <span class="rt-meta">${done && s.count !== undefined ? `<span class="rt-count">${esc(s.count)}<small>${esc(STEP_UNIT[s.key] || '')}</small></span>` : ''}${done && s.ms !== undefined ? `<span class="rt-ms">${ms} ms</span>` : ''}</span>
      </li>`;
    }).join('');
    el.innerHTML = `<div class="rt-head">${head}</div><ol class="rt-steps" id="rt-steps" aria-label="Steps of the last check">${steps}</ol>`;
  }

  async function playSteps(steps) {
    const r = ui.run;
    r.steps = steps.map((s) => ({ ...s }));
    if (reduceMotion()) { r.revealed = r.steps.length; return; }
    for (let i = r.revealed; i < r.steps.length; i++) {
      r.revealed = i;
      renderTimeline();
      await sleep(450);
    }
    r.revealed = r.steps.length;
  }

  function finishRun(lastRun, at) {
    ui.run = {
      phase: 'done', at: at || new Date().toISOString(), collapsed: ui.run ? ui.run.collapsed : false, userToggled: false,
      steps: (lastRun.steps && lastRun.steps.length ? lastRun.steps : []), revealed: 99,
      summary: { newPayments: lastRun.newPayments, autoMatched: lastRun.autoMatched, proposals: lastRun.proposals },
    };
    store.set(RUN_KEY, JSON.stringify({ at: ui.run.at, steps: ui.run.steps, summary: ui.run.summary }));
    renderTimeline();
  }

  // ---------- inbox ----------
  const GROUPS = [
    { key: 'check', types: ['match', 'review'], title: 'Check these matches', sub: 'We think we know who paid. Confirm to mark them paid.' },
    { key: 'refund', types: ['refund'], title: 'Money going back', sub: 'Refunds go back through PayPal and can’t be undone.' },
    { key: 'reminder', types: ['reminder'], title: 'Still owe dues', sub: 'Each gets a PayPal invoice they can pay in one tap.' },
  ];
  const GLYPH = { match: ICON.match, review: ICON.review, refund: ICON.refund, reminder: ICON.invoice };

  function matchNames(pr) {
    const pay = pr.paymentId ? paymentById(pr.paymentId) : null;
    const al = (pay && pay.match && pay.match.allocations) || [];
    const names = al.length ? allocNames(al) : pr.memberId ? [(memberById(pr.memberId) || {}).name] : [];
    return names.filter(Boolean);
  }

  function approveLabel(pr) {
    switch (pr.type) {
      case 'refund': return pr.amount ? `Refund ${money(pr.amount)}` : 'Refund';
      case 'reminder': return (memberById(pr.memberId) || {}).invoice ? 'Send reminder' : 'Send just this one';
      case 'match': { const n = matchNames(pr); return n.length ? `Mark ${listNames(n.map(first))} as paid` : 'Confirm match'; }
      case 'review': return 'Keep as club income';
      default: return 'Approve';
    }
  }
  function rejectLabel(pr) {
    switch (pr.type) {
      case 'refund': return 'Keep as club income';
      case 'reminder': return 'Skip for now';
      case 'match': return 'Not them';
      case 'review': return 'Leave unsorted';
      default: return 'Reject';
    }
  }

  function doneText(pr) {
    const m = pr.memberId ? memberById(pr.memberId) : null;
    const pay = pr.paymentId ? paymentById(pr.paymentId) : null;
    const who = (m && m.name) || (pay && pay.payerName) || '';
    const amt = pr.amount !== null && pr.amount !== undefined ? money(pr.amount) : '';
    if (pr.status === 'failed') return pr.result || 'PayPal reported an error. Nothing changed.';
    if (pr.status === 'rejected') {
      if (pr.result === 'Resolved manually') return `Sorted by hand${who ? `: ${who}` : ''}`;
      switch (pr.type) {
        case 'refund': return `Kept ${amt} from ${who} as club income`;
        case 'reminder': return `Skipped ${first(who)}’s reminder. Nothing was sent.`;
        case 'match': return `Not ${listNames(matchNames(pr).map(first))}. Left for you to assign.`;
        case 'review': return `Left ${pay ? `${pay.payerName}’s ${amt}` : 'the payment'} unsorted`;
        default: return 'Skipped. Nothing was sent.';
      }
    }
    switch (pr.type) {
      case 'refund': return `Refunded ${amt} to ${pay ? pay.payerName : who}`;
      case 'reminder': return /remind/i.test(pr.receipt && pr.receipt.api || '') ? `Reminded ${who} about their ${amt} invoice` : `Sent ${who} a ${amt} dues invoice`;
      case 'match': { const al = pay && pay.allocations && pay.allocations.length ? allocNames(pay.allocations) : matchNames(pr); return `Marked ${listNames(al)} as paid`; }
      case 'review': return `Kept ${amt} from ${pay ? pay.payerName : 'the payer'} as club income`;
      default: return pr.result || 'Done';
    }
  }
  function receiptChip(pr) {
    if (pr.status !== 'done') return '';
    const r = pr.receipt;
    if (r && (r.id || r.api)) {
      return `<span class="receipt" title="PayPal receipt"><span class="r-api">${esc(r.api || 'PayPal')}</span> ${esc(r.id || '')} <span class="r-status">${esc(r.status || '')}</span></span>`;
    }
    if (pr.type === 'match' || pr.type === 'review') return '<span class="receipt local"><span class="r-api">Club ledger</span> booked</span>';
    return pr.result ? `<span class="receipt local">${esc(pr.result)}</span>` : '';
  }

  function doneRow(pr) {
    const cls = pr.status === 'failed' ? 'st-failed-row' : pr.status === 'rejected' ? 'st-rejected-row' : 'st-done-row';
    const ico = pr.status === 'failed' ? ICON.alert : pr.status === 'rejected' ? ICON.minus : ICON.check;
    return `<article class="card is-done ${cls}${ui.justDone.has(pr.id) ? ' just-done' : ''}" data-proposal-id="${esc(pr.id)}" data-proposal-type="${esc(pr.type)}" data-status="${esc(pr.status)}" tabindex="-1">
      <span class="glyph">${ico}</span>
      <div class="done-line"><span class="dl-text">${esc(doneText(pr))}</span>${receiptChip(pr)}</div>
      <span class="done-time">${esc(pr.decidedAt ? clock(pr.decidedAt) : '')}</span>
    </article>`;
  }

  function marginNote(pr, pay) {
    if (!pay) return '';
    const m = pay.match;
    let reasons = ((m && m.reasons) || []).map(cleanReason);
    if (pr.type === 'refund' && pay.intent && pay.intent.label !== 'dues') {
      reasons = [`Note reads like ${(INTENT[pay.intent.label] || pay.intent.label).toLowerCase()}, not dues (${pct(pay.intent.score)}% sure)`, ...reasons];
    }
    reasons = reasons.slice(0, 3);
    const showMeter = (pr.type === 'match' || pr.type === 'review') && m;
    return `<div class="note-margin">
      <div class="nm-top"><span class="section-label">Agent’s note</span>${showMeter ? meter(m.confidence) : ''}</div>
      <p class="note-quote">${pay.note ? `<q>${highlight(pay.note, noteTokens(pay))}</q>` : '<span class="muted">No note on the payment</span>'} <span class="nq-from">· ${esc(pay.payerName || 'Unknown payer')}, ${esc(day(pay.date))}</span></p>
      ${reasons.length ? `<ul class="reasons">${reasons.map((r) => `<li class="${negReason(r) ? 'neg' : ''}">${negReason(r) ? ICON.x : ICON.check}<span>${esc(r)}</span></li>`).join('')}</ul>` : ''}
    </div>`;
  }

  function messageBlock(pr) {
    if (pr.message === null || pr.message === undefined) return '';
    const id = esc(pr.id);
    const text = has(ui.drafts, pr.id) ? ui.drafts[pr.id] : pr.message;
    const who = pr.type === 'refund' ? `Note to ${esc(first((paymentById(pr.paymentId) || {}).payerName || (memberById(pr.memberId) || {}).name))} with the refund` : 'Message on the PayPal invoice';
    const edited = has(ui.drafts, pr.id) && ui.drafts[pr.id] !== pr.message;
    if (ui.editing.has(pr.id)) {
      return `<div class="msg-editor"><label for="msg-${id}">${who}${edited ? ' · edited' : ''}</label>
        <textarea class="msg" id="msg-${id}" data-proposal-id="${id}" data-fk="msg-${id}" rows="5">${esc(text || '')}</textarea>
        <div><button type="button" class="link-btn subtle toggle-msg" data-proposal-id="${id}" data-fk="tm-${id}" aria-expanded="true" aria-controls="msg-${id}">Done editing</button></div></div>`;
    }
    return `<div class="msg-preview"><span class="section-label" style="margin:0">${who}${edited ? ' · edited' : ''}</span><blockquote>${esc(text || '')}</blockquote>
      <div><button type="button" class="link-btn toggle-msg" data-proposal-id="${id}" data-fk="tm-${id}" aria-expanded="false">Edit message</button></div></div>`;
  }

  function cardHtml(pr, isNew) {
    if (pr.status !== 'pending') return doneRow(pr);
    const pay = pr.paymentId ? paymentById(pr.paymentId) : null;
    const id = esc(pr.id);
    const showDetail = pr.detail && !(pr.type === 'match' && pay && pay.match && (pay.match.reasons || []).length);
    const amountSub = pr.type === 'refund' ? 'back to payer' : pay ? `from ${esc(first(pay.payerName))}` : '';
    let confirm = '';
    let actions;
    if (ui.confirming === pr.id) {
      const payer = (pay && pay.payerName) || (memberById(pr.memberId) || {}).name || 'the payer';
      confirm = `<div class="confirm-strip" role="group" aria-labelledby="cf-${id}">
        <p id="cf-${id}">Send <b>${esc(money2(pr.amount))}</b> back to <strong>${esc(payer)}</strong> through PayPal? This can’t be undone.</p>
        <div class="row">
          <button type="button" class="btn btn-danger confirm-approve" data-proposal-id="${id}" data-fk="cfa-${id}">Yes, refund ${esc(money(pr.amount))}</button>
          <button type="button" class="btn btn-secondary cancel-confirm" data-proposal-id="${id}" data-fk="cfc-${id}">Cancel</button>
        </div></div>`;
      actions = '';
    } else {
      actions = `<div class="card-actions">
        <button type="button" class="btn btn-primary approve" data-proposal-id="${id}" data-fk="ap-${id}" aria-describedby="t-${id}">${esc(approveLabel(pr))}</button>
        <button type="button" class="link-btn reject" data-proposal-id="${id}" data-fk="rj-${id}" aria-describedby="t-${id}">${esc(rejectLabel(pr))}</button>
        <span class="spacer"></span>
        ${pay ? `<button type="button" class="link-btn subtle open-payment" data-payment-id="${esc(pay.id)}" data-fk="op-${id}">${pr.type === 'review' ? 'Pick the member' : 'View payment'}</button>` : ''}
      </div>`;
    }
    return `<article class="card${isNew ? ' is-new' : ''}" data-proposal-id="${id}" data-proposal-type="${esc(pr.type)}" data-status="pending" tabindex="-1" aria-labelledby="t-${id}">
      <span class="glyph" aria-hidden="true">${GLYPH[pr.type] || ICON.info}</span>
      <div class="card-body">
        <h4 class="card-title" id="t-${id}">${esc(pr.title)}</h4>
        ${showDetail ? `<p class="card-detail">${esc(pr.detail)}</p>` : ''}
        ${marginNote(pr, pay)}
        ${messageBlock(pr)}
        ${confirm}
        ${actions}
      </div>
      ${pr.amount !== null && pr.amount !== undefined ? `<div class="card-amount">${esc(money2(pr.amount))}${amountSub ? `<small>${amountSub}</small>` : ''}</div>` : '<div></div>'}
    </article>`;
  }

  function batchHtml(items, isNewFn) {
    const pending = items.filter((p) => p.status === 'pending');
    const decided = items.filter((p) => p.status !== 'pending');
    const selected = pending.filter((p) => !ui.batchOff.has(p.id));
    const selTotal = selected.reduce((s, p) => s + num(p.amount), 0);
    const doneOk = decided.filter((p) => p.status === 'done');
    const rows = items.map((pr) => {
      const m = memberById(pr.memberId) || {};
      const id = esc(pr.id);
      if (pr.status !== 'pending') {
        return `<li class="batch-row is-done${pr.status === 'rejected' ? ' is-rejected' : ''}${ui.justDone.has(pr.id) ? ' just-done' : ''}" data-proposal-id="${id}" data-proposal-type="reminder" data-status="${esc(pr.status)}">
          <div class="br-line"><span class="done-glyph">${pr.status === 'rejected' ? ICON.minus : pr.status === 'failed' ? ICON.alert : ICON.check}</span>
          <div class="done-line"><span class="dl-text">${esc(doneText(pr))}</span>${receiptChip(pr)}</div>
          <span class="done-time">${esc(pr.decidedAt ? clock(pr.decidedAt) : '')}</span></div></li>`;
      }
      const off = ui.batchOff.has(pr.id);
      const editing = ui.editing.has(pr.id);
      const edited = has(ui.drafts, pr.id) && ui.drafts[pr.id] !== pr.message;
      const detail = String(pr.detail || '').split(/(?<=\.)\s/)[0];
      return `<li class="batch-row${off ? ' is-off' : ''}${isNewFn(pr) ? ' row-new' : ''}" data-proposal-id="${id}" data-proposal-type="reminder" data-status="pending">
        <div class="br-line">
          <label class="br-check"><input type="checkbox" class="batch-toggle" data-proposal-id="${id}" data-fk="bt-${id}" ${off ? '' : 'checked'} aria-label="Include ${esc(m.name || pr.title)}"><span class="box">${ICON.check}</span></label>
          <div class="br-who"><b>${esc(m.name || pr.title)}</b><span>${esc(detail)}${edited ? ' · message edited' : ''}</span></div>
          <button type="button" class="link-btn subtle br-msg toggle-msg" data-proposal-id="${id}" data-fk="tm-${id}" aria-expanded="${editing}" aria-controls="edit-${id}">${editing ? 'Close' : 'Edit message'}</button>
          <span class="br-amt">${esc(money2(pr.amount))}</span>
        </div>
        ${editing ? `<div class="br-edit" id="edit-${id}">
          <label class="sr-only" for="msg-${id}">Message on ${esc(first(m.name))}’s PayPal invoice</label>
          <textarea class="msg" id="msg-${id}" data-proposal-id="${id}" data-fk="msg-${id}" rows="5">${esc(has(ui.drafts, pr.id) ? ui.drafts[pr.id] : pr.message || '')}</textarea>
          <div class="row">
            <button type="button" class="btn btn-secondary btn-sm approve" data-proposal-id="${id}" data-fk="ap-${id}">${esc(approveLabel(pr))}</button>
            <button type="button" class="link-btn reject" data-proposal-id="${id}" data-fk="rj-${id}">Skip for now</button>
          </div></div>` : ''}
      </li>`;
    }).join('');
    const previewSrc = selected[0] || pending[0];
    const title = pending.length
      ? `Send dues invoices to ${plural(pending.length, 'member')}`
      : `Sent dues invoices to ${plural(doneOk.length, 'member')}`;
    const amount = pending.length ? pending.reduce((s, p) => s + num(p.amount), 0) : doneOk.reduce((s, p) => s + num(p.amount), 0);
    return `<article class="card batch" data-batch="reminder" aria-labelledby="t-batch">
      <span class="glyph" aria-hidden="true">${ICON.invoice}</span>
      <div class="card-body">
        <h4 class="card-title" id="t-batch">${esc(title)}</h4>
        <p class="card-detail">${pending.length ? 'Untick anyone you want to skip. You can edit each message first.' : 'Invoices are out. Members show as Paid as soon as their invoice is paid.'}</p>
        <ul class="batch-list">${rows}</ul>
        ${ui.previewOpen && previewSrc ? `<div class="preview-box" id="batch-preview">${esc(has(ui.drafts, previewSrc.id) ? ui.drafts[previewSrc.id] : previewSrc.message || '')}<small>Preview for ${esc((memberById(previewSrc.memberId) || {}).name || '')}. Each member gets their own name and amount.</small></div>` : ''}
        ${pending.length ? `<div class="batch-foot">
          <button type="button" class="link-btn toggle-preview" data-fk="tp" aria-expanded="${ui.previewOpen}" aria-controls="batch-preview">${ui.previewOpen ? 'Hide preview' : 'Preview message'}</button>
          <span class="spacer"></span>
          <span class="bf-total"><b>${esc(money(selTotal))}</b> in ${plural(selected.length, 'invoice')}</span>
          <button type="button" class="btn btn-primary" id="approve-all-reminders" data-fk="send-batch" ${selected.length ? '' : 'disabled'}>Send ${plural(selected.length, 'invoice')}</button>
        </div>` : ''}
      </div>
      <div class="card-amount">${esc(money2(amount))}<small>${plural(pending.length || doneOk.length, 'invoice')}</small></div>
    </article>`;
  }

  function autoMatched() {
    const viaProposal = new Set((state.proposals || []).map((p) => p.paymentId).filter(Boolean));
    return (state.payments || []).filter((p) => p.status === 'matched' && !viaProposal.has(p.id) && p.match)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function renderAside() {
    const el = $('#inbox-aside');
    const list = autoMatched();
    const layout = $('.inbox-layout');
    if (!state.payments.length) { el.hidden = true; layout.classList.add('no-aside'); return; }
    el.hidden = false; layout.classList.remove('no-aside');
    const thr = pct((state.settings || {}).autoApplyThreshold || 0.8);
    el.innerHTML = `<div class="aside-block">
        <h3 id="auto-title">Booked automatically <span class="count">${list.length}</span></h3>
        <p>Matches at ${thr}% or more go straight into the ledger. Open one to see why.</p>
        ${list.length ? `<ul class="auto-list">${list.map((p) => `<li><button type="button" class="auto-item open-payment" data-payment-id="${esc(p.id)}" data-fk="au-${esc(p.id)}">
          <span class="ai-who">${esc(p.payerName)} <span class="arrow">→</span> ${allocNames(p.allocations).map(esc).join(' + ')}</span>
          <span class="ai-conf">${pct(p.match.confidence)}%</span>
          <span class="ai-note">${p.note ? `“${highlight(p.note, noteTokens(p))}”` : 'no note'} · ${esc(money(p.amount, p.currency))}</span>
        </button></li>`).join('')}</ul>` : '<p class="muted" style="margin-top:10px;font-size:var(--fs-sm)">Nothing was confident enough to book on its own.</p>'}
      </div>
      <div class="aside-block kbd-hints">
        <kbd>J</kbd> <kbd>K</kbd> next and previous card · <kbd>Esc</kbd> closes a payment
      </div>`;
  }

  function renderInbox() {
    const root = $('#inbox');
    const active = document.activeElement;
    const fk = active && active.dataset ? active.dataset.fk : null;
    const caret = active && active.tagName === 'TEXTAREA' ? [active.selectionStart, active.selectionEnd] : null;

    const proposals = state.proposals || [];
    const firstRender = ui.seen === null;
    const seen = ui.seen || new Set();
    const isNew = (p) => !firstRender && !seen.has(p.id) && p.status === 'pending';
    const pending = proposals.filter((p) => p.status === 'pending');
    const order = (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id));

    let html = '';
    if (!proposals.length) {
      html = isFirstRun()
        ? (ui.busy ? '' : `<p class="empty-quiet">Nothing to approve yet. Check your PayPal payments and we’ll match them to members and suggest next steps.</p>`)
        : `<div class="empty-state">${TICKMARK}<h2>All squared away.</h2><p>No payments need you. We’ll flag new ones next time you check.</p></div>`;
    } else {
      html += pending.length
        ? `<div class="inbox-head"><div><h2>${pending.length} ${pending.length === 1 ? 'thing needs' : 'things need'} your OK</h2><p>Nothing is sent or refunded until you approve it.</p></div></div>`
        : `<div class="empty-state" style="padding-top:8px">${TICKMARK}<h2>All done.</h2><p>Every payment is sorted. We’ll flag new ones next time you check.</p></div>`;
      const known = new Set(GROUPS.flatMap((g) => g.types));
      const groups = GROUPS.concat([{ key: 'other', types: [...new Set(proposals.map((p) => p.type))].filter((t) => !known.has(t)), title: 'Other', sub: '' }]);
      for (const g of groups) {
        const all = proposals.filter((p) => g.types.includes(p.type)).sort(order);
        if (!all.length) continue;
        // decisions from before this page load fold away; this session's stay in place as receipts
        const earlier = all.filter((p) => p.status !== 'pending' && String(p.decidedAt || '') < ui.loadedAt);
        const current = all.filter((p) => !earlier.includes(p));
        if (g.key === 'check') {
          const conf = (p) => num(((paymentById(p.paymentId) || {}).match || {}).confidence);
          current.sort((a, b) => conf(a) - conf(b));
        }
        const open = all.filter((p) => p.status === 'pending').length;
        let body;
        if (g.key === 'reminder') body = current.length ? batchHtml(current, isNew) : '';
        else body = current.map((p) => cardHtml(p, isNew(p))).join('');
        html += `<section class="group" data-group="${esc(g.key)}" aria-labelledby="gh-${esc(g.key)}">
          <div class="group-head"><h3 id="gh-${esc(g.key)}">${esc(g.title)}</h3><span class="count">${open ? `${open} open` : 'done'}</span>${g.sub && open ? `<p>${esc(g.sub)}</p>` : ''}</div>
          <div class="cards">${body}</div>
          ${earlier.length ? `<details class="earlier"><summary class="link-btn subtle">${plural(earlier.length, 'earlier decision')}</summary><div class="cards" style="margin-top:10px">${earlier.map(doneRow).join('')}</div></details>` : ''}
        </section>`;
      }
    }
    root.innerHTML = html;
    ui.seen = new Set(proposals.map((p) => p.id));
    ui.justDone.clear();
    renderAside();
    $$('textarea.msg', root).forEach(autoGrow);
    if (fk) {
      const el = root.querySelector(`[data-fk="${CSS.escape(fk)}"]`) || $('#inbox-aside').querySelector(`[data-fk="${CSS.escape(fk)}"]`);
      if (el) { el.focus({ preventScroll: true }); if (caret) { try { el.setSelectionRange(caret[0], caret[1]); } catch { /* ignore */ } } }
    }
  }
  function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = `${Math.max(132, ta.scrollHeight + 2)}px`; }

  // ---------- history ----------
  function renderActivity() {
    const log = (state.log || []).slice().sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    const label = { agent: 'Agent', paypal: 'PayPal', user: 'You', error: 'Error' };
    if (!log.length) { $('#activity').innerHTML = '<p class="history-empty">Nothing has happened yet.</p>'; return; }
    const today = new Date().toDateString();
    const yest = new Date(Date.now() - 86400000).toDateString();
    const groups = [];
    for (const e of log) {
      const d = new Date(e.at); const k = d.toDateString();
      let g = groups[groups.length - 1];
      if (!g || g.k !== k) { g = { k, d, items: [] }; groups.push(g); }
      g.items.push(e);
    }
    const ids = (s) => esc(s).replace(/\b(INV2-[\w-]+|RF[A-Z0-9]{6,}|[0-9A-Z]{17})\b/g, '<span class="pid">$1</span>');
    $('#activity').innerHTML = groups.map((g) => {
      const name = g.k === today ? 'Today' : g.k === yest ? 'Yesterday' : g.d.toLocaleDateString('en-US', { weekday: 'short' });
      return `<section class="hday"><h3>${name} · ${esc(g.d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</h3><ol class="hlist">${g.items.map((e) => `
        <li class="h-${esc(e.kind)}"><time datetime="${esc(e.at)}">${esc(clock(e.at))}</time><span class="hkind">${esc(label[e.kind] || e.kind)}</span><span class="hmsg">${ids(e.message)}</span></li>`).join('')}</ol></section>`;
    }).join('');
  }

  // ---------- payment side panel (modal, focus trapped, background inert) ----------
  const BACKGROUND = ['#masthead', '#main', '#footer'];
  function setInert(on) {
    for (const sel of BACKGROUND) { const el = $(sel); if (!el) continue; if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); }
  }
  function openPayment(id) {
    const p = paymentById(id);
    if (!p) return;
    if (!ui.assignDraft || ui.assignDraft.paymentId !== id) {
      const base = (p.allocations && p.allocations.length ? p.allocations : (p.match && p.match.allocations) || []);
      ui.assignDraft = { paymentId: id, rows: base.length ? base.map((a) => ({ memberId: a.memberId, amount: num(a.amount) })) : [{ memberId: '', amount: num(p.amount) - num(p.refunded) }] };
    }
    if (!ui.openPaymentId) ui.lastFocus = document.activeElement;
    ui.openPaymentId = id;
    closeMenu();
    $('#scrim').hidden = false;
    $('#payment-panel').hidden = false;
    setInert(true);
    renderPanel();
    $('#pp-close').focus();
  }
  function closePayment() {
    if (!ui.openPaymentId) return;
    ui.openPaymentId = null;
    ui.assignDraft = null;
    $('#scrim').hidden = true;
    $('#payment-panel').hidden = true;
    setInert(false);
    const back = ui.lastFocus;
    if (back && back.focus && document.contains(back)) back.focus();
    else if (ui.tab === 'payments') $('#payments-grid').focus();
  }
  function trapTab(e) {
    if (e.key !== 'Tab' || !ui.openPaymentId) return;
    const items = $$('#payment-panel button, #payment-panel select, #payment-panel input, #payment-panel a[href], #payment-panel [tabindex]:not([tabindex="-1"])').filter((el) => !el.disabled && el.offsetParent !== null);
    if (!items.length) return;
    const firstEl = items[0]; const lastEl = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === firstEl || !$('#payment-panel').contains(document.activeElement))) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && (document.activeElement === lastEl || !$('#payment-panel').contains(document.activeElement))) { e.preventDefault(); firstEl.focus(); }
  }

  function memberOptions(selected) {
    const ms = state.members.slice().sort((a, b) => a.name.localeCompare(b.name));
    return '<option value="">Choose a member…</option>' + ms.map((m) =>
      `<option value="${esc(m.id)}"${m.id === selected ? ' selected' : ''}>${esc(m.name)}${num(m.outstanding) > 0 ? ` (owes ${esc(money(m.outstanding))})` : ''}</option>`).join('');
  }
  function sameAlloc(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    const k = (l) => l.map((x) => `${x.memberId}:${num(x.amount)}`).sort().join('|');
    return k(a) === k(b);
  }

  function renderPanel() {
    const p = paymentById(ui.openPaymentId);
    if (!p) { closePayment(); return; }
    const cur = p.currency || currency();
    const active = document.activeElement;
    const fk = active && active.dataset ? active.dataset.fk : null;
    $('#pp-title').textContent = p.payerName || 'Unknown payer';
    const match = p.match;
    const reasons = ((match && match.reasons) || []).map(cleanReason);
    const alts = (match && match.alternatives) || [];
    const related = (state.proposals || []).filter((x) => x.paymentId === p.id && x.status === 'pending');
    const rows = ui.assignDraft.rows;
    const sum = rows.reduce((s, r) => s + num(r.amount), 0);
    const available = num(p.amount) - num(p.refunded);
    const off = Math.abs(sum - available) > 0.005;
    const toks = noteTokens(p);

    $('#pp-body').innerHTML = `
      <div>
        <div class="pp-top"><span class="pp-amount">${esc(money2(p.amount, cur))}</span>${st(p.status, PAY_ST[p.status] || p.status)}</div>
        <dl class="pp-facts">
          <dt>Date</dt><dd>${esc(day(p.date, true))}</dd>
          <dt>From</dt><dd>${esc(p.payerName || '–')}${p.payerEmail ? ` · <span class="muted">${esc(p.payerEmail)}</span>` : ''}</dd>
          <dt>Looks like</dt><dd>${p.intent ? `${esc(INTENT[p.intent.label] || p.intent.label)} <span class="muted num">${pct(p.intent.score)}%</span>` : '<span class="muted">Not read yet</span>'}</dd>
          <dt>Came in as</dt><dd>${p.source === 'invoice' ? 'PayPal invoice payment' : 'PayPal payment'}</dd>
          ${num(p.refunded) > 0 ? `<dt>Refunded</dt><dd class="num">${esc(money2(p.refunded, cur))}</dd>` : ''}
          <dt>PayPal ID</dt><dd class="num" style="font-size:12.5px">${esc(p.id)}</dd>
        </dl>
      </div>
      <div><span class="section-label">Payment note</span><p class="pp-note">${p.note ? `<q>${highlight(p.note, toks)}</q>` : '<span class="muted" style="font-family:var(--sans);font-size:var(--fs-body)">No note</span>'}</p></div>
      ${(p.allocations && p.allocations.length) ? `<div><span class="section-label">Booked to</span><div class="alloc-list">${p.allocations.map((a) => `<div class="alloc"><span>${esc(a.memberName || a.memberId)}</span><b>${esc(money2(a.amount, cur))}</b></div>`).join('')}</div></div>` : ''}
      <div class="note-margin">
        <div class="nm-top"><span class="section-label">Agent’s note</span>${match ? meter(match.confidence) : ''}</div>
        ${match ? `
          ${!(match.allocations && match.allocations.length) ? '<p class="muted">No member fits this payment.</p>'
            : sameAlloc(match.allocations, p.allocations) ? '<p>Booked exactly as suggested.</p>'
            : `<div><p style="font-size:var(--fs-sm)">Suggested:</p><div class="alloc-list">${match.allocations.map((a) => `<div class="alloc"><span>${esc(a.memberName || a.memberId)}</span><b>${esc(money2(a.amount, cur))}</b></div>`).join('')}</div></div>`}
          ${reasons.length ? `<ul class="reasons">${reasons.map((r) => `<li class="${negReason(r) ? 'neg' : ''}">${negReason(r) ? ICON.x : ICON.check}<span>${esc(r)}</span></li>`).join('')}</ul>` : ''}
        ` : '<p class="muted">Not looked at yet. Check PayPal payments to match it.</p>'}
      </div>
      ${alts.length ? `<div><span class="section-label">Other candidates</span><div class="alts">${alts.map((a) => `
        <div class="alt"><span>${esc(a.memberName || a.memberId)}</span>${meter(a.score, { word: false })}<button type="button" class="mini-btn use-alt" data-member-id="${esc(a.memberId)}" data-fk="alt-${esc(a.memberId)}" aria-label="Use ${esc(a.memberName)}">Use</button></div>`).join('')}</div></div>` : ''}
      ${related.length ? `<div><span class="section-label">Waiting for your OK</span>${related.map((r) => `<p class="card-detail" style="margin-bottom:4px">${esc(r.title)}</p>`).join('')}<button type="button" class="link-btn" data-goto="inbox" data-fk="goto-inbox">Go to To approve</button></div>` : ''}
      <div>
        <span class="section-label">Assign it yourself</span>
        <div class="assign-rows">${rows.map((r, i) => `
          <div class="assign-row" data-row="${i}">
            <select id="as-m-${i}" aria-label="Member ${i + 1}" data-field="memberId" data-fk="as-m-${i}">${memberOptions(r.memberId)}</select>
            <input id="as-a-${i}" type="number" step="0.01" min="0" inputmode="decimal" aria-label="Amount for member ${i + 1}" data-field="amount" data-fk="as-a-${i}" value="${esc(r.amount)}">
            <button type="button" class="icon-btn remove-row" data-fk="as-x-${i}" aria-label="Remove member ${i + 1}">${ICON.x}</button>
          </div>`).join('')}</div>
        <button type="button" class="link-btn" id="add-row" data-fk="add-row" style="margin-top:8px">+ Add another member</button>
        <div class="assign-sum${off ? ' off' : ''}"><span>Assigned <b>${esc(money2(sum, cur))}</b> of ${esc(money2(available, cur))}</span>${off ? '<span>Totals don’t match</span>' : ''}</div>
        <div class="assign-actions">
          <button type="button" class="btn btn-primary" id="save-assign" data-fk="save-assign">Save assignment</button>
          <button type="button" class="btn btn-secondary" id="ignore-payment" data-fk="ignore-payment">Not dues, keep as club income</button>
        </div>
      </div>`;
    if (fk) { const el = $('#pp-body').querySelector(`[data-fk="${CSS.escape(fk)}"]`); if (el) el.focus(); }
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
    renderTimeline();
    renderActivity();
    if (ui.openPaymentId) renderPanel();
  }

  // ---------- tabs ----------
  const TABS = ['inbox', 'members', 'payments', 'activity'];
  function showTab(name, focus = false) {
    if (!TABS.includes(name)) name = 'inbox';
    ui.tab = name;
    for (const t of TABS) {
      const btn = $(`#tab-${t}`);
      const on = t === name;
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
      $(`#panel-${t}`).hidden = !on;
    }
    if (focus) $(`#tab-${name}`).focus();
    try { history.replaceState(null, '', `${location.search}#/${name}`); } catch { /* ignore */ }
  }

  // ---------- actions ----------
  function setBusy(btn, busy, label) {
    btn.disabled = busy;
    btn.classList.toggle('is-busy', busy);
    btn.setAttribute('aria-busy', String(busy));
    const l = btn.querySelector('.label');
    if (l && label) l.textContent = label;
    const sh = btn.querySelector('.label-short');
    if (sh && label) sh.textContent = busy ? 'Checking…' : 'Check payments';
  }

  async function runAgent() {
    if (ui.busy) return;
    ui.busy = true;
    const btn = $('#run-agent');
    const wasFirst = isFirstRun();
    setBusy(btn, true, 'Checking PayPal…');
    document.body.classList.add('is-running');
    if (wasFirst) { ui.hideFirstrun = true; renderHeader(); showTab('inbox'); renderInbox(); }
    ui.run = { phase: 'live', steps: STEP_DEFAULTS.map((s) => ({ ...s })), revealed: 0, at: new Date().toISOString(), collapsed: false };
    renderTimeline();
    if (ui.tab === 'inbox' && wasFirst) $('#run-timeline').scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
    announce('Checking PayPal payments…', 2500, 'info');
    try {
      const data = await api('POST', '/api/agent/run');
      const lr = (data && data.lastRun) || {};
      if (lr.steps && lr.steps.length) await playSteps(lr.steps);
      if (isState(data)) setState(data); else await refresh();
      finishRun(lr, ui.run.at);
      const n = num(lr.newPayments); const a = num(lr.autoMatched);
      const pending = state.proposals.filter((p) => p.status === 'pending').length;
      announce(n
        ? `Found ${plural(n, 'new payment')}. ${a} matched to members; ${Math.max(0, n - a)} need you.`
        : `No new payments. ${pending ? `${plural(pending, 'thing')} still ${pending === 1 ? 'needs' : 'need'} your OK.` : 'Everything is sorted.'}`);
      setTimeout(() => { if (ui.run && ui.run.phase === 'done' && !ui.run.userToggled && !document.documentElement.classList.contains('demo')) { ui.run.collapsed = true; renderTimeline(); } }, reduceMotion() ? 0 : 2600);
    } catch (e) {
      ui.run = { ...(ui.run || {}), phase: 'error', error: e.message };
      renderTimeline();
      fail(`Couldn’t check PayPal: ${e.message}`);
    } finally {
      ui.busy = false;
      ui.hideFirstrun = false;
      document.body.classList.remove('is-running');
      setBusy($('#run-agent'), false, 'Check PayPal payments');
      if (state) renderHeader();
    }
  }

  function decidedMessage(pr, action) {
    if (!pr) return action === 'reject' ? 'Skipped. Nothing was sent.' : 'Done.';
    if (pr.status === 'failed') return null;
    const line = doneText(pr);
    if (pr.status === 'done' && pr.receipt && pr.receipt.id) return `${line}. PayPal ${pr.receipt.id} ${String(pr.receipt.status || '').toLowerCase()}.`;
    return `${line}.`;
  }

  async function decide(id, action, btn) {
    const card = btn && (btn.closest('.card') || btn.closest('.batch-row'));
    if (card) card.classList.add('is-working');
    if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
    try {
      let body;
      if (action === 'approve') {
        const msg = has(ui.drafts, id) ? ui.drafts[id] : undefined;
        body = msg !== undefined ? { message: msg } : {};
      }
      await write('POST', `/api/proposals/${encodeURIComponent(id)}/${action}`, body);
      delete ui.drafts[id];
      ui.editing.delete(id);
      if (ui.confirming === id) ui.confirming = null;
      ui.justDone.add(id);
      const after = state.proposals.find((p) => p.id === id);
      renderInbox();
      const doneEl = $(`#inbox [data-proposal-id="${CSS.escape(id)}"]`);
      if (doneEl && document.activeElement === document.body) doneEl.focus({ preventScroll: true });
      if (after && after.status === 'failed') fail(after.result || 'PayPal reported an error. Nothing changed.');
      else announce(decidedMessage(after, action));
    } catch (e) {
      if (card) card.classList.remove('is-working');
      if (btn) { btn.disabled = false; btn.classList.remove('is-busy'); }
      fail(e.message);
    }
  }

  async function approveBatch(btn) {
    const ids = state.proposals.filter((p) => p.status === 'pending' && p.type === 'reminder' && !ui.batchOff.has(p.id)).map((p) => p.id);
    if (!ids.length) return;
    btn.disabled = true;
    const card = btn.closest('.card'); if (card) card.classList.add('is-working');
    let last = null; let ok = 0; let failed = 0; const errors = [];
    for (let i = 0; i < ids.length; i++) {
      btn.textContent = `Sending ${i + 1} of ${ids.length}…`;
      const id = ids[i];
      try {
        const body = has(ui.drafts, id) ? { message: ui.drafts[id] } : {};
        last = await api('POST', `/api/proposals/${encodeURIComponent(id)}/approve`, body);
        delete ui.drafts[id]; ui.editing.delete(id); ui.justDone.add(id);
        const pr = last.proposals.find((p) => p.id === id);
        if (pr && pr.status === 'failed') { failed++; errors.push(pr.result); } else ok++;
      } catch (e) { failed++; errors.push(e.message); }
    }
    if (isState(last)) setState(last); else await refresh();
    if (ok) announce(`Sent ${plural(ok, 'PayPal invoice')}. Members can pay them in one tap.`);
    if (failed) fail(`${plural(failed, 'invoice')} didn’t go out: ${errors.filter(Boolean)[0] || 'PayPal error'}`);
  }

  async function payInvoice(id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Paying…'; }
    const m = state.members.find((x) => x.invoice && x.invoice.id === id);
    try {
      await write('POST', `/api/demo/pay-invoice/${encodeURIComponent(id)}`);
      const after = m && memberById(m.id);
      announce(`${m ? m.name : 'The member'} paid their invoice through PayPal${after && after.status === 'paid' ? ' and is marked as paid' : ''}.`);
    } catch (e) {
      fail(e.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Member pays'; }
    }
  }

  // promise-based confirm dialog (no window.confirm)
  function confirmDialog({ title, body, ok = 'OK', danger = false }) {
    const d = $('#confirm-dialog');
    $('#confirm-title').textContent = title;
    $('#confirm-body').textContent = body;
    const okBtn = $('#confirm-ok');
    okBtn.textContent = ok;
    okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    const back = document.activeElement;
    return new Promise((resolve) => {
      const done = (v) => { okBtn.onclick = null; $('#confirm-cancel').onclick = null; d.removeEventListener('cancel', onCancel); if (d.open) d.close(); if (back && back.focus && document.contains(back)) back.focus(); resolve(v); };
      const onCancel = (e) => { e.preventDefault(); done(false); };
      okBtn.onclick = () => done(true);
      $('#confirm-cancel').onclick = () => done(false);
      d.addEventListener('cancel', onCancel);
      d.showModal();
      $('#confirm-cancel').focus();
    });
  }

  async function deleteMember(id) {
    const m = memberById(id);
    const yes = await confirmDialog({ title: `Remove ${m ? m.name : 'this member'}?`, body: 'Their payments stay in the payment list. You can add them again later.', ok: 'Remove member', danger: true });
    if (!yes) return;
    try { await write('DELETE', `/api/members/${encodeURIComponent(id)}`); announce(`Removed ${m ? m.name : 'the member'}.`); }
    catch (e) { fail(e.message); }
  }

  async function saveAssign(ignore) {
    const p = paymentById(ui.openPaymentId);
    if (!p) return;
    let allocations = [];
    if (!ignore) {
      allocations = ui.assignDraft.rows.filter((r) => r.memberId).map((r) => ({ memberId: r.memberId, amount: num(r.amount) }));
      if (!allocations.length) { fail('Choose at least one member, or keep the payment as club income.'); return; }
      if (allocations.some((a) => !(a.amount > 0))) { fail('Every amount must be more than zero.'); return; }
    }
    try {
      await write('POST', `/api/payments/${encodeURIComponent(p.id)}/assign`, { allocations });
      announce(ignore ? `Kept ${money(p.amount)} from ${p.payerName} as club income.` : `Booked ${money(p.amount)} from ${p.payerName} to ${listNames(allocations.map((a) => (memberById(a.memberId) || {}).name || a.memberId))}.`);
      ui.assignDraft = null;
      closePayment();
    } catch (e) { fail(e.message); }
  }

  async function resetDemo() {
    closeMenu();
    const yes = await confirmDialog({ title: 'Reset the demo club?', body: 'This puts back the 14 demo members and empties the mock PayPal account. Your changes are lost.', ok: 'Reset demo', danger: true });
    if (!yes) return;
    const btn = $('#reset-demo');
    btn.disabled = true;
    try {
      ui.drafts = {}; ui.editing.clear(); ui.batchOff.clear(); ui.confirming = null; ui.previewOpen = false;
      ui.seen = null; ui.run = null; ui.lastCollected = null; ui.loadedAt = new Date().toISOString();
      store.del(RUN_KEY);
      closePayment();
      await write('POST', '/api/demo/reset');
      announce('Demo reset. Fresh club, empty PayPal inbox.');
    } catch (e) { fail(e.message); }
    finally { btn.disabled = false; }
  }

  async function simulate(body) {
    const before = new Set(state.payments.map((p) => p.id));
    const btn = $('#sim-submit');
    btn.disabled = true;
    try {
      const data = await write('POST', '/api/demo/simulate-payment', body);
      $('#sim-dialog').close();
      $('#sim-form').reset();
      if (data && data.lastRun) finishRun({ ...data.lastRun }, new Date().toISOString());
      if (ui.run) { ui.run.collapsed = true; renderTimeline(); }
      const added = state.payments.find((p) => !before.has(p.id));
      if (added) {
        const who = added.allocations && added.allocations.length ? `booked to ${listNames(allocNames(added.allocations))}`
          : added.status === 'needs_review' ? 'waiting for you in To approve' : 'not matched yet';
        announce(`New PayPal payment: ${money(added.amount)} from ${added.payerName}${added.note ? ` “${added.note}”` : ''}, ${who}.`);
      } else announce('Payment sent to the mock PayPal account.');
    } catch (e) { fail(e.message); }
    finally { btn.disabled = false; }
  }

  function exportCsv() {
    if (!membersApi) { window.location.href = '/api/export.csv'; return; }
    const stamp = new Date().toISOString().slice(0, 10);
    membersApi.exportDataAsCsv({
      fileName: `${clubName().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-members-${stamp}.csv`,
      allColumns: true,
      columnKeys: ['name', 'email', 'nicknames', 'dues', 'paid', 'outstanding', 'status', 'lastPaymentAt', 'invoice'],
      skipPinnedBottom: true,
      processHeaderCallback: (p) => ({ invoice: 'Invoice', lastPaymentAt: 'Last payment' }[p.column.getColId()] || p.column.getColDef().headerName),
      processCellCallback: (p) => {
        const d = p.node.data || {};
        switch (p.column.getColId()) {
          case 'dues': case 'paid': case 'outstanding': return num(p.value).toFixed(2);
          case 'status': return MEMBER_ST[d.status] || d.status;
          case 'lastPaymentAt': return d.lastPaymentAt ? String(d.lastPaymentAt).slice(0, 10) : '';
          case 'invoice': return d.invoice ? `${d.invoice.id} (${d.invoice.status})` : '';
          default: return p.value ?? '';
        }
      },
    });
    announce('Exported the members table as CSV, with your current filter and sort.');
  }

  // ---------- demo menu ----------
  function openMenu(focusFirst = true) {
    $('#demo-menu-list').hidden = false;
    $('#demo-menu').setAttribute('aria-expanded', 'true');
    if (focusFirst) $$('#demo-menu-list .menu-item')[0].focus();
  }
  function closeMenu(returnFocus = false) {
    const list = $('#demo-menu-list');
    if (list.hidden) return;
    list.hidden = true;
    $('#demo-menu').setAttribute('aria-expanded', 'false');
    if (returnFocus) $('#demo-menu').focus();
  }

  // ---------- keyboard: j/k between inbox cards ----------
  function moveCard(dir) {
    const cards = $$('#inbox .card[data-proposal-id][data-status="pending"], #inbox .card.batch');
    if (!cards.length) return;
    const cur = document.activeElement && document.activeElement.closest ? document.activeElement.closest('#inbox .card') : null;
    let i = cards.indexOf(cur);
    i = i < 0 ? (dir > 0 ? 0 : cards.length - 1) : Math.max(0, Math.min(cards.length - 1, i + dir));
    const target = cards[i];
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.focus();
    target.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
  }

  // ---------- event wiring ----------
  function wire() {
    $('#run-agent').addEventListener('click', runAgent);
    $('#reset-demo').addEventListener('click', resetDemo);
    $('#simulate-payment').addEventListener('click', () => {
      closeMenu();
      const d = $('#sim-dialog');
      $('#sim-amount-label').textContent = `Amount (${currency()})`;
      d.showModal();
      $('#sim-payer').focus();
    });
    $('#demo-menu').addEventListener('click', () => ($('#demo-menu-list').hidden ? openMenu(false) : closeMenu()));
    $('#demo-menu').addEventListener('keydown', (e) => {
      const closed = $('#demo-menu-list').hidden;
      if (e.key === 'Escape' && !closed) { e.preventDefault(); closeMenu(true); }
      else if (e.key === 'ArrowDown' || ((e.key === 'Enter' || e.key === ' ') && closed)) { e.preventDefault(); openMenu(true); }
    });
    $('#demo-menu-list').addEventListener('keydown', (e) => {
      const items = $$('#demo-menu-list .menu-item');
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i + items.length - 1) % items.length].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
      else if (e.key === 'Tab') closeMenu();
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) closeMenu(); });

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
        if (!(n > 0)) { fail('The amount must be more than zero.'); return; }
        body.amount = n;
      }
      simulate(body);
    });

    $('#add-member').addEventListener('click', () => {
      const f = $('#member-form');
      f.reset();
      f.elements.dues.value = state && state.settings ? state.settings.defaultDues : '';
      $('#mem-dues-label').textContent = `Dues (${currency()})`;
      $('#member-dialog').showModal();
      $('#mem-name').focus();
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
      if (!body.name || !body.email) { fail('Add a name and an email.'); return; }
      try {
        await write('POST', '/api/members', body);
        $('#member-dialog').close();
        announce(`Added ${body.name}.`);
      } catch (err) { fail(err.message); }
    });
    $('#export-csv').addEventListener('click', exportCsv);
    $('#members-reset-view').addEventListener('click', () => membersApi && resetColumns('members', membersApi));
    $('#payments-reset-view').addEventListener('click', () => paymentsApi && resetColumns('payments', paymentsApi));

    $('#members-search').addEventListener('input', (e) => membersApi && membersApi.setGridOption('quickFilterText', e.target.value));
    $('#payments-search').addEventListener('input', (e) => paymentsApi && paymentsApi.setGridOption('quickFilterText', e.target.value));
    $('#member-chips').addEventListener('click', (e) => {
      const c = e.target.closest('.chip'); if (!c) return;
      ui.memberFilter = c.dataset.filter; renderChips(); membersApi && membersApi.onFilterChanged();
      const again = $(`#member-chips [data-filter="${c.dataset.filter}"]`); if (again) again.focus();
    });
    $('#payment-chips').addEventListener('click', (e) => {
      const c = e.target.closest('.chip'); if (!c) return;
      ui.paymentFilter = c.dataset.filter; renderChips(); paymentsApi && paymentsApi.onFilterChanged();
      const again = $(`#payment-chips [data-filter="${c.dataset.filter}"]`); if (again) again.focus();
    });

    $('#members-grid').addEventListener('click', (e) => {
      const pay = e.target.closest('.pay-invoice');
      if (pay) { e.stopPropagation(); payInvoice(pay.dataset.invoiceId, pay); return; }
      const del = e.target.closest('.delete-member');
      if (del) { e.stopPropagation(); deleteMember(del.dataset.memberId); }
    });

    // tabs: click, arrows, Home/End
    const tablist = $('.tabs');
    tablist.addEventListener('click', (e) => { const t = e.target.closest('[role="tab"]'); if (t) showTab(t.id.replace('tab-', '')); });
    tablist.addEventListener('keydown', (e) => {
      const i = TABS.indexOf(ui.tab);
      const go = { ArrowRight: (i + 1) % TABS.length, ArrowLeft: (i + TABS.length - 1) % TABS.length, Home: 0, End: TABS.length - 1 }[e.key];
      if (go !== undefined) { e.preventDefault(); showTab(TABS[go], true); }
    });

    // global delegation
    document.addEventListener('click', (e) => {
      const go = e.target.closest('[data-goto]');
      if (go) { e.preventDefault(); if (ui.openPaymentId) closePayment(); showTab(go.dataset.goto); if (go.closest('.hero, .actionbar')) $('#tab-inbox').scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' }); return; }
      const ca = e.target.closest('.confirm-approve');
      if (ca) { decide(ca.dataset.proposalId, 'approve', ca); return; }
      const cc = e.target.closest('.cancel-confirm');
      if (cc) { ui.confirming = null; renderInbox(); const b = $(`#inbox [data-fk="ap-${CSS.escape(cc.dataset.proposalId)}"]`); if (b) b.focus(); return; }
      const ap = e.target.closest('.approve');
      if (ap && ap.dataset.proposalId) {
        const pr = state.proposals.find((p) => p.id === ap.dataset.proposalId);
        if (pr && pr.type === 'refund') { ui.confirming = pr.id; renderInbox(); const c = $(`#inbox [data-fk="cfa-${CSS.escape(pr.id)}"]`); if (c) c.focus(); return; }
        decide(ap.dataset.proposalId, 'approve', ap); return;
      }
      const rj = e.target.closest('.reject');
      if (rj && rj.dataset.proposalId) { decide(rj.dataset.proposalId, 'reject', rj); return; }
      const all = e.target.closest('#approve-all-reminders');
      if (all) { approveBatch(all); return; }
      const tm = e.target.closest('.toggle-msg');
      if (tm) {
        const id = tm.dataset.proposalId;
        if (ui.editing.has(id)) ui.editing.delete(id); else ui.editing.add(id);
        renderInbox();
        if (ui.editing.has(id)) { const ta = $(`#msg-${CSS.escape(id)}`); if (ta) ta.focus(); }
        return;
      }
      const tp = e.target.closest('.toggle-preview');
      if (tp) { ui.previewOpen = !ui.previewOpen; renderInbox(); return; }
      const rt = e.target.closest('.rt-toggle');
      if (rt && ui.run) { ui.run.collapsed = !ui.run.collapsed; ui.run.userToggled = true; renderTimeline(); const b = $('.rt-toggle'); if (b) b.focus(); return; }
      const op = e.target.closest('.open-payment');
      if (op) openPayment(op.dataset.paymentId);
    });
    $('#inbox').addEventListener('input', (e) => {
      if (e.target.matches('textarea.msg')) { ui.drafts[e.target.dataset.proposalId] = e.target.value; autoGrow(e.target); }
    });
    $('#inbox').addEventListener('change', (e) => {
      const t = e.target.closest('.batch-toggle');
      if (!t) return;
      if (t.checked) ui.batchOff.delete(t.dataset.proposalId); else ui.batchOff.add(t.dataset.proposalId);
      renderInbox();
    });

    // side panel
    $('#pp-close').addEventListener('click', closePayment);
    $('#scrim').addEventListener('click', closePayment);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ui.openPaymentId && !document.querySelector('dialog[open]')) { e.preventDefault(); closePayment(); return; }
      trapTab(e);
      const tag = (e.target && e.target.tagName) || '';
      if (ui.tab === 'inbox' && !ui.openPaymentId && !document.querySelector('dialog[open]') && !/INPUT|TEXTAREA|SELECT/.test(tag) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'j') { e.preventDefault(); moveCard(1); }
        if (e.key === 'k') { e.preventDefault(); moveCard(-1); }
      }
    });
    const body = $('#pp-body');
    body.addEventListener('change', (e) => {
      const row = e.target.closest('.assign-row'); if (!row) return;
      const r = ui.assignDraft.rows[Number(row.dataset.row)];
      if (e.target.dataset.field === 'memberId') {
        r.memberId = e.target.value;
        const m = memberById(r.memberId);
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
        renderPanel(); $('#add-row').focus(); return;
      }
      const alt = e.target.closest('.use-alt');
      if (alt) {
        const p = paymentById(ui.openPaymentId);
        ui.assignDraft.rows = [{ memberId: alt.dataset.memberId, amount: num(p.amount) - num(p.refunded) }];
        renderPanel(); $('#save-assign').focus(); return;
      }
      if (e.target.closest('#save-assign')) { saveAssign(false); return; }
      if (e.target.closest('#ignore-payment')) saveAssign(true);
    });

    if (narrowMql) {
      const onNarrow = () => { applyResponsiveColumns(); };
      if (narrowMql.addEventListener) narrowMql.addEventListener('change', onNarrow); else if (narrowMql.addListener) narrowMql.addListener(onNarrow);
    }
    window.addEventListener('hashchange', () => { const h = (location.hash || '').replace(/^#\/?/, ''); if (TABS.includes(h) && h !== ui.tab) showTab(h); });
  }

  // ---------- boot ----------
  window.app = { refresh, state: null, showTab, openPayment };

  function boot() {
    wire();
    const fromHash = (location.hash || '').replace(/^#\/?/, '');
    showTab(TABS.includes(fromHash) ? fromHash : 'inbox');
    try {
      const saved = JSON.parse(store.get(RUN_KEY) || 'null');
      if (saved && saved.steps) ui.run = { phase: 'done', at: saved.at, steps: saved.steps, summary: saved.summary || {}, revealed: 99, collapsed: true };
    } catch { /* ignore */ }
    if (window.agGrid && agGrid.createGrid) {
      buildMembersGrid();
      buildPaymentsGrid();
      applyResponsiveColumns();
    } else {
      for (const id of ['#members-grid', '#payments-grid']) {
        $(id).innerHTML = '<div class="empty-state" style="padding:24px"><p>The table library (AG Grid) didn’t load. Check the internet connection and reload the page.</p></div>';
      }
      fail('The table library didn’t load from its CDN. Reload to try again.');
    }
    refresh().then(() => { if (state && isFirstRun()) { ui.run = null; store.del(RUN_KEY); renderTimeline(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
