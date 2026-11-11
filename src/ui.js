/* ===== Screens. Every visible string goes through t() so it can be shown in Arabic (see i18n.js). ===== */
const CLOUD = window.g197cloud;
const $ = (id) => document.getElementById(id);
const el = (tag, attrs, ...kids) => {
  const n = document.createElement(tag);
  for (const k in (attrs || {})) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'value') n.value = v; else n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...kids.flat().filter((k) => k != null && k !== false));
  return n;
};
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const S = { sales: null, salesError: false, counts: {}, cars: [], db: null, cur: ls.get('g197-cur', 'USD'), unit: ls.get('g197-unit', 'mi'), lang: ls.get('g197-lang', 'en'), theme: ls.get('g197-theme', 'light'), mode: 'signin', loginMsg: '', filter: 'all', rec: null, remOpen: false };
if (!FX[S.cur]) S.cur = 'USD';

function t(s, v) { let o = (S.lang === 'ar' && AR[s]) || s; if (v) for (const k in v) o = o.split('{' + k + '}').join(v[k]); return o; }
const CURS = ['USD', 'GBP', 'EUR', 'QAR', 'AED', 'SAR'];
const cash = (n, cur) => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(n); } catch (e) { return n + ' ' + cur; } };
const money = (gbp) => gbp == null ? '—' : cash(Math.round(gbp / FX[S.cur] / 100) * 100, S.cur);
const num = (n) => new Intl.NumberFormat('en-US').format(n);
const fmtDate = (d) => { try { return new Date(d + 'T00:00:00Z').toLocaleDateString(S.lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return d; } };
const today = () => new Date().toISOString().slice(0, 10);
const shortModel = (m) => (m || '').replace('Porsche ', '');
const catOf = (name) => CATALOG.find((m) => m.name === name) || null;
const unitName = (u) => t((u || S.unit) === 'km' ? 'km' : 'mi');
const dist = (mi) => S.unit === 'km' ? Math.round(mi * 1.609344) : Math.round(mi);
const distText = (mi) => num(dist(mi)) + ' ' + unitName();
const carMiles = (c) => { const n = Number(c.miles); if (!n) return null; return c.unit === 'km' ? Math.round(n * 0.621371) : n; };
const carOdo = (c) => c.miles ? num(+c.miles) + ' ' + unitName(c.unit || 'mi') : '';
const pct = (d) => (d >= 0 ? '+' : '−') + Math.abs(d * 100).toFixed(0) + '%';
function toast(msg) { const b = $('toast'); b.firstChild.textContent = msg; b.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { b.hidden = true; }, 2200); }

function modelOf(car) { if (car.model && car.model !== 'auto' && car.model !== 'other') return car.model; if (car.model === 'other') return null; return suggestModel(car, decodeVin(car.vin)).model; }
function estimate(car) {
  if (!S.sales) return null;
  const model = modelOf(car); if (!model) return null;
  const m = marketFor(S.sales, model, carMiles(car), today()); if (!m.total) return null;
  if (m.enoughComps) return { gbp: m.compMedian, low: m.compLow, high: m.compHigh, basis: 'similar', n: m.comps.length, model };
  if (m.n12 >= 3) return { gbp: m.median12, low: m.low12, high: m.high12, basis: 'year', n: m.n12, model };
  return { gbp: m.medianAll, basis: 'all', n: m.total, model };
}
function remStatus(car, r) {
  const now = today(), soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), odo = +car.miles || 0;
  if ((r.date && r.date < now) || (r.odo && odo && odo >= +r.odo)) return 'overdue';
  if ((r.date && r.date <= soon) || (r.odo && odo && +r.odo - odo <= 500)) return 'soon';
  return 'later';
}
const dueOf = (car) => (car.reminders || []).map((r) => ({ r, car, st: remStatus(car, r) })).filter((x) => x.st !== 'later');

/* ----- routing ----- */
function route() { const p = (location.hash || '#/home').replace(/^#\/?/, '').split('/').map(decodeURIComponent); return { name: p[0] || 'home', a: p[1], b: p[2] }; }
function nav(h) { if (location.hash === h) render(); else location.hash = h; window.scrollTo(0, 0); }
window.addEventListener('hashchange', () => { S.rec = null; S.remOpen = false; render(); });

/* ----- small builders ----- */
const panel = (title, note, ...kids) => el('section', { class: 'panel' }, title ? el('h2', { text: title }) : null, note ? el('p', { class: 'muted small', text: note }) : null, ...kids);
const stat = (label, value, note, cls) => el('div', { class: 'stat' }, el('span', { class: 'label', text: label }), el('b', { class: cls || '', text: value }), note ? el('span', { class: 'muted small', text: note }) : null);
const table = (heads, rows) => el('div', { class: 'tablebox' }, el('table', {}, el('thead', {}, el('tr', {}, heads.map((h) => el('th', { class: h[1] || '', text: h[0] })))), el('tbody', {}, rows)));
const field = (label, input, hint) => { const id = input.id || (input.id = 'f' + Math.random().toString(36).slice(2, 8)); return el('div', { class: 'field' }, el('label', { for: id, text: label }), input, hint ? el('span', { class: 'hint', text: hint }) : null); };
const select = (opts, value, attrs) => { const s = el('select', attrs || {}, opts.map((o) => el('option', { value: o[0], text: o[1] }))); s.value = value; return s; };
const svgIcon = (d) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = d; return s; };
const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  garage: '<path d="M3 10.5 12 5l9 5.5V20H3z"/><path d="M7 20v-6h10v6"/><path d="M7 17h10"/>',
  market: '<path d="M4 19.5h16"/><path d="M5 15.5l4.5-5 3.5 3 6-7.5"/><path d="M15.5 6H19v3.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', pdf: '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4"/><path d="M12 11v6m0 0-2.5-2.5M12 17l2.5-2.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.2"/>'
};
const ico = (name, label) => [svgIcon(ICONS[name]), el('span', { text: label })];
const LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21.5" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="24" cy="24" r="16.5" fill="none" stroke="currentColor" stroke-width="1"/><text x="24" y="29.5" text-anchor="middle" font-family="Archivo, Arial, sans-serif" font-weight="700" font-size="15" letter-spacing="-.5" fill="currentColor">197</text></svg>';
const brand = (href) => { const a = el(href ? 'a' : 'div', { class: 'brand', href }); a.innerHTML = LOGO; a.append(el('b', { text: 'Garage 197' })); return a; };
const skel = (h) => el('div', { class: 'skel', style: 'min-height:' + h });
function trendOf(model) {
  const c = catOf(model); if (!c || !c.median2020 || !S.sales) return null;
  const d = today(), y1 = (+d.slice(0, 4) - 1) + d.slice(4), v = S.sales.filter((r) => r.model === model && r.date >= y1).map((r) => r.gbp);
  return v.length >= 5 ? (median(v) - c.median2020) / c.median2020 : null;
}
const CAR_SVG = '<svg viewBox="0 0 64 32" fill="currentColor" aria-hidden="true"><path d="M4 22c0-4 3-6 9-7l6-7c2-2 4-3 8-3h9c6 0 10 3 14 8l6 2c3 1 4 3 4 6v2h-5a6 6 0 0 0-12 0H23a6 6 0 0 0-12 0H4zm19-8h11V8h-6c-2 0-3 1-4 2zm14 0h9c-3-4-5-6-9-6z"/><circle cx="17" cy="24" r="4.5"/><circle cx="49" cy="24" r="4.5"/></svg>';
function photoBox(car) {
  const box = el('div', { class: 'photo' }); box.innerHTML = CAR_SVG;
  if (car && car.photo && car.photo.path) CLOUD.fileUrl(car.photo.path).then((url) => { const im = el('img', { src: url, alt: car.name || '' }); im.addEventListener('error', () => { box.innerHTML = CAR_SVG; }); box.replaceChildren(im); }).catch(() => {});
  return box;
}
async function shrink(file) {
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
  } catch (e) { return file; }
}
async function saveCar(car, patch) { const { id, ...body } = car; await S.db.collection('cars').doc(id).set({ ...body, ...patch, updatedAt: new Date().toISOString() }); }
const mlink = (model) => el('a', { href: '#/model/' + encodeURIComponent(model), text: shortModel(model) });

/* ----- login ----- */
function langToggle() { return el('button', { type: 'button', class: 'linkbtn', text: S.lang === 'ar' ? 'English' : 'العربية', onclick: () => { S.lang = S.lang === 'ar' ? 'en' : 'ar'; ls.set('g197-lang', S.lang); render(); } }); }
function viewLogin() {
  const status = el('p', { class: 'status', role: 'status', text: S.loginMsg }); S.loginMsg = '';
  const email = el('input', { type: 'email', autocomplete: 'email', inputmode: 'email', id: 'a-email' });
  const pass = el('input', { type: 'password', autocomplete: S.mode === 'newpass' ? 'new-password' : 'current-password', id: 'a-pass' });
  const say = (m) => { status.textContent = m; };
  const friendly = (e, create) => {
    const m = ((e && e.message) || '').toLowerCase() + ' ' + ((e && e.code) || '');
    if (/invalid login|invalid_credentials/.test(m)) return t('That email and password don’t match an account. Check them, or press Create account.');
    if (/already registered|user_already_exists/.test(m)) return t('That email already has an account. Press Sign in instead.');
    if (/rate limit|over_email_send_rate_limit/.test(m)) return t('Too many emails have been requested. Wait a few minutes and try again.');
    if (/failed to fetch|networkerror|load failed/.test(m)) return t('Couldn’t reach the server. Check your connection and try again.');
    return t(create ? 'Couldn’t create the account: {m}' : 'Couldn’t sign in: {m}', { m: (e && e.message) || '' });
  };
  let body;
  if (S.mode === 'newpass') {
    body = el('form', { novalidate: true, onsubmit: async (ev) => {
      ev.preventDefault(); if (pass.value.length < 8) { say(t('Use a password of at least 8 characters.')); return; }
      say(t('Saving…'));
      try { await CLOUD.setPassword(pass.value); S.mode = 'signin'; toast(t('Password changed')); nav('#/home'); render(); } catch (e) { say(t('Couldn’t change the password: {m}', { m: e.message })); }
    } }, el('p', { class: 'small', text: t('Choose a new password for {email}.', { email: CLOUD.user ? CLOUD.user.email : '' }) }), field(t('New password'), pass), el('div', { class: 'row' }, el('button', { type: 'submit', class: 'btn primary', text: t('Save new password') })));
  } else if (S.mode === 'forgot') {
    body = el('form', { novalidate: true, onsubmit: async (ev) => {
      ev.preventDefault(); const e = email.value.trim(); if (!/^\S+@\S+\.\S+$/.test(e)) { say(t('Enter your email address.')); return; }
      say(t('Sending…'));
      try { await CLOUD.recover(e); say(t('If that email has an account, a reset link is on its way. Open it on this device to choose a new password.')); } catch (err) { say(friendly(err)); }
    } }, el('p', { class: 'small', text: t('Enter your email and we will send you a link to choose a new password.') }), field(t('Email'), email),
      el('div', { class: 'row' }, el('button', { type: 'submit', class: 'btn primary', text: t('Send reset link') }), el('button', { type: 'button', class: 'btn', text: t('Back to sign in'), onclick: () => { S.mode = 'signin'; render(); } })));
  } else {
    const go = async (create) => {
      const e = email.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(e)) { say(t('Enter your email address.')); email.focus(); return; }
      if (pass.value.length < 8) { say(t('Use a password of at least 8 characters.')); pass.focus(); return; }
      say(t(create ? 'Creating your account…' : 'Signing in…'));
      try { const r = await CLOUD.sign(e, pass.value, create); if (r.confirm) say(t('Account created. Open the confirmation email we sent, then sign in here.')); else { location.hash = '#/home'; render(); } }
      catch (err) { say(friendly(err, create)); }
    };
    body = el('form', { novalidate: true, onsubmit: (ev) => { ev.preventDefault(); go(false); } }, field(t('Email'), email), field(t('Password'), pass),
      el('div', { class: 'row' }, el('button', { type: 'submit', class: 'btn primary', id: 'b-signin', text: t('Sign in') }), el('button', { type: 'button', class: 'btn', id: 'b-signup', text: t('Create account'), onclick: () => go(true) })),
      el('button', { type: 'button', class: 'linkbtn small', id: 'b-forgot', text: t('Forgot your password?'), onclick: () => { S.mode = 'forgot'; render(); } }));
  }
  const art = el('div', { class: 'art' }, brand(), el('div', {}), el('p', { text: t('Track what classic Porsches sell for, keep your cars and their history in one place, and see how your garage sits against the market.') }));
  art.children[1].innerHTML = CAR_SVG.replace('<svg ', '<svg class="car" ');
  return el('div', { class: 'signin' }, art,
    el('div', { class: 'form' }, el('div', { class: 'row between' }, el('h2', { text: t(S.mode === 'newpass' ? 'Choose a new password' : S.mode === 'forgot' ? 'Reset your password' : 'Sign in'), style: 'font-size:1.4rem' }), langToggle()), body, status,
      S.mode === 'signin' ? el('p', { class: 'muted small', text: t('New here? Enter your email, choose a password of at least 8 characters and press Create account.') }) : null));
}

/* ----- market read-out ----- */
function searchLinks(q) {
  const mk = (label, site, extra) => el('a', { href: 'https://www.google.com/search?q=' + encodeURIComponent(q + ' ' + (extra || 'sold') + ' site:' + site), target: '_blank', rel: 'noopener', text: label });
  return el('div', { class: 'links' }, mk(t('Classic.com results'), 'classic.com'), mk(t('The Classic Valuer results'), 'theclassicvaluer.com'), mk(t('Bring a Trailer results'), 'bringatrailer.com'), mk(t('Collecting Cars results'), 'collectingcars.com'), mk(t('For sale on Dubizzle'), 'dubizzle.com', 'for sale'));
}
function drawChart(host, m, miles) {
  host.replaceChildren();
  const pts = m.points; if (pts.length < 2) return;
  const W = Math.max(300, host.clientWidth || 600), H = 250, ml = 58, mr = 14, mt = 20, mb = 36, u = S.unit === 'km' ? 1.609344 : 1;
  const xMax = Math.max(...pts.map((p) => p.miles), miles || 0) * u * 1.06, yVals = pts.map((p) => p.gbp / FX[S.cur]);
  const step = (max, n) => { const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw); };
  const ys = step(Math.max(...yVals) * 1.05, 4), yTop = Math.ceil(Math.max(...yVals) * 1.05 / ys) * ys, xs = step(xMax, W < 420 ? 3 : 5);
  const x = (v) => ml + (v * u / xMax) * (W - ml - mr), y = (v) => H - mb - (v / yTop) * (H - mt - mb);
  const NS = 'http://www.w3.org/2000/svg';
  const s = (tag, a, text) => { const n = document.createElementNS(NS, tag); for (const k in a) n.setAttribute(k, a[k]); if (text != null) n.textContent = text; return n; };
  const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': t('Sold price against distance driven for recent sales') });
  const kfmt = (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v / 1000) + 'k';
  for (let v = 0; v <= yTop + 1; v += ys) { svg.append(s('line', { x1: ml, x2: W - mr, y1: y(v), y2: y(v), stroke: 'var(--line)', 'stroke-width': 1 })); svg.append(s('text', { x: ml - 8, y: y(v) + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 }, kfmt(v))); }
  for (let v = 0; v <= xMax; v += xs) svg.append(s('text', { x: ml + (v / xMax) * (W - ml - mr), y: H - mb + 16, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 }, Math.round(v / 1000) + 'k'));
  svg.append(s('text', { x: W - mr, y: H - 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 }, t('Distance at sale ({u})', { u: unitName() })));
  if (m.band && miles) {
    svg.append(s('rect', { x: x(m.band[0]), y: mt, width: Math.max(0, x(Math.min(m.band[1], xMax / u)) - x(m.band[0])), height: H - mt - mb, fill: 'var(--accent-soft)', opacity: .7 }));
    svg.append(s('line', { x1: x(miles), x2: x(miles), y1: mt, y2: H - mb, stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
    const right = x(miles) > W - 120;
    svg.append(s('text', { x: x(miles) + (right ? -6 : 6), y: mt - 6, 'text-anchor': right ? 'end' : 'start', fill: 'var(--accent)', 'font-size': 11, 'font-weight': 600 }, t('This car')));
  }
  const tip = el('div', { class: 'tip', hidden: true });
  for (const p of pts) {
    const c = s('circle', { cx: x(p.miles), cy: y(p.gbp / FX[S.cur]), r: 5, fill: 'var(--ink)', 'fill-opacity': .55, stroke: 'var(--panel)', 'stroke-width': 1.5, tabindex: 0 });
    const show = () => {
      tip.replaceChildren(el('div', { class: 'muted', text: fmtDate(p.date) + (p.platform && p.platform !== 'Unknown' ? ' · ' + p.platform : '') }), el('div', { style: 'font-weight:600', text: money(p.gbp) + ' · ' + distText(p.miles) }), p.location ? el('div', { text: p.location }) : null);
      tip.hidden = false; const k = host.clientWidth / W; let left = x(p.miles) * k + 10;
      if (left + tip.offsetWidth > host.clientWidth) left = Math.max(0, x(p.miles) * k - tip.offsetWidth - 10);
      tip.style.left = left + 'px'; tip.style.top = Math.max(0, y(p.gbp / FX[S.cur]) * k - 12) + 'px'; c.setAttribute('r', 7);
    };
    const hide = () => { tip.hidden = true; c.setAttribute('r', 5); };
    c.addEventListener('pointerenter', show); c.addEventListener('pointerleave', hide); c.addEventListener('focus', show); c.addEventListener('blur', hide);
    svg.append(c);
  }
  host.append(svg, tip);
}
function drawTrend(host, rows) {
  host.replaceChildren();
  const W = Math.max(300, host.clientWidth || 600), H = 220, ml = 58, mr = 14, mt = 12, mb = 28;
  const t0 = +new Date(rows[0].date), t1 = +new Date(rows[rows.length - 1].date), yVals = rows.map((r) => r.gbp / FX[S.cur]);
  const step = (max, n) => { const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= raw); };
  const ys = step(Math.max(...yVals) * 1.05, 4), yTop = Math.ceil(Math.max(...yVals) * 1.05 / ys) * ys;
  const x = (d) => ml + ((+new Date(d) - t0) / (t1 - t0 || 1)) * (W - ml - mr), y = (v) => H - mb - (v / yTop) * (H - mt - mb);
  const NS = 'http://www.w3.org/2000/svg', s = (tag, a, text) => { const n = document.createElementNS(NS, tag); for (const k in a) n.setAttribute(k, a[k]); if (text != null) n.textContent = text; return n; };
  const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': t('Prices over time') }), kfmt = (v) => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v / 1000) + 'k';
  for (let v = 0; v <= yTop + 1; v += ys) { svg.append(s('line', { x1: ml, x2: W - mr, y1: y(v), y2: y(v), stroke: 'var(--line)', 'stroke-width': 1 })); svg.append(s('text', { x: ml - 8, y: y(v) + 4, 'text-anchor': 'end', fill: 'var(--muted)', 'font-size': 11 }, kfmt(v))); }
  const years = {}; for (const r of rows) (years[r.date.slice(0, 4)] = years[r.date.slice(0, 4)] || []).push(r.gbp / FX[S.cur]);
  for (const yr of Object.keys(years)) { const d = yr + '-01-01'; if (+new Date(d) >= t0) { svg.append(s('line', { x1: x(d), x2: x(d), y1: mt, y2: H - mb, stroke: 'var(--line)', 'stroke-width': 1, 'stroke-dasharray': '2 4' })); } svg.append(s('text', { x: Math.max(ml + 14, Math.min(W - mr - 14, x(yr + '-07-01'))), y: H - 8, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 11 }, yr)); }
  for (const r of rows) svg.append(s('circle', { cx: x(r.date), cy: y(r.gbp / FX[S.cur]), r: 4, fill: 'var(--ink)', 'fill-opacity': .35 }));
  const pts = Object.keys(years).filter((k) => years[k].length >= 3).map((k) => [Math.max(ml, Math.min(W - mr, x(k + '-07-01'))), y(median(years[k]))]);
  if (pts.length >= 2) svg.append(s('polyline', { points: pts.map((q) => q.join(',')).join(' '), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
  for (const q of pts) svg.append(s('circle', { cx: q[0], cy: q[1], r: 5, fill: 'var(--accent)', stroke: 'var(--panel)', 'stroke-width': 2 }));
  host.append(svg);
}
function marketView(model, car) {
  const out = el('div', { class: 'col' }), q = [car && car.year, (car && car.name) || model].filter(Boolean).join(' ') || 'classic car';
  if (S.salesError) return el('p', { class: 'empty', text: t('The sold results didn’t load. Reload the page to try again.') });
  if (!S.sales) return el('p', { class: 'empty', text: t('Loading sold results…') });
  if (!model) { out.append(el('p', { class: 'empty', text: t('We couldn’t match this car to a model in the catalogue, which covers Porsche models built before 2003. Edit the car and pick the model under “More details”. Meanwhile these searches open public results:') }), searchLinks(q)); return out; }
  const miles = car ? carMiles(car) : null, cat = catOf(model), m = marketFor(S.sales, model, miles, today()), name = shortModel(model);
  if (!m.total) { out.append(el('p', { class: 'empty', text: t('No sold results are on file yet for the {model}. It is in the catalogue, so sales will show here as soon as they are added. Meanwhile these searches open public results:', { model: name }) }), searchLinks(q)); return out; }
  const head = el('div', { class: 'col', style: 'gap:6px' });
  if (m.enoughComps) head.append(el('span', { class: 'label', text: t('Cars like yours sold for') }), el('div', { class: 'big', text: money(m.compLow) + ' – ' + money(m.compHigh) }),
    el('p', { class: 'muted small', text: t('Based on {n} {model} sales in the last two years with {a} to {b} {u} on the clock. Their typical price was {p}.', { n: m.comps.length, model: name, a: num(dist(m.band[0])), b: num(dist(m.band[1])), u: unitName(), p: money(m.compMedian) }) }));
  else {
    const few = m.n12 < 3;
    head.append(el('span', { class: 'label', text: t(few ? 'Typical price, all sales on file' : 'Typical price, last 12 months') }), el('div', { class: 'big', text: money(few ? m.medianAll : m.median12) }),
      el('p', { class: 'muted small', text: few ? t('From the {n} sales on file since {d}. Only {k} sold in the last 12 months, so this is a longer-run figure.', { n: m.total, d: fmtDate(m.firstDate), k: m.n12 }) : !car ? t('From {n} sales at any mileage.', { n: m.n12 }) : miles && !m.points.length ? t('From {n} sales at any mileage. The sales on file for this model don’t record mileage yet, so we can’t narrow it to cars like yours.', { n: m.n12 }) : miles ? t('From {n} sales at any mileage. Too few recent sales have mileage close to this car’s to narrow it further.', { n: m.n12 }) : t('From {n} sales at any mileage. Add the odometer reading to narrow this to cars like yours.', { n: m.n12 }) }));
  }
  out.append(head);
  const stats = el('div', { class: 'stats' },
    stat(t('This year'), money(m.medianYtd), t('{n} sales', { n: m.nYtd })),
    stat(t('Against last year'), m.change == null ? '—' : pct(m.change), m.change == null ? t('Not enough sales in both years to compare') : t('Last year {p} from {n} sales', { p: money(m.medianPrev), n: m.nPrev }), m.change == null ? '' : m.change > 0 ? 'up' : 'down'),
    stat(t('Last 12 months'), money(m.median12), m.n12 ? t('{n} sales, from {a} to {b}', { n: m.n12, a: money(m.low12), b: money(m.high12) }) : t('No sales')));
  if (cat && cat.median2020) { const d = m.median12 ? (m.median12 - cat.median2020) / cat.median2020 : null; stats.append(stat(t('Since 2020'), money(cat.median2020), d == null ? '' : t('The last 12 months are {p} against it', { p: pct(d) }))); }
  out.append(stats);
  if (m.points.length >= 2) { const ch = el('div', { class: 'chart' }); out.append(el('div', { class: 'col', style: 'gap:6px' }, el('span', { class: 'label', text: t('Price against distance driven, last two years') }), ch)); setTimeout(() => drawChart(ch, m, miles), 0); S.redraw = () => drawChart(ch, m, miles); } else S.redraw = null;
  const all = S.sales.filter((r) => r.model === model).sort((a, b) => a.date.localeCompare(b.date));
  if (all.length >= 8 && (new Date(all[all.length - 1].date) - new Date(all[0].date)) / 864e5 > 400) { const tr = el('div', { class: 'chart' }); out.append(el('div', { class: 'col', style: 'gap:6px' }, el('span', { class: 'label', text: t('Prices over time') }), tr, el('span', { class: 'muted small', text: t('Each dot is one sale. The line joins the typical price of each year with three or more sales.') }))); setTimeout(() => drawTrend(tr, all), 0); const prev = S.redraw; S.redraw = () => { if (prev) prev(); drawTrend(tr, all); }; }
  out.append(el('div', { class: 'col', style: 'gap:6px' }, el('span', { class: 'label', text: t(m.byMiles ? 'Closest sales by mileage' : 'Most recent sales') }),
    table([[t('Sold')], [t('Price'), 'num'], [unitName(), 'num'], [t('Car and venue')]], m.nearest.map((r) => el('tr', {}, el('td', { text: fmtDate(r.date) }), el('td', { class: 'num', text: money(r.gbp) }), el('td', { class: 'num', text: r.miles == null ? '' : num(dist(r.miles)) }), el('td', { text: [r.year, r.platform !== 'Unknown' ? r.platform : '', r.location].filter(Boolean).join(' · ') }))))));
  out.append(el('details', { class: 'more' }, el('summary', { text: t('How this is worked out') }), el('div', {}, el('p', { class: 'small muted', text: t('The typical price is the middle sale: half the cars sold for more and half for less, so one unusual car doesn’t distort it. “Cars like yours” uses sales with between half and one and a half times your car’s mileage and shows the middle half of them. Prices come from public auction results copied by hand, converted at fixed approximate exchange rates. This is market research, not a formal valuation.') }))));
  out.append(searchLinks(q));
  return out;
}

/* ----- home ----- */
function garageValue() {
  const ests = S.cars.map((c) => ({ c, e: estimate(c) })), valued = ests.filter((x) => x.e);
  const total = valued.reduce((a, x) => a + x.e.gbp, 0);
  const paidCars = valued.filter((x) => +x.c.paid && FX[x.c.paidCur || 'USD']), paid = paidCars.reduce((a, x) => a + +x.c.paid * FX[x.c.paidCur || 'USD'], 0), nowPaid = paidCars.reduce((a, x) => a + x.e.gbp, 0);
  return { total, valued: valued.length, paidN: paidCars.length, paid, nowPaid };
}
function valueHistory(total) {
  if (!CLOUD.user || !total) return null;
  const k = 'g197-val-' + CLOUD.user.id; let h = []; try { h = JSON.parse(ls.get(k, '[]')) || []; } catch (e) {}
  const d = today(); if (h.length && h[h.length - 1].d === d) h[h.length - 1].v = total; else h.push({ d, v: total });
  ls.set(k, JSON.stringify(h.slice(-400)));
  return h.length > 1 && h[0].d < d ? h[0] : null;
}
function viewHome() {
  const out = el('div', { class: 'col' });
  if (!CLOUD.loaded) { out.append(skel('11rem'), skel('6rem')); return out; }
  if (CLOUD.setupError) out.append(panel(null, null, el('p', { style: 'color:var(--bad)', text: t('Your garage could not be loaded from the cloud. Check your connection and reload the page.') })));
  if (!S.cars.length) { const b = el('div', { class: 'blank' }); b.innerHTML = CAR_SVG; b.append(el('h2', { text: t('Welcome to Garage 197'), style: 'font-size:1.3rem' }), el('p', { style: 'max-width:46ch', text: t('Start by adding your first car. It takes a minute: give its name, year and mileage, and you will see what cars like it sell for and can start its logbook.') }), el('a', { class: 'btn primary', href: '#/car/new' }, ico('plus', t('Add your first car')))); out.append(b); }
  else {
    const g = garageValue(), first = valueHistory(g.total), stats = [];
    if (g.paidN) { const d = g.nowPaid - g.paid; stats.push(stat(t('Against what you paid'), (d >= 0 ? '+' : '−') + money(Math.abs(d)), t('Cars with a purchase price: {n}', { n: g.paidN }), d >= 0 ? 'up' : 'down')); }
    if (first && first.v) { const d = g.total - first.v; stats.push(stat(t('Since {d}', { d: fmtDate(first.d) }), (d >= 0 ? '+' : '−') + money(Math.abs(d)), t('Change in the estimate since you first opened the app'), d >= 0 ? 'up' : 'down')); }
    stats.push(stat(t('Cars'), String(S.cars.length), t('{a} of {b} cars valued from recent sales.', { a: g.valued, b: S.cars.length })));
    out.append(panel(null, null, el('span', { class: 'label', text: t('Your garage is worth about') }), el('div', { class: 'big', style: 'font-size:clamp(2.2rem,8vw,3.4rem)', text: g.valued ? money(g.total) : '—' }), el('div', { class: 'stats' }, stats), el('p', { class: 'muted small', text: t('An estimate from public sales, not a formal valuation.') }), el('div', { class: 'row' }, el('a', { class: 'btn primary', href: '#/garage' }, ico('garage', t('Open my garage'))))));
    const due = S.cars.flatMap(dueOf);
    if (due.length) out.append(panel(t('Coming up'), null, el('ul', { class: 'due-list' }, due.map((x) => el('li', {}, el('span', {}, el('a', { href: '#/car/' + x.car.id + '/logbook', text: x.r.title }), el('span', { class: 'muted', text: ' · ' + (x.car.name || '') })), el('span', { class: 'tag s-' + x.st, text: remText(x.car, x.r, x.st) }))))));
  }
  out.append(searchPanel());
  if (S.sales) {
    const latest = [...S.sales].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
    out.append(panel(t('Latest sales'), null, table([[t('Sold')], [t('Model')], [t('Price'), 'num']], latest.map((r) => el('tr', {}, el('td', { text: fmtDate(r.date) }), el('td', {}, mlink(r.model)), el('td', { class: 'num', text: money(r.gbp) })))), el('div', { class: 'row' }, el('a', { class: 'btn', href: '#/market' }, ico('market', t('See the whole market'))))));
  }
  return out;
}
function searchPanel() {
  const q = el('input', { type: 'search', list: 'dl-models', placeholder: t('e.g. 993 Turbo or 356 Speedster'), id: 'q-model', autocomplete: 'off' });
  const find = () => { const v = q.value.trim().toLowerCase(); if (!v) return; const hit = CATALOG.find((m) => shortModel(m.name).toLowerCase() === v || m.name.toLowerCase() === v) || suggestHit(v) || CATALOG.find((m) => v.split(/\s+/).every((w) => m.name.toLowerCase().includes(w))); if (hit) nav('#/model/' + encodeURIComponent(hit.name)); else toast(t('No model matches that. Try the list.')); };
  q.addEventListener('change', find);
  return panel(t('Look up any model'), null, el('form', { onsubmit: (ev) => { ev.preventDefault(); find(); } }, el('div', { class: 'row' }, el('div', { style: 'flex:1;min-width:12rem' }, q), el('button', { type: 'submit', class: 'btn primary', text: t('See its market') }))), el('datalist', { id: 'dl-models' }, CATALOG.map((m) => el('option', { value: shortModel(m.name) }))));
}
function viewMarket() {
  const out = el('div', { class: 'col' }, el('h1', { text: t('Market') }));
  if (S.salesError) { out.append(el('p', { class: 'empty', text: t('The sold results didn’t load. Reload the page to try again.') })); return out; }
  if (!S.sales) { out.append(skel('8rem'), skel('16rem')); return out; }
  const d = today(), y1 = (+d.slice(0, 4) - 1) + d.slice(4), d90 = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const last12 = S.sales.filter((r) => r.date >= y1), byModel = {};
  for (const r of last12) (byModel[r.model] = byModel[r.model] || []).push(r.gbp);
  const top = last12.reduce((a, r) => (!a || r.gbp > a.gbp ? r : a), null), latest = [...S.sales].sort((a, b) => b.date.localeCompare(a.date));
  out.append(panel(t('Market at a glance'), t('Classic Porsche models built before 2003, from public auction results.'), el('div', { class: 'stats' },
    stat(t('Sold results on file'), num(S.sales.length), t('{n} models covered', { n: Object.keys(S.counts).length })),
    stat(t('Sold in the last 90 days'), num(S.sales.filter((r) => r.date >= d90).length), t('Latest on {d}', { d: fmtDate(latest[0].date) })),
    stat(t('Top sale, last 12 months'), top ? money(top.gbp) : '—', top ? shortModel(top.model) + ', ' + fmtDate(top.date) : ''))));
  out.append(searchPanel());
  const movers = CATALOG.filter((m) => m.median2020 && (byModel[m.name] || []).length >= 5).map((m) => { const med = median(byModel[m.name]); return { m, med, d: (med - m.median2020) / m.median2020 }; }).sort((a, b) => b.d - a.d);
  const up = movers.filter((x) => x.d > 0).slice(0, 7), down = movers.filter((x) => x.d < 0).slice(-7).reverse(), max = Math.max(0.01, ...up.concat(down).map((x) => Math.abs(x.d)));
  const bar = (x) => el('div', { class: 'bar' }, mlink(x.m.name), el('div', { class: 't' }, el('i', { class: x.d >= 0 ? 'up-bg' : 'down-bg', style: 'width:' + Math.max(3, Math.abs(x.d) / max * 100) + '%' })), el('span', { class: 'p ' + (x.d >= 0 ? 'up' : 'down'), text: pct(x.d) }));
  const note = t('Each model’s typical price over the last 12 months against its typical price since 2020. Based on 5 to 20 sales per model, so read it as a pointer.');
  out.append(el('div', { class: 'grid2' },
    panel(t('Running hot'), note, up.length ? el('div', { class: 'bars' }, up.map(bar)) : el('p', { class: 'empty', text: t('None at the moment.') })),
    panel(t('Running cold'), note, down.length ? el('div', { class: 'bars' }, down.map(bar)) : el('p', { class: 'empty', text: t('None at the moment.') }))));
  out.append(panel(t('Latest sales'), t('The most recent sold results on file. Press a model to see its market. Live for-sale listings will appear here once a listings feed is licensed.'),
    table([[t('Sold')], [t('Model')], [t('Price'), 'num'], [t('Car and venue')]], latest.slice(0, 15).map((r) => el('tr', {}, el('td', { text: fmtDate(r.date) }), el('td', {}, mlink(r.model)), el('td', { class: 'num', text: money(r.gbp) }), el('td', { class: 'muted', text: [r.year, r.platform !== 'Unknown' ? r.platform : ''].filter(Boolean).join(' · ') }))))));
  const fams = {}; for (const r of last12) { const c = catOf(r.model), f = c ? c.family : 'Other'; (fams[f] = fams[f] || []).push(r.gbp); }
  const order = [...new Set(CATALOG.map((m) => m.family))].filter((f) => fams[f]), fmax = Math.max(...order.map((f) => median(fams[f])));
  out.append(panel(t('By model family, last 12 months'), t('Typical price of every sale on file in each family. Families mix cheap and expensive variants, so compare like with like on a model’s own page.'),
    el('div', { class: 'bars' }, order.map((f) => el('div', { class: 'bar', style: 'grid-template-columns:minmax(0,11rem) minmax(0,1fr) 6.5rem' }, el('span', { text: t(f) }), el('div', { class: 't' }, el('i', { style: 'background:var(--accent);width:' + Math.max(3, median(fams[f]) / fmax * 100) + '%' })), el('span', { class: 'p', text: money(median(fams[f])) }))))));
  out.append(el('p', { class: 'muted small', text: t('Sold prices are public auction results copied by hand from The Classic Valuer and Classic.com. This is market research, not a formal valuation.') }));
  return out;
}
function suggestHit(v) { const m = suggestModel({ name: v }, decodeVin('')).model; return m ? catOf(m) : null; }
function remText(car, r, st) {
  const bits = []; if (r.date) bits.push(fmtDate(r.date)); if (r.odo) bits.push(num(+r.odo) + ' ' + unitName(car.unit || 'mi'));
  return t(st === 'overdue' ? 'Due now' : st === 'soon' ? 'Due soon' : 'Planned') + (bits.length ? ' · ' + bits.join(' · ') : '');
}

/* ----- garage ----- */
function viewGarage() {
  const out = el('div', { class: 'col' }), name = CLOUD.garageName || t('My garage');
  let head;
  if (S.renaming) {
    const inp = el('input', { type: 'text', maxlength: 40, value: CLOUD.garageName || '', placeholder: t('My garage'), 'aria-label': t('Garage name'), style: 'flex:1;min-width:10rem' });
    head = el('form', { class: 'row', style: 'flex-direction:row', onsubmit: async (ev) => { ev.preventDefault(); const v = inp.value.trim().slice(0, 40); try { await CLOUD.saveGarageName(v); toast(t('Saved')); } catch (e) { toast(t('Couldn’t save. Try again.')); } S.renaming = false; render(); } }, inp, el('button', { type: 'submit', class: 'btn primary', text: t('Save name') }), el('button', { type: 'button', class: 'btn', text: t('Cancel'), onclick: () => { S.renaming = false; render(); } }));
    setTimeout(() => inp.focus(), 0);
  } else head = el('div', { class: 'row between' }, el('div', { class: 'row' }, el('h1', { text: name, style: 'overflow-wrap:anywhere' }), el('button', { type: 'button', class: 'btn sm', id: 'b-rename', text: t('Rename'), onclick: () => { S.renaming = true; render(); } })), el('a', { class: 'btn primary', href: '#/car/new' }, ico('plus', t('Add a car'))));
  out.append(head);
  if (!CLOUD.loaded) { out.append(el('div', { class: 'cards' }, skel('17rem'), skel('17rem'))); return out; }
  if (!S.cars.length) { const b = el('div', { class: 'blank' }); b.innerHTML = CAR_SVG; b.append(el('p', { style: 'max-width:44ch', text: t('Your garage is empty. Add your first car to see what it is worth and start its logbook.') }), el('a', { class: 'btn primary', href: '#/car/new' }, ico('plus', t('Add your first car')))); out.append(b); return out; }
  out.append(el('div', { class: 'cards' }, S.cars.map((c) => {
    const e = estimate(c), due = dueOf(c).length, tr = e ? trendOf(e.model) : null;
    return el('a', { class: 'card', href: '#/car/' + c.id + '/overview' }, photoBox(c), el('div', { class: 'body' },
      el('b', { text: c.name || t('Unnamed car') }), el('span', { class: 'muted small', text: [c.year, carOdo(c)].filter(Boolean).join(' · ') }),
      el('span', { class: 'small', text: e ? t('Worth about {p}', { p: money(e.gbp) }) : t('No market data yet') }),
      tr == null ? null : el('span', { class: 'trend ' + (tr >= 0 ? 'up' : 'down'), text: (tr >= 0 ? '▲ ' : '▼ ') + t('{p} against its long-run price', { p: pct(tr) }) }),
      due ? el('span', {}, el('span', { class: 'badge due', text: t('{n} due', { n: due }) })) : null));
  })));
  return out;
}

/* ----- car form ----- */
function carForm(car) {
  const isNew = !car, c = car || { unit: S.unit, paidCur: S.cur, name: S.prefill || '' }; S.prefill = '';
  const f = {
    name: el('input', { type: 'text', value: c.name || '', list: 'dl-names', placeholder: t('e.g. Porsche 964 Turbo'), autocomplete: 'off', id: 'f-name' }),
    year: el('input', { type: 'number', min: 1900, max: 2030, inputmode: 'numeric', value: c.year || '', placeholder: '1991', id: 'f-year' }),
    miles: el('input', { type: 'number', min: 0, inputmode: 'numeric', value: c.miles || '', id: 'f-miles' }),
    unit: select([['mi', t('Miles')], ['km', t('Kilometres')]], c.unit || 'mi', { id: 'f-unit' }),
    vin: el('input', { type: 'text', class: 'mono', value: c.vin || '', maxlength: 24, spellcheck: 'false', autocomplete: 'off', style: 'text-transform:uppercase', dir: 'ltr', id: 'f-vin' }),
    condition: select([['', t('Not graded')], ['1', t('1 Concours')], ['2', t('2 Excellent')], ['3', t('3 Good')], ['4', t('4 Fair')]], c.condition || ''),
    colour: el('input', { type: 'text', value: c.colour || '', autocomplete: 'off', id: 'f-colour' }), interior: el('input', { type: 'text', value: c.interior || '', autocomplete: 'off' }),
    reg: el('input', { type: 'text', value: c.reg || '', autocomplete: 'off' }), acquired: el('input', { type: 'date', value: c.acquired || '' }),
    paid: el('input', { type: 'number', min: 0, inputmode: 'numeric', value: c.paid || '', id: 'f-paid' }), paidCur: select(CURS.map((x) => [x, x]), c.paidCur || 'USD'),
    photo: el('input', { type: 'file', accept: 'image/*', id: 'f-photo' })
  };
  const groups = {}; for (const m of CATALOG) (groups[m.family] = groups[m.family] || []).push(m);
  f.model = el('select', { id: 'f-model' }, el('option', { value: 'auto', text: t('Work it out from the name') }), Object.keys(groups).map((g) => el('optgroup', { label: t(g) }, groups[g].map((m) => el('option', { value: m.name, text: shortModel(m.name) + ', ' + m.from + '–' + String(m.to).slice(2) })))), el('option', { value: 'other', text: t('Another model (not in the catalogue)') }));
  f.model.value = [...f.model.options].some((o) => o.value === c.model) ? c.model : 'auto';
  const vinHint = el('span', { class: 'hint' }), status = el('p', { class: 'status', role: 'status' });
  const hint = () => { const d = decodeVin(f.vin.value); vinHint.textContent = !d.vin ? t('Optional. On cars built from 1981 it has 17 characters and tells us the exact model.') : d.full ? [d.maker, d.year, d.type ? t('type {x}', { x: d.type }) : ''].filter(Boolean).join(' · ') + (d.checkOk === false ? ' · ' + t('check digit fails, one character may be mistyped') : '') : t('{n} characters so far', { n: d.length }); };
  f.vin.addEventListener('input', hint); hint();
  const save = el('button', { type: 'submit', class: 'btn primary', id: 'b-save', text: t(isNew ? 'Add to my garage' : 'Save changes') });
  const form = el('form', { novalidate: true, id: 'car-form', onsubmit: async (ev) => {
    ev.preventDefault();
    const body = { name: f.name.value.trim(), year: f.year.value, miles: f.miles.value, unit: f.unit.value, vin: f.vin.value.toUpperCase().replace(/[\s-]/g, ''), condition: f.condition.value, model: f.model.value, colour: f.colour.value.trim(), interior: f.interior.value.trim(), reg: f.reg.value.trim(), acquired: f.acquired.value, paid: f.paid.value, paidCur: f.paidCur.value };
    if (!body.name) { status.textContent = t('Give the car a name first, for example its model.'); f.name.focus(); return; }
    save.disabled = true; status.textContent = t('Saving…');
    try {
      const id = isNew ? CLOUD.newId() : car.id, pic = f.photo.files[0];
      if (pic) { const old = car && car.photo; body.photo = await CLOUD.upload(id, await shrink(pic)); if (old) CLOUD.removeFiles([old.path]); }
      await saveCar({ ...(car || { records: [], reminders: [] }), id }, body);
      toast(t(isNew ? 'Car added' : 'Saved')); nav('#/car/' + id + '/overview');
    } catch (e) { status.textContent = t('Couldn’t save: {m}', { m: (e && e.message) || '' }); save.disabled = false; }
  } },
    field(t('Car name'), f.name), el('datalist', { id: 'dl-names' }, CATALOG.map((m) => el('option', { value: m.name }))),
    el('div', { class: 'row2' }, field(t('Model year'), f.year), el('div', { class: 'row2' }, field(t('Odometer'), f.miles), field(t('Unit'), f.unit))),
    field(t('Photo'), f.photo, car && car.photo ? t('Choose a file to replace the current photo.') : t('Optional. One photo to show on the car’s card.')),
    el('details', { class: 'more', open: !isNew }, el('summary', { text: t('More details') }), el('div', {},
      el('div', { class: 'field' }, el('label', { for: 'f-vin', text: t('Chassis number (VIN)') }), f.vin, vinHint),
      el('div', { class: 'row2' }, field(t('Colour'), f.colour), field(t('Interior'), f.interior)),
      el('div', { class: 'row2' }, field(t('Registration'), f.reg), field(t('Date acquired'), f.acquired)),
      el('div', { class: 'row2' }, field(t('Purchase price'), f.paid), field(t('Currency'), f.paidCur)),
      el('div', { class: 'row2' }, field(t('Condition'), f.condition), field(t('Model to compare against'), f.model)))),
    el('div', { class: 'row' }, save, el('a', { class: 'btn', href: isNew ? '#/garage' : '#/car/' + car.id + '/overview', text: t('Cancel') })), status);
  const out = el('div', { class: 'col', style: 'max-width:40rem' }, el('h1', { text: t(isNew ? 'Add a car' : 'Edit {name}', { name: c.name || '' }) }), isNew ? el('p', { class: 'muted', text: t('Three things are enough to start: the name, the year and the mileage. Everything else can wait.') }) : null, panel(null, null, form));
  if (!isNew) {
    let sure = false; const del = el('button', { type: 'button', class: 'btn danger', id: 'b-del', text: t('Remove this car') });
    del.addEventListener('click', async () => {
      if (!sure) { sure = true; del.textContent = t('Yes, remove it and its logbook'); return; }
      const paths = (car.records || []).flatMap((r) => (r.files || []).map((x) => x.path)).concat(car.photo ? [car.photo.path] : [], (car.gallery || []).map((x) => x.path));
      try { await S.db.collection('cars').doc(car.id).delete(); CLOUD.removeFiles(paths); toast(t('Car removed')); nav('#/garage'); } catch (e) { toast(t('Couldn’t remove it. Try again.')); }
    });
    out.append(el('div', { class: 'row' }, del));
  }
  return out;
}

/* ----- car page ----- */
function trFlag(x) {
  let m;
  if ((m = /^(\d+) characters\. Cars built/.exec(x))) return t('{n} characters. Cars built before 1981 have shorter chassis numbers that can’t be decoded automatically; newer cars have 17.', { n: m[1] });
  if ((m = /^(\d+) characters\. A modern/.exec(x))) return t('{n} characters. A modern chassis number has 17.', { n: m[1] });
  if ((m = /^Check digit should be (.), not (.)/.exec(x))) return t('Check digit should be {a}, not {b}. One character is probably mistyped.', { a: m[1], b: m[2] });
  return t(x);
}
function vinPlate(car) {
  const d = decodeVin(car.vin); if (!d.vin) return null;
  const wrap = el('div', { class: 'col', style: 'gap:10px' });
  wrap.append(el('div', { class: 'plate' }, d.full ? d.segs.map((s) => el('div', { class: 'seg' }, el('span', { class: 'label', text: t(s.label) }), el('b', { text: s.chars }), el('em', { text: t(s.value) || ' ' }))) : el('div', { class: 'seg' }, el('b', { text: d.vin }))));
  if (d.full && d.year && car.year && Number(car.year) !== d.year) d.flags.push({ kind: 'warn', text: t('The chassis number says model year {a}, but the car is saved as {b}.', { a: d.year, b: car.year }) });
  wrap.append(el('div', { class: 'flags' }, d.flags.map((f) => el('span', { class: 'flag ' + f.kind, text: trFlag(f.text) }))));
  return wrap;
}
function banner(car, e) {
  const b = el('div', { class: 'banner' }); b.innerHTML = CAR_SVG;
  if (car.photo && car.photo.path) CLOUD.fileUrl(car.photo.path).then((url) => { const im = el('img', { src: url, alt: '' }); im.addEventListener('error', () => im.remove()); b.prepend(im); }).catch(() => {});
  b.append(el('div', { class: 'over' }, el('h1', { text: car.name || t('Unnamed car') }), e ? el('div', { class: 'v' }, el('small', { text: t('Worth about') }), el('span', { text: money(e.gbp) })) : null));
  return b;
}
function galleryPanel(car) {
  const list = car.gallery || [], input = el('input', { type: 'file', accept: 'image/*', multiple: true, id: 'g-files', style: 'display:none' }), status = el('span', { class: 'status' });
  input.addEventListener('change', async () => {
    const files = [...input.files]; if (!files.length) return; const added = [];
    try { let n = 0; for (const f of files) { status.textContent = t('Uploading file {a} of {b}…', { a: ++n, b: files.length }); added.push(await CLOUD.upload(car.id, await shrink(f))); } await saveCar(car, { gallery: list.concat(added) }); toast(t('Photos added')); render(); }
    catch (e) { status.textContent = t('Couldn’t save: {m}', { m: (e && e.message) || '' }); }
  });
  const grid = el('div', { class: 'gallery' }, list.map((g) => {
    const ph = el('button', { type: 'button', class: 'ph', 'aria-label': t('Open photo') });
    CLOUD.fileUrl(g.path).then((url) => { ph.append(el('img', { src: url, alt: '', loading: 'lazy' })); ph.addEventListener('click', () => window.open(url, '_blank')); }).catch(() => {});
    return el('figure', {}, ph, el('button', { type: 'button', class: 'linkbtn small', text: t('Remove'), onclick: async () => { try { await saveCar(car, { gallery: list.filter((x) => x !== g) }); CLOUD.removeFiles([g.path]); toast(t('Photo removed')); render(); } catch (e) { toast(t('Couldn’t save. Try again.')); } } }));
  }));
  return panel(t('Photos'), null, list.length ? grid : el('p', { class: 'empty', text: t('Add photos of the car, its details and its paperwork.') }), el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', id: 'b-photos', onclick: () => input.click() }, ico('camera', t('Add photos'))), input, status));
}
function viewCar(car, sub) {
  const base = '#/car/' + car.id + '/', tabs = [['overview', t('Overview')], ['market', t('Market')], ['logbook', t('Logbook')]], e = estimate(car);
  const out = el('div', { class: 'col' },
    el('a', { class: 'small', href: '#/garage', text: '‹ ' + (CLOUD.garageName || t('My garage')) }), banner(car, e),
    el('nav', { class: 'subtabs', 'aria-label': t('Car sections') }, tabs.map((x) => el('a', { class: 'tab', href: base + x[0], 'aria-current': sub === x[0] ? 'page' : 'false', text: x[1] }))));
  if (sub === 'market') out.append(panel(null, null, marketView(modelOf(car), car)));
  else if (sub === 'logbook') out.append(logbookView(car));
  else {
    const facts = [[t('Model year'), car.year], [t('Odometer'), carOdo(car)], [t('Colour'), car.colour], [t('Interior'), car.interior], [t('Registration'), car.reg], [t('Acquired'), car.acquired ? fmtDate(car.acquired) : ''], [t('Paid'), car.paid ? cash(+car.paid, car.paidCur) : ''], [t('Condition'), car.condition ? t({ 1: '1 Concours', 2: '2 Excellent', 3: '3 Good', 4: '4 Fair' }[car.condition]) : ''], [t('Compared against'), e ? shortModel(e.model) : '']].filter((x) => x[1]);
    const basis = !e ? t('We couldn’t value this car yet. Open the Market tab to see why.') : e.basis === 'similar' ? t('From {n} recent sales of cars with similar mileage.', { n: e.n }) : e.basis === 'year' ? t('The typical price of {n} sales in the last 12 months.', { n: e.n }) : t('The typical price of the {n} sales on file. Few are recent, so treat it as a rough guide.', { n: e.n });
    const value = el('div', { class: 'col', style: 'gap:8px' }, el('span', { class: 'label', text: t('Worth about') }), el('div', { class: 'big', text: e ? money(e.gbp) : '—' }));
    if (e && e.low != null && e.high > e.low) value.append(el('div', { class: 'range' }, el('div', { class: 'track' }, el('span', { class: 'dot', style: 'left:' + Math.max(0, Math.min(100, (e.gbp - e.low) / (e.high - e.low) * 100)) + '%' })), el('div', { class: 'ends' }, el('span', { text: money(e.low) }), el('span', { text: money(e.high) })), el('span', { class: 'muted small', text: t('Where the typical price sits in the range these cars sold for.') })));
    value.append(el('p', { class: 'muted small', text: basis }));
    if (e && +car.paid && FX[car.paidCur || 'USD']) { const d = e.gbp - +car.paid * FX[car.paidCur || 'USD']; value.append(el('p', { class: 'small ' + (d >= 0 ? 'up' : 'down'), style: 'font-weight:600', text: t('{d} against the {p} you paid', { d: (d >= 0 ? '+' : '−') + money(Math.abs(d)), p: cash(+car.paid, car.paidCur) }) })); }
    const tr = e ? trendOf(e.model) : null; if (tr != null) value.append(el('p', { class: 'trend ' + (tr >= 0 ? 'up' : 'down'), text: (tr >= 0 ? '▲ ' : '▼ ') + t('{p} against its long-run price', { p: pct(tr) }) }));
    const due = dueOf(car);
    out.append(el('div', { class: 'grid2' }, panel(null, null, value, el('div', { class: 'row' }, el('a', { class: 'btn', href: base + 'market' }, ico('market', t('See the market'))), el('a', { class: 'btn', href: base + 'logbook', text: t('Open the logbook') }))),
      panel(t('Coming up'), null, due.length ? el('ul', { class: 'due-list' }, due.map((x) => el('li', {}, el('span', { text: x.r.title }), el('span', { class: 'tag s-' + x.st, text: remText(car, x.r, x.st) })))) : el('p', { class: 'empty', text: t('Nothing is due. Reminders you add in the logbook show here.') }))));
    out.append(galleryPanel(car));
    out.append(panel(t('Details'), null, facts.length ? el('dl', { class: 'facts' }, facts.map((x) => el('div', {}, el('dt', { text: x[0] }), el('dd', { text: x[1] })))) : el('p', { class: 'empty', text: t('No details yet.') }), vinPlate(car), el('div', { class: 'row' }, el('a', { class: 'btn', id: 'b-edit', href: base + 'edit' }, ico('edit', t('Edit details'))))));
  }
  return out;
}

/* ----- logbook ----- */
const REC_TYPES = { service: 'Service', condition: 'Condition', tyres: 'Tyres', document: 'Document', purchase: 'Purchase', note: 'Note' };
const STATUS = { good: 'Good', fair: 'Fair', attention: 'Needs attention' };
function logbookView(car) {
  const out = el('div', { class: 'col' }), recs = [...(car.records || [])].sort((a, b) => (b.date || '').localeCompare(a.date || '')), rems = car.reminders || [];
  // reminders
  const remPanel = panel(t('Coming up'), null);
  if (rems.length) remPanel.append(el('ul', { class: 'due-list' }, [...rems].sort((a, b) => (a.date || '9').localeCompare(b.date || '9')).map((r) => { const st = remStatus(car, r); return el('li', {}, el('span', { text: r.title }), el('span', { class: 'row' }, el('span', { class: 'tag s-' + st, text: remText(car, r, st) }), el('button', { type: 'button', class: 'linkbtn small', text: t('Done'), onclick: async () => { try { await saveCar(car, { reminders: rems.filter((x) => x.id !== r.id) }); toast(t('Reminder cleared')); render(); } catch (e) { toast(t('Couldn’t save. Try again.')); } } }))); })));
  else if (!S.remOpen) remPanel.append(el('p', { class: 'empty', text: t('Nothing planned. Add a reminder for the next service, inspection or insurance renewal.') }));
  if (S.remOpen) {
    const ti = el('input', { type: 'text', maxlength: 80, placeholder: t('e.g. Annual service'), id: 'm-title' }), da = el('input', { type: 'date', id: 'm-date' }), od = el('input', { type: 'number', min: 0, inputmode: 'numeric', id: 'm-odo' }), st = el('p', { class: 'status', role: 'status' });
    remPanel.append(el('form', { novalidate: true, onsubmit: async (ev) => { ev.preventDefault(); if (!ti.value.trim()) { st.textContent = t('Say what is due.'); return; } if (!da.value && !od.value) { st.textContent = t('Add a date, a mileage, or both.'); return; }
      try { await saveCar(car, { reminders: rems.concat({ id: 'm' + Date.now().toString(36), title: ti.value.trim(), date: da.value, odo: od.value }) }); S.remOpen = false; toast(t('Reminder added')); render(); } catch (e) { st.textContent = t('Couldn’t save. Try again.'); } } },
      field(t('What is due'), ti), el('div', { class: 'row2' }, field(t('Due date'), da), field(t('Or at ({u})', { u: unitName(car.unit || 'mi') }), od)),
      el('div', { class: 'row' }, el('button', { type: 'submit', class: 'btn primary', text: t('Add reminder') }), el('button', { type: 'button', class: 'btn', text: t('Cancel'), onclick: () => { S.remOpen = false; render(); } })), st));
  } else remPanel.append(el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', id: 'b-rem-new', text: t('Add a reminder'), onclick: () => { S.remOpen = true; render(); } })));
  out.append(remPanel);
  // records
  const head = el('div', { class: 'row between' }, el('h2', { text: t('History') }), el('div', { class: 'row' }, recs.length ? el('button', { type: 'button', class: 'btn', id: 'b-pdf', onclick: () => printLogbook(car) }, ico('pdf', t('Download as PDF'))) : null, S.rec ? null : el('button', { type: 'button', class: 'btn primary', id: 'b-rec-new', onclick: () => { S.rec = { files: [], removed: [] }; render(); } }, ico('plus', t('Add a record')))));
  const hist = el('section', { class: 'panel' }, head);
  if (S.rec) hist.append(recordForm(car));
  if (!recs.length) { if (!S.rec) hist.append(el('p', { class: 'empty', text: t('No records yet. Add the first service, condition check or document for this car.') })); out.append(hist); return out; }
  const spend = {}; for (const r of recs) if (+r.cost && r.type !== 'purchase') spend[r.cur || 'USD'] = (spend[r.cur || 'USD'] || 0) + +r.cost;
  const lastSvc = recs.find((r) => r.type === 'service'), odo = Math.max(0, ...recs.map((r) => +r.odometer || 0)), flagged = recs.filter((r) => r.status === 'attention').length;
  hist.append(el('div', { class: 'stats' },
    stat(t('Records'), String(recs.length), t('Since {d}', { d: fmtDate(recs[recs.length - 1].date) })),
    stat(t('Spent on the car'), Object.keys(spend).length ? Object.keys(spend).map((c) => cash(spend[c], c)).join(' + ') : '—', t('Not counting the purchase')),
    stat(t('Last service'), lastSvc && lastSvc.date ? fmtDate(lastSvc.date) : '—', lastSvc ? lastSvc.title : t('None logged yet')),
    stat(t('Highest odometer logged'), odo ? num(odo) + ' ' + unitName(car.unit || 'mi') : '—', flagged ? t('{n} need attention', { n: flagged }) : t('Nothing flagged'))));
  const used = ['all', ...Object.keys(REC_TYPES).filter((x) => recs.some((r) => r.type === x))]; if (!used.includes(S.filter)) S.filter = 'all';
  if (used.length > 2) hist.append(el('div', { class: 'chips', role: 'group', 'aria-label': t('Filter records') }, used.map((x) => el('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.filter === x), text: x === 'all' ? t('All') : t(REC_TYPES[x]), onclick: () => { S.filter = x; render(); } }))));
  hist.append(el('ul', { class: 'log' }, recs.filter((x) => S.filter === 'all' || x.type === S.filter).map((r) => el('li', {},
    el('div', { class: 'when' }, el('span', { text: r.date ? fmtDate(r.date) : '' }), r.odometer ? el('span', { text: num(+r.odometer) + ' ' + unitName(car.unit || 'mi') }) : null),
    el('div', { class: 'what' },
      el('span', {}, el('span', { class: 'tag', text: t(REC_TYPES[r.type] || 'Note') }), r.status ? el('span', { class: 'tag s-' + r.status, text: ' · ' + t(STATUS[r.status]) }) : null),
      el('b', { text: r.title || '' }),
      (r.by || +r.cost) ? el('span', { class: 'muted small', text: [r.by, +r.cost ? cash(+r.cost, r.cur) : ''].filter(Boolean).join(' · ') }) : null,
      r.notes ? el('span', { class: 'small', style: 'white-space:pre-wrap', text: r.notes }) : null,
      r.files && r.files.length ? el('span', { class: 'row small' }, r.files.map((f) => { const b = el('button', { type: 'button', class: 'linkbtn', text: f.name }); b.addEventListener('click', async () => { const w = window.open('', '_blank'); try { const url = await CLOUD.fileUrl(f.path); if (w) w.location = url; else location.href = url; } catch (e) { if (w) w.close(); toast(t('Couldn’t open the file.')); } }); return b; })) : null,
      el('span', {}, el('button', { type: 'button', class: 'linkbtn small', text: t('Edit'), onclick: () => { S.rec = { editing: r.id, files: (r.files || []).slice(), removed: [] }; render(); window.scrollTo(0, 0); } })))))));
  out.append(hist);
  return out;
}
function recordForm(car) {
  const st0 = S.rec, r = (car.records || []).find((x) => x.id === st0.editing) || { type: 'service', date: today(), cur: car.lastCur || S.cur };
  const f = {
    type: select(Object.keys(REC_TYPES).map((k) => [k, t({ service: 'Service or repair', condition: 'Condition check', tyres: 'Tyres', document: 'Document', purchase: 'Purchase or sale', note: 'Note' }[k])]), r.type || 'note', { id: 'r-type' }),
    date: el('input', { type: 'date', value: r.date || '', id: 'r-date' }), title: el('input', { type: 'text', maxlength: 120, value: r.title || '', placeholder: t('e.g. Major service and brake fluid'), id: 'r-title', autocomplete: 'off' }),
    odo: el('input', { type: 'number', min: 0, inputmode: 'numeric', value: r.odometer || '', id: 'r-odo' }), by: el('input', { type: 'text', maxlength: 80, value: r.by || '', placeholder: t('Workshop or person'), id: 'r-by', autocomplete: 'off' }),
    cost: el('input', { type: 'number', min: 0, inputmode: 'decimal', value: r.cost || '', id: 'r-cost' }), cur: select(CURS.map((x) => [x, x]), r.cur || 'USD', { id: 'r-cur' }),
    status: select([['', t('Not applicable')], ['good', t('Good')], ['fair', t('Fair, keep an eye on it')], ['attention', t('Needs attention')]], r.status || '', { id: 'r-status' }),
    notes: el('textarea', { maxlength: 2000, placeholder: t('Parts fitted, findings, where the paperwork is kept'), id: 'r-notes' }), files: el('input', { type: 'file', multiple: true, accept: 'image/*,application/pdf', id: 'r-files' })
  };
  f.notes.value = r.notes || '';
  const status = el('p', { class: 'status', role: 'status' }), list = el('div', { class: 'col', style: 'gap:4px' });
  const drawFiles = () => list.replaceChildren(...st0.files.map((x) => el('span', { class: 'small' }, el('span', { text: x.name + ' ' }), el('button', { type: 'button', class: 'linkbtn', text: t('Remove'), onclick: () => { st0.files = st0.files.filter((y) => y !== x); st0.removed.push(x.path); drawFiles(); } }))));
  drawFiles();
  const save = el('button', { type: 'submit', class: 'btn primary', id: 'b-rec-save', text: t(st0.editing ? 'Save record' : 'Add to logbook') });
  let sure = false; const del = st0.editing ? el('button', { type: 'button', class: 'btn danger', id: 'b-rec-del', text: t('Delete record') }) : null;
  if (del) del.addEventListener('click', async () => {
    if (!sure) { sure = true; del.textContent = t('Yes, delete it'); return; }
    try { await saveCar(car, { records: (car.records || []).filter((x) => x.id !== st0.editing) }); CLOUD.removeFiles((r.files || []).map((x) => x.path)); S.rec = null; toast(t('Record deleted')); render(); } catch (e) { status.textContent = t('Couldn’t delete it. Try again.'); }
  });
  return el('form', { novalidate: true, id: 'rec-form', style: 'border:1px solid var(--line);border-radius:8px;padding:14px', onsubmit: async (ev) => {
    ev.preventDefault();
    const rec = { id: st0.editing || 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: f.type.value, date: f.date.value, title: f.title.value.trim(), odometer: f.odo.value, by: f.by.value.trim(), cost: f.cost.value, cur: f.cur.value, status: f.status.value, notes: f.notes.value.trim() };
    if (!rec.title) { status.textContent = t('Say what happened first.'); f.title.focus(); return; }
    if (!rec.date) { status.textContent = t('Add the date.'); f.date.focus(); return; }
    const picked = [...f.files.files];
    if (picked.some((x) => x.size > CLOUD.maxFile)) { status.textContent = t('One of the files is over 10 MB. Choose smaller files.'); return; }
    save.disabled = true;
    try {
      let n = 0; for (const x of picked) { status.textContent = t('Uploading file {a} of {b}…', { a: ++n, b: picked.length }); st0.files.push(await CLOUD.upload(car.id, x)); }
      f.files.value = ''; rec.files = st0.files.slice();
      const patch = { records: (car.records || []).filter((x) => x.id !== rec.id).concat(rec), lastCur: rec.cur };
      if (+rec.odometer > (+car.miles || 0)) patch.miles = String(rec.odometer);
      const gone = st0.removed.slice(); await saveCar(car, patch); if (gone.length) CLOUD.removeFiles(gone);
      S.rec = null; toast(t('Saved to the logbook')); render();
    } catch (e) { drawFiles(); status.textContent = t('Couldn’t save: {m}', { m: (e && e.message) || '' }); save.disabled = false; }
  } },
    el('div', { class: 'row2' }, field(t('Type'), f.type), field(t('Date'), f.date)), field(t('What happened'), f.title),
    el('div', { class: 'row2' }, field(t('Odometer ({u})', { u: unitName(car.unit || 'mi') }), f.odo), field(t('Done by'), f.by)),
    el('div', { class: 'row2' }, field(t('Cost'), f.cost), field(t('Currency'), f.cur)), field(t('Condition found'), f.status), field(t('Notes'), f.notes),
    el('div', { class: 'field' }, el('label', { for: 'r-files', text: t('Photos and documents') }), list, f.files, el('span', { class: 'hint', text: t('Photos or PDFs, up to 10 MB each. They are private to your account.') })),
    el('div', { class: 'row' }, save, el('button', { type: 'button', class: 'btn', id: 'b-rec-cancel', text: t('Cancel'), onclick: () => { S.rec = null; render(); } }), del), status);
}
function printLogbook(car) {
  const recs = [...(car.records || [])].sort((a, b) => (a.date || '').localeCompare(b.date || '')), p = $('print');
  const facts = [[t('Model year'), car.year], [t('Chassis number (VIN)'), car.vin], [t('Odometer'), carOdo(car)], [t('Colour'), car.colour], [t('Interior'), car.interior], [t('Registration'), car.reg], [t('Acquired'), car.acquired ? fmtDate(car.acquired) : '']].filter((x) => x[1]);
  const lg = el('div', { style: 'width:34pt;height:34pt;float:inline-end' }); lg.innerHTML = LOGO;
  p.replaceChildren(lg, el('h1', { text: car.name || '' }), el('p', { text: t('Logbook from {g}, printed {d}', { g: CLOUD.garageName || 'Garage 197', d: fmtDate(today()) }) }),
    el('dl', { class: 'facts', style: 'margin-top:10pt' }, facts.map((x) => el('div', {}, el('dt', { text: x[0] }), el('dd', { text: x[1] })))),
    el('h2', { text: t('History') }),
    el('table', {}, el('thead', {}, el('tr', {}, [t('Date'), t('Type'), t('What happened'), t('Odometer'), t('Done by'), t('Cost')].map((h) => el('th', { text: h })))),
      el('tbody', {}, recs.map((r) => el('tr', {}, el('td', { text: r.date ? fmtDate(r.date) : '' }), el('td', { text: t(REC_TYPES[r.type] || 'Note') + (r.status ? ' · ' + t(STATUS[r.status]) : '') }), el('td', {}, el('b', { text: r.title || '' }), r.notes ? el('div', { style: 'white-space:pre-wrap', text: r.notes }) : null, r.files && r.files.length ? el('div', { text: t('Attached: {f}', { f: r.files.map((x) => x.name).join(', ') }) }) : null), el('td', { text: r.odometer ? num(+r.odometer) + ' ' + unitName(car.unit || 'mi') : '' }), el('td', { text: r.by || '' }), el('td', { text: +r.cost ? cash(+r.cost, r.cur) : '' }))))));
  window.print();
}

/* ----- settings ----- */
function viewSettings() {
  const pick = (key, lskey, opts) => select(opts, S[key], { onchange: (ev) => { S[key] = ev.target.value; ls.set(lskey, S[key]); toast(t('Saved')); render(); } });
  const out = el('div', { class: 'col', style: 'max-width:40rem' }, el('h1', { text: t('Settings') }),
    panel(t('Display'), null,
      field(t('Language'), pick('lang', 'g197-lang', [['en', 'English'], ['ar', 'العربية']])),
      field(t('Show prices in'), pick('cur', 'g197-cur', [['USD', t('US dollars')], ['GBP', t('Pounds')], ['EUR', t('Euros')], ['QAR', t('Qatari riyals')], ['AED', t('UAE dirhams')], ['SAR', t('Saudi riyals')]]), t('Conversions use fixed approximate exchange rates.')),
      field(t('Show distances in'), pick('unit', 'g197-unit', [['mi', t('Miles')], ['km', t('Kilometres')]])),
      field(t('Appearance'), pick('theme', 'g197-theme', [['light', t('Light')], ['dark', t('Dark')], ['auto', t('Match my device')]]))),
    panel(t('Account'), null, el('p', { class: 'small', text: t('Signed in as {email}. Your garage is saved to your account and follows you to any device.', { email: CLOUD.user.email || '' }) }),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn', id: 'b-signout', text: t('Sign out'), onclick: async () => { await CLOUD.signOut(); location.hash = '#/home'; } }))));
  const n = CLOUD.localCount();
  if (n) out.append(panel(t('Cars saved on this device'), null, el('p', { class: 'small', text: t('Cars saved on this device before accounts existed: {n}.', { n }) }), el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn primary', id: 'b-import', text: t('Add them to my account'), onclick: async () => { try { await CLOUD.importLocal(); toast(t('Cars added to your account')); } catch (e) { toast(t('Couldn’t save. Try again.')); } render(); } }))));
  return out;
}

/* ----- frame ----- */
function render() {
  const app = $('app'); document.documentElement.lang = S.lang; document.documentElement.dir = S.lang === 'ar' ? 'rtl' : 'ltr'; document.documentElement.dataset.theme = S.theme; S.redraw = null;
  const dark = S.theme === 'dark' || (S.theme === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches), tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = dark ? '#120d1c' : '#ffffff';
  if (!CLOUD.user || S.mode === 'newpass') { app.replaceChildren(viewLogin()); return; }
  const r = route(), top = r.name === 'home' ? 'home' : r.name === 'market' || r.name === 'model' ? 'market' : r.name === 'settings' ? 'settings' : 'garage';
  const tab = (id, href, label) => el('a', { class: 'tab', id: 't-' + id, href, 'aria-current': top === id ? 'page' : 'false' }, ico(id, label));
  const head = el('header', { class: 'head' }, brand('#/home'), el('nav', { class: 'tabs', 'aria-label': t('Sections') }, tab('home', '#/home', t('Home')), tab('garage', '#/garage', CLOUD.garageName || t('My garage')), tab('market', '#/market', t('Market')), tab('settings', '#/settings', t('Settings'))));
  let main;
  if (r.name === 'garage') main = viewGarage();
  else if (r.name === 'market') main = viewMarket();
  else if (r.name === 'settings') main = viewSettings();
  else if (r.name === 'model') { const m = catOf(r.a); main = el('div', { class: 'col' }, el('div', { class: 'col', style: 'gap:6px' }, el('a', { class: 'small', href: '#/market', text: '‹ ' + t('Market') }), el('h1', { text: m ? shortModel(m.name) : t('Model not found') }), m ? el('p', { class: 'muted', text: t('Built {a} to {b}', { a: m.from, b: m.to }) }) : null), m ? panel(null, null, marketView(m.name, null)) : null, m ? el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn primary', text: t('Add this car to my garage'), onclick: () => { S.prefill = m.name; nav('#/car/new'); } })) : null); }
  else if (r.name === 'car' && r.a === 'new') main = carForm(null);
  else if (r.name === 'car') { const car = S.cars.find((c) => c.id === r.a); main = !car ? el('p', { class: 'empty', text: t(CLOUD.loaded ? 'That car is no longer in your garage.' : 'Loading your garage…') }) : r.b === 'edit' ? carForm(car) : viewCar(car, r.b || 'overview'); }
  else main = viewHome();
  app.replaceChildren(head, el('main', {}, main));
}
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (S.redraw) S.redraw(); }, 150); });

/* ----- start ----- */
fetch('sales.csv').then((r) => { if (!r.ok) throw new Error('load'); return r.text(); }).then((txt) => { S.sales = prepSales(parseCsv(txt)); S.counts = {}; for (const r of S.sales) S.counts[r.model] = (S.counts[r.model] || 0) + 1; render(); }).catch(() => { S.salesError = true; render(); });
(async () => {
  S.db = await window.claude.use('db');
  let busy = () => { const a = document.activeElement; return !!(a && a.closest && a.closest('form') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)); };
  S.db.collection('cars').onSnapshot((snap) => { S.cars = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '')); if (!busy()) render(); });
  CLOUD.onAuth(() => { if (!busy() || !CLOUD.user) render(); });
  try { const k = await CLOUD.fromLink(); if (k === 'recovery') S.mode = 'newpass'; else if (k && k.error) S.loginMsg = t('That link didn’t work: {m}. Ask for a new one.', { m: k.error }); } catch (e) { S.loginMsg = t('That link has expired. Ask for a new one.'); }
  render();
})();
render();
