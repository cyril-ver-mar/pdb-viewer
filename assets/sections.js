/* Большие разделы сайта — один список для каталога учеников (index.html), меню «Разделы» и страницы учителя.
   Скрыть раздел: "hidden": true (вернуть — false или убрать поле). Скрытый раздел пропадает из каталога
   и меню учеников, но его страница и прямые ссылки работают. На teacher.html видны все шесть с пометкой
   «скрыт» и переключателем, который сохраняет этот файл на GitHub.
   Блок между метками переписывает страница учителя — держите его чистым JSON. */
(function (root) {
  'use strict';
  var LIST = /*PV-SECTIONS*/[
  {
    "href": "interactions.html",
    "icon": "⚛️",
    "title": "Физика взаимодействий",
    "desc": "Как энергия контакта зависит от расстояния и угла: водородная связь, галоген, π–π, ионы",
    "menu": "Межмолекулярные взаимодействия",
    "menuIcon": "🧲",
    "hidden": true
  },
  {
    "href": "symmetry.html",
    "icon": "🔷",
    "title": "Симметрия",
    "desc": "Точечные и пространственные группы, свойства и квизы",
    "menu": "Симметрия",
    "menuIcon": "🔷",
    "hidden": true
  },
  {
    "href": "eos.html",
    "icon": "📈",
    "title": "Уравнения состояния",
    "desc": "Идеальный газ, вириал и Ван-дер-Ваальс: как складывается давление",
    "menu": "Уравнения состояния",
    "menuIcon": "🫧",
    "hidden": true
  },
  {
    "href": "lattice.html",
    "icon": "💠",
    "title": "Физика кристаллов",
    "desc": "Прямая и обратная решётка, фононы и электроны",
    "menu": "Кристаллические решётки",
    "menuIcon": "🧊",
    "hidden": true
  },
  {
    "href": "machines.html",
    "icon": "⚙️",
    "title": "Молекулярные машины",
    "desc": "Роторы, челноки, катенаны и живые моторы и их энергия",
    "menu": "Молекулярные машины",
    "menuIcon": "⚙️",
    "hidden": false
  },
  {
    "href": "supra.html",
    "icon": "⭕",
    "title": "Супрамолекулярная химия",
    "desc": "Хозяин и гость: каликсарены, краун-эфиры, порфирины",
    "menu": "Супрамолекулярная химия",
    "menuIcon": "💍",
    "hidden": false
  }
]/*PV-SECTIONS-END*/;
  var api = {
    all: function () { return LIST.slice(); },
    visible: function () { return LIST.filter(function (s) { return !s.hidden; }); },
    isHidden: function (href) { return LIST.some(function (s) { return s.href === href && s.hidden; }); },
    // переписать блок списка в тексте этого файла (для сохранения со страницы учителя)
    rewrite: function (text, hiddenByHref) {
      var a = text.indexOf('/*PV-SECTIONS*/'), b = text.indexOf('/*PV-SECTIONS-END*/');
      if (a < 0 || b < a) throw new Error('В assets/sections.js не найдены метки списка разделов');
      var list = JSON.parse(text.slice(a + 15, b));
      list.forEach(function (s) { if (s.href in hiddenByHref) s.hidden = !!hiddenByHref[s.href]; });
      return text.slice(0, a + 15) + JSON.stringify(list, null, 2) + text.slice(b);
    }
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PVSections = api;
})(typeof window !== 'undefined' ? window : this);
