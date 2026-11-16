(function () {
  'use strict';
  const IX = window.IXLab;
  const $ = (id) => document.getElementById(id);
  if (!IX) {
    document.body.innerHTML = '<p>Не загрузилась модель.</p>';
    return;
  }

  const boot = IX.stateFromSearch(location.search);
  let preset = boot.preset;
  let geom = Object.assign({}, boot.geom);
  let unit = boot.unit || localStorage.getItem('ix-unit') || 'kJ';
  let theme = boot.theme || localStorage.getItem('ix-theme') ||
    (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  let labelsOn = true, holesOn = true, shellsOn = true, spinOn = false;
  let lessonType = '';
  let qrTimer = 0;
  let frame = 0;

  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    $('bTheme').textContent = theme === 'dark' ? 'Светлая' : 'Тёмная';
    $('bTheme').classList.toggle('on', theme === 'dark');
  }
  function fmtNum(v, digits) {
    if (!isFinite(v)) return '—';
    return v.toFixed(digits == null ? 1 : digits).replace('.', ',').replace('-', '−');
  }
  function energyText(kJ) {
    const v = unit === 'kcal' ? kJ / IX.KCAL : kJ;
    const u = unit === 'kcal' ? 'ккал/моль' : 'кДж/моль';
    return fmtNum(v, 1) + ' ' + u;
  }

  function renderTypes() {
    const box = $('types');
    box.innerHTML = '';
    IX.TYPES.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip type' + (t.id === preset.type ? ' sel' : '');
      b.style.setProperty('--c', t.color);
      b.textContent = t.name;
      b.onclick = () => {
        if (preset.type === t.id) return;
        preset = IX.presetsOf(t.id)[0];
        geom = Object.assign({}, preset.defaults);
        renderTypes();
        buildControls();
        renderLesson();
        schedule(true);
      };
      box.appendChild(b);
    });
    const boxP = $('presets');
    boxP.innerHTML = '';
    IX.presetsOf(preset.type).forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (p.id === preset.id ? ' sel' : '');
      b.textContent = p.name;
      b.onclick = () => {
        preset = p;
        geom = Object.assign({}, p.defaults);
        buildControls();
        renderTypes();
        schedule(true);
      };
      boxP.appendChild(b);
    });
  }

  function buildControls() {
    const box = $('sliders');
    box.innerHTML = '';
    preset.controls.forEach(c => {
      const lab = document.createElement('label');
      lab.className = 'sl';
      const row = document.createElement('div');
      row.className = 'row';
      const name = document.createElement('span');
      name.textContent = c.label;
      const out = document.createElement('output');
      out.id = 'out-' + c.key;
      row.append(name, out);
      const input = document.createElement('input');
      input.type = 'range';
      input.id = 'sl-' + c.key;
      input.min = c.min;
      input.max = c.max;
      input.step = c.step;
      input.value = geom[c.key] == null ? c.min : geom[c.key];
      input.setAttribute('aria-label', c.label);
      input.addEventListener('input', () => {
        geom[c.key] = parseFloat(input.value);
        paintOutputs();
        schedule(false);
      });
      lab.append(row, input);
      box.appendChild(lab);
    });
    const tg = $('toggles');
    tg.innerHTML = '';
    (preset.toggles || []).forEach(t => {
      const lab = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!geom[t.key];
      input.addEventListener('change', () => {
        geom[t.key] = input.checked;
        schedule(false);
      });
      lab.append(input, document.createTextNode(' ' + t.label));
      tg.appendChild(lab);
    });
    paintOutputs();
  }

  function paintOutputs() {
    preset.controls.forEach(c => {
      const out = $('out-' + c.key);
      if (!out) return;
      const v = geom[c.key];
      out.textContent = fmtNum(v, c.step < 0.1 ? 2 : 0) + (c.unit ? ' ' + c.unit : '');
    });
  }

  function renderLesson() {
    if (lessonType === preset.type) return;
    lessonType = preset.type;
    const L = IX.lesson[preset.type];
    const box = $('eqs');
    box.innerHTML = '';
    (L.equations || []).forEach(eq => {
      const d = document.createElement('div');
      d.className = 'formula';
      if (window.katex) {
        try { katex.render(eq.tex, d, { displayMode: true, throwOnError: false }); }
        catch (e) { d.textContent = eq.tex; }
      } else d.textContent = eq.tex;
      box.appendChild(d);
    });
    const g = $('gloss');
    g.innerHTML = '';
    (L.glossary || []).forEach(pair => {
      const dt = document.createElement('dt');
      dt.textContent = pair[0];
      const dd = document.createElement('dd');
      dd.textContent = pair[1];
      g.append(dt, dd);
    });
    $('ranges').textContent = L.ranges || '';
    const refs = $('refs');
    refs.innerHTML = '';
    (L.refs || []).forEach(r => {
      const li = document.createElement('li');
      li.textContent = r;
      refs.appendChild(li);
    });
  }

  function paintReadout(res, min) {
    const box = $('readout');
    box.dataset.e = res.total.toFixed(4);
    box.dataset.emin = min.total.toFixed(4);
    box.dataset.req = min.at.toFixed(4);
    box.dataset.r = String(geom.r);
    box.dataset.type = preset.type;
    box.dataset.preset = preset.id;
    const big = $('eNow');
    big.textContent = energyText(res.total);
    big.classList.toggle('good', res.total < -0.05);
    big.classList.toggle('bad', res.total > 0.05);
    const scan = preset.controls.find(c => c.key === (preset.scan || 'r'));
    const edge = min.edge ? ' Минимум у края диапазона.' : '';
    $('eMin').textContent = 'Минимум по «' + (scan ? scan.label : 'r') + '»: ' +
      energyText(min.total) + ' при ' + fmtNum(min.at, 2) + (scan && scan.unit ? ' ' + scan.unit : '') + '.' + edge;
    const met = $('metrics');
    met.innerHTML = '';
    (res.metrics || []).forEach(m => {
      const s = document.createElement('span');
      const digits = m.unit === '°' || m.unit === 'Å²' ? 0 : 2;
      s.textContent = m.name + ' ' + fmtNum(m.value, m.unit === '°' ? 0 : 2) + (m.unit ? ' ' + m.unit : '');
      met.appendChild(s);
    });
    $('blurb').textContent = (preset.group ? preset.group + '. ' : '') + (preset.blurb || '');
    $('partNow').textContent = res.partList.map(p => p.name + ': ' + energyText(p.value)).join(' · ');
  }

  function paintCharts(res) {
    const scanR = IX.scan(preset, geom, preset.scan || 'r', 64);
    const series = res.partList.map(p => ({
      name: p.name, color: p.color, ys: scanR.series[p.key] || [], width: 1.5
    }));
    series.push({ name: 'Сумма', color: theme === 'dark' ? '#f8fafc' : '#0f172a', ys: scanR.series.total, width: 2.6 });
    IXCharts.drawLines($('cDist'), {
      xs: scanR.xs, series: series, xlabel: scanR.xlabel, markerX: geom[preset.scan || 'r'], theme: theme
    });
    const c2 = preset.chart2;
    if (c2) {
      const scan2 = IX.scan(preset, geom, c2.key, 56);
      IXCharts.drawLines($('cAng'), {
        xs: scan2.xs,
        series: [{ name: 'Сумма', color: '#1f6fd6', ys: scan2.series.total, width: 2.4 }],
        xlabel: c2.label, markerX: geom[c2.key], theme: theme
      });
      $('hAng').textContent = 'Энергия и ' + c2.label.replace(', °', '').replace(', K', '').replace(', Å', '');
      $('cardAng').hidden = false;
    } else $('cardAng').hidden = true;
    IXCharts.drawLegend($('cLegend'), res.partList.concat([{ name: 'Сумма', color: theme === 'dark' ? '#f8fafc' : '#0f172a', value: res.total }]), theme);
    const heat = preset.heat ? IX.heatmap(preset, geom, 22) : null;
    $('cardHeat').hidden = !heat;
    if (heat) IXCharts.drawHeat($('cHeat'), Object.assign({ theme: theme }, heat));
  }

  function syncUrl() {
    const q = IX.toQuery(preset, geom, unit, theme);
    const url = location.pathname + q;
    try { history.replaceState(null, '', url); } catch (e) {}
    const abs = location.origin + location.pathname + q;
    $('shareUrl').textContent = abs;
    clearTimeout(qrTimer);
    qrTimer = setTimeout(() => drawQR(abs), 80);
  }

  function drawQR(text) {
    const canvas = $('qr');
    if (!canvas || !window.qrcode) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, W);
    try {
      const nBytes = new TextEncoder().encode(text).length;
      const q = qrcode(0, nBytes < 500 ? 'M' : 'L');
      q.addData(text, 'Byte');
      q.make();
      const n = q.getModuleCount(), quiet = 4;
      const cell = Math.floor(W / (n + quiet * 2)) || 1;
      const off = Math.floor((W - cell * n) / 2);
      ctx.fillStyle = '#000';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
    } catch (e) { /* QR не обязателен для расчёта */ }
  }

  function render(resetCam) {
    const res = IX.evaluate(preset, geom);
    const min = IX.minimum(preset, geom);
    paintReadout(res, min);
    paintCharts(res);
    IXScene.show(res, { reset: resetCam, theme: theme, labels: labelsOn, holes: holesOn, shells: shellsOn });
    if (spinOn) IXScene.setSpin(true);
    syncUrl();
    $('bUnit').textContent = unit === 'kcal' ? 'ккал/моль' : 'кДж/моль';
    document.title = 'Физика взаимодействий — ' + (IX.getType(preset.type) || {}).name;
  }

  function schedule(resetCam) {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => render(!!resetCam));
  }

  $('bTheme').onclick = () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('ix-theme', theme);
    applyTheme();
    schedule(false);
  };
  $('bUnit').onclick = () => {
    unit = unit === 'kcal' ? 'kJ' : 'kcal';
    localStorage.setItem('ix-unit', unit);
    schedule(false);
  };
  $('bLabels').onclick = () => { labelsOn = !labelsOn; $('bLabels').classList.toggle('on', labelsOn); schedule(false); };
  $('bHoles').onclick = () => { holesOn = !holesOn; $('bHoles').classList.toggle('on', holesOn); schedule(false); };
  $('bShells').onclick = () => { shellsOn = !shellsOn; $('bShells').classList.toggle('on', shellsOn); schedule(false); };
  $('bSpin').onclick = () => {
    spinOn = !spinOn;
    $('bSpin').classList.toggle('on', spinOn);
    IXScene.setSpin(spinOn);
  };
  $('bCopy').onclick = async () => {
    const text = $('shareUrl').textContent;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else throw new Error('no clipboard');
      $('bCopy').textContent = 'Скопировано';
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); $('bCopy').textContent = 'Скопировано'; } catch (e2) { $('bCopy').textContent = 'Выделите ссылку'; }
      ta.remove();
    }
    setTimeout(() => { $('bCopy').textContent = 'Копировать ссылку'; }, 1600);
  };

  window.addEventListener('resize', () => { IXScene.resize(); schedule(false); });
  applyTheme();
  IXScene.mount($('viewer'));
  renderTypes();
  buildControls();
  renderLesson();
  render(true);
  window.addEventListener('load', () => { IXScene.resize(); schedule(true); });
})();
