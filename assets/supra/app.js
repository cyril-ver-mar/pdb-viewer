/* Страница супрамолекулярной химии: состояние, 3D, графики, ссылка. */
(function () {
  'use strict';
  const D = window.SUPRA_DATA;
  const G = window.SupraGeom;
  const $ = id => document.getElementById(id);
  const DEFAULTS = {
    c: 'crown', n: 6, het: 'O', ann: '0', sub: 'H', guest: 'none', sandwich: '0',
    arm: 2, donor: 'OMe', pivot: 'N', pod: 'glyme', podN: 4, crypt: '222', iso: 'in',
    conf: 'cone', upper: 'tBu', lower: 'OH', rim: 'OMe', chir: 'p', mod: 'OH',
    other: 'porphin', topo: 'cat2', aza: 'cyclen', azaMetal: 'none', metal: 'none',
    sph: 'full', color: 'element', cavity: '1', contacts: '1', spin: '0'
  };
  const state = Object.assign({}, DEFAULTS);
  const NUM = { n: 1, arm: 1, podN: 1 };
  let viewer = null;
  let last = null;
  let timer = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }
  function bgHex() {
    const dark = document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    return dark ? 0x101820 : 0xf7f9fc;
  }
  function readUrl() {
    const q = new URLSearchParams(location.search);
    Object.keys(DEFAULTS).forEach(k => {
      if (!q.has(k)) return;
      state[k] = NUM[k] ? parseInt(q.get(k), 10) || DEFAULTS[k] : q.get(k);
    });
    if (q.has('benzo') && !q.has('ann')) state.ann = q.get('benzo');
    const alias = { cucurbituril: 'cb', cyclodextrin: 'cd', crownether: 'crown' };
    if (alias[state.c]) state.c = alias[state.c];
  }
  function writeUrl() {
    const u = new URL(location.href);
    u.search = '';
    Object.keys(DEFAULTS).forEach(k => {
      if (String(state[k]) !== String(DEFAULTS[k])) u.searchParams.set(k, state[k]);
    });
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
  function shareUrl() {
    const u = new URL('supra.html', location.href);
    Object.keys(DEFAULTS).forEach(k => {
      if (String(state[k]) !== String(DEFAULTS[k])) u.searchParams.set(k, state[k]);
    });
    return u.href;
  }

  function snapN(c, n) {
    n = n | 0;
    if (c === 'crown' || c === 'lariat') return Math.max(3, Math.min(10, n || 6));
    if (c === 'cb') return Math.max(5, Math.min(8, n || 6));
    if (c === 'cd') return Math.max(6, Math.min(8, n || 7));
    if (c === 'calix') {
      const a = [4, 5, 6, 8];
      return a.reduce((b, v) => Math.abs(v - n) < Math.abs(b - n) ? v : b, 4);
    }
    if (c === 'pillar') return n >= 6 ? 6 : 5;
    return n || 6;
  }

  function chargeHex(q) {
    if (q == null || !isFinite(+q)) return '#d1d5db';
    const t = Math.max(-1, Math.min(1, (+q) / 0.6));
    const u = Math.abs(t);
    const g = Math.round(255 * (1 - u));
    const h = v => v.toString(16).padStart(2, '0');
    if (t >= 0) return '#' + [255, g, g].map(h).join('');
    return '#' + [g, g, 255].map(h).join('');
  }
  function lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }; }

  function ensureViewer() {
    if (viewer) return viewer;
    const el = $('viewer');
    viewer = $3Dmol.createViewer(el, { backgroundColor: bgHex(), antialias: true });
    return viewer;
  }
  function styleModel(v, mol) {
    if (state.color === 'charge') {
      mol.atoms.forEach((a, i) => {
        const col = chargeHex(a.q);
        const scale = a.ion ? 0.55 : (a.el === 'H' ? 0.18 : 0.25);
        v.setStyle({ serial: i + 1 }, { stick: { radius: a.el === 'H' ? 0.08 : 0.14, color: col }, sphere: { scale: scale, color: col } });
      });
    } else {
      v.setStyle({}, { stick: { radius: 0.14 }, sphere: { scale: 0.25 } });
      v.setStyle({ elem: 'H' }, { stick: { radius: 0.08 }, sphere: { scale: 0.16 } });
      ['Li', 'Na', 'K', 'Rb', 'Cs', 'Cu', 'Zn', 'Ni', 'Fe'].forEach(el => {
        v.setStyle({ elem: el }, { sphere: { scale: 0.6 } });
      });
    }
  }
  function drawContacts(v, built) {
    if (state.contacts !== '1' || !built.contacts) return;
    built.contacts.forEach(c => {
      const a = built.mol.atoms[c.i], b = built.mol.atoms[c.j];
      if (!a || !b) return;
      const color = c.kind === 'metal' ? '#db2777' : '#0284c7';
      const n = 7;
      for (let i = 0; i < n; i += 2) {
        v.addCylinder({
          start: lerp(a, b, i / n),
          end: lerp(a, b, Math.min(1, (i + 1) / n)),
          radius: 0.04,
          color: color,
          fromCap: 1,
          toCap: 1
        });
      }
    });
  }
  function draw(built, animate) {
    const v = ensureViewer();
    v.setBackgroundColor(bgHex());
    if (v.removeAllShapes) v.removeAllShapes();
    if (v.removeAllModels) v.removeAllModels();
    if (v.removeAllSurfaces) v.removeAllSurfaces();
    const guests = built.mol.atoms.filter(a => a.role === 'guest');
    const finals = guests.map(a => ({ x: a.x, y: a.y, z: a.z }));
    const motion = animate && guests.length && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (motion) guests.forEach(a => { a.z += 14; });
    const sdf = G.sdfOf(built.mol);
    v.addModel(sdf, 'sdf');
    styleModel(v, built.mol);
    if (state.cavity === '1' && built.cavity && built.cavity.diameter) {
      v.addSphere({
        center: built.cavity.center,
        radius: Math.max(0.45, built.cavity.diameter / 2),
        color: 0x7eb6ff,
        opacity: 0.22
      });
    }
    if (!motion) drawContacts(v, built);
    v.zoomTo();
    v.render();
    if (state.spin === '1') v.spin('y', 0.35); else v.spin(false);
    if (!motion) return;
    const t0 = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - t0) / 700);
      const e = t * t * (3 - 2 * t);
      guests.forEach((a, i) => {
        a.x = finals[i].x; a.y = finals[i].y; a.z = finals[i].z + (1 - e) * 14;
      });
      if (v.removeAllModels) v.removeAllModels();
      if (v.removeAllShapes) v.removeAllShapes();
      v.addModel(G.sdfOf(built.mol), 'sdf');
      styleModel(v, built.mol);
      if (state.cavity === '1' && built.cavity && built.cavity.diameter) {
        v.addSphere({ center: built.cavity.center, radius: Math.max(0.45, built.cavity.diameter / 2), color: 0x7eb6ff, opacity: 0.22 });
      }
      if (t === 1) drawContacts(v, built);
      v.render();
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function titleOf(st, built) {
    const m = snapN(st.c, st.n);
    if (st.c === 'crown' || st.c === 'lariat') {
      const ring = 3 * m;
      let name = ring + '-краун-' + m;
      if (st.het === 'S') name = 'тиа-' + name;
      if (st.het === 'NH') name = 'аза-' + name;
      if (st.het === 'NMe') name = 'N-метилаза-' + name;
      if (st.het === 'diaza') name = 'диаза-' + name;
      if (st.het === 'NOS') name = 'смешанный ' + name;
      if (st.ann === '1') name = 'бензо-' + name;
      if (st.ann === '2') name = 'дибензо-' + name;
      if (st.ann === 'cy') name = 'дициклогексано-' + name;
      if (st.c === 'lariat') name = (st.pivot === 'N' ? 'N' : 'C') + '-лариат, ' + name;
      if (st.sandwich === '1') name = 'сэндвич 2× ' + name;
      return name;
    }
    if (st.c === 'cb') return 'кукурбит[' + m + ']урил';
    if (st.c === 'cd') return (m === 6 ? 'α' : m === 7 ? 'β' : 'γ') + '-циклодекстрин';
    if (st.c === 'calix') return 'каликс[' + m + ']арен';
    if (st.c === 'pillar') return 'пиллар[' + m + ']арен';
    if (st.c === 'crypt') return 'криптанд [' + String(st.crypt).split('').filter(ch => /[0-9]/.test(ch)).join('.') + ']';
    if (st.c === 'spherand') return st.sph === 'hemi' ? 'гемисферанд' : 'сферанд';
    if (st.c === 'aza') return st.aza === 'cyclam' ? 'циклам' : 'циклен';
    if (st.c === 'podand') return st.pod === 'tripod' ? 'триподанд' : 'глим n=' + (st.podN | 0);
    if (st.c === 'other') return { porphin: 'порфин', bluebox: 'синяя коробка', ctv: 'циклотривератрилен', resorcin: 'резорцинарен', cavitand: 'кавитанд' }[st.other] || st.other;
    if (st.c === 'topo') return { cat2: '[2]катенан', cat3: '[3]катенан', rot: '[2]ротаксан', pseudo: 'псевдоротаксан', daisy: 'дейзи-чейн', trefoil: 'трилистник', solomon: 'зацепление Соломона', borro: 'кольца Борромео', penta: 'пентафойл' }[st.topo] || st.topo;
    return built && built.name || 'хозяин';
  }
  function systematic(st) {
    if (st.c !== 'crown' && st.c !== 'lariat') return '';
    const m = snapN(st.c, st.n);
    const ring = 3 * m;
    const pos = [];
    for (let i = 0; i < m; i++) pos.push(1 + 3 * i);
    const words = ['', 'моно', 'ди', 'три', 'тетра', 'пента', 'гекса', 'гепта', 'окта', 'нона', 'дека'];
    const rings = { 9: 'нонан', 12: 'додекан', 15: 'пентадекан', 18: 'октадекан', 21: 'генэйкозан', 24: 'тетракозан', 27: 'гептакозан', 30: 'триаконтан' };
    const hetero = st.het === 'S' ? 'тиа' : (st.het === 'NH' || st.het === 'NMe' || st.het === 'diaza' ? 'аза' : 'окса');
    const root = rings[ring];
    if (!root || st.het === 'NOS' || st.het === 'diaza') return 'Цикл из ' + ring + ' атомов, доноров: ' + m + '. Положения гетероатомов: ' + pos.join(', ') + '.';
    return pos.join(',') + '-' + (words[m] || (m + '-')) + hetero + 'цикло' + root + '.';
  }

  function litCavity(st) {
    const m = snapN(st.c, st.n);
    if (st.c === 'crown' || st.c === 'lariat') {
      const t = { 4: '1,2–1,5 Å', 5: '1,7–2,2 Å', 6: '2,6–3,2 Å', 7: '3,4–4,3 Å', 8: 'около 4,5–5,0 Å' };
      return t[m] ? 'Таблица для ' + (3 * m) + '-краун-' + m + ': ' + t[m] + '.' : 'Для этого размера табличный ряд Педерсена обычно не приводят, смотрите оценку модели.';
    }
    if (st.c === 'cb') {
      const t = { 5: 'портал 2,4 Å, полость 4,4 Å', 6: 'портал 3,9 Å, полость 5,8 Å', 7: 'портал 5,4 Å, полость 7,3 Å', 8: 'портал 6,9 Å, полость 8,8 Å' };
      return 'CB[' + m + ']: ' + (t[m] || '') + ', высота около 9,1 Å.';
    }
    if (st.c === 'cd') {
      const t = { 6: '4,7–5,3 Å (α)', 7: '6,0–6,5 Å (β)', 8: '7,5–8,3 Å (γ)' };
      return 'Внутренний диаметр ' + t[m] + ', высота около 7,9 Å.';
    }
    if (st.c === 'crypt') {
      const key = String(st.crypt).replace(/\D/g, '');
      const t = { '111': 'около 1 Å', '211': 'около 1,6 Å', '221': 'около 2,2 Å', '222': 'около 2,8 Å', '322': 'около 3,5 Å' };
      return 'Ориентир полости [' + key.split('').join('.') + ']: ' + (t[key] || 'см. текст') + '.';
    }
    if (st.c === 'pillar') return m === 5 ? 'Полость пиллар[5]арена около 4,7 Å.' : 'Пиллар[6]арен заметно шире пиллар[5]арена.';
    if (st.c === 'spherand' && st.sph !== 'hemi') return 'Жёсткая полость сферанда около 1,6 Å.';
    return '';
  }
  function fitPhrase(diam) {
    if (!diam) return '';
    return D.ions.map(ion => {
      const diff = Math.abs(diam - ion.d);
      const cls = diff < 0.45 ? 'good' : diff < 0.9 ? 'mid' : '';
      const word = diff < 0.45 ? 'размер близкий' : ion.d < diam ? 'ион меньше' : 'ион крупнее';
      return '<i class="' + cls + '">' + esc(ion.label) + ' ' + ion.d.toFixed(2) + ' Å · ' + word + '</i>';
    }).join('');
  }

  function renderBadge(built) {
    const name = titleOf(state, built);
    const cav = built.cavity && built.cavity.diameter ? built.cavity.diameter.toFixed(2) + ' Å' : '—';
    $('badge').innerHTML = '<b>' + esc(name) + '</b><span id="hostFormula">' + esc(built.hostFormula) + '</span> · полость <span id="cavVal">' + esc(cav) + '</span>';
    const el = $('atomCount');
    if (el) el.textContent = String(built.atomCount);
  }
  function renderInfo(built) {
    const block = D.text[state.c] || D.text.crown;
    const name = titleOf(state, built);
    const cav = built.cavity && built.cavity.diameter ? built.cavity.diameter.toFixed(2) : null;
    let html = '<h2>' + esc(name) + '</h2>';
    html += '<p class="lead">' + esc(block.lead) + '</p>';
    html += '<p><b>Формула хозяина:</b> ' + esc(built.hostFormula) + ' (' + built.mol.atoms.filter(a => a.role !== 'guest').length + ' атомов). ';
    html += '<b>Вся модель:</b> ' + esc(built.formula) + ' (' + built.atomCount + ' атомов).</p>';
    html += '<p class="muted">' + esc(systematic(state)) + '</p>';
    if (cav) {
      html += '<p><b>Просвет на модели:</b> ' + cav + ' Å. ';
      html += esc(litCavity(state)) + ' Модель меряет расстояние между ван-дер-ваальсовыми поверхностями доноров, таблица — принятый в учебниках диаметр. Они близки, но не обязаны совпасть до десятой.</p>';
      html += '<div class="match">' + fitPhrase(+cav) + '</div>';
    } else html += '<p class="muted">' + esc(litCavity(state) || 'У этой молекулы нет одной круглой полости.') + '</p>';
    if (built.meta && built.meta.sandwich) html += '<p>Сэндвич: два одинаковых макроцикла и катион между ними.</p>';
    html += '<details open><summary>История и номенклатура</summary><p>' + esc(block.history) + '</p></details>';
    html += '<details><summary>Полость</summary><p>' + esc(block.cavity) + '</p></details>';
    html += '<details><summary>Гости и константы</summary><p>' + esc(block.guests) + '</p><p class="note">' + esc(block.cite) + '</p></details>';
    if (state.c === 'topo') {
      html += '<p>Пересечения на рисунке — места, где нить проходит выше или ниже. Механическая связь не рисуется палочкой: части нельзя разнять, не разорвав ковалентную цепь. У колец Борромео любая пара по отдельности распадается, вместе — нет.</p>';
    }
    $('info').innerHTML = html;
  }

  function axisChart(series) {
    const ions = D.ions;
    const W = 640, H = 280, L = 46, R = 12, T = 16, B = 36;
    const maxK = 11;
    const minR = 0.6, maxR = 1.8;
    const X = r => L + (r - minR) / (maxR - minR) * (W - L - R);
    const Y = k => T + (1 - k / maxK) * (H - T - B);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="log K от радиуса катиона">';
    s += '<line class="axis" x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '"/>';
    s += '<line class="axis" x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (H - B) + '"/>';
    for (let k = 0; k <= 10; k += 2) {
      const y = Y(k);
      s += '<line class="axis" x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y + '" opacity="0.5"/>';
      s += '<text x="' + (L - 6) + '" y="' + (y + 4) + '" font-size="12" text-anchor="end">' + k + '</text>';
    }
    ions.forEach(ion => {
      const x = X(ion.r);
      s += '<text x="' + x + '" y="' + (H - 14) + '" font-size="12" text-anchor="middle">' + ion.label + '</text>';
    });
    s += '<text x="' + (L + 8) + '" y="14" font-size="12">log K</text>';
    series.forEach(ser => {
      const pts = ions.filter(ion => ser.k[ion.id] != null).map(ion => [X(ion.r), Y(ser.k[ion.id])]);
      if (pts.length >= 2) s += '<polyline fill="none" stroke="' + ser.color + '" stroke-width="2.5" points="' + pts.map(p => p.join(',')).join(' ') + '"/>';
      ions.forEach(ion => {
        if (ser.k[ion.id] == null) return;
        s += '<circle cx="' + X(ion.r) + '" cy="' + Y(ser.k[ion.id]) + '" r="4.5" fill="' + ser.color + '"><title>' + ser.name + ' ' + ion.label + ' ' + ser.k[ion.id] + '</title></circle>';
      });
    });
    let lx = L + 8;
    series.forEach(ser => {
      s += '<rect x="' + lx + '" y="' + (H - 12) + '" width="10" height="10" fill="' + ser.color + '"/>';
      s += '<text x="' + (lx + 14) + '" y="' + H + '" font-size="11">' + ser.name + '</text>';
      lx += ser.name.length * 7 + 36;
    });
    s += '</svg>';
    return s;
  }
  function barChart() {
    const rows = D.bars;
    const W = 640, H = 220, L = 120, R = 24, T = 16;
    const maxK = 12;
    const bw = 28;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Макроциклический и криптатный эффект для K+">';
    rows.forEach((row, i) => {
      const y = T + i * 56;
      const w = (row.k / maxK) * (W - L - R);
      s += '<text x="' + (L - 8) + '" y="' + (y + 18) + '" font-size="14" text-anchor="end">' + row.name + '</text>';
      s += '<text x="' + (L - 8) + '" y="' + (y + 34) + '" font-size="11" text-anchor="end" opacity="0.7">' + row.sub + '</text>';
      s += '<rect x="' + L + '" y="' + y + '" width="' + w + '" height="' + bw + '" rx="6" fill="' + ['#64748b', '#1f6fd6', '#db2777'][i] + '"/>';
      s += '<text x="' + (L + w + 6) + '" y="' + (y + 19) + '" font-size="14">' + row.k.toFixed(1) + '</text>';
    });
    s += '</svg>';
    return s;
  }
  function renderCharts() {
    $('charts').innerHTML =
      '<h3>Селективность: log K и радиус катиона</h3>' +
      axisChart(D.series) +
      '<p class="note">18-краун-6 и порядок величин для 15-краун-5 — метанол, 25 °C, комплексы 1:1 (R. M. Izatt и др., Chem. Rev. 1985, 85, 271). У 15-краун-5 константы 1:1 близки, зато Na⁺ часто собирает сэндвич. [2.2.2] — 95% метанол, типичные log K по J.-M. Lehn, J.-P. Sauvage, J. Am. Chem. Soc. 1975, 97, 6700. Радиусы — Shannon, 1976, КЧ 6. Это справочник, не измерение на этой странице.</p>' +
      '<h3>Макроциклический и криптатный эффект, K⁺</h3>' +
      barChart() +
      '<p class="note">Пентаглим (открытый аналог) около 2, 18-краун-6 — 6,1, криптанд [2.2.2] — 10,4 в метаноле. Четыре порядка между ступенями — учебная оценка эффекта. Цифра поданда зависит от статьи; 6,10 и 10,4 — те же источники, что у графика выше. В воде все константы меньше (K⁺@18-краун-6 около 2,0; K⁺@[2.2.2] около 5,4), но порядок сохраняется.</p>';
  }

  function field(label, html) { return '<label class="f">' + label + '</label>' + html; }
  function sel(id, options, value) {
    return '<select id="' + id + '">' + options.map(o => '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
  }
  function range(id, min, max, value, step) {
    return '<input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + (step || 1) + '" value="' + value + '">';
  }
  function renderControls() {
    const c = state.c;
    const bits = [];
    const presets = D.presets.filter(p => p.c === c);
    if (presets.length) {
      bits.push('<div class="presets" id="presets">' + presets.map((p, i) => '<button type="button" class="preset" data-i="' + D.presets.indexOf(p) + '">' + esc(p.label) + '</button>').join('') + '</div>');
    }
    if (c === 'crown' || c === 'lariat') {
      const m = snapN(c, state.n);
      bits.push(field('Донорных атомов в цикле: ' + m + ' → ' + (3 * m) + '-краун-' + m, range('n', 4, 10, m)));
      bits.push(field('Гетероатомы', sel('het', [['O', 'все O'], ['S', 'все S, тиакраун'], ['NH', 'все NH, азакраун'], ['NMe', 'все N–Me'], ['diaza', 'два NH напротив'], ['NOS', 'смесь O/NH/S']], state.het)));
      bits.push(field('Аннелирование', sel('ann', [['0', 'нет'], ['1', 'бензо'], ['2', 'дибензо'], ['cy', 'дициклогексано']], state.ann)));
      bits.push(field('Заместитель на углероде', sel('sub', [['H', 'H'], ['Me', 'один метил'], ['MeAll', 'метилы на всех CH₂']], state.sub)));
      if (c === 'lariat') {
        bits.push('<div class="grid2">' + field('Опора руки', sel('pivot', [['N', 'N-лариат'], ['C', 'C-лариат']], state.pivot)) + field('Концевой донор', sel('donor', [['OMe', 'OCH₃'], ['OH', 'OH'], ['NH2', 'NH₂'], ['SMe', 'SCH₃']], state.donor)) + '</div>');
        bits.push(field('Длина руки, звенья CH₂: ' + (state.arm | 0), range('arm', 1, 4, state.arm | 0)));
      } else {
        bits.push('<label class="check"><input type="checkbox" id="sandwich"' + (state.sandwich === '1' ? ' checked' : '') + '> Сэндвич из двух краунов</label>');
      }
    } else if (c === 'cb') {
      bits.push(field('n в CB[n]: ' + snapN(c, state.n), range('n', 5, 8, snapN(c, state.n))));
    } else if (c === 'cd') {
      const m = snapN(c, state.n);
      bits.push(field('Остатков глюкозы: ' + m + ' (' + (m === 6 ? 'α' : m === 7 ? 'β' : 'γ') + ')', range('n', 6, 8, m)));
      bits.push(field('Модификация', sel('mod', [['OH', 'природные OH'], ['Me', 'перметил'], ['HP', 'гидроксипропил по O2/O6']], state.mod)));
    } else if (c === 'calix') {
      const m = snapN(c, state.n);
      bits.push(field('n каликс[n]арена: ' + m, range('n', 4, 8, m)));
      if (m === 4) bits.push(field('Конформация', sel('conf', [['cone', 'конус'], ['pcone', 'частичный конус'], ['12alt', '1,2-альтернат'], ['13alt', '1,3-альтернат']], state.conf)));
      bits.push('<div class="grid2">' + field('Верхний обод', sel('upper', [['tBu', 'п-трет-бутил'], ['H', 'H'], ['SO3', 'сульфонато']], state.upper)) + field('Нижний обод', sel('lower', [['OH', 'OH'], ['OMe', 'OMe'], ['OPr', 'OPr'], ['crown', 'краун-мостик']], state.lower)) + '</div>');
    } else if (c === 'pillar') {
      bits.push(field('n пиллар[n]арена: ' + snapN(c, state.n), range('n', 5, 6, snapN(c, state.n))));
      bits.push('<div class="grid2">' + field('Обод', sel('rim', [['OMe', 'OMe'], ['OEt', 'OEt']], state.rim)) + field('Наклон звеньев', sel('chir', [['p', 'в одну сторону'], ['m', 'в другую']], state.chir)) + '</div>');
    } else if (c === 'crypt') {
      bits.push(field('Криптанд', sel('crypt', [['111', '[1.1.1]'], ['211', '[2.1.1]'], ['221', '[2.2.1]'], ['222', '[2.2.2]'], ['322', '[3.2.2]']], String(state.crypt).replace(/\D/g, '') || '222')));
      bits.push(field('Изомер мостиковых азотов', sel('iso', [['in', 'in-in'], ['out', 'out-out'], ['inout', 'in-out']], state.iso)));
    } else if (c === 'podand') {
      bits.push(field('Тип', sel('pod', [['glyme', 'глим, цепь'], ['tripod', 'триподанд']], state.pod)));
      bits.push(field('Звеньев –CH₂CH₂O– в руке: ' + (state.podN | 0), range('podN', 1, state.pod === 'tripod' ? 3 : 6, state.podN | 0)));
    } else if (c === 'spherand') {
      bits.push(field('Хозяин', sel('sph', [['full', 'сферанд, 6 анизолов'], ['hemi', 'гемисферанд']], state.sph)));
    } else if (c === 'aza') {
      bits.push(field('Макроцикл', sel('aza', [['cyclen', 'циклен'], ['cyclam', 'циклам']], state.aza)));
      bits.push(field('Ион в центре', sel('azaMetal', [['none', 'нет'], ['Cu', 'Cu²⁺'], ['Ni', 'Ni²⁺'], ['Zn', 'Zn²⁺']], state.azaMetal)));
    } else if (c === 'other') {
      bits.push(field('Макроцикл', sel('other', [['porphin', 'порфин'], ['bluebox', 'синяя коробка CBPQT⁴⁺'], ['ctv', 'циклотривератрилен'], ['resorcin', 'резорцинарен'], ['cavitand', 'кавитанд']], state.other)));
      if (state.other === 'porphin') bits.push(field('Металл', sel('metal', [['none', 'без металла'], ['Zn', 'Zn²⁺'], ['Fe', 'Fe²⁺']], state.metal)));
    } else if (c === 'topo') {
      bits.push(field('Объект', sel('topo', [['cat2', '[2]катенан'], ['cat3', '[3]катенан'], ['rot', '[2]ротаксан'], ['pseudo', 'псевдоротаксан'], ['daisy', 'дейзи-чейн'], ['trefoil', 'трилистный узел'], ['solomon', 'зацепление Соломона'], ['borro', 'кольца Борромео'], ['penta', 'пентафойл']], state.topo)));
    }
    if (c !== 'topo' && c !== 'podand') {
      bits.push(field('Гость', sel('guest', D.guests.map(g => [g.id, g.label]), state.guest)));
    }
    $('controls').innerHTML = '<h2>Собрать хозяина</h2>' + bits.join('') +
      '<div class="rowbtns"><button type="button" class="btn primary" id="insert">Вставить гостя</button>' +
      '<button type="button" class="btn" id="dlSdf">SDF</button><button type="button" class="btn" id="dlPdb">PDB</button>' +
      '<button type="button" class="btn" id="openViewer">Открыть в просмотрщике</button>' +
      '<button type="button" class="btn" id="copyLink">Ссылка</button><button type="button" class="btn" id="showQr">QR</button></div>' +
      '<p class="note" id="linkOut"></p><p class="note">Атомов в модели: <b id="atomCount">0</b>. Геометрия учебная: фрагменты и короткая релаксация связей, углов и отталкивания.</p>';
    wireControls();
  }
  function wireControls() {
    const root = $('controls');
    root.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('input', onControl);
      el.addEventListener('change', onControl);
    });
    const ins = $('insert');
    if (ins) ins.onclick = () => rebuild(true);
    $('dlSdf').onclick = () => download('sdf');
    $('dlPdb').onclick = () => download('pdb');
    $('openViewer').onclick = openInViewer;
    $('copyLink').onclick = copyLink;
    $('showQr').onclick = showQr;
    root.querySelectorAll('.preset').forEach(b => b.addEventListener('click', () => applyPreset(+b.dataset.i)));
  }
  function onControl(ev) {
    const el = ev.target;
    if (el.id === 'sandwich') state.sandwich = el.checked ? '1' : '0';
    else if (el.id === 'n' || el.id === 'arm' || el.id === 'podN') state[el.id] = parseInt(el.value, 10);
    else if (el.id) state[el.id] = el.value;
    if (el.id === 'n') { state.n = snapN(state.c, state.n); el.value = state.n; }
    clearTimeout(timer);
    timer = setTimeout(() => rebuild(false), 40);
  }
  function applyPreset(i) {
    const p = D.presets[i];
    if (!p) return;
    Object.keys(DEFAULTS).forEach(k => { if (p.state[k] == null && k !== 'c') return; });
    Object.assign(state, DEFAULTS, p.state);
    state.n = snapN(state.c, state.n);
    renderClassChips();
    renderControls();
    rebuild(true);
  }

  function rebuild(animate) {
    window.SUPRA.ready = false;
    try {
      state.n = snapN(state.c, state.n);
      last = G.build(state);
    } catch (err) {
      $('err').hidden = false;
      $('err').textContent = 'Не удалось собрать модель.';
      window.SUPRA.ready = true;
      return;
    }
    $('err').hidden = !last.nan;
    if (last.nan) $('err').textContent = 'В координатах появилось нечисловое значение.';
    draw(last, !!animate);
    renderBadge(last);
    renderInfo(last);
    writeUrl();
    const pub = window.SUPRA;
    pub.ready = true;
    pub.hostFormula = last.hostFormula;
    pub.formula = last.formula;
    pub.atomCount = last.atomCount;
    pub.nan = last.nan;
    pub.cavityDiameter = last.cavity && last.cavity.diameter;
    pub.state = Object.assign({}, state);
  }

  function deflateB64(text) {
    const u8 = window.pako.deflateRaw(new TextEncoder().encode(text), { level: 9 });
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function download(kind) {
    if (!last) return;
    const text = kind === 'pdb' ? G.pdbOf(last.mol) : G.sdfOf(last.mol);
    const name = (last.name || 'supra').replace(/[^\w.-]+/g, '_') + '.' + kind;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'chemical/x-mdl-sdfile' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function openInViewer() {
    if (!last) return;
    const sdf = G.sdfOf(last.mol);
    const enc = deflateB64(sdf);
    const u = new URL('index.html', location.href);
    const base = (last.name || 'supra').replace(/[^\w.-]+/g, '_');
    u.hash = 'd=' + enc + '&n=' + encodeURIComponent(base + '.sdf') + '&fmt=sdf&style=ballstick';
    window.open(u.href, '_blank', 'noopener');
  }
  async function copyLink() {
    const url = shareUrl();
    try { await navigator.clipboard.writeText(url); } catch (e) { /* ниже покажем адрес */ }
    $('linkOut').textContent = url;
  }
  function showQr() {
    const url = shareUrl();
    $('qrUrl').textContent = url;
    const canvas = $('qrCanvas');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, W);
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    const n = q.getModuleCount();
    const cell = Math.floor(W / (n + 8)) || 2;
    const off = Math.floor((W - cell * n) / 2);
    ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
    $('qrDialog').showModal();
  }

  function renderClassChips() {
    $('classChips').innerHTML = D.classes.map(c => '<button type="button" data-c="' + c.id + '"' + (c.id === state.c ? ' class="on"' : '') + '>' + esc(c.title) + '</button>').join('');
    $('classChips').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      state.c = b.dataset.c;
      state.n = snapN(state.c, state.n);
      state.guest = 'none';
      state.sandwich = '0';
      renderClassChips();
      renderControls();
      rebuild(false);
    }));
  }
  function setTheme(mode) {
    if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = mode;
    try { localStorage.setItem('supra-theme', mode); } catch (e) { /* приватный режим */ }
    if (viewer) viewer.setBackgroundColor(bgHex());
    if (viewer) viewer.render();
  }
  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem('supra-theme'); } catch (e) { saved = null; }
    if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
    $('themeBtn').onclick = () => {
      const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      setTheme(cur === 'dark' ? 'light' : 'dark');
    };
  }
  function tool(id, on) {
    const b = $(id);
    b.classList.toggle('on', on);
  }

  window.SUPRA = { ready: false, state: state, hostFormula: '', formula: '', atomCount: 0, nan: false, cavityDiameter: null };
  readUrl();
  state.n = snapN(state.c, state.n);
  initTheme();
  renderClassChips();
  renderControls();
  renderCharts();
  $('spinBtn').onclick = () => { state.spin = state.spin === '1' ? '0' : '1'; tool('spinBtn', state.spin === '1'); if (viewer) { if (state.spin === '1') viewer.spin('y', 0.35); else viewer.spin(false); viewer.render(); } writeUrl(); };
  $('cavBtn').onclick = () => { state.cavity = state.cavity === '1' ? '0' : '1'; tool('cavBtn', state.cavity === '1'); rebuild(false); };
  $('colBtn').onclick = () => { state.color = state.color === 'charge' ? 'element' : 'charge'; tool('colBtn', state.color === 'charge'); $('colBtn').textContent = state.color === 'charge' ? 'Заряд' : 'Элементы'; rebuild(false); };
  $('ixBtn').onclick = () => { state.contacts = state.contacts === '1' ? '0' : '1'; tool('ixBtn', state.contacts === '1'); rebuild(false); };
  $('resetBtn').onclick = () => { if (viewer) { viewer.zoomTo(); viewer.render(); } };
  tool('cavBtn', state.cavity === '1');
  tool('ixBtn', state.contacts === '1');
  window.addEventListener('resize', () => { if (viewer) viewer.resize(); });
  rebuild(false);
})();
