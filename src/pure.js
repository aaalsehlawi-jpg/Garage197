/*PURE-START*/
const FX = { GBP: 1, USD: 0.75, EUR: 0.86, QAR: 0.206, AED: 0.204, SAR: 0.2 };
const WMI = { WP0: 'Porsche', WP1: 'Porsche', ZFF: 'Ferrari', WDB: 'Mercedes-Benz', WDD: 'Mercedes-Benz', WBA: 'BMW', WBS: 'BMW M', SCF: 'Aston Martin', ZHW: 'Lamborghini', ZA9: 'Lamborghini', SAJ: 'Jaguar', ZAM: 'Maserati', SCC: 'Lotus', JN1: 'Nissan', JT2: 'Toyota', JH4: 'Acura', JHM: 'Honda', WAU: 'Audi', WVW: 'Volkswagen', ZAR: 'Alfa Romeo', SAL: 'Land Rover', SCA: 'Rolls-Royce', SCB: 'Bentley', '1G1': 'Chevrolet', '1FA': 'Ford', ZLA: 'Lancia', VF1: 'Renault', VF7: 'Citroën', SAR: 'Rover' };
const PLANTS = { S: 'Stuttgart-Zuffenhausen', N: 'Neckarsulm', L: 'Leipzig', U: 'Uusikaupunki', K: 'Osnabrück' };
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';
function vinYear(c) { const i = YEAR_CODES.indexOf(c); return i < 0 ? null : 1980 + i; }
function vinCheck(v) {
  const val = (ch) => /\d/.test(ch) ? +ch : ({ A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 })[ch];
  const w = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 17; i++) { const x = val(v[i]); if (x == null) return null; sum += x * w[i]; }
  const r = sum % 11; return r === 10 ? 'X' : String(r);
}
function decodeVin(raw) {
  const v = (raw || '').toUpperCase().replace(/[\s-]/g, '');
  const out = { vin: v, length: v.length, full: false, flags: [], segs: [] };
  if (!v) return out;
  if (/[IOQ]/.test(v)) out.flags.push({ kind: 'bad', text: 'Contains I, O or Q, which chassis numbers never use. Check for 1 or 0.' });
  if (v.length !== 17) {
    out.flags.push({ kind: 'warn', text: v.length < 17 ? v.length + ' characters. Cars built before 1981 have shorter chassis numbers that can’t be decoded automatically; newer cars have 17.' : v.length + ' characters. A modern chassis number has 17.' });
    return out;
  }
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return out;
  out.full = true;
  out.maker = WMI[v.slice(0, 3)] || null;
  out.year = vinYear(v[9]);
  const row = v.slice(3, 6) === 'ZZZ';
  out.market = row ? 'Rest of world' : 'USA / Canada';
  if (row || v[8] === 'Z') out.flags.push({ kind: 'ok', text: 'Rest-of-world format, which has no check digit to verify.' });
  else {
    const c = vinCheck(v);
    out.checkOk = c === v[8];
    out.flags.push(out.checkOk ? { kind: 'ok', text: 'Check digit is valid, so the number is typed correctly.' } : { kind: 'bad', text: 'Check digit should be ' + c + ', not ' + v[8] + '. One character is probably mistyped.' });
  }
  const isPorsche = out.maker === 'Porsche';
  if (isPorsche) {
    out.type = v[6] + v[7] + v[11];
    out.plant = PLANTS[v[10]] || null;
    out.variantCode = v[12];
    if (out.type === '964' && (v[12] === '7' || v[12] === '8')) out.variant = 'Turbo';
    if (out.type === '993' && v[12] === '7') out.variant = 'Turbo';
  }
  out.segs = [
    { chars: v.slice(0, 3), label: 'Maker', value: out.maker || 'Not recognised' },
    { chars: v.slice(3, 6), label: 'Spec', value: out.market },
    { chars: v.slice(6, 8), label: isPorsche ? 'Type' : 'Model', value: isPorsche ? out.type.slice(0, 2) + '…' : '' },
    { chars: v[8], label: 'Check', value: row ? 'None' : (out.checkOk ? 'Valid' : 'Fails') },
    { chars: v[9], label: 'Year', value: out.year ? String(out.year) : '?' },
    { chars: v[10], label: 'Plant', value: isPorsche ? (out.plant || '') : '' },
    { chars: v.slice(11), label: 'Serial', value: isPorsche ? 'Type ' + out.type + (out.variant ? ' ' + out.variant : '') : '' }
  ];
  return out;
}
const CATALOG = [{"name":"Porsche 356 Pre-A","family":"356 and early sports cars","from":1948,"to":1955,"median2020":null,"n":0},{"name":"Porsche 550 Spyder","family":"356 and early sports cars","from":1953,"to":1956,"median2020":null,"n":0},{"name":"Porsche 356 A Cabriolet","family":"356 and early sports cars","from":1955,"to":1959,"median2020":null,"n":0},{"name":"Porsche 356 A Coupe","family":"356 and early sports cars","from":1955,"to":1959,"median2020":86250,"n":13},{"name":"Porsche 356 A Speedster","family":"356 and early sports cars","from":1955,"to":1958,"median2020":241395,"n":10},{"name":"Porsche 356 B Cabriolet","family":"356 and early sports cars","from":1959,"to":1963,"median2020":96795,"n":11},{"name":"Porsche 356 B Coupe","family":"356 and early sports cars","from":1959,"to":1963,"median2020":59852,"n":15},{"name":"Porsche 356 B Roadster","family":"356 and early sports cars","from":1959,"to":1962,"median2020":140563,"n":11},{"name":"Porsche 356 C Cabriolet","family":"356 and early sports cars","from":1963,"to":1965,"median2020":115483,"n":17},{"name":"Porsche 356 C Coupe","family":"356 and early sports cars","from":1963,"to":1965,"median2020":65928,"n":17},{"name":"Porsche 904 Carrera GTS","family":"356 and early sports cars","from":1964,"to":1965,"median2020":null,"n":0},{"name":"Porsche 911 2.0 (early)","family":"911 early (1964-1973)","from":1964,"to":1968,"median2020":98801,"n":9},{"name":"Porsche 911 S Coupe","family":"911 early (1964-1973)","from":1966,"to":1977,"median2020":88652,"n":15},{"name":"Porsche 911 S Targa","family":"911 early (1964-1973)","from":1967,"to":1977,"median2020":54580,"n":15},{"name":"Porsche 911 T Coupe","family":"911 early (1964-1973)","from":1967,"to":1973,"median2020":67473,"n":13},{"name":"Porsche 911 T Targa","family":"911 early (1964-1973)","from":1967,"to":1973,"median2020":null,"n":0},{"name":"Porsche 911 E Coupe","family":"911 early (1964-1973)","from":1968,"to":1973,"median2020":79132,"n":14},{"name":"Porsche 911 E Targa","family":"911 early (1964-1973)","from":1968,"to":1973,"median2020":null,"n":0},{"name":"Porsche 911 Carrera RS 2.7 Lightweight","family":"911 early (1964-1973)","from":1972,"to":1973,"median2020":null,"n":0},{"name":"Porsche 911 Carrera RS 2.7 Touring","family":"911 early (1964-1973)","from":1972,"to":1973,"median2020":422172,"n":13},{"name":"Porsche 911 Carrera 2.7 Coupe","family":"911 G-series (1974-1989)","from":1974,"to":1977,"median2020":88817,"n":10},{"name":"Porsche 911 Carrera RS 3.0","family":"911 G-series (1974-1989)","from":1974,"to":1974,"median2020":null,"n":0},{"name":"Porsche 911 (930) Turbo Coupe","family":"911 G-series (1974-1989)","from":1975,"to":1989,"median2020":111200,"n":17},{"name":"Porsche 911 Carrera 3.0","family":"911 G-series (1974-1989)","from":1975,"to":1977,"median2020":66178,"n":14},{"name":"Porsche 911 SC","family":"911 G-series (1974-1989)","from":1978,"to":1983,"median2020":46162,"n":16},{"name":"Porsche 911 SC Targa and Cabriolet","family":"911 G-series (1974-1989)","from":1978,"to":1983,"median2020":null,"n":0},{"name":"Porsche 911 Carrera 3.2 Coupe","family":"911 G-series (1974-1989)","from":1984,"to":1989,"median2020":59713,"n":14},{"name":"Porsche 911 Carrera 3.2 Targa and Cabriolet","family":"911 G-series (1974-1989)","from":1984,"to":1989,"median2020":null,"n":0},{"name":"Porsche 911 (930) Turbo Targa and Cabriolet","family":"911 G-series (1974-1989)","from":1987,"to":1989,"median2020":null,"n":0},{"name":"Porsche 911 Carrera 3.2 Speedster","family":"911 G-series (1974-1989)","from":1989,"to":1989,"median2020":null,"n":0},{"name":"Porsche 911 (964) Carrera 2 Coupe","family":"911 (964)","from":1989,"to":1994,"median2020":72628,"n":15},{"name":"Porsche 911 (964) Carrera 4 Coupe","family":"911 (964)","from":1989,"to":1994,"median2020":79348,"n":18},{"name":"Porsche 911 (964) Carrera Targa and Cabriolet","family":"911 (964)","from":1989,"to":1994,"median2020":null,"n":0},{"name":"Porsche 911 (964) Turbo 3.3","family":"911 (964)","from":1990,"to":1992,"median2020":null,"n":28},{"name":"Porsche 911 (964) Carrera RS","family":"911 (964)","from":1991,"to":1993,"median2020":203566,"n":13},{"name":"Porsche 911 (964) Turbo S","family":"911 (964)","from":1992,"to":1994,"median2020":null,"n":0},{"name":"Porsche 911 (964) RS America","family":"911 (964)","from":1993,"to":1994,"median2020":null,"n":0},{"name":"Porsche 911 (964) Speedster","family":"911 (964)","from":1993,"to":1994,"median2020":152700,"n":18},{"name":"Porsche 911 (964) Turbo 3.6","family":"911 (964)","from":1993,"to":1994,"median2020":288320,"n":14},{"name":"Porsche 911 (993) Carrera 4","family":"911 (993)","from":1994,"to":1998,"median2020":null,"n":0},{"name":"Porsche 911 (993) Carrera Cabriolet","family":"911 (993)","from":1994,"to":1998,"median2020":null,"n":0},{"name":"Porsche 911 (993) Carrera Coupe","family":"911 (993)","from":1994,"to":1998,"median2020":64254,"n":17},{"name":"Porsche 911 (993) Carrera 4S","family":"911 (993)","from":1995,"to":1998,"median2020":112965,"n":15},{"name":"Porsche 911 (993) Carrera RS","family":"911 (993)","from":1995,"to":1996,"median2020":281563,"n":14},{"name":"Porsche 911 (993) GT2","family":"911 (993)","from":1995,"to":1998,"median2020":878097,"n":9},{"name":"Porsche 911 (993) Targa","family":"911 (993)","from":1995,"to":1998,"median2020":null,"n":0},{"name":"Porsche 911 (993) Turbo","family":"911 (993)","from":1995,"to":1998,"median2020":177753,"n":20},{"name":"Porsche 911 (993) Carrera S","family":"911 (993)","from":1996,"to":1998,"median2020":122382,"n":13},{"name":"Porsche 911 (993) Turbo S","family":"911 (993)","from":1997,"to":1998,"median2020":422578,"n":20},{"name":"Porsche 911 (996) Carrera Coupe","family":"911 (996)","from":1997,"to":2004,"median2020":22438,"n":15},{"name":"Porsche 911 (996) Carrera Cabriolet","family":"911 (996)","from":1998,"to":2004,"median2020":null,"n":0},{"name":"Porsche 911 (996) GT3","family":"911 (996)","from":1999,"to":2005,"median2020":83968,"n":18},{"name":"Porsche 911 (996) Turbo","family":"911 (996)","from":2000,"to":2005,"median2020":41544,"n":12},{"name":"Porsche 911 (996) Carrera 4S Coupe","family":"911 (996)","from":2001,"to":2005,"median2020":29589,"n":17},{"name":"Porsche 911 (996) GT2","family":"911 (996)","from":2001,"to":2005,"median2020":128380,"n":16},{"name":"Porsche 911 (996) Targa","family":"911 (996)","from":2001,"to":2005,"median2020":null,"n":0},{"name":"Porsche 912 Coupe","family":"912 and 914","from":1965,"to":1969,"median2020":42611,"n":14},{"name":"Porsche 914","family":"912 and 914","from":1969,"to":1976,"median2020":18547,"n":13},{"name":"Porsche 914/6","family":"912 and 914","from":1969,"to":1972,"median2020":70540,"n":12},{"name":"Porsche 912 E","family":"912 and 914","from":1975,"to":1976,"median2020":null,"n":0},{"name":"Porsche 924","family":"924, 944 and 968","from":1976,"to":1985,"median2020":5625,"n":18},{"name":"Porsche 924 Turbo","family":"924, 944 and 968","from":1978,"to":1984,"median2020":10108,"n":16},{"name":"Porsche 924 Carrera GT","family":"924, 944 and 968","from":1980,"to":1981,"median2020":54404,"n":13},{"name":"Porsche 944","family":"924, 944 and 968","from":1982,"to":1989,"median2020":10272,"n":17},{"name":"Porsche 944 Turbo","family":"924, 944 and 968","from":1985,"to":1991,"median2020":19271,"n":10},{"name":"Porsche 924 S","family":"924, 944 and 968","from":1986,"to":1988,"median2020":8726,"n":14},{"name":"Porsche 944 S","family":"924, 944 and 968","from":1986,"to":1988,"median2020":null,"n":0},{"name":"Porsche 944 Turbo S","family":"924, 944 and 968","from":1988,"to":1988,"median2020":null,"n":0},{"name":"Porsche 944 S2","family":"924, 944 and 968","from":1989,"to":1992,"median2020":13818,"n":16},{"name":"Porsche 968 Coupe","family":"924, 944 and 968","from":1991,"to":1995,"median2020":null,"n":0},{"name":"Porsche 968 Cabriolet","family":"924, 944 and 968","from":1992,"to":1995,"median2020":14704,"n":16},{"name":"Porsche 968 Club Sport","family":"924, 944 and 968","from":1993,"to":1995,"median2020":34304,"n":10},{"name":"Porsche 968 Turbo S","family":"924, 944 and 968","from":1993,"to":1994,"median2020":null,"n":0},{"name":"Porsche 968 Sport","family":"924, 944 and 968","from":1994,"to":1995,"median2020":14985,"n":17},{"name":"Porsche 928","family":"928 and 959","from":1977,"to":1982,"median2020":16152,"n":19},{"name":"Porsche 928 S and S2","family":"928 and 959","from":1979,"to":1986,"median2020":null,"n":0},{"name":"Porsche 959","family":"928 and 959","from":1986,"to":1988,"median2020":null,"n":0},{"name":"Porsche 928 S4","family":"928 and 959","from":1987,"to":1991,"median2020":20536,"n":18},{"name":"Porsche 928 GT","family":"928 and 959","from":1989,"to":1991,"median2020":null,"n":0},{"name":"Porsche 928 GTS","family":"928 and 959","from":1992,"to":1995,"median2020":55817,"n":17},{"name":"Porsche Boxster (986)","family":"Boxster","from":1996,"to":2004,"median2020":10893,"n":16},{"name":"Porsche Boxster S (986)","family":"Boxster","from":1999,"to":2004,"median2020":null,"n":0}];
const OPTIONAL = new Set(['porsche', 'coupe', 'early', 'touring']);
const STRONG = ['rs', 'turbo', 'gt2', 'gt3', 'speedster', 'targa', 'cabriolet', 'roadster', 's4', 'gts', 'gt', 'america', 'lightweight'];
function nameTokens(s) {
  return (s || '').toLowerCase().replace(/cabrio\b|\bconvertible\b/g, 'cabriolet').replace(/\bc2\b/g, 'carrera 2').replace(/\bc4s\b/g, 'carrera 4s').replace(/\bc4\b/g, 'carrera 4').replace(/clubsport|\bcs\b/g, 'club sport').replace(/\b356\s*([abc])\b/g, '356 $1').replace(/914[-\s]6/g, '914/6').replace(/\b965\b/g, '964')
    .split(/[^a-z0-9./]+/).map((t) => t.replace(/^\.+|\.+$/g, '')).filter(Boolean);
}
function suggestModel(car, vin) {
  const year = Number(car.year) || (vin && vin.year) || null;
  const t = new Set(nameTokens(car.name));
  const reasons = [];
  if (vin && vin.full && vin.maker === 'Porsche' && vin.type) {
    if (['964', '993', '996', '986', '924', '944', '968', '928', '930', '911'].includes(vin.type)) { t.add(vin.type); reasons.push('chassis number is a type ' + vin.type + (vin.variant ? ' ' + vin.variant : '')); }
    if (vin.variant === 'Turbo') t.add('turbo');
  }
  if (!t.size) return { model: null, reason: '' };
  if (['964', '993', '996', '930'].some((g) => t.has(g))) t.add('911');
  if (t.has('boxster')) t.add('986'); else if (t.has('986')) t.add('boxster');
  if (t.has('911') && !['964', '993', '996', '930'].some((g) => t.has(g)) && year) {
    const gen = year >= 1990 && year <= 1993 ? '964' : year >= 1995 && year <= 1998 ? '993' : year >= 1999 && year <= 2004 ? '996' : t.has('turbo') && year >= 1975 && year <= 1989 ? '930' : null;
    if (gen) { t.add(gen); reasons.push(year + ' cars are the ' + gen); }
    else if (t.has('carrera') && year >= 1984 && year <= 1989) t.add('3.2');
  }
  if (t.has('964') && t.has('turbo') && !t.has('3.3') && !t.has('3.6') && !t.has('s')) {
    if (!year) return { model: null, reason: 'Add the model year to tell a 3.3 from a 3.6.' };
    if (year <= 1992) { t.add('3.3'); reasons.push(year + ' cars are the 3.3'); }
    else { t.add('3.6'); reasons.push(year + ' cars are usually the 3.6 (a few 1993 cars are the 3.3 Turbo S)'); }
  }
  if ((t.has('964') || t.has('993')) && t.has('rs') && !t.has('america')) t.add('carrera');
  let best = null;
  for (const m of CATALOG) {
    let toks = nameTokens(m.name).filter((x) => !OPTIONAL.has(x)), alt = null;
    const a = toks.indexOf('and');
    if (a > 0) { alt = [toks[a - 1], toks[a + 1]]; toks = toks.filter((x, i) => i < a - 1 || i > a + 1); }
    if (!toks.every((x) => t.has(x))) continue;
    if (alt && !alt.some((x) => t.has(x))) continue;
    const all = toks.concat(alt || []);
    if (STRONG.some((x) => t.has(x) && !all.includes(x))) continue;
    const score = toks.length * 100 + (alt ? 100 : 0) + (year && year >= m.from && year <= m.to ? 10 : 0) + (m.n ? 1 : 0);
    if (!best || score > best.score) best = { m, score };
  }
  if (!best) return { model: null, reason: '' };
  if (!reasons.length) reasons.push('the name matches');
  return { model: best.m.name, reason: reasons.join(', ') };
}
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
function prepSales(rows) {
  return rows.map((r) => ({ id: r.id, date: r.date, model: r.model, variant: r.variant, year: r.model_year, price: +r.price, currency: r.currency, gbp: Math.round(+r.price * +r.fx_to_gbp), miles: r.mileage_mi === '' ? null : +r.mileage_mi, platform: r.platform, location: r.location, flag: r.flag }));
}
function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }
function marketFor(sales, model, carMiles, today) {
  const rs = sales.filter((r) => r.model === model);
  const y = +today.slice(0, 4);
  const back = (n) => (y - n) + today.slice(4);
  const inYear = (yr) => rs.filter((r) => r.date.startsWith(String(yr))).map((r) => r.gbp);
  const ytd = inYear(y), prev = inYear(y - 1);
  const last12 = rs.filter((r) => r.date >= back(1)).map((r) => r.gbp);
  const recent = rs.filter((r) => r.date >= back(2));
  const withMiles = recent.filter((r) => r.miles != null);
  let comps = [], band = null;
  if (carMiles) {
    band = [Math.round(carMiles * 0.5), Math.round(carMiles * 1.5)];
    comps = withMiles.filter((r) => r.miles >= band[0] && r.miles <= band[1]);
  }
  const cp = comps.map((r) => r.gbp).sort((a, b) => a - b);
  const quart = (p) => cp[Math.min(cp.length - 1, Math.max(0, Math.round((cp.length - 1) * p)))];
  const mY = median(ytd), mP = median(prev);
  return {
    total: rs.length, medianAll: median(rs.map((r) => r.gbp)), firstDate: rs.map((r) => r.date).sort()[0] || null, medianYtd: mY, nYtd: ytd.length, medianPrev: mP, nPrev: prev.length,
    change: mY != null && mP && ytd.length >= 3 && prev.length >= 3 ? (mY - mP) / mP : null, thin: ytd.length < 10 || prev.length < 10,
    median12: median(last12), n12: last12.length, low12: last12.length ? Math.min(...last12) : null, high12: last12.length ? Math.max(...last12) : null,
    band, comps, enoughComps: comps.length >= 3,
    compMedian: median(cp), compLow: cp.length ? quart(0.25) : null, compHigh: cp.length ? quart(0.75) : null,
    points: withMiles,
    byMiles: !!(carMiles && withMiles.length),
    nearest: carMiles && withMiles.length ? [...withMiles].sort((a, b) => Math.abs(a.miles - carMiles) - Math.abs(b.miles - carMiles)).slice(0, 8) : [...(recent.length ? recent : rs)].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
  };
}
/*PURE-END*/
