/* GSTR-3B working (gstr3b.niveshsahayak.in): output tax, eligible input tax credit and tax payable in cash or by credit.
   Figures come from the bills saved in the data home (sales, notes, purchase bills, expenses, self invoices, reverse charge vouchers)
   and every box can be typed over, for example with the ITC shown in GSTR-2B. Set-off order: section 49(5) of the CGST Act and
   Rule 88A (IGST credit first, against IGST, then CGST and SGST/UTGST; CGST and SGST credit never against each other; reverse charge
   tax only in cash, section 49(4)). Workings are saved in the data home under meta 'gstr3b'. Screen words: NS.t('g3.*').
   Credit carried forward (user test 2026-11-06): box 'ITC balance brought forward' = the credit left after every earlier period,
   worked period by period from the typed opening balance (meta gstr3b 'open|<business>' = { m: 'YYYY-MM', igst, cgst, sgst, cess })
   or from the first month with saved bills; a saved working of an earlier period counts as saved, its own brought-forward box only
   when it was typed. Capital goods (App › Fixed assets, ITC ticked) are in 4A(5); a fixed asset sold with GST is in 3.1(a). */
(function () {
  'use strict';
  var $ = NS.$, $$ = NS.$$, esc = NS.esc, num = NS.num, r2 = NS.r2, t = NS.t, money = NS.money, B = window.NSBooks;
  var root = $('#g3');
  function key(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function gstinOk(g) { g = String(g || '').trim().toUpperCase(); return g.length === 15 && NS.gstinCheck(g).ok; }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  /* QRMP GSTR-3B due day by state (Notification 76/2020-CT as amended): 22nd for these states, 24th for the rest */
  var D22 = { '22': 1, '23': 1, '24': 1, '26': 1, '27': 1, '29': 1, '30': 1, '32': 1, '33': 1, '36': 1, '37': 1, '34': 1, '35': 1, '31': 1 };
  /* boxes: id, heads */
  var BOX = [
    ['a', ['txv', 'igst', 'cgst', 'sgst', 'cess']], ['b', ['txv', 'igst', 'cess']], ['c', ['txv']], ['d', ['txv', 'igst', 'cgst', 'sgst', 'cess']], ['e', ['txv']],
    ['i1', ['igst', 'cess']], ['i2', ['igst', 'cess']], ['i3', ['igst', 'cgst', 'sgst', 'cess']], ['i4', ['igst', 'cgst', 'sgst', 'cess']], ['i5', ['igst', 'cgst', 'sgst', 'cess']],
    ['r1', ['igst', 'cgst', 'sgst', 'cess']], ['r2', ['igst', 'cgst', 'sgst', 'cess']],
    ['x1', ['inter', 'intra']], ['x2', ['inter', 'intra']],
    ['cf', ['igst', 'cgst', 'sgst', 'cess']], ['int', ['igst', 'cgst', 'sgst', 'cess']], ['fee', ['cgst', 'sgst']]
  ];
  var GROUPS = [['g3.h.out', ['a', 'b', 'c', 'd', 'e']], ['g3.h.itc', ['i1', 'i2', 'i3', 'i4', 'i5']], ['g3.h.rev', ['r1', 'r2']], ['g3.h.exin', ['x1', 'x2']], ['g3.h.more', ['cf', 'int', 'fee']]];
  var HEADS = { txv: 'g3.c.txv', igst: 'IGST', cgst: 'CGST', sgst: 'SGST/UTGST', cess: 'g3.c.cess', inter: 'g3.c.inter', intra: 'g3.c.intra' };

  var DOCS = [], BIZ = [], META = {}, V = {}, AUTO = {}, S32 = [], WARN = [], SELLER = null, CARRY = null;

  function period() { return periodOf($('#g3-month').value || NS.today().slice(0, 7), $('#g3-ptype').value === 'q'); }
  function periodOf(m, q) {
    var y = +m.slice(0, 4), mo = +m.slice(5, 7), from = mo, to = mo;
    if (q) { from = Math.floor((mo - 1) / 3) * 3 + 1; to = from + 2; }
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return { from: y + '-' + pad(from) + '-01', to: y + '-' + pad(to) + '-' + pad(new Date(y, to, 0).getDate()), q: q, y: y, to_m: to,
      id: q ? y + '-Q' + pad(to) : y + '-' + pad(mo), label: q ? MON[from - 1] + '–' + MON[to - 1] + ' ' + y : MON[mo - 1] + ' ' + y };
  }
  function zero() { var o = {}; BOX.forEach(function (b) { o[b[0]] = {}; b[1].forEach(function (h) { o[b[0]][h] = 0; }); }); return o; }
  function add(o, box, h, v) { o[box][h] = r2(o[box][h] + v); }
  function taxOn(d) { if (d.type === 'cashmemo') return d.withGst === true; if (d.type === 'note') return d.withGst !== false; return d.kind === 'tax'; }
  /* tax of a sale by rate, same rules as docs.js */
  function sale(d) {
    var origin = d.seller && d.seller.state, pos = d.pos || d.buyer && d.buyer.state || origin, intra = !origin || !pos || origin === pos, on = taxOn(d);
    var o = { pos: pos, intra: intra, txv: 0, tax: 0, nil: 0 };
    (d.items || []).concat(B.chargeLines ? B.chargeLines(d) : []).forEach(function (it) {   /* extra charges are taxable value too */
      var q = num(it.qty), rate = num(it.rate);
      if (!it.desc && !rate) return;
      var g = rate * q, txv = r2(g - g * num(it.disc) / 100), p = on ? num(it.gst) : 0;
      if (!p) { o.nil += txv; return; }
      o.txv += txv; o.tax += r2(txv * p / 100);
    });
    o.igst = intra ? 0 : r2(o.tax); o.cgst = intra ? r2(o.tax / 2) : 0; o.sgst = intra ? r2(o.tax / 2) : 0;
    return o;
  }
  function nextOf(P) { var d = new Date(Date.UTC(+P.to.slice(0, 4), +P.to.slice(5, 7), 1)); return periodOf(d.toISOString().slice(0, 7), P.q); }
  function bills(bz, P) {
    var A = zero(), s32 = {}, W = [];
    var mine = DOCS.filter(function (d) { return key(d.seller && d.seller.name) === bz; });
    var inP = mine.filter(function (d) { return d.date >= P.from && d.date <= P.to; });
    var seller = (inP[0] || mine[0] || {}).seller || null;
    var byNo = {}; mine.forEach(function (d) { if (d.type === 'invoice' && d.no) byNo[key(d.no)] = d; });
    inP.forEach(function (d) {
      var ty = d.type || 'invoice';
      var pnote = ty === 'note' && d.side === 'purchase';
      if (ty === 'invoice' || ty === 'cashmemo' || ty === 'note' && !pnote) {
        var sign = ty === 'note' && d.kind !== 'debit' ? -1 : 1, src = ty === 'note' ? byNo[key(d.orig && d.orig.no)] || d : d;
        if (!taxOn(d)) { if (d.kind === 'supply') add(A, 'c', 'txv', sign * sale(d).nil); return; }
        var o = sale(d), sup = src.einv && src.einv.sup || '', exp = /^EXP/.test(sup) || (src.buyer && src.buyer.state) === '96' || src.pos === '96', zr = exp || /^SEZ/.test(sup);
        var box = zr ? 'b' : 'a';
        add(A, box, 'txv', sign * o.txv); add(A, box, 'igst', sign * o.igst);
        if (box === 'a') { add(A, 'a', 'cgst', sign * o.cgst); add(A, 'a', 'sgst', sign * o.sgst); }
        else if (o.cgst) W.push(t('g3.w.zr', { no: d.no }));
        add(A, 'c', 'txv', sign * o.nil);
        if (!zr && !o.intra && !gstinOk(d.buyer && d.buyer.gstin)) {   /* 3.2: inter-state supplies to unregistered persons */
          var s = s32[o.pos] || (s32[o.pos] = { pos: o.pos, txv: 0, igst: 0 }); s.txv = r2(s.txv + sign * o.txv); s.igst = r2(s.igst + sign * o.igst);
        }
      } else if (ty === 'self') {   /* reverse charge on purchases from unregistered suppliers: liability 3.1(d), credit 4A(3) */
        var st = B.itemTotals(d);
        add(A, 'd', 'txv', st.taxable); ['igst', 'cgst', 'sgst'].forEach(function (h) { add(A, 'd', h, st[h]); add(A, 'i3', h, st[h]); });
      } else if (ty === 'voucher' && d.rcm) {
        var tot = (d.lines || []).reduce(function (a, l) { return a + num(l.amt); }, 0), rt = r2(tot * num(d.rcmRate) / 100);
        add(A, 'd', 'txv', tot); add(A, 'd', 'cgst', r2(rt / 2)); add(A, 'd', 'sgst', r2(rt - r2(rt / 2))); add(A, 'i3', 'cgst', r2(rt / 2)); add(A, 'i3', 'sgst', r2(rt - r2(rt / 2)));
        W.push(t('g3.w.rcmv', { no: d.no }));
      } else if (ty === 'pbill' || pnote) {   /* a note against a purchase: debit note = like a purchase return, credit note = like a bill */
        var bt = B.itemTotals(d), sg = (pnote ? d.kind === 'debit' : d.kind === 'return') ? -1 : 1;
        if (pnote ? d.withGst === false : d.noGst) { var other = d.buyer && d.buyer.state && d.seller && d.seller.state && d.buyer.state !== d.seller.state; add(A, 'x1', other ? 'inter' : 'intra', sg * bt.taxable); return; }
        ['igst', 'cgst', 'sgst'].forEach(function (h) { add(A, 'i5', h, sg * bt[h]); });
        if (!gstinOk(d.buyer && d.buyer.gstin)) W.push(t('g3.w.nogstin', { no: d.no || '—', p: d.buyer && d.buyer.name || '' }));
      } else if (ty === 'exp' && d.itc && num(d.gst)) {
        var amt = num(d.amount), g = num(d.gst), itc = r2(amt * g / (100 + g));
        if (d.inter) add(A, 'i5', 'igst', itc); else { add(A, 'i5', 'cgst', r2(itc / 2)); add(A, 'i5', 'sgst', r2(itc - r2(itc / 2))); }
      } else if (ty === 'fa' && num(d.gstAmt)) {   /* App › Fixed assets: GST on capital goods (ITC ticked) is ITC, GST on an asset sold is output tax */
        var fg = num(d.gstAmt), half = r2(fg / 2);
        if (d.kind === 'sale') { add(A, 'a', 'txv', num(d.amount)); if (d.inter) add(A, 'a', 'igst', fg); else { add(A, 'a', 'cgst', half); add(A, 'a', 'sgst', r2(fg - half)); } }
        else if (d.itc) { if (d.inter) add(A, 'i5', 'igst', fg); else { add(A, 'i5', 'cgst', half); add(A, 'i5', 'sgst', r2(fg - half)); } W.push(t('fx.g3_cg', { no: d.no || d.name || '' })); }
      }
    });
    if (A.i5.igst || A.i5.cgst || A.i5.sgst) W.push(t('g3.w.2b'));
    return { A: A, W: W, seller: seller, s32: Object.keys(s32).map(function (k) { return s32[k]; }).filter(function (s) { return s.txv; }) };
  }
  function fromBills() {
    var bz = $('#g3-biz').value, P = period(), r = bills(bz, P);
    SELLER = r.seller; S32 = r.s32; WARN = r.W;
    CARRY = carried(bz, P);
    ['igst', 'cgst', 'sgst', 'cess'].forEach(function (h) { r.A.cf[h] = CARRY.v[h]; });
    AUTO = r.A;
    return r.A;
  }

  /* ---------- credit carried forward from earlier periods ---------- */
  function openOf(bz) { var o = META['open|' + bz]; return o && /^\d{4}-\d{2}$/.test(o.m || '') ? o : null; }
  function four(o) { var v = {}; ['igst', 'cgst', 'sgst', 'cess'].forEach(function (h) { v[h] = r2(Math.max(0, num(o && o[h]))); }); return v; }
  /* the credit that reaches period P: { v: {igst, cgst, sgst, cess}, from: label of the first period worked, n: periods walked } */
  function carried(bz, P) {
    var op = openOf(bz), start = op ? op.m : '', bal = four(op), n = 0;
    if (!start) {
      DOCS.forEach(function (d) { if (key(d.seller && d.seller.name) === bz && d.date && (!start || d.date.slice(0, 7) < start)) start = d.date.slice(0, 7); });
      bal = four(null);
    }
    if (!start || start > P.from.slice(0, 7) && !(op && periodOf(start, P.q).id === P.id)) return { v: four(null), from: '', n: 0 };
    var cur = periodOf(start, P.q), first = cur.label;
    while (cur.from < P.from && n < 240) {
      var sv = META[bz + '|' + cur.id], v;
      if (sv && sv.v) { v = JSON.parse(JSON.stringify(sv.v)); if (!sv.cfTyped) v.cf = Object.assign({}, v.cf, bal); }
      else { v = bills(bz, cur).A; v.cf = Object.assign(v.cf, bal); }
      bal = four(setoff(v).cf); cur = nextOf(cur); n++;
    }
    return { v: bal, from: first, n: n, op: !!op };
  }

  /* ---------- set-off: section 49 and Rule 88A ---------- */
  function setoff(v) {
    var L = { igst: v.a.igst + v.b.igst, cgst: v.a.cgst, sgst: v.a.sgst, cess: v.a.cess + v.b.cess };
    var C = {};
    ['igst', 'cgst', 'sgst', 'cess'].forEach(function (h) {
      C[h] = r2(v.cf[h] + ['i1', 'i2', 'i3', 'i4', 'i5'].reduce(function (a, b) { return a + (v[b][h] || 0); }, 0) - v.r1[h] - v.r2[h]);
    });
    var use = { igst: { igst: 0, cgst: 0, sgst: 0 }, cgst: { igst: 0, cgst: 0 }, sgst: { igst: 0, sgst: 0 }, cess: { cess: 0 } }, left = Object.assign({}, L), cr = Object.assign({}, C);
    function take(from, against, amt) { amt = r2(Math.max(0, Math.min(amt, cr[from], left[against]))); cr[from] = r2(cr[from] - amt); left[against] = r2(left[against] - amt); use[against][from] = r2((use[against][from] || 0) + amt); }
    take('igst', 'igst', left.igst);
    /* IGST credit next goes to the CGST and SGST that their own credit cannot cover, then to what is left */
    var needC = Math.max(0, left.cgst - Math.max(0, cr.cgst)), needS = Math.max(0, left.sgst - Math.max(0, cr.sgst));
    take('igst', 'cgst', needC); take('igst', 'sgst', needS); take('igst', 'cgst', left.cgst); take('igst', 'sgst', left.sgst);
    take('cgst', 'cgst', left.cgst); take('cgst', 'igst', left.igst);
    take('sgst', 'sgst', left.sgst); take('sgst', 'igst', left.igst);
    take('cess', 'cess', left.cess);
    var rcm = { igst: v.d.igst, cgst: v.d.cgst, sgst: v.d.sgst, cess: v.d.cess };
    var cash = {};
    ['igst', 'cgst', 'sgst', 'cess'].forEach(function (h) { cash[h] = r2(Math.max(0, left[h]) + rcm[h] + (v.int[h] || 0) + (v.fee[h] || 0)); });
    return { L: L, C: C, use: use, left: left, rcm: rcm, cash: cash, cf: cr, total: r2(cash.igst + cash.cgst + cash.sgst + cash.cess) };
  }

  /* ---------- screen ---------- */
  function m(n) { return money(n, false); }
  function form() {
    $('#g3-form').innerHTML = GROUPS.map(function (g) {
      return '<fieldset class="g3-g"><legend>' + esc(t(g[0])) + '</legend>' + g[1].map(function (id) {
        var b = BOX.filter(function (x) { return x[0] === id; })[0];
        return '<div class="g3-row"><div class="g3-lbl">' + esc(t('g3.b.' + id)) + '</div><div class="g3-in">' + b[1].map(function (h) {
          return '<label><span>' + esc(/^g3\./.test(HEADS[h]) ? t(HEADS[h]) : HEADS[h]) + '</span><input inputmode="decimal" data-b="' + id + '" data-h="' + h + '" value=""></label>';
        }).join('') + '</div></div>';
      }).join('') + '</fieldset>';
    }).join('');
  }
  function drawOpen() {
    var bz = $('#g3-biz').value, op = openOf(bz) || {}, box = $('#g3-open');
    if (!box) { box = document.createElement('fieldset'); box.id = 'g3-open'; box.className = 'g3-g'; $('#g3-form').appendChild(box); }
    var cf = $('#g3-form input[data-b="cf"]'), row = cf && cf.closest('.g3-row'), note = $('#g3-cfnote');
    if (row && !note) { note = document.createElement('p'); note.id = 'g3-cfnote'; note.className = 'soft'; row.appendChild(note); }
    if (note) note.textContent = CARRY && CARRY.n ? t('fx.g3_carry', { from: CARRY.from, v: m(CARRY.v.igst + CARRY.v.cgst + CARRY.v.sgst + CARRY.v.cess) }) : CARRY && CARRY.op ? t('fx.g3_open1') : t('fx.g3_none');
    box.innerHTML = '<legend>' + esc(t('fx.g3_open')) + '</legend><p class="soft">' + esc(t('fx.g3_openh')) + '</p><div class="g3-in">' +
      '<label><span>' + esc(t('fx.g3_om')) + '</span><input id="g3-om" type="month" value="' + esc(op.m || '') + '"></label>' +
      ['igst', 'cgst', 'sgst', 'cess'].map(function (h) { return '<label><span>' + esc(/^g3\./.test(HEADS[h]) ? t(HEADS[h]) : HEADS[h]) + '</span><input inputmode="decimal" data-open="' + h + '" value="' + (num(op[h]) ? r2(num(op[h])) : '') + '"></label>'; }).join('') +
      '</div><p class="row"><button type="button" class="btn sm" data-do="open-save">' + esc(t('fx.g3_osave')) + '</button></p>';
  }
  function fill(v) { $$('#g3-form input[data-b]').forEach(function (i) { var x = v[i.dataset.b][i.dataset.h]; i.value = x ? r2(x) : ''; i.classList.toggle('typed', !!(AUTO[i.dataset.b] && r2(AUTO[i.dataset.b][i.dataset.h]) !== r2(x || 0))); }); }
  function read() { var v = zero(); $$('#g3-form input[data-b]').forEach(function (i) { v[i.dataset.b][i.dataset.h] = r2(num(i.value)); }); return v; }
  function due(P) {
    var st = SELLER && SELLER.state, d;
    if (!P.q) d = new Date(P.y, P.to_m, 20);
    else d = new Date(P.y, P.to_m, D22[st] ? 22 : 24);
    return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear();
  }
  function draw() {
    V = read();
    var P = period(), x = setoff(V), s = SELLER || {};
    var row = function (lbl, a) { return '<tr><td>' + esc(lbl) + '</td>' + a.map(function (n) { return '<td class="n">' + m(n) + '</td>'; }).join('') + '</tr>'; };
    var hd = '<tr><th></th><th class="n">IGST</th><th class="n">CGST</th><th class="n">SGST/UTGST</th><th class="n">' + esc(t('g3.c.cess')) + '</th></tr>';
    var four = function (o) { return [o.igst || 0, o.cgst || 0, o.sgst || 0, o.cess || 0]; };
    var h = '<div class="g1-print-hd"><b>' + esc(s.name || '') + '</b>' + (s.gstin ? ' · GSTIN ' + esc(s.gstin) : '') + '<br>' + esc(t('g3.for', { p: P.label })) + '</div>' +
      '<div class="g1-tiles"><div><span>' + esc(t('g3.k.out')) + '</span><b>' + m(x.L.igst + x.L.cgst + x.L.sgst + x.L.cess) + '</b></div><div><span>' + esc(t('g3.k.itc')) + '</span><b>' + m(x.C.igst + x.C.cgst + x.C.sgst + x.C.cess) + '</b></div>' +
      '<div><span>' + esc(t('g3.k.rcm')) + '</span><b>' + m(x.rcm.igst + x.rcm.cgst + x.rcm.sgst + x.rcm.cess) + '</b></div><div class="hi"><span>' + esc(t('g3.k.cash')) + '</span><b>' + m(x.total) + '</b></div>' +
      '<div><span>' + esc(t('g3.k.due')) + '</span><b>' + esc(due(P)) + '</b></div></div>' +
      (WARN.length ? '<div class="callout g1-warn"><b>' + esc(t('g3.check')) + '</b><ul>' + WARN.slice(0, 30).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<h3>' + esc(t('g3.h.pay')) + '</h3><div class="g1-tw"><table class="g1-t">' + hd + '<tbody>' +
      row(t('g3.p.liab'), four(x.L)) + row(t('g3.p.byigst'), [x.use.igst.igst, x.use.cgst.igst, x.use.sgst.igst, 0]) + row(t('g3.p.bycgst'), [x.use.igst.cgst || 0, x.use.cgst.cgst, 0, 0]) +
      row(t('g3.p.bysgst'), [x.use.igst.sgst || 0, 0, x.use.sgst.sgst, 0]) + row(t('g3.p.bycess'), [0, 0, 0, x.use.cess.cess]) +
      row(t('g3.p.left'), four(x.left)) + row(t('g3.p.rcm'), four(x.rcm)) + row(t('g3.p.int'), [V.int.igst, V.int.cgst + V.fee.cgst, V.int.sgst + V.fee.sgst, V.int.cess]) +
      '</tbody><tfoot>' + row(t('g3.p.cash'), four(x.cash)) + '</tfoot></table></div>' +
      '<h3>' + esc(t('g3.h.cf')) + '</h3><div class="g1-tw"><table class="g1-t">' + hd + '<tbody>' + row(t('g3.p.avail'), four(x.C)) + row(t('g3.p.cf'), four(x.cf)) + '</tbody></table></div>' +
      (S32.length ? '<h3>' + esc(t('g3.h.32')) + '</h3><div class="g1-tw"><table class="g1-t"><tr><th>' + esc(t('g3.c.pos')) + '</th><th class="n">' + esc(t('g3.c.txv')) + '</th><th class="n">IGST</th></tr><tbody>' +
        S32.map(function (s) { return '<tr><td>' + esc(s.pos + '-' + NS.stateName(s.pos)) + '</td><td class="n">' + m(s.txv) + '</td><td class="n">' + m(s.igst) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
      (x.C.igst < 0 || x.C.cgst < 0 || x.C.sgst < 0 ? '<p class="callout">' + esc(t('g3.w.neg')) + '</p>' : '') +
      '<p class="soft g3-print-boxes">' + esc(t('g3.note')) + '</p>';
    $('#g3-out').innerHTML = h;
    $('#g3-boxes').innerHTML = GROUPS.map(function (g) { return '<b>' + esc(t(g[0])) + '</b>: ' + g[1].map(function (id) { var b = BOX.filter(function (z) { return z[0] === id; })[0]; return esc(t('g3.b.' + id)) + ' ' + b[1].map(function (hh) { return m(V[id][hh]); }).join(' / '); }).join('; '); }).join('<br>');
  }
  function ident() { return $('#g3-biz').value + '|' + period().id; }
  function load(fresh) {
    fromBills();
    var saved = !fresh && META[ident()];
    if (saved && !saved.cfTyped) { saved = JSON.parse(JSON.stringify(saved)); ['igst', 'cgst', 'sgst', 'cess'].forEach(function (h) { saved.v.cf[h] = AUTO.cf[h]; }); }
    fill(saved ? saved.v : AUTO);
    drawOpen();
    $('#g3-saved').textContent = saved ? t('g3.loaded', { d: new Date(saved.at).toLocaleString('en-IN') }) : '';
    draw();
    try { localStorage.setItem('ns-g3', JSON.stringify({ biz: $('#g3-biz').value, p: $('#g3-ptype').value, m: $('#g3-month').value })); } catch (e) {}
  }
  function start() {
    form();
    document.addEventListener('ns-lang', function () { var v = read(); form(); fill(v); drawOpen(); draw(); });   /* the language pack can arrive after the first drawing */
    NSStore.ready().then(function () { return Promise.all([NSStore.list('doc'), NSStore.list('biz'), NSStore.meta('gstr3b')]); }).then(function (x) {
      DOCS = x[0] || []; BIZ = x[1] || []; META = x[2] || {};
      var seen = {}, bl = [];
      BIZ.concat(DOCS.map(function (d) { return d.seller; })).forEach(function (s) { var k = key(s && s.name); if (k && !seen[k]) { seen[k] = 1; bl.push([k, s.name + (s.gstin ? ' (' + s.gstin + ')' : '')]); } });
      $('#g3-biz').innerHTML = bl.length ? bl.map(function (b) { return '<option value="' + esc(b[0]) + '">' + esc(b[1]) + '</option>'; }).join('') : '<option value="">' + esc(t('g3.nobiz')) + '</option>';
      var sv = {}; try { sv = JSON.parse(localStorage.getItem('ns-g3') || '{}'); } catch (e) {}
      var prev = new Date(); prev.setDate(1); prev.setMonth(prev.getMonth() - 1);
      $('#g3-month').value = sv.m || prev.getFullYear() + '-' + ('0' + (prev.getMonth() + 1)).slice(-2);
      if (sv.biz && bl.some(function (b) { return b[0] === sv.biz; })) $('#g3-biz').value = sv.biz;
      if (sv.p) $('#g3-ptype').value = sv.p;
      $('#g3-status').textContent = t(NSStore.mode() === 'vault' ? 'g1.vault' : 'g1.local', { n: DOCS.length });
      load();
    }).catch(function () { $('#g3-status').textContent = t('g1.fail'); });
    root.addEventListener('change', function (e) { if (e.target.closest('.g1-ctl')) load(); });
    root.addEventListener('input', function (e) { if (e.target.matches('#g3-form input[data-b]')) { e.target.classList.add('typed'); draw(); } });
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var d = b.dataset.do;
      if (d === 'refill') { load(true); NS.toast(t('g3.refilled')); }
      else if (d === 'open-save') {
        var bz = $('#g3-biz').value, mo = $('#g3-om').value, o = { m: mo };
        $$('[data-open]').forEach(function (i) { o[i.dataset.open] = r2(num(i.value)); });
        if (mo) META['open|' + bz] = o; else delete META['open|' + bz];
        NSStore.meta('gstr3b', META).then(function () { NS.toast(t('g3.saved')); load(); });
      }
      else if (d === 'save') { META[ident()] = { v: read(), at: Date.now(), cfTyped: !!$$('#g3-form input[data-b="cf"].typed').length }; NSStore.meta('gstr3b', META).then(function () { NS.toast(t('g3.saved')); $('#g3-saved').textContent = t('g3.loaded', { d: new Date().toLocaleString('en-IN') }); }); }
      else if (d === 'print') window.print();
      else if (d === 'share') NS.sharePdf([$('#g3-out')], 'GSTR-3B ' + ((SELLER && SELLER.gstin) || '') + ' ' + period().label, 'a4', 'GSTR-3B ' + period().label, 'GSTR-3B working ' + period().label);
    });
  }
  if (window.NS_G3_TEST) window.NS_G3_TEST({ setoff: setoff, bills: bills, carried: carried, periodOf: periodOf, use: function (docs, meta) { DOCS = docs; META = meta || {}; } });
  if (!root) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
