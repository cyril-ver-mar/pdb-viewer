/* Общая оболочка разделов: шапка с «← Каталог», «Разделы», переходом по подразделам и «⋯ Ещё»,
   свёртки с памятью, нижняя шторка, ползунки-двойники и выпадающие списки вместо длинных рядов чипов.
   Логику страниц не трогает: только переносит готовые узлы и посылает обычные события. */
(function () {
  'use strict';
  var doc = document;
  var root = doc.documentElement;
  root.classList.add('ui');
  var SECTIONS = [
    ['./', 'Каталог структур', '🧬'],
    ['interactions.html', 'Межмолекулярные взаимодействия', '🧲'],
    ['symmetry.html', 'Симметрия', '🔷'],
    ['eos.html', 'Уравнения состояния', '🫧'],
    ['lattice.html', 'Кристаллические решётки', '🧊'],
    ['machines.html', 'Молекулярные машины', '⚙️'],
    ['supra.html', 'Супрамолекулярная химия', '💍'],
    ['teacher.html', 'Страница учителя', '🎓']
  ];
  function el(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { return null; }
    return null;
  }
  function page() {
    var p = (location.pathname.split('/').pop() || 'index.html');
    return doc.body.getAttribute('data-ui-page') || p.replace(/\.html$/, '') || 'index';
  }
  function nudge() {
    // графики, нарисованные в скрытом блоке, пересчитывают размер по resize
    try { window.dispatchEvent(new Event('resize')); } catch (e) { /* старые браузеры */ }
  }

  /* ---------- меню-поповеры ---------- */
  var openPop = null;
  function closePop() {
    if (!openPop) return;
    openPop.pop.hidden = true;
    openPop.btn.setAttribute('aria-expanded', 'false');
    openPop = null;
  }
  function menu(label, icon, cls) {
    var wrap = el('div', 'ui-menu ' + (cls || ''));
    var btn = el('button', 'ui-btn');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    if (icon) btn.appendChild(el('span', 'ui-ico', icon));
    if (label) btn.appendChild(el('span', 'ui-lbl', label));
    btn.setAttribute('aria-label', label || icon);
    var pop = el('div', 'ui-pop');
    pop.hidden = true;
    pop.setAttribute('role', 'menu');
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var was = openPop && openPop.pop === pop;
      closePop();
      if (was) return;
      pop.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      openPop = { pop: pop, btn: btn };
    });
    pop.addEventListener('click', function (ev) {
      var t = ev.target.closest('a,button');
      if (t && !t.hasAttribute('data-ui-keep-open')) setTimeout(closePop, 0);
    });
    wrap.appendChild(btn);
    wrap.appendChild(pop);
    return { wrap: wrap, btn: btn, pop: pop };
  }
  doc.addEventListener('click', function (ev) {
    if (openPop && !openPop.pop.contains(ev.target)) closePop();
  });
  doc.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { closePop(); closeSheets(); }
  });

  /* ---------- шапка ---------- */
  function buildBar() {
    var head = doc.querySelector('[data-ui-header]') || doc.querySelector('header.top') || doc.querySelector('body > header');
    if (!head || head.classList.contains('ui-bar')) return null;
    var titleSrc = head.querySelector('h1');
    var title = doc.body.getAttribute('data-ui-title') || (titleSrc ? titleSrc.childNodes[0].textContent.trim() : doc.title);
    var keep = Array.prototype.slice.call(head.querySelectorAll('[data-ui-bar]'));
    var more = Array.prototype.slice.call(doc.querySelectorAll('[data-ui-more]'));
    Array.prototype.slice.call(head.children).forEach(function (c) { c.classList.add('ui-orig'); });
    head.classList.add('ui-bar');
    head.setAttribute('role', 'banner');

    var back = el('a', 'ui-back');
    back.href = './';
    back.setAttribute('aria-label', '← Каталог');
    back.appendChild(el('span', 'ui-ico', '←'));
    back.appendChild(el('span', 'ui-lbl', 'Каталог'));
    head.appendChild(back);
    var h = el('h1', 'ui-title', title);
    head.appendChild(h);

    var jump = buildJump();
    if (jump) head.appendChild(jump);

    var secs = menu('Разделы', '☰', 'ui-sec-btn');
    secs.pop.appendChild(el('div', 'ui-cap', 'Разделы'));
    var here = location.pathname.split('/').pop() || './';
    SECTIONS.forEach(function (s, i) {
      if (i === SECTIONS.length - 1) secs.pop.appendChild(el('div', 'ui-sep'));
      var a = el('a');
      a.href = s[0];
      a.setAttribute('role', 'menuitem');
      a.appendChild(el('span', '', s[2]));
      a.appendChild(el('span', '', s[1]));
      if (s[0] === here || (here === 'index.html' && s[0] === './')) a.setAttribute('aria-current', 'page');
      secs.pop.appendChild(a);
    });
    head.appendChild(secs.wrap);

    keep.forEach(function (k) { k.classList.remove('ui-orig'); k.classList.add('ui-btn'); head.appendChild(k); });

    if (more.length) {
      var m = menu('', '⋯', 'ui-more');
      m.btn.setAttribute('aria-label', '⋯ Ещё');
      m.btn.title = 'Ещё';
      more.forEach(function (node) {
        node.classList.remove('ui-orig');
        if (node.tagName === 'A' || node.tagName === 'BUTTON') node.setAttribute('role', 'menuitem');
        m.pop.appendChild(node);
      });
      head.appendChild(m.wrap);
    }
    return head;
  }

  /* ---------- переход по подразделам ---------- */
  var jumpSel = null;
  function sections() {
    return Array.prototype.slice.call(doc.querySelectorAll('[data-ui-sec]'));
  }
  function buildJump() {
    var list = sections();
    if (list.length < 2) return null;
    var sel = el('select', 'ui-jump');
    sel.setAttribute('aria-label', 'Перейти к подразделу');
    list.forEach(function (s, i) {
      if (!s.id) s.id = 'ui-sec-' + i;
      var o = el('option', '', s.getAttribute('data-ui-sec'));
      o.value = s.id;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { go(sel.value); });
    jumpSel = sel;
    return sel;
  }
  function go(id) {
    var t = doc.getElementById(id);
    if (!t) return;
    var tab = t.getAttribute('data-ui-tab');
    if (tab) {
      var b = doc.querySelector(tab);
      if (b) b.click();
    }
    var p = t.parentElement;
    while (p) {
      if (p.tagName === 'DETAILS' && !p.open) p.open = true;
      p = p.parentElement;
    }
    if (t.tagName === 'DETAILS') t.open = true;
    lockJump = Date.now();
    requestAnimationFrame(function () { t.scrollIntoView({ block: 'start' }); });
  }
  var lockJump = 0;
  function trackJump() {
    if (!jumpSel) return;
    var ticking = false;
    function upd() {
      ticking = false;
      if (Date.now() - lockJump < 900) return;
      var y = (parseFloat(getComputedStyle(root).getPropertyValue('--ui-bar-h')) || 52) + 40;
      var cur = null;
      sections().forEach(function (s) {
        if (!s.offsetParent && s.tagName !== 'DETAILS') return;
        var tb = s.getAttribute('data-ui-tab') ? doc.querySelector(s.getAttribute('data-ui-tab')) : null;
        if (tb && !(tb.classList.contains('on') || tb.getAttribute('aria-selected') === 'true')) return;
        if (s.getBoundingClientRect().top <= y) cur = s;
      });
      if (!cur) cur = sections().filter(function (s) {
        var tb = s.getAttribute('data-ui-tab') ? doc.querySelector(s.getAttribute('data-ui-tab')) : null;
        return !tb || tb.classList.contains('on') || tb.getAttribute('aria-selected') === 'true';
      })[0] || sections()[0];
      if (cur && jumpSel.value !== cur.id) jumpSel.value = cur.id;
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
    doc.addEventListener('click', function () { setTimeout(function () { lockJump = 0; upd(); }, 60); });
    upd();
  }

  /* ---------- свёртки с памятью ---------- */
  function folds() {
    var pg = page();
    Array.prototype.slice.call(doc.querySelectorAll('details.ui-fold')).forEach(function (d, i) {
      var id = d.getAttribute('data-fold') || d.id || ('f' + i);
      var key = 'ui-fold:' + pg + ':' + id;
      var saved = store(key);
      if (saved === '1') d.open = true;
      else if (saved === '0') d.open = false;
      d.addEventListener('toggle', function () {
        store(key, d.open ? '1' : '0');
        if (d.open) setTimeout(nudge, 30);
      });
    });
  }

  /* ---------- нижняя шторка ---------- */
  var scrim = null;
  function closeSheets() {
    Array.prototype.slice.call(doc.querySelectorAll('.ui-sheet.ui-open')).forEach(function (s) { s.classList.remove('ui-open'); });
    if (scrim) { scrim.remove(); scrim = null; }
    Array.prototype.slice.call(doc.querySelectorAll('.ui-sheet-btn[aria-expanded="true"]')).forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }
  function sheets() {
    Array.prototype.slice.call(doc.querySelectorAll('.ui-sheet')).forEach(function (sheet) {
      if (!sheet.id) return;
      if (!sheet.querySelector('.ui-sheet-head')) {
        var head = el('div', 'ui-sheet-head');
        head.appendChild(el('span', '', sheet.getAttribute('data-title') || 'Настройки'));
        var x = el('button', 'ui-sheet-btn ui-close', 'Готово');
        x.type = 'button';
        x.style.display = 'inline-flex';
        x.addEventListener('click', closeSheets);
        head.appendChild(x);
        sheet.insertBefore(head, sheet.firstChild);
      }
      Array.prototype.slice.call(doc.querySelectorAll('.ui-sheet-btn[aria-controls="' + sheet.id + '"]')).forEach(function (btn) {
        btn.setAttribute('aria-expanded', 'false');
        btn.addEventListener('click', function () {
          var open = !sheet.classList.contains('ui-open');
          closeSheets();
          if (!open) return;
          sheet.classList.add('ui-open');
          btn.setAttribute('aria-expanded', 'true');
          scrim = el('div', 'ui-scrim');
          scrim.addEventListener('click', closeSheets);
          doc.body.appendChild(scrim);
          setTimeout(nudge, 30);
        });
      });
    });
  }

  /* ---------- ползунок-двойник ---------- */
  function mirrors() {
    Array.prototype.slice.call(doc.querySelectorAll('[data-ui-mirror]')).forEach(function (host) {
      var src = doc.querySelector(host.getAttribute('data-ui-mirror'));
      if (!src) return;
      var outSrc = host.getAttribute('data-ui-out') ? doc.querySelector(host.getAttribute('data-ui-out')) : null;
      var lab = el('label', 'ui-mirror');
      var top = el('span', 'ui-mirror-top');
      var name = el('span', '');
      name.innerHTML = host.getAttribute('data-ui-label') || '';
      var out = el('output', 'ui-val');
      top.appendChild(name);
      top.appendChild(out);
      var r = el('input');
      r.type = 'range';
      ['min', 'max', 'step'].forEach(function (a) { if (src.hasAttribute(a)) r.setAttribute(a, src.getAttribute(a)); });
      r.value = src.value;
      r.setAttribute('data-ui-twin', host.getAttribute('data-ui-mirror'));
      r.setAttribute('aria-label', name.textContent);
      lab.appendChild(top);
      lab.appendChild(r);
      host.appendChild(lab);
      function pull() {
        if (r.value !== src.value) r.value = src.value;
        out.textContent = outSrc ? outSrc.textContent : src.value;
      }
      r.addEventListener('input', function () {
        src.value = r.value;
        src.dispatchEvent(new Event('input', { bubbles: true }));
        src.dispatchEvent(new Event('change', { bubbles: true }));
        pull();
      });
      src.addEventListener('input', pull);
      src.addEventListener('change', pull);
      if (outSrc && window.MutationObserver) new MutationObserver(pull).observe(outSrc, { childList: true, characterData: true, subtree: true });
      setInterval(function () { if (doc.activeElement !== r) pull(); }, 700);
      pull();
    });
  }

  /* ---------- ряд чипов → выпадающий список на телефоне ---------- */
  function chipSelects() {
    Array.prototype.slice.call(doc.querySelectorAll('[data-ui-chips-select]')).forEach(function (box) {
      var sel = el('select', 'ui-chip-select');
      sel.setAttribute('aria-label', box.getAttribute('data-ui-chips-select') || 'Выбор');
      box.classList.add('ui-chips-to-select');
      box.insertBefore(sel, box.firstChild);
      function items() { return Array.prototype.slice.call(box.querySelectorAll('button, a.chip')); }
      function isOn(b) {
        return b.classList.contains('on') || b.classList.contains('active') || b.classList.contains('sel')
          || b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true';
      }
      function rebuild() {
        var list = items();
        var sig = list.map(function (b) { return b.textContent; }).join('|');
        if (sel._sig !== sig) {
          sel._sig = sig;
          sel.innerHTML = '';
          list.forEach(function (b, i) {
            var o = el('option', '', b.textContent.trim());
            o.value = String(i);
            sel.appendChild(o);
          });
        }
        var on = -1;
        list.forEach(function (b, i) { if (on < 0 && isOn(b)) on = i; });
        if (on >= 0) sel.value = String(on);
      }
      sel.addEventListener('change', function () {
        var b = items()[+sel.value];
        if (b) b.click();
        setTimeout(rebuild, 0);
      });
      if (window.MutationObserver) new MutationObserver(function () { rebuild(); }).observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'aria-selected'] });
      rebuild();
    });
  }

  /* ---------- карточка «текст + ползунки + холсты» → сцена сверху, управление под ней ---------- */
  function slug(t) { return (t || '').toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40); }
  function autopanes() {
    var sel = doc.body.getAttribute('data-ui-autopane');
    if (!sel) return;
    Array.prototype.slice.call(doc.querySelectorAll(sel)).forEach(function (card) {
      var h2 = card.querySelector(':scope > h2');
      var panel = card.closest('[data-sec-panel]');
      if (h2 && doc.body.hasAttribute('data-ui-autosec') && !card.hasAttribute('data-ui-sec')) {
        card.setAttribute('data-ui-sec', h2.textContent.trim());
        if (panel) card.setAttribute('data-ui-tab', '[data-sec="' + panel.getAttribute('data-sec-panel') + '"]');
      }
      if (card.classList.contains('ui-pane')) return;
      var kids = Array.prototype.slice.call(card.children);
      function isView(k) {
        if (k.hasAttribute('data-ui-view-part')) return true;
        if (k.tagName === 'CANVAS' || k.classList.contains('legend')) return true;
        return !!(k.querySelector && k.querySelector('canvas') && !k.querySelector('input, select, button'));
      }
      function isTheory(k) {
        if (k.hasAttribute('data-ui-keep')) return false;
        if (k.classList.contains('eq') && !k.id) return true;
        if (k.classList.contains('cap') && !k.id) return true;
        return k.tagName === 'P' && !k.id && !k.classList.contains('note');
      }
      if (!kids.some(isView)) return;
      var stage = el('div', 'ui-stage');
      var ctr = el('div', 'ui-controls');
      var fold = el('details', 'ui-fold');
      fold.setAttribute('data-fold', 'th-' + slug(h2 ? h2.textContent : String(Math.random())));
      fold.appendChild(el('summary', '', 'Пояснения и формулы'));
      var body = el('div', 'ui-fold-body');
      fold.appendChild(body);
      kids.forEach(function (k) {
        if (k === h2 || k.tagName === 'H1') return;
        if (isView(k)) stage.appendChild(k);
        else if (isTheory(k)) body.appendChild(k);
        else ctr.appendChild(k);
      });
      if (body.children.length) ctr.appendChild(fold);
      card.classList.add('ui-pane', 'ui-split');
      if (h2 && h2.nextSibling) card.insertBefore(stage, h2.nextSibling);
      else card.insertBefore(stage, card.firstChild);
      card.appendChild(ctr);
    });
  }

  function init() {
    autopanes();
    buildBar();
    trackJump();
    folds();
    sheets();
    mirrors();
    chipSelects();
  }
  window.UI = { go: go, nudge: nudge, closeSheets: closeSheets, init: init };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
