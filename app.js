'use strict';
/* ==========================================================================
   GymLog — Logique principale
   Organisation du fichier :
     1. Utilitaires (dates, formats, calculs)
     2. Icônes SVG
     3. État global & accès aux données
     4. Moteur d'interface : délégation d'événements, pages, feuilles, toast
     5. Onglet Activité
     6. Onglet Séances + éditeur de séance + dossiers
     7. Bibliothèque d'exercices (liste, sélecteur, fiche, création)
     8. Entraînement actif (séries, records, minuteur de repos, fin)
     9. Onglet Progrès + Statistiques + Records + Mensurations + Réglages
    10. Graphiques SVG (courbes, heatmap, silhouette)
    11. Démarrage
   ========================================================================== */

/* =========================== 1. UTILITAIRES ============================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const DAY = 864e5;

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

/** Clé de jour locale "AAAA-MM-JJ" */
function dayKey(d) { d = new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startOfDay(d) { d = new Date(d); d.setHours(0, 0, 0, 0); return d; }
/** Lundi 00:00 de la semaine de d */
function startOfWeek(d) { d = startOfDay(d); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
function addDays(d, n) { d = new Date(d); d.setDate(d.getDate() + n); return d; }
function parseDayKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }

/** 75 -> "1:15", 3725 -> "1:02:05" */
function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
/** Durée lisible : "45 min", "1h04" */
function fmtDur(sec) {
  const m = Math.round((sec || 0) / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${pad(m % 60)}`;
}
function fmtNum(n, dec = 0) { return Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: dec }); }
/** Volume compact : "8 450 kg", "12,4 t" */
function fmtVol(v) { return v >= 10000 ? `${fmtNum(v / 1000, 1)} t` : `${fmtNum(v)} ${unit()}`; }
function fmtHour(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDateLong(ts) { const d = new Date(ts); return `${cap(DAYS_SHORT[d.getDay()])} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`; }
function fmtDateShort(ts) { const d = new Date(ts); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`; }
/** Date relative : "Aujourd'hui", "Hier", "Il y a 3 j"… */
function relDay(ts) {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
  if (diff <= 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  if (diff < 7) return `Il y a ${diff} j`;
  if (diff < 31) return `Il y a ${Math.floor(diff / 7)} sem.`;
  return fmtDateShort(ts);
}
/** "72,5" -> 72.5 ; vide -> null */
function parseNum(v) {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
/** 1RM estimé — formule d'Epley */
function e1rm(w, r) { if (!w || !r) return 0; return r === 1 ? w : w * (1 + r / 30); }
const unit = () => S.settings.units || 'kg';
const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* iOS : non supporté */ } };

/* ============================== 2. ICÔNES ================================ */
const svg = (d, sw = 2, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ICON = {
  chevL: svg('<path d="M15 18l-6-6 6-6"/>', 2.5),
  chevR: svg('<path d="M9 18l6-6-6-6"/>', 2.5),
  chevD: svg('<path d="M6 9l6 6 6-6"/>', 2.5),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 2.5),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>', 2.5),
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 1.8),
  trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
  flame: svg('<path d="M12 22c4 0 7-2.7 7-7 0-4-3-6.5-4-10-2 2-2.5 4-2.5 5.5C11 9 10 7.5 10 5.5 7 7.5 5 11 5 15c0 4.3 3 7 7 7z"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  ruler: svg('<path d="M3 17l14-14 4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>'),
  book: svg('<path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h11"/>'),
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  minimize: svg('<path d="M6 9l6 6 6-6"/>', 2.8)
};
/** Pictogrammes d'équipement (vignettes d'exercices) */
const EQ_ICON = {
  barre: svg('<path d="M2 12h20M5.5 8v8M8.5 6.5v11M15.5 6.5v11M18.5 8v8"/>'),
  halteres: svg('<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>', 2.2),
  machine: svg('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 8h6M9 12h6M9 16h6"/>'),
  poulie: svg('<circle cx="12" cy="5" r="2.5"/><path d="M12 7.5V15M8.5 15h7v5h-7z"/>'),
  pdc: svg('<circle cx="12" cy="4.5" r="2.2"/><path d="M12 7.5v7M6.5 10.5h11M9 21l3-6.5 3 6.5"/>')
};

/* ===================== 3. ÉTAT GLOBAL & DONNÉES ========================== */
const S = {
  data: { exercises: [], workouts: [], templates: [], folders: [], measurements: [] },
  settings: { id: 'main', restTimerDefault: 120, units: 'kg', theme: 'auto', weeklyGoal: 3, seeded: false },
  tab: 'activity',
  calMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selDay: null,           // jour sélectionné dans le calendrier
  openFolders: {},        // dossiers repliés/dépliés
  active: null,           // entraînement en cours
  statsPeriod: '30J',
  histLimit: 40,
  tplSearch: false, tplQuery: '',   // recherche dans l'onglet Séances         // nombre de séances affichées dans l'historique
  measPeriod: '3M',
  measSel: ['weight', 'waist']
};
let EX = new Map(); // index id -> exercice
function rebuildExIndex() { EX = new Map(S.data.exercises.map(e => [e.id, e])); }
const exName = id => EX.get(id)?.name || 'Exercice supprimé';

/** Sauvegarde un objet (mémoire + IndexedDB) */
async function save(store, obj) {
  const arr = S.data[store];
  const i = arr.findIndex(x => x.id === obj.id);
  if (i >= 0) arr[i] = obj; else arr.push(obj);
  if (store === 'exercises') rebuildExIndex();
  await DB.put(store, obj);
}
async function removeItem(store, id) {
  S.data[store] = S.data[store].filter(x => x.id !== id);
  if (store === 'exercises') rebuildExIndex();
  await DB.del(store, id);
}
const saveSettings = () => DB.put('settings', S.settings);

/** Entraînements triés du plus récent au plus ancien */
const workoutsDesc = () => [...S.data.workouts].sort((a, b) => b.startTime - a.startTime);

/** Statistiques d'un entraînement (enregistré ou en cours) */
function wStats(w) {
  let volume = 0, sets = 0, pr = 0, total = 0;
  for (const ex of w.exercises) for (const s of ex.sets) {
    total++;
    if (!s.completed) continue;
    sets++;
    volume += (s.weight || 0) * (s.reps || 0);
    if (s.isRecord) pr++;
  }
  return { volume, sets, pr, total };
}

/** Séries validées par muscle (principal = 1, secondaire = 0,5) */
function muscleSets(workouts) {
  const m = {};
  for (const w of workouts) for (const ex of w.exercises) {
    const e = EX.get(ex.exerciseId); if (!e) continue;
    const n = ex.sets.filter(s => s.completed).length; if (!n) continue;
    m[e.muscleGroup] = (m[e.muscleGroup] || 0) + n;
    if (e.secondaryMuscle) m[e.secondaryMuscle] = (m[e.secondaryMuscle] || 0) + n * 0.5;
  }
  return m;
}

/** Meilleur 1RM estimé historique d'un exercice (hors entraînement `excludeId`) */
function bestE1RM(exerciseId, excludeId) {
  let best = 0;
  for (const w of S.data.workouts) {
    if (w.id === excludeId) continue;
    for (const ex of w.exercises) if (ex.exerciseId === exerciseId)
      for (const s of ex.sets) if (s.completed) best = Math.max(best, e1rm(s.weight, s.reps));
  }
  return best;
}

/** Séries de la dernière séance contenant cet exercice (colonne PREV) */
function prevSets(exerciseId) {
  for (const w of workoutsDesc()) {
    const ex = w.exercises.find(x => x.exerciseId === exerciseId);
    if (ex) { const done = ex.sets.filter(s => s.completed); if (done.length) return done; }
  }
  return [];
}

/** Historique complet d'un exercice, du plus ancien au plus récent */
function exerciseHistory(exerciseId) {
  const out = [];
  for (const w of [...S.data.workouts].sort((a, b) => a.startTime - b.startTime)) {
    const sets = w.exercises.filter(x => x.exerciseId === exerciseId).flatMap(x => x.sets.filter(s => s.completed));
    if (!sets.length) continue;
    const best = sets.reduce((b, s) => e1rm(s.weight, s.reps) > e1rm(b.weight, b.reps) ? s : b, sets[0]);
    out.push({ w, sets, best, e1rm: e1rm(best.weight, best.reps), maxW: Math.max(...sets.map(s => s.weight || 0)), volume: sets.reduce((a, s) => a + (s.weight || 0) * (s.reps || 0), 0) });
  }
  return out;
}

/**
 * Recalcule les records sur tout l'historique (après import, suppression,
 * données de démo). Un record = meilleure série d'un exercice dans une séance
 * dont le 1RM estimé dépasse tout ce qui a été fait auparavant.
 */
async function recomputeAllRecords() {
  const best = {};
  const changed = [];
  for (const w of [...S.data.workouts].sort((a, b) => a.startTime - b.startTime)) {
    let dirty = false;
    for (const ex of w.exercises) {
      let top = null, topV = 0;
      for (const s of ex.sets) {
        const v = s.completed ? e1rm(s.weight, s.reps) : 0;
        if (v > topV) { topV = v; top = s; }
      }
      const prev = best[ex.exerciseId] || 0;
      for (const s of ex.sets) {
        const isR = s === top && prev > 0 && topV > prev;
        if (!!s.isRecord !== isR) { s.isRecord = isR; dirty = true; }
      }
      best[ex.exerciseId] = Math.max(prev, topV);
    }
    if (dirty) changed.push(w);
  }
  if (changed.length) await DB.putMany('workouts', changed);
}

/* ============== 4. MOTEUR D'INTERFACE (événements, pages…) =============== */
const ACTIONS = {};   // actions globales : data-action="nom"
const INPUTS = {};    // saisies globales : data-input="nom"
const pages = [];     // pile de sous-pages
const sheets = [];    // pile de feuilles modales

/** Contexte (feuille ou page) le plus haut contenant l'élément */
function findCtx(el) {
  for (let i = sheets.length - 1; i >= 0; i--) if (sheets[i].el.contains(el)) return sheets[i];
  for (let i = pages.length - 1; i >= 0; i--) if (pages[i].el.contains(el)) return pages[i];
  return null;
}

// Délégation globale des clics
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const act = el.dataset.action;
  const ctx = findCtx(el);
  if (act === 'sheet-close' && ctx && ctx.close) { ctx.close(); return; }
  const fn = (ctx && ctx.actions && ctx.actions[act]) || ACTIONS[act];
  if (fn) { e.preventDefault(); e.stopPropagation(); fn(el, e); }
});
// Délégation globale des saisies (input + select)
document.addEventListener('input', e => {
  const el = e.target.closest('[data-input]'); if (!el) return;
  const ctx = findCtx(el);
  const fn = (ctx && ctx.inputs && ctx.inputs[el.dataset.input]) || INPUTS[el.dataset.input];
  fn && fn(el, e);
});
// Fin de saisie (perte de focus) : data-change
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]'); if (!el) return;
  const ctx = findCtx(el);
  const fn = (ctx && ctx.changes && ctx.changes[el.dataset.change]) || CHANGES[el.dataset.change];
  fn && fn(el, e);
});
const CHANGES = {};
// Sélection du contenu des champs numériques au focus (saisie rapide)
document.addEventListener('focusin', e => {
  if (e.target.matches('input[inputmode]')) setTimeout(() => { try { e.target.select(); } catch (_) { } }, 30);
});
// "Entrée" ferme le clavier
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('input[inputmode]')) e.target.blur();
});

/** Ouvre une sous-page glissant depuis la droite */
function pushPage(opts) {
  const el = document.createElement('section');
  el.className = 'page';
  el.innerHTML = `
    <header class="page-head">
      <button class="back-btn" data-action="back">${ICON.chevL}<span>Retour</span></button>
      <h2 class="page-title"></h2>
      <div class="page-right"></div>
    </header>
    <div class="page-body"></div>`;
  const pg = { el, actions: {}, inputs: {}, changes: {}, right: '', ...opts };
  $('#pages').appendChild(el);
  pages.push(pg);
  renderPage(pg);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  return pg;
}
/** Re-rend une page en conservant la position de défilement */
function renderPage(pg) {
  const body = $('.page-body', pg.el);
  const top = body.scrollTop;
  body.innerHTML = pg.render(pg);
  body.scrollTop = top;
  $('.page-title', pg.el).textContent = typeof pg.title === 'function' ? pg.title(pg) : pg.title;
  $('.page-right', pg.el).innerHTML = typeof pg.right === 'function' ? pg.right(pg) : pg.right;
  pg.after && pg.after(pg);
}
function popPage() {
  const pg = pages.pop(); if (!pg) return;
  pg.el.classList.remove('in');
  setTimeout(() => pg.el.remove(), 320);
}
ACTIONS.back = popPage;

/** Rafraîchit l'onglet courant et toutes les pages ouvertes */
function refreshAll() { renderTab(); pages.forEach(renderPage); }

/** Ouvre une feuille modale (bottom sheet). full=true : plein écran */
function openSheet({ html, actions = {}, inputs = {}, changes = {}, full = false, onClose }) {
  const el = document.createElement('div');
  el.className = 'sheet-wrap';
  el.innerHTML = `<div class="sheet-backdrop" data-action="sheet-close"></div>
    <div class="sheet ${full ? 'full' : ''}"><div class="sheet-grab"></div><div class="sheet-content">${html}</div></div>`;
  $('#sheet-root').appendChild(el);
  const sh = {
    el, actions, inputs, changes,
    set(h) { $('.sheet-content', el).innerHTML = h; },
    close() {
      const i = sheets.indexOf(sh); if (i < 0) return;
      sheets.splice(i, 1);
      el.classList.remove('show');
      setTimeout(() => el.remove(), 320);
      onClose && onClose();
    }
  };
  sheets.push(sh);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  return sh;
}

/** Feuille de confirmation -> Promise<boolean> */
function confirmSheet(title, message, okLabel = 'Confirmer', danger = false) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const sh = openSheet({
      html: `<div class="dialog"><h3>${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : ''}
        <button class="btn-primary ${danger ? 'danger' : ''}" data-action="ok">${esc(okLabel)}</button>
        <button class="btn-plain" data-action="sheet-close">Annuler</button></div>`,
      actions: { ok: () => { finish(true); sh.close(); } },
      onClose: () => finish(false)
    });
  });
}

/** Liste d'options façon "action sheet" iOS */
function actionSheet(title, options) {
  const sh = openSheet({
    html: `<div class="dialog">${title ? `<h3>${esc(title)}</h3>` : ''}
      <div class="opt-list">${options.map((o, i) => `<button class="opt ${o.danger ? 'danger' : ''}" data-action="opt" data-i="${i}">${o.icon || ''}<span>${esc(o.label)}</span></button>`).join('')}</div>
      <button class="btn-plain" data-action="sheet-close">Annuler</button></div>`,
    actions: { opt: el => { sh.close(); options[+el.dataset.i].fn(); } }
  });
}

/** Saisie de texte simple -> Promise<string|null> */
function inputSheet(title, value = '', placeholder = '', okLabel = 'Valider') {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const sh = openSheet({
      html: `<div class="dialog"><h3>${esc(title)}</h3>
        <input class="field" id="inp-sheet" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">
        <button class="btn-primary" data-action="ok">${esc(okLabel)}</button>
        <button class="btn-plain" data-action="sheet-close">Annuler</button></div>`,
      actions: { ok: () => { finish($('#inp-sheet', sh.el).value.trim()); sh.close(); } },
      onClose: () => finish(null)
    });
    setTimeout(() => $('#inp-sheet', sh.el)?.focus(), 350);
  });
}

/** Choix d'un temps de repos -> Promise<number|null> */
function restPickerSheet(current) {
  const opts = [0, 30, 45, 60, 75, 90, 120, 150, 180, 210, 240, 300];
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const sh = openSheet({
      html: `<div class="dialog"><h3>Temps de repos</h3>
        <div class="grid-opts">${opts.map(s => `<button class="opt-pill ${s === current ? 'on' : ''}" data-action="pick" data-v="${s}">${s ? fmtClock(s) : 'Aucun'}</button>`).join('')}</div>
        <button class="btn-plain" data-action="sheet-close">Annuler</button></div>`,
      actions: { pick: el => { finish(+el.dataset.v); sh.close(); } },
      onClose: () => finish(null)
    });
  });
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/** Affiche l'onglet courant */
function renderTab() {
  const v = $('#views');
  const html = S.tab === 'activity' ? viewActivity() : S.tab === 'seances' ? viewSeances() : viewProgress();
  v.innerHTML = `<div class="view">${html}</div>`;
  $$('#tabbar .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === S.tab));
}
ACTIONS.tab = el => {
  const tab = el.dataset.tab;
  // on ferme les sous-pages quand on change d'onglet
  while (pages.length) popPage();
  if (tab === S.tab) { $('#views').scrollTo({ top: 0, behavior: 'smooth' }); return; }
  S.tab = tab;
  $('#views').scrollTop = 0;
  renderTab();
  $('#views .view').classList.add('fade-in');
};

/* ========================== 5. ONGLET ACTIVITÉ =========================== */
/** Pastille ronde avec les initiales (accès profil / réglages) */
function avatarBtn() {
  const n = (S.settings.profileName || '').trim();
  const ini = n ? n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() : '';
  return `<button class="avatar" data-action="open-settings" aria-label="Profil et réglages">${ini ? esc(ini) : svg('<circle cx="12" cy="8" r="4"/><path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/>', 2.2)}</button>`;
}

/** "AUJ. · JEU. 12 NOV.", "HIER · MER. 11 NOV.", "SAM. 3 OCT." */
function dayLabel(k) {
  const d = parseDayKey(k);
  const diff = Math.round((startOfDay(Date.now()) - d) / DAY);
  let t = `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`.toUpperCase();
  if (d.getFullYear() !== new Date().getFullYear()) t += ' ' + d.getFullYear();
  return diff === 0 ? 'AUJ. · ' + t : diff === 1 ? 'HIER · ' + t : t;
}

function viewActivity() {
  const m = S.calMonth, y = m.getFullYear(), mo = m.getMonth();
  const byDay = {};
  for (const w of S.data.workouts) (byDay[dayKey(w.startTime)] ||= []).push(w);
  const now = new Date();
  const today = dayKey(now);
  const isCurMonth = y === now.getFullYear() && mo === now.getMonth();

  // Grille complète : du lundi de la 1re semaine au dimanche de la dernière
  // (les jours des mois voisins sont affichés en grisé, avec leurs points)
  const end = addDays(startOfWeek(new Date(y, mo + 1, 0)), 6);
  let cells = '';
  for (let d = startOfWeek(new Date(y, mo, 1)); d <= end; d = addDays(d, 1)) {
    const k = dayKey(d);
    const n = (byDay[k] || []).length;
    cells += `<button class="cal-cell ${k === today ? 'today' : ''} ${S.selDay === k ? 'sel' : ''} ${d.getMonth() !== mo ? 'out' : ''}" data-action="cal-day" data-day="${k}">
      <span class="cal-num">${d.getDate()}</span><span class="cal-dots">${'<i></i>'.repeat(Math.min(n, 3))}</span></button>`;
  }

  // Statistiques rapides
  const wkStart = startOfWeek(now).getTime();
  const moStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const thisWeek = S.data.workouts.filter(w => w.startTime >= wkStart).length;
  const thisMonth = S.data.workouts.filter(w => w.startTime >= moStart).length;
  const pr30 = S.data.workouts.filter(w => w.startTime >= Date.now() - 30 * DAY).reduce((a, w) => a + wStats(w).pr, 0);

  // Historique continu, groupé par jour (ou un seul jour si sélectionné)
  let list = workoutsDesc();
  if (S.selDay) list = list.filter(w => dayKey(w.startTime) === S.selDay);
  const shown = list.slice(0, S.histLimit);
  const groups = [];
  for (const w of shown) {
    const k = dayKey(w.startTime);
    if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, ws: [] });
    groups[groups.length - 1].ws.push(w);
  }
  const hist = groups.map(g => `
    <div class="day-head"><h3>${dayLabel(g.k)}</h3><span class="mono-sm">${g.ws.length} entraînement${g.ws.length > 1 ? 's' : ''}</span></div>
    ${g.ws.map(workoutCard).join('')}`).join('');

  return `
    <header class="act-head">
      <button class="icon-btn sm" data-action="cal-prev" aria-label="Mois précédent">${ICON.chevL}</button>
      <h1 class="act-title">${MONTHS[mo]} <small>${y}</small></h1>
      ${!isCurMonth || S.selDay ? `<button class="today-pill" data-action="cal-today">Aujourd'hui</button>` : ''}
      <button class="icon-btn sm green" data-action="log-past" aria-label="Ajouter un entraînement passé">${ICON.plus}</button>
      <button class="icon-btn sm" data-action="cal-next" aria-label="Mois suivant">${ICON.chevR}</button>
      ${avatarBtn()}
    </header>
    <div class="cal-plain">
      <div class="cal-grid cal-wd">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
    </div>
    <div class="quick-stats">
      <div class="qs"><b>${thisWeek}</b><span>CETTE SEMAINE</span></div>
      <div class="qs"><b>${thisMonth}</b><span>CE MOIS</span></div>
      <div class="qs pr"><b>${pr30}<small>PR</small></b><span>30 JOURS</span></div>
    </div>
    ${S.selDay ? `<div class="sel-bar"><span>${list.length} entraînement${list.length > 1 ? 's' : ''} ce jour-là</span><button class="link-btn" data-action="cal-clear">Tout l'historique</button></div>` : ''}
    ${list.length ? hist : emptyState(ICON.timer, S.selDay ? 'Aucun entraînement ce jour-là.' : 'Aucun entraînement pour le moment.', S.selDay ? '' : '<button class="btn-primary inline" data-action="tab" data-tab="seances">Démarrer une séance</button>')}
    ${list.length > shown.length ? `<button class="btn-plain" data-action="hist-more">Voir plus (${list.length - shown.length})</button>` : ''}`;
}

function emptyState(icon, text, extra = '') {
  return `<div class="empty"><div class="empty-ic">${icon || ICON.timer}</div><p>${text}</p>${extra}</div>`;
}

/** Carte compacte d'un entraînement (historique) */
function workoutCard(w) {
  const st = wStats(w);
  return `<button class="w-row tap" data-action="open-workout" data-id="${w.id}">
    <span class="w-bar"></span>
    <span class="w-row-main">
      <span class="w-row-top"><b>${esc(w.name)}</b>${st.pr ? `<span class="pr-pill">+${st.pr} PR</span>` : ''}</span>
      <span class="w-row-meta"><span class="mono">${fmtHour(w.startTime)} → ${fmtHour(w.endTime)}</span> · ${fmtDur(w.duration)} · ${st.sets} série${st.sets > 1 ? 's' : ''} · ${fmtNum(st.volume)} ${unit()}</span>
    </span>
  </button>`;
}

ACTIONS['cal-prev'] = () => { S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() - 1, 1); renderTab(); };
ACTIONS['cal-next'] = () => { S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() + 1, 1); renderTab(); };
ACTIONS['cal-today'] = () => { S.calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); S.selDay = null; S.histLimit = 40; renderTab(); $('#views').scrollTo({ top: 0, behavior: 'smooth' }); };
ACTIONS['cal-day'] = el => {
  const k = el.dataset.day;
  S.selDay = S.selDay === k ? null : k;
  const d = parseDayKey(k);
  if (d.getMonth() !== S.calMonth.getMonth()) S.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  renderTab();
};
ACTIONS['cal-clear'] = () => { S.selDay = null; renderTab(); };
ACTIONS['hist-more'] = () => { S.histLimit += 40; renderTab(); };

/** « + » : saisir après coup un entraînement fait sans l'app */
ACTIONS['log-past'] = () => {
  const tpls = [...S.data.templates].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'fr'));
  const d = { tpl: '', name: 'Entraînement libre', date: S.selDay && S.selDay <= dayKey(Date.now()) ? S.selDay : dayKey(Date.now()), time: '18:00', dur: 60 };
  const sh = openSheet({
    html: `<div class="dialog left"><h3>Ajouter un entraînement passé</h3>
      <p class="muted sm" style="text-align:center">Pour une séance faite sans l'app : tu saisiras ensuite tes séries.</p>
      <label class="lbl">Séance</label>
      <select class="field" data-input="lp-tpl"><option value="">Entraînement libre</option>${tpls.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
      <label class="lbl">Nom</label><input class="field" id="lp-name" data-input="lp-name" value="${esc(d.name)}" autocomplete="off">
      <div class="row2">
        <div><label class="lbl">Date</label><input class="field" type="date" data-input="lp-date" value="${d.date}" max="${dayKey(Date.now())}"></div>
        <div><label class="lbl">Début</label><input class="field" type="time" data-input="lp-time" value="${d.time}"></div>
      </div>
      <label class="lbl">Durée (minutes)</label><input class="field" inputmode="numeric" data-input="lp-dur" value="${d.dur}">
      <button class="btn-primary" data-action="lp-go">Saisir les séries</button>
      <button class="btn-plain" data-action="sheet-close">Annuler</button></div>`,
    inputs: {
      'lp-tpl': el => { d.tpl = el.value; const t = tpls.find(x => x.id === d.tpl); d.name = t ? t.name : 'Entraînement libre'; $('#lp-name', sh.el).value = d.name; },
      'lp-name': el => { d.name = el.value; },
      'lp-date': el => { d.date = el.value; },
      'lp-time': el => { d.time = el.value; },
      'lp-dur': el => { d.dur = parseInt(el.value, 10) || 0; }
    },
    actions: {
      'lp-go': () => {
        if (!d.date) { toast('Choisis une date'); return; }
        const [hh, mm] = (d.time || '18:00').split(':').map(Number);
        const start = parseDayKey(d.date); start.setHours(hh || 0, mm || 0, 0, 0);
        if (start.getTime() > Date.now()) { toast('La date doit être dans le passé'); return; }
        if (d.dur < 1 || d.dur > 600) { toast('Indique une durée en minutes'); return; }
        const t = tpls.find(x => x.id === d.tpl);
        sh.close();
        startWorkout({
          name: d.name.trim() || 'Entraînement libre', templateId: t ? t.id : null,
          startTime: start.getTime(), manual: true, durationMin: d.dur,
          exercises: t ? t.exercises.map(e => ({ exerciseId: e.exerciseId, restTime: e.restTime, tempo: e.tempo, targetReps: e.targetReps, nSets: e.targetSets || 3 })) : []
        });
      }
    }
  });
};
ACTIONS['open-workout'] = el => openWorkoutDetail(el.dataset.id);

/** Détail d'un entraînement passé */
function openWorkoutDetail(id) {
  pushPage({
    title: 'Séance',
    render: () => {
      const w = S.data.workouts.find(x => x.id === id);
      if (!w) return emptyState(ICON.trash, 'Séance supprimée.');
      const st = wStats(w);
      return `
        <div class="detail-head"><h1>${esc(w.name)}</h1>
          <p class="muted">${fmtDateLong(w.startTime)} · ${fmtHour(w.startTime)} → ${fmtHour(w.endTime)}</p>
          ${st.pr ? `<span class="pr-badge lg">${ICON.trophy}+${st.pr} record${st.pr > 1 ? 's' : ''}</span>` : ''}</div>
        <div class="card mini-stats big">
          <div><b>${fmtDur(w.duration)}</b><span>Durée</span></div>
          <div><b>${st.sets}</b><span>Séries</span></div>
          <div><b>${fmtVol(st.volume)}</b><span>Volume</span></div>
        </div>
        ${w.exercises.map(ex => {
          const e = EX.get(ex.exerciseId);
          const sets = ex.sets.filter(s => s.completed);
          if (!sets.length) return '';
          return `<div class="card">
            <div class="ex-head tap" data-action="open-exercise" data-id="${ex.exerciseId}">${exThumb(e)}<div class="ex-info"><h3>${esc(exName(ex.exerciseId))}</h3><span class="muted sm">${sets.length} série${sets.length > 1 ? 's' : ''}</span></div><span class="chev-r">${ICON.chevR}</span></div>
            <div class="hist-sets">${sets.map((s, i) => `<div class="hist-set ${s.isRecord ? 'rec' : ''}"><span class="n">${i + 1}</span><span>${fmtNum(s.weight, 2)} ${unit()} × ${s.reps}</span><span class="muted sm">1RM ${fmtNum(e1rm(s.weight, s.reps), 1)}</span>${s.isRecord ? '<span class="rec-badge">RECORD</span>' : ''}</div>`).join('')}</div>
          </div>`;
        }).join('')}
        <button class="btn-soft wide" data-action="summary">${ICON.check}<span>Voir le résumé</span></button>
        <button class="btn-primary" data-action="repeat">${ICON.play} Refaire cette séance</button>
        <button class="btn-plain danger" data-action="del">Supprimer la séance</button>`;
    },
    actions: {
      summary: () => { const w = S.data.workouts.find(x => x.id === id); w && showSummary(w); },
      repeat: () => {
        const w = S.data.workouts.find(x => x.id === id);
        startWorkout({
          name: w.name, templateId: w.templateId,
          exercises: w.exercises.map(ex => ({ exerciseId: ex.exerciseId, restTime: ex.restTime, tempo: ex.tempo, nSets: Math.max(1, ex.sets.filter(s => s.completed).length) }))
        });
      },
      del: async () => {
        if (!await confirmSheet('Supprimer la séance ?', 'Cette action est définitive.', 'Supprimer', true)) return;
        await removeItem('workouts', id);
        await recomputeAllRecords();
        popPage(); refreshAll(); toast('Séance supprimée');
      }
    }
  });
}

/* ====================== 6. ONGLET SÉANCES ================================ */
function estimateDuration(t) {
  const sec = t.exercises.reduce((a, e) => a + (e.targetSets || 3) * (45 + (e.restTime ?? S.settings.restTimerDefault)), 0);
  return Math.max(5, Math.round(sec / 60 / 5) * 5);
}
function lastDone(templateId) {
  return workoutsDesc().find(w => w.templateId === templateId) || null;
}

const sortedTemplates = () => [...S.data.templates].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'fr'));
const sortedFolders = () => [...S.data.folders].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const GRIP = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';
ICON.trend = svg('<path d="M4 4v16h16"/><path d="M7.5 14.5l3.5-4 3 2.5 5-6"/>');

function viewSeances() {
  return `
    <header class="se-head">
      <div><p class="kicker"><i></i>AUJOURD'HUI</p><h1 class="se-title">Séances</h1></div>
      <div class="head-pill"><button class="icon-btn sm" data-action="tpl-search" aria-label="Rechercher une séance">${ICON.search}</button>${avatarBtn()}</div>
    </header>
    ${S.tplSearch ? `<div class="search-wrap">${ICON.search}<input class="search" type="search" id="tpl-q" placeholder="Rechercher une séance ou un exercice" data-input="tpl-q" value="${esc(S.tplQuery)}" autocomplete="off"></div>` : ''}
    <div class="se-tiles">
      <button class="se-tile free tap" data-action="start-free"><span class="se-play">${ICON.play}</span><span><b>Entraînement libre</b><small>Démarre direct sans plan</small></span></button>
      <button class="se-tile tap" data-action="new-template">${ICON.plus}<b>SÉANCE</b></button>
    </div>
    <div id="se-list">${seancesList()}</div>`;
}

/** Dossiers + séances (re-rendu seul pendant la recherche, pour garder le clavier) */
function seancesList() {
  const q = S.tplSearch ? norm(S.tplQuery || '').trim() : '';
  const match = t => !q || norm(t.name).includes(q) || t.exercises.some(e => norm(exName(e.exerciseId)).includes(q));
  const tpls = sortedTemplates().filter(match);
  const folders = sortedFolders();
  const folderIds = new Set(folders.map(f => f.id));
  const loose = tpls.filter(t => !t.folderId || !folderIds.has(t.folderId));
  const canDrag = !q; // pas de glisser-déposer pendant une recherche

  let html = `<div class="se-label"><span>MES DOSSIERS</span><button class="new-pill" data-action="new-folder">${ICON.folder}NOUVEAU</button></div>
    <div class="dnd-list" data-dnd="folders">`;
  for (const f of folders) {
    const list = tpls.filter(t => t.folderId === f.id);
    const total = S.data.templates.filter(t => t.folderId === f.id).length;
    if (q && !list.length) continue;
    const open = q ? true : S.openFolders[f.id] !== false;
    html += `<section class="folder ${open ? 'open' : ''}" data-drag-id="${f.id}" data-kind="folder">
      <div class="folder-card">
        ${canDrag ? `<span class="drag-h" aria-label="Déplacer le dossier">${GRIP}</span>` : '<span class="drag-sp"></span>'}
        <button class="folder-toggle" data-action="folder-toggle" data-id="${f.id}">
          <span class="chev">${ICON.chevD}</span><span class="folder-ic">${ICON.folder}</span>
          <span class="folder-txt"><b>${esc(f.name)}</b><small>${total} séance${total > 1 ? 's' : ''}</small></span></button>
        <button class="icon-btn sm" data-action="folder-menu" data-id="${f.id}" aria-label="Options du dossier">${ICON.more}</button>
        <button class="mini-plus" data-action="folder-add" data-id="${f.id}" aria-label="Nouvelle séance dans ce dossier">${ICON.plus}</button>
      </div>
      <div class="folder-body dnd-list" data-dnd="tpl" data-folder="${f.id}">${list.map(t => templateCard(t, canDrag)).join('') || '<p class="empty-sm">Dossier vide — glisse une séance ici ou touche « + ».</p>'}</div>
    </section>`;
  }
  html += `</div>`;
  if (!folders.length) html += `<p class="empty-sm">Aucun dossier. Crée-en un pour ranger tes séances (ex. : PPL + Upper).</p>`;
  html += `<div class="se-label mt"><span>MES SÉANCES</span></div>
    <div class="dnd-list" data-dnd="tpl" data-folder="">${loose.map(t => templateCard(t, canDrag)).join('') || `<p class="empty-sm">${q ? 'Aucune séance trouvée.' : 'Aucune séance hors dossier.'}</p>`}</div>`;
  html += `<button class="card list-link tap" data-action="open-library"><span class="ll-ic">${ICON.book}</span><span>Bibliothèque d'exercices</span><span class="muted">${S.data.exercises.length}</span>${ICON.chevR}</button>`;
  return html;
}

function templateCard(t, canDrag = true) {
  const last = lastDone(t.id);
  const n = t.exercises.length;
  const names = t.exercises.map(e => exName(e.exerciseId)).join(', ');
  return `<div class="tpl-card2" data-drag-id="${t.id}" data-kind="tpl">
    <div class="tpl-top">
      ${canDrag ? `<span class="drag-h" aria-label="Déplacer la séance">${GRIP}</span>` : '<span class="drag-sp"></span>'}
      <button class="tpl-head" data-action="edit-template" data-id="${t.id}"><b>${esc(t.name)}</b>
        <small>${n} exo${n > 1 ? 's' : ''} · ~${estimateDuration(t)} min · ${last ? 'fait ' + fmtDateShort(last.startTime) : 'jamais faite'}</small></button>
      <button class="sq-btn" data-action="tpl-stats" data-id="${t.id}" aria-label="Progression de la séance">${ICON.trend}</button>
      <button class="icon-btn sm" data-action="tpl-menu" data-id="${t.id}" aria-label="Options de la séance">${ICON.more}</button>
    </div>
    <p class="tpl-exlist" data-action="edit-template" data-id="${t.id}">${esc(names) || 'Aucun exercice — touche pour en ajouter.'}</p>
    ${last ? `<button class="last-box tap" data-action="open-summary" data-id="${last.id}"><span class="lb-bar"></span>
      <span><small>DERNIER ENTRAÎNEMENT</small><b>${fmtDateShort(last.startTime)} · voir le récap</b></span>${ICON.chevR}</button>` : ''}
    <button class="btn-go" data-action="start-template" data-id="${t.id}">${ICON.play}Démarrer</button>
  </div>`;
}

ACTIONS['tpl-search'] = () => {
  S.tplSearch = !S.tplSearch;
  if (!S.tplSearch) S.tplQuery = '';
  renderTab();
  if (S.tplSearch) setTimeout(() => $('#tpl-q')?.focus(), 50);
};
INPUTS['tpl-q'] = el => { S.tplQuery = el.value; $('#se-list').innerHTML = seancesList(); };
ACTIONS['folder-add'] = el => openTemplateEditor(null, el.dataset.id);
ACTIONS['open-summary'] = el => { const w = S.data.workouts.find(x => x.id === el.dataset.id); if (w) showSummary(w); };
ACTIONS['tpl-stats'] = el => openTemplateStats(el.dataset.id);

/** Menu « … » d'une séance */
ACTIONS['tpl-menu'] = el => {
  const t = S.data.templates.find(x => x.id === el.dataset.id); if (!t) return;
  const folder = S.data.folders.find(f => f.id === t.folderId);
  actionSheet(t.name, [
    { label: 'Démarrer', fn: () => ACTIONS['start-template']({ dataset: { id: t.id } }) },
    { label: 'Modifier', fn: () => openTemplateEditor(t.id) },
    { label: 'Voir la progression', fn: () => openTemplateStats(t.id) },
    { label: folder ? `Déplacer (dossier : ${folder.name})` : 'Déplacer vers un dossier', fn: () => moveTemplateSheet(t) },
    { label: 'Dupliquer', fn: async () => { await save('templates', { ...JSON.parse(JSON.stringify(t)), id: uid(), name: t.name + ' (copie)', order: (t.order ?? 0) + 0.5 }); await renumberTemplates(); renderTab(); toast('Séance dupliquée'); } },
    { label: 'Supprimer', danger: true, fn: async () => { if (!await confirmSheet(`Supprimer « ${t.name} » ?`, 'L\'historique des entraînements est conservé.', 'Supprimer', true)) return; await removeItem('templates', t.id); renderTab(); } }
  ]);
};
function moveTemplateSheet(t) {
  actionSheet('Déplacer vers…', [
    ...sortedFolders().filter(f => f.id !== t.folderId).map(f => ({ label: f.name, icon: ICON.folder, fn: () => moveTemplateTo(t, f.id) })),
    ...(t.folderId ? [{ label: 'Hors dossier (Mes séances)', fn: () => moveTemplateTo(t, null) }] : [])
  ]);
}
async function moveTemplateTo(t, folderId) {
  t.folderId = folderId; t.order = 1e6; // en fin de liste
  await save('templates', t); await renumberTemplates();
  if (folderId) S.openFolders[folderId] = true;
  renderTab(); toast('Séance déplacée');
}
/** Remet des numéros d'ordre propres (0, 1, 2…) */
async function renumberTemplates() {
  sortedTemplates().forEach((t, i) => { t.order = i; });
  await DB.putMany('templates', S.data.templates);
}

/** Page « Progression » d'une séance */
function openTemplateStats(id) {
  const st = { metric: 'volume' };
  const pg = pushPage({
    title: () => S.data.templates.find(t => t.id === id)?.name || 'Progression',
    render: () => {
      const t = S.data.templates.find(x => x.id === id);
      if (!t) return emptyState(ICON.trash, 'Séance supprimée.');
      const ws = S.data.workouts.filter(w => w.templateId === id).sort((a, b) => a.startTime - b.startTime);
      if (!ws.length) return emptyState(ICON.trend, 'Pas encore réalisée. Démarre-la pour suivre ta progression.', `<button class="btn-primary inline" data-action="start-template" data-id="${id}">${ICON.play} Démarrer</button>`);
      const rows = ws.map(w => ({ w, ...wStats(w) }));
      const avg = k => rows.reduce((a, r) => a + r[k], 0) / rows.length;
      const best = rows.reduce((b, r) => r.volume > b.volume ? r : b, rows[0]);
      const first = rows[0], last = rows[rows.length - 1];
      const evo = first.volume ? (last.volume - first.volume) / first.volume * 100 : 0;
      const metric = { volume: r => r.volume, duree: r => (r.w.duration || 0) / 60, series: r => r.sets }[st.metric];
      const fmtY = { volume: v => v >= 1000 ? fmtNum(v / 1000, 1) + 't' : fmtNum(v), duree: v => fmtNum(v) + ' min', series: v => fmtNum(v) }[st.metric];
      // Progression du 1RM estimé par exercice (1re fois -> dernière fois dans cette séance)
      const exProg = t.exercises.map(e => {
        const pts = ws.map(w => {
          const sets = w.exercises.filter(x => x.exerciseId === e.exerciseId).flatMap(x => x.sets);
          return Math.max(0, ...sets.map(s => e1rm(s.weight, s.reps)));
        }).filter(v => v > 0);
        if (!pts.length) return '';
        const d = pts.length > 1 && pts[0] ? (pts[pts.length - 1] - pts[0]) / pts[0] * 100 : null;
        return `<button class="rec-row tap" data-action="open-exercise" data-id="${e.exerciseId}">${exThumb(EX.get(e.exerciseId))}
          <span class="ex-row-txt"><b>${esc(exName(e.exerciseId))}</b><span class="muted sm">1RM estimé : ${fmtNum(pts[0], 1)} → ${fmtNum(pts[pts.length - 1], 1)} ${unit()}</span></span>
          ${d == null ? '' : `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(d))} %</span>`}</button>`;
      }).join('');
      return `
        <div class="stat-grid">
          <div class="card stat"><span>Réalisée</span><b>${ws.length}<small> fois</small></b></div>
          <div class="card stat"><span>Dernière fois</span><b style="font-size:18px">${fmtDateShort(last.w.startTime)}</b><span class="muted sm">${relDay(last.w.startTime)}</span></div>
          <div class="card stat"><span>Volume moyen</span><b>${fmtVol(avg('volume'))}</b>${rows.length > 1 ? `<span class="delta ${evo >= 0 ? 'up' : 'down'}">${evo >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(evo))} % depuis la 1re</span>` : ''}</div>
          <div class="card stat"><span>Durée moyenne</span><b>${fmtDur(rows.reduce((a, r) => a + (r.w.duration || 0), 0) / rows.length)}</b></div>
        </div>
        <div class="card">
          <div class="seg sm">${[['volume', 'Volume'], ['duree', 'Durée'], ['series', 'Séries']].map(([k, l]) => `<button class="${st.metric === k ? 'on' : ''}" data-action="ts-metric" data-v="${k}">${l}</button>`).join('')}</div>
          ${rows.length > 1 ? lineChart([{ color: 'var(--accent)', points: rows.map(r => ({ x: r.w.startTime, y: metric(r) })) }], { yFmt: fmtY, area: true }) : '<p class="empty-sm">Il faut au moins deux séances pour tracer une courbe.</p>'}
        </div>
        <div class="card rec-card">${ICON.trophy}<div><b>Meilleure séance : ${fmtVol(best.volume)}</b><span class="muted sm">${fmtDateLong(best.w.startTime)} · ${best.sets} séries · ${fmtDur(best.w.duration)}</span></div></div>
        ${exProg ? `<div class="section-head"><h2>Par exercice</h2></div><div class="card list-card">${exProg}</div>` : ''}
        <div class="section-head"><h2>Historique</h2></div>
        ${[...ws].reverse().map(workoutCard).join('')}`;
    },
    actions: { 'ts-metric': el => { st.metric = el.dataset.v; renderPage(pg); } }
  });
}

/* ----- Glisser-déposer (dossiers et séances), via la poignée ⠿ ----- */
let drag = null;
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('.drag-h'); if (!h) return;
  const item = h.closest('[data-drag-id]'); if (!item) return;
  e.preventDefault();
  const r = item.getBoundingClientRect();
  const ph = document.createElement('div');
  ph.className = 'drag-ph'; ph.style.height = r.height + 'px';
  item.before(ph);
  Object.assign(item.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', margin: '0' });
  item.classList.add('dragging');
  document.body.classList.add('is-dragging');
  try { h.setPointerCapture(e.pointerId); } catch (_) { }
  drag = { item, ph, kind: item.dataset.kind, startY: e.clientY, top: r.top, y: e.clientY, scroller: $('#views') };
  vibrate(10);
  drag.raf = requestAnimationFrame(autoScroll);
}, { passive: false });

document.addEventListener('pointermove', e => {
  if (!drag) return;
  e.preventDefault();
  drag.y = e.clientY;
  drag.item.style.transform = `translateY(${e.clientY - drag.startY}px)`;
  placePlaceholder();
}, { passive: false });

/** Déplace l'emplacement en pointillés selon la position du doigt */
function placePlaceholder() {
  const { kind, y, ph, item } = drag;
  const lists = $$(`.dnd-list[data-dnd="${kind === 'folder' ? 'folders' : 'tpl'}"]`).filter(l => l.offsetParent !== null);
  if (!lists.length) return;
  // liste visée : celle qui contient le doigt, sinon la plus proche
  let target = lists[0], bestD = Infinity;
  for (const l of lists) {
    const r = l.getBoundingClientRect();
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (d < bestD || (d === 0 && l.contains(target) === false && target.contains(l))) { bestD = d; target = l; }
  }
  const items = [...target.children].filter(c => c.dataset.kind === kind && c !== item);
  const before = items.find(c => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
  if (before) { if (ph.nextSibling !== before) target.insertBefore(ph, before); }
  else if (ph.parentNode !== target || ph.nextElementSibling) target.appendChild(ph);
}

/** Défilement automatique près des bords de l'écran */
function autoScroll() {
  if (!drag) return;
  const edge = 90, H = innerHeight;
  const sp = drag.y < edge ? -(edge - drag.y) / 6 : drag.y > H - edge - 70 ? (drag.y - (H - edge - 70)) / 6 : 0;
  if (sp) { drag.scroller.scrollTop += sp; placePlaceholder(); }
  drag.raf = requestAnimationFrame(autoScroll);
}

async function endDrag() {
  if (!drag) return;
  const { item, ph, kind } = drag;
  cancelAnimationFrame(drag.raf);
  drag = null;
  ph.replaceWith(item);
  item.removeAttribute('style');
  item.classList.remove('dragging');
  document.body.classList.remove('is-dragging');
  if (kind === 'folder') {
    $$('.dnd-list[data-dnd="folders"] > [data-kind="folder"]').forEach((el, i) => { const f = S.data.folders.find(x => x.id === el.dataset.dragId); if (f) f.order = i; });
    await DB.putMany('folders', S.data.folders);
  } else {
    let i = 0;
    $$('.dnd-list[data-dnd="tpl"]').forEach(list => {
      const fid = list.dataset.folder || null;
      [...list.children].filter(c => c.dataset.kind === 'tpl').forEach(c => {
        const t = S.data.templates.find(x => x.id === c.dataset.dragId);
        if (t) { t.folderId = fid; t.order = i++; }
      });
    });
    await DB.putMany('templates', S.data.templates);
  }
  vibrate(8);
  renderTab();
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

ACTIONS['start-free'] = () => startWorkout({ name: 'Entraînement libre', templateId: null, exercises: [] });
ACTIONS['start-template'] = el => {
  const t = S.data.templates.find(x => x.id === el.dataset.id); if (!t) return;
  startWorkout({
    name: t.name, templateId: t.id,
    exercises: t.exercises.map(e => ({ exerciseId: e.exerciseId, restTime: e.restTime, tempo: e.tempo, targetReps: e.targetReps, nSets: e.targetSets || 3 }))
  });
};
ACTIONS['new-template'] = () => openTemplateEditor(null);
ACTIONS['edit-template'] = el => openTemplateEditor(el.dataset.id);
ACTIONS['folder-toggle'] = el => {
  const id = el.dataset.id;
  S.openFolders[id] = S.openFolders[id] === false;
  el.closest('.folder').classList.toggle('open', S.openFolders[id] !== false);
};
ACTIONS['new-folder'] = async () => {
  const name = await inputSheet('Nouveau dossier', '', 'Ex. : PPL + Upper', 'Créer');
  if (!name) return;
  await save('folders', { id: uid(), name, order: S.data.folders.length });
  renderTab();
};
ACTIONS['folder-menu'] = el => {
  const f = S.data.folders.find(x => x.id === el.dataset.id); if (!f) return;
  const idx = [...S.data.folders].sort((a, b) => a.order - b.order).indexOf(f);
  actionSheet(f.name, [
    { label: 'Renommer', fn: async () => { const n = await inputSheet('Renommer le dossier', f.name); if (n) { f.name = n; await save('folders', f); renderTab(); } } },
    { label: 'Créer une séance dans ce dossier', fn: () => openTemplateEditor(null, f.id) },
    ...(idx > 0 ? [{ label: 'Monter', fn: () => moveFolder(f, -1) }] : []),
    ...(idx < S.data.folders.length - 1 ? [{ label: 'Descendre', fn: () => moveFolder(f, 1) }] : []),
    {
      label: 'Supprimer le dossier', danger: true, fn: async () => {
        if (!await confirmSheet('Supprimer le dossier ?', 'Les séances qu\'il contient seront conservées dans « Mes séances ».', 'Supprimer', true)) return;
        for (const t of S.data.templates.filter(t => t.folderId === f.id)) { t.folderId = null; await save('templates', t); }
        await removeItem('folders', f.id); renderTab();
      }
    }
  ]);
};
async function moveFolder(f, dir) {
  const list = [...S.data.folders].sort((a, b) => a.order - b.order);
  const i = list.indexOf(f), j = i + dir;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((x, k) => { x.order = k; });
  await DB.putMany('folders', list);
  renderTab();
}

/** Éditeur de séance (modèle) */
function openTemplateEditor(id, folderId = null) {
  const src = id ? S.data.templates.find(t => t.id === id) : null;
  const draft = src ? JSON.parse(JSON.stringify(src)) : { id: uid(), name: '', folderId, order: S.data.templates.length, exercises: [] };
  const pg = pushPage({
    title: src ? 'Modifier la séance' : 'Nouvelle séance',
    right: `<button class="link-btn strong" data-action="tpl-save">OK</button>`,
    render: () => `
      <label class="lbl">Nom</label>
      <input class="field" data-input="tpl-name" value="${esc(draft.name)}" placeholder="Ex. : Push, Pull, Legs…" autocomplete="off">
      <label class="lbl">Dossier</label>
      <select class="field" data-input="tpl-folder">
        <option value="">Aucun dossier</option>
        ${S.data.folders.map(f => `<option value="${f.id}" ${draft.folderId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}
      </select>
      <div class="section-head"><h2>Exercices</h2><span class="muted">~${estimateDuration(draft)} min</span></div>
      ${draft.exercises.map((e, i) => `
        <div class="card tpl-ex-card">
          <div class="ex-head">${exThumb(EX.get(e.exerciseId))}<div class="ex-info"><h3>${esc(exName(e.exerciseId))}</h3></div>
            <button class="icon-btn" data-action="tpl-ex-menu" data-i="${i}">${ICON.more}</button></div>
          <div class="tpl-params">
            <div class="param"><span>Séries</span><div class="stepper">
              <button data-action="tpl-sets" data-i="${i}" data-d="-1">−</button><b>${e.targetSets}</b><button data-action="tpl-sets" data-i="${i}" data-d="1">+</button></div></div>
            <div class="param"><span>Reps</span><input class="field sm" inputmode="numeric" data-input="tpl-reps" data-i="${i}" value="${e.targetReps ?? ''}" placeholder="10"></div>
            <div class="param"><span>Repos</span><button class="chip-sm" data-action="tpl-rest" data-i="${i}">${ICON.timer}${fmtClock(e.restTime)}</button></div>
          </div>
        </div>`).join('') || '<p class="empty-sm">Ajoute des exercices à ta séance.</p>'}
      <button class="btn-soft wide" data-action="tpl-add">${ICON.plus}<span>Ajouter des exercices</span></button>
      ${src ? `<button class="btn-primary" data-action="tpl-start">${ICON.play} Démarrer cette séance</button>
               <button class="btn-plain" data-action="tpl-dup">Dupliquer</button>
               <button class="btn-plain danger" data-action="tpl-del">Supprimer la séance</button>` : ''}`,
    inputs: {
      'tpl-name': el => { draft.name = el.value; },
      'tpl-folder': el => { draft.folderId = el.value || null; },
      'tpl-reps': el => { draft.exercises[+el.dataset.i].targetReps = parseInt(el.value, 10) || null; }
    },
    actions: {
      'tpl-save': async () => {
        if (!draft.name.trim()) { toast('Donne un nom à ta séance'); $('.field', pg.el)?.focus(); return; }
        draft.name = draft.name.trim();
        await save('templates', draft);
        popPage(); refreshAll(); toast('Séance enregistrée');
      },
      'tpl-add': () => openPicker(ids => {
        ids.forEach(exId => draft.exercises.push({ exerciseId: exId, restTime: S.settings.restTimerDefault, targetSets: 3, targetReps: 10, tempo: '' }));
        renderPage(pg);
      }),
      'tpl-sets': el => {
        const e = draft.exercises[+el.dataset.i];
        e.targetSets = clamp(e.targetSets + +el.dataset.d, 1, 12);
        renderPage(pg);
      },
      'tpl-rest': async el => {
        const e = draft.exercises[+el.dataset.i];
        const v = await restPickerSheet(e.restTime);
        if (v != null) { e.restTime = v; renderPage(pg); }
      },
      'tpl-ex-menu': el => {
        const i = +el.dataset.i;
        actionSheet(exName(draft.exercises[i].exerciseId), [
          ...(i > 0 ? [{ label: 'Monter', fn: () => { const a = draft.exercises;[a[i - 1], a[i]] = [a[i], a[i - 1]]; renderPage(pg); } }] : []),
          ...(i < draft.exercises.length - 1 ? [{ label: 'Descendre', fn: () => { const a = draft.exercises;[a[i + 1], a[i]] = [a[i], a[i + 1]]; renderPage(pg); } }] : []),
          { label: 'Tempo', fn: async () => { const v = await inputSheet('Tempo', draft.exercises[i].tempo || '', 'Ex. : 3-1-1-0'); if (v != null) { draft.exercises[i].tempo = v; renderPage(pg); } } },
          { label: 'Retirer l\'exercice', danger: true, fn: () => { draft.exercises.splice(i, 1); renderPage(pg); } }
        ]);
      },
      'tpl-start': async () => {
        if (draft.name.trim()) await save('templates', draft);
        popPage(); refreshAll();
        ACTIONS['start-template']({ dataset: { id: draft.id } });
      },
      'tpl-dup': async () => {
        const copy = { ...JSON.parse(JSON.stringify(draft)), id: uid(), name: draft.name + ' (copie)' };
        await save('templates', copy); popPage(); refreshAll(); toast('Séance dupliquée');
      },
      'tpl-del': async () => {
        if (!await confirmSheet('Supprimer cette séance ?', 'L\'historique des entraînements est conservé.', 'Supprimer', true)) return;
        await removeItem('templates', draft.id); popPage(); refreshAll();
      }
    }
  });
}

/* ================= 7. BIBLIOTHÈQUE D'EXERCICES =========================== */
/** Vignette d'exercice (pictogramme d'équipement, teinte par groupe) */
function exThumb(e) {
  const cat = e ? MUSCLE_CATEGORY[e.muscleGroup] : '';
  const hue = { 'Pectoraux': 'c1', 'Dos': 'c2', 'Épaules': 'c3', 'Biceps': 'c4', 'Triceps': 'c5', 'Jambes': 'c6', 'Abdominaux': 'c7' }[cat] || 'c0';
  return `<span class="ex-thumb ${hue}">${EQ_ICON[e?.equipment] || EQ_ICON.halteres}</span>`;
}

function filterExercises(st) {
  const q = norm(st.q || '').trim();
  return S.data.exercises
    .filter(e => !st.cat || CATEGORIES[st.cat].includes(e.muscleGroup))
    .filter(e => !st.eq || e.equipment === st.eq)
    .filter(e => !q || norm(e.name).includes(q) || norm(MUSCLES[e.muscleGroup] || '').includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function filterChips(st, catAction, eqAction) {
  return `<div class="chips scroll-x">${Object.keys(CATEGORIES).map(c => `<button class="chip ${st.cat === c ? 'on' : ''}" data-action="${catAction}" data-v="${c}">${c}</button>`).join('')}</div>
    <div class="chips scroll-x">${Object.entries(EQUIPMENT).map(([k, v]) => `<button class="chip ${st.eq === k ? 'on' : ''}" data-action="${eqAction}" data-v="${k}">${v}</button>`).join('')}</div>`;
}

function exerciseRows(list, { action, sel = [] }) {
  if (!list.length) return '<p class="empty-sm">Aucun exercice trouvé.</p>';
  return list.map(e => {
    const n = sel.indexOf(e.id);
    return `<button class="ex-row tap ${n >= 0 ? 'on' : ''}" data-action="${action}" data-id="${e.id}">
      ${exThumb(e)}
      <span class="ex-row-txt"><b>${esc(e.name)}</b><span class="muted sm">${MUSCLES[e.muscleGroup] || ''}${e.secondaryMuscle ? ' · ' + MUSCLES[e.secondaryMuscle] : ''} · ${EQUIPMENT[e.equipment] || ''}${e.isCustom ? ' · Perso' : ''}</span></span>
      ${n >= 0 ? `<span class="sel-num">${n + 1}</span>` : (action === 'pk-item' ? '<span class="sel-num off"></span>' : `<span class="chev-r">${ICON.chevR}</span>`)}
    </button>`;
  }).join('');
}

/** Page "Bibliothèque d'exercices" */
ACTIONS['open-library'] = () => {
  const st = { q: '', cat: '', eq: '' };
  const pg = pushPage({
    title: 'Exercices',
    right: `<button class="icon-btn" data-action="lib-new" aria-label="Créer un exercice">${ICON.plus}</button>`,
    render: () => `
      <div class="search-wrap">${ICON.search}<input class="search" type="search" placeholder="Rechercher un exercice" data-input="lib-q" value="${esc(st.q)}"></div>
      <div id="lib-chips">${filterChips(st, 'lib-cat', 'lib-eq')}</div>
      <div id="lib-list" class="ex-list">${exerciseRows(filterExercises(st), { action: 'open-exercise' })}</div>`,
    inputs: { 'lib-q': el => { st.q = el.value; $('#lib-list', pg.el).innerHTML = exerciseRows(filterExercises(st), { action: 'open-exercise' }); } },
    actions: {
      'lib-cat': el => { st.cat = st.cat === el.dataset.v ? '' : el.dataset.v; renderPage(pg); },
      'lib-eq': el => { st.eq = st.eq === el.dataset.v ? '' : el.dataset.v; renderPage(pg); },
      'lib-new': () => openExerciseForm(() => renderPage(pg))
    }
  });
};

/** Sélecteur d'exercices (plein écran, multi-sélection) */
function openPicker(onPick) {
  const st = { q: '', cat: '', eq: '', sel: [] };
  const list = () => exerciseRows(filterExercises(st), { action: 'pk-item', sel: st.sel });
  const upd = () => {
    $('#pk-chips', sh.el).innerHTML = filterChips(st, 'pk-cat', 'pk-eq');
    $('#pk-list', sh.el).innerHTML = list();
    const b = $('#pk-done', sh.el);
    b.disabled = !st.sel.length;
    b.textContent = st.sel.length ? `Ajouter (${st.sel.length})` : 'Ajouter';
  };
  const sh = openSheet({
    full: true,
    html: `<div class="sheet-top"><button class="link-btn" data-action="sheet-close">Annuler</button><h3>Exercices</h3><button class="link-btn strong" id="pk-done" data-action="pk-done" disabled>Ajouter</button></div>
      <div class="search-wrap">${ICON.search}<input class="search" type="search" placeholder="Rechercher" data-input="pk-q"></div>
      <div id="pk-chips">${filterChips(st, 'pk-cat', 'pk-eq')}</div>
      <button class="ex-row tap create" data-action="pk-create"><span class="ex-thumb c0">${ICON.plus}</span><span class="ex-row-txt"><b>Créer un exercice</b></span></button>
      <div id="pk-list" class="ex-list">${list()}</div>`,
    inputs: { 'pk-q': el => { st.q = el.value; $('#pk-list', sh.el).innerHTML = list(); } },
    actions: {
      'pk-cat': el => { st.cat = st.cat === el.dataset.v ? '' : el.dataset.v; upd(); },
      'pk-eq': el => { st.eq = st.eq === el.dataset.v ? '' : el.dataset.v; upd(); },
      'pk-item': el => {
        const id = el.dataset.id, i = st.sel.indexOf(id);
        if (i >= 0) st.sel.splice(i, 1); else st.sel.push(id);
        vibrate(8); upd();
      },
      'pk-done': () => { if (!st.sel.length) return; const ids = [...st.sel]; sh.close(); onPick(ids); },
      'pk-create': () => openExerciseForm(ex => { st.sel.push(ex.id); upd(); })
    }
  });
}

/** Formulaire de création d'un exercice personnalisé */
function openExerciseForm(onSaved) {
  const d = { name: '', muscleGroup: 'pectoraux', secondaryMuscle: '', equipment: 'halteres' };
  const opts = (obj, cur, empty) => (empty ? `<option value="">${empty}</option>` : '') + Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v}</option>`).join('');
  const sh = openSheet({
    html: `<div class="dialog left"><h3>Nouvel exercice</h3>
      <label class="lbl">Nom</label><input class="field" data-input="f-name" placeholder="Ex. : Développé couché Smith" autocomplete="off">
      <label class="lbl">Muscle principal</label><select class="field" data-input="f-muscle">${opts(MUSCLES, d.muscleGroup)}</select>
      <label class="lbl">Muscle secondaire</label><select class="field" data-input="f-sec">${opts(MUSCLES, '', 'Aucun')}</select>
      <label class="lbl">Équipement</label><select class="field" data-input="f-eq">${opts(EQUIPMENT, d.equipment)}</select>
      <button class="btn-primary" data-action="f-save">Créer l'exercice</button>
      <button class="btn-plain" data-action="sheet-close">Annuler</button></div>`,
    inputs: {
      'f-name': el => { d.name = el.value; }, 'f-muscle': el => { d.muscleGroup = el.value; },
      'f-sec': el => { d.secondaryMuscle = el.value; }, 'f-eq': el => { d.equipment = el.value; }
    },
    actions: {
      'f-save': async () => {
        const name = d.name.trim();
        if (!name) { toast('Donne un nom à l\'exercice'); return; }
        if (S.data.exercises.some(e => norm(e.name) === norm(name))) { toast('Cet exercice existe déjà'); return; }
        const ex = { id: 'cx-' + uid(), name, muscleGroup: d.muscleGroup, secondaryMuscle: d.secondaryMuscle || null, equipment: d.equipment, isCustom: true };
        await save('exercises', ex);
        sh.close(); toast('Exercice créé'); onSaved && onSaved(ex);
      }
    }
  });
}

/** Contenu de la fiche exercice (historique, 1RM, graphique) */
function exerciseDetailHtml(id) {
  const e = EX.get(id);
  if (!e) return emptyState(ICON.trash, 'Exercice introuvable.');
  const hist = exerciseHistory(id);
  const best = hist.reduce((b, h) => h.e1rm > (b?.e1rm || 0) ? h : b, null);
  const maxW = Math.max(0, ...hist.map(h => h.maxW));
  const totalSets = hist.reduce((a, h) => a + h.sets.length, 0);
  return `
    <div class="ex-detail-head">${exThumb(e)}<div><h1>${esc(e.name)}</h1>
      <p class="muted">${MUSCLES[e.muscleGroup]}${e.secondaryMuscle ? ' · ' + MUSCLES[e.secondaryMuscle] : ''} · ${EQUIPMENT[e.equipment]}</p></div></div>
    <div class="stat-grid">
      <div class="card stat"><span>1RM estimé</span><b>${best ? fmtNum(best.e1rm, 1) : '—'}<small> ${unit()}</small></b></div>
      <div class="card stat"><span>Charge max</span><b>${maxW ? fmtNum(maxW, 2) : '—'}<small> ${unit()}</small></b></div>
      <div class="card stat"><span>Séances</span><b>${hist.length}</b></div>
      <div class="card stat"><span>Séries</span><b>${totalSets}</b></div>
    </div>
    ${hist.length >= 2 ? `<div class="card"><h3 class="card-title">Évolution du 1RM estimé</h3>${lineChart([{ color: 'var(--accent)', points: hist.map(h => ({ x: h.w.startTime, y: h.e1rm })) }], { yFmt: v => fmtNum(v), area: true })}</div>` : ''}
    ${best ? `<div class="card rec-card">${ICON.trophy}<div><b>Meilleure série : ${fmtNum(best.best.weight, 2)} ${unit()} × ${best.best.reps}</b><span class="muted sm">${fmtDateLong(best.w.startTime)} · 1RM ${fmtNum(best.e1rm, 1)} ${unit()}</span></div></div>` : ''}
    <div class="section-head"><h2>Historique</h2></div>
    ${hist.length ? [...hist].reverse().slice(0, 30).map(h => `<div class="card hist-item">
        <div class="hist-top"><b>${esc(h.w.name)}</b><span class="muted sm">${fmtDateLong(h.w.startTime)}</span></div>
        <div class="hist-chips">${h.sets.map(s => `<span class="set-chip ${s.isRecord ? 'rec' : ''}">${fmtNum(s.weight, 2)}×${s.reps}</span>`).join('')}</div>
      </div>`).join('') : '<p class="empty-sm">Pas encore réalisé. Ton historique apparaîtra ici.</p>'}
    ${e.isCustom ? `<button class="btn-plain danger" data-action="ex-del" data-id="${e.id}">Supprimer cet exercice</button>` : ''}`;
}

/** Ouvre la fiche : en feuille si l'entraînement est affiché, sinon en page */
ACTIONS['open-exercise'] = el => openExerciseDetail(el.dataset.id);
function openExerciseDetail(id) {
  const del = async () => {
    const used = S.data.workouts.some(w => w.exercises.some(x => x.exerciseId === id)) || S.data.templates.some(t => t.exercises.some(x => x.exerciseId === id));
    if (!await confirmSheet('Supprimer cet exercice ?', used ? 'Il est utilisé dans des séances : il apparaîtra comme « Exercice supprimé ».' : '', 'Supprimer', true)) return;
    await removeItem('exercises', id);
    return true;
  };
  if (S.active && !S.active.minimized) {
    const sh = openSheet({ full: true, html: `<div class="sheet-top"><span></span><h3>Exercice</h3><button class="link-btn strong" data-action="sheet-close">OK</button></div>${exerciseDetailHtml(id)}`, actions: { 'ex-del': async () => { if (await del()) { sh.close(); renderWorkout(); } } } });
    return;
  }
  pushPage({ title: 'Exercice', render: () => exerciseDetailHtml(id), actions: { 'ex-del': async () => { if (await del()) { popPage(); refreshAll(); } } } });
}

/* ===================== 8. ENTRAÎNEMENT ACTIF ============================= */
const ACTIVE_KEY = 'gymlog.active';
function persistActive() {
  try {
    if (S.active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(S.active));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch (e) { /* stockage plein */ }
}
const newSet = n => ({ setNumber: n, weight: null, reps: null, completed: false, isRecord: false, timestamp: null });

/**
 * Démarre un entraînement.
 * spec = { name, templateId, exercises: [{ exerciseId, restTime, tempo, targetReps, nSets }] }
 */
async function startWorkout(spec) {
  if (S.active) {
    const ok = await confirmSheet('Une séance est en cours', `« ${S.active.name} » n'est pas terminée. L'abandonner pour démarrer celle-ci ?`, 'Abandonner et démarrer', true);
    if (!ok) { maximizeWorkout(); return; }
    stopRest();
  }
  unlockAudio();
  S.active = {
    id: uid(), name: spec.name, templateId: spec.templateId || null,
    startTime: spec.startTime || Date.now(), minimized: false, rest: null,
    manual: !!spec.manual, durationMin: spec.durationMin || null,
    exercises: spec.exercises.filter(e => EX.has(e.exerciseId)).map(e => ({
      exerciseId: e.exerciseId,
      restTime: e.restTime ?? S.settings.restTimerDefault,
      tempo: e.tempo || '',
      targetReps: e.targetReps || null,
      sets: Array.from({ length: e.nSets || 3 }, (_, k) => newSet(k + 1))
    }))
  };
  persistActive();
  while (pages.length) popPage();
  renderWorkout(true);
  if (!spec.manual) requestNotifPermission();
}

/** Valeurs "fantômes" proposées pour une série (précédente séance ou série du dessus) */
function placeholderFor(ex, j, prev) {
  const p = prev[j] || (j > 0 ? ex.sets[j - 1] : null) || prev[prev.length - 1];
  return {
    weight: p && p.weight != null ? p.weight : null,
    reps: p && p.reps != null ? p.reps : ex.targetReps
  };
}

function renderWorkout(animateOpen = false) {
  const a = S.active;
  const root = $('#workout-root');
  if (!a) { root.className = ''; setTimeout(() => { if (!S.active) root.innerHTML = ''; }, 350); renderMiniBar(); return; }
  const body = $('.w-body', root);
  const scroll = body ? body.scrollTop : 0;
  const st = wStats(a);
  root.innerHTML = `
    <div class="w-screen ${a.rest ? 'has-rest' : ''}">
      <header class="w-head">
        <div class="w-top">
          <button class="icon-btn" data-action="w-minimize" aria-label="Réduire">${ICON.minimize}</button>
          <div class="w-title">${a.manual ? `<span class="live manual">SAISIE · ${fmtDateShort(a.startTime).toUpperCase()}</span>` : '<span class="live"><i></i>LIVE</span>'}<h2 data-action="w-rename">${esc(a.name)}</h2></div>
          <button class="btn-finish" data-action="w-finish">Terminer</button>
        </div>
        <div class="w-stats">
          <div>${a.manual ? `<b>${fmtDur(a.durationMin * 60)}</b>` : `<b id="w-elapsed">${fmtClock((Date.now() - a.startTime) / 1000)}</b>`}<span>Durée</span></div>
          <div><b id="w-volume">${fmtNum(st.volume)} ${unit()}</b><span>Volume</span></div>
          <div><b id="w-sets">${st.sets} / ${st.total}</b><span>Séries</span></div>
        </div>
      </header>
      <div class="w-body">
        ${a.exercises.map((ex, i) => exerciseBlock(ex, i)).join('')}
        ${a.exercises.length ? '' : emptyState(EQ_ICON.halteres, 'Séance vide. Ajoute ton premier exercice.')}
        <button class="btn-primary" data-action="w-add-ex">${ICON.plus} Exercice</button>
        <button class="btn-plain danger" data-action="w-cancel">Abandonner l'entraînement</button>
      </div>
      <div id="rest-panel"></div>
    </div>`;
  if (animateOpen && !a.minimized) {
    root.className = '';
    requestAnimationFrame(() => requestAnimationFrame(() => { root.className = 'open'; }));
  } else root.className = a.minimized ? '' : 'open';
  $('.w-body', root).scrollTop = scroll;
  renderRest();
  renderMiniBar();
}

function exerciseBlock(ex, i) {
  const e = EX.get(ex.exerciseId);
  const prev = prevSets(ex.exerciseId);
  const rows = ex.sets.map((s, j) => {
    const p = prev[j];
    const ph = placeholderFor(ex, j, prev);
    return `<div class="set-row ${s.completed ? 'done' : ''} ${s.isRecord ? 'rec' : ''}">
      <button class="set-num" data-action="w-set-menu" data-ex="${i}" data-set="${j}">${j + 1}</button>
      <span class="set-prev">${s.isRecord ? '<span class="rec-badge">RECORD</span>' : (p ? `${fmtNum(p.weight, 2)}×${p.reps}` : '—')}</span>
      <input class="set-in" inputmode="decimal" enterkeyhint="next" data-input="w-weight" data-change="w-commit" data-ex="${i}" data-set="${j}" value="${s.weight ?? ''}" placeholder="${ph.weight ?? ''}">
      <input class="set-in" inputmode="numeric" enterkeyhint="done" data-input="w-reps" data-change="w-commit" data-ex="${i}" data-set="${j}" value="${s.reps ?? ''}" placeholder="${ph.reps ?? ''}">
      <button class="set-check" data-action="w-check" data-ex="${i}" data-set="${j}" aria-label="Valider la série">${ICON.check}</button>
    </div>`;
  }).join('');
  return `<section class="ex-card">
    <div class="ex-head">
      ${exThumb(e)}
      <div class="ex-info"><h3 class="tap" data-action="open-exercise" data-id="${ex.exerciseId}">${esc(exName(ex.exerciseId))}</h3>
        <div class="ex-meta">
          <button class="chip-sm" data-action="w-rest-edit" data-ex="${i}">${ICON.timer}${ex.restTime ? fmtClock(ex.restTime) : 'Off'}</button>
          ${ex.tempo ? `<button class="chip-sm" data-action="w-tempo" data-ex="${i}">Tempo ${esc(ex.tempo)}</button>` : ''}
        </div></div>
      <button class="icon-btn" data-action="w-ex-menu" data-ex="${i}" aria-label="Options">${ICON.more}</button>
    </div>
    <div class="set-row head"><span>#</span><span>PREV</span><span>${unit().toUpperCase()}</span><span>REPS</span><span>${ICON.check}</span></div>
    ${rows}
    <button class="btn-add-set" data-action="w-add-set" data-ex="${i}">${ICON.plus} Ajouter une série</button>
  </section>`;
}

/** Met à jour l'en-tête (volume, séries) sans tout re-rendre */
function updateWorkoutStats() {
  if (!S.active) return;
  const st = wStats(S.active);
  const v = $('#w-volume'), s = $('#w-sets');
  if (v) v.textContent = `${fmtNum(st.volume)} ${unit()}`;
  if (s) s.textContent = `${st.sets} / ${st.total}`;
}

/** Recalcule le record de l'exercice dans la séance en cours. Renvoie la série record. */
function recomputeRecords(ex) {
  const hist = bestE1RM(ex.exerciseId, S.active.id);
  let top = null, topV = 0;
  for (const s of ex.sets) {
    const v = s.completed ? e1rm(s.weight, s.reps) : 0;
    if (v > topV) { topV = v; top = s; }
  }
  for (const s of ex.sets) s.isRecord = s === top && hist > 0 && topV > hist;
  return ex.sets.find(s => s.isRecord) || null;
}

let persistTimer;
const persistSoon = () => { clearTimeout(persistTimer); persistTimer = setTimeout(persistActive, 300); };
const setAt = el => S.active.exercises[+el.dataset.ex].sets[+el.dataset.set];

INPUTS['w-weight'] = el => { setAt(el).weight = parseNum(el.value); updateWorkoutStats(); persistSoon(); };
INPUTS['w-reps'] = el => { const v = parseNum(el.value); setAt(el).reps = v == null ? null : Math.round(v); updateWorkoutStats(); persistSoon(); };
// Modification d'une série déjà validée : on recalcule les records
CHANGES['w-commit'] = el => {
  const ex = S.active.exercises[+el.dataset.ex];
  if (!setAt(el).completed) return;
  const before = ex.sets.map(s => s.isRecord).join();
  recomputeRecords(ex);
  persistActive();
  if (before !== ex.sets.map(s => s.isRecord).join()) renderWorkout();
};

ACTIONS['w-check'] = el => {
  const a = S.active;
  const exIdx = +el.dataset.ex, setIdx = +el.dataset.set;
  const ex = a.exercises[exIdx], s = ex.sets[setIdx];
  unlockAudio();
  if (s.completed) {
    s.completed = false; s.isRecord = false; s.timestamp = null;
    recomputeRecords(ex);
  } else {
    // Champs vides -> on reprend les valeurs proposées
    const ph = placeholderFor(ex, setIdx, prevSets(ex.exerciseId));
    if (s.reps == null) s.reps = ph.reps ?? null;
    if (s.weight == null) s.weight = ph.weight ?? 0;
    if (!s.reps) { toast('Indique le nombre de répétitions'); s.reps = null; return; }
    s.completed = true; s.timestamp = Date.now();
    vibrate(12);
    const rec = recomputeRecords(ex);
    if (rec === s) { toast('🏆 Nouveau record !'); vibrate([30, 60, 30]); }
    if (ex.restTime > 0 && !a.manual) startRest(ex.restTime, exIdx, setIdx);
  }
  persistActive();
  renderWorkout();
};

ACTIONS['w-add-set'] = el => {
  const ex = S.active.exercises[+el.dataset.ex];
  ex.sets.push(newSet(ex.sets.length + 1));
  persistActive(); renderWorkout();
};

ACTIONS['w-set-menu'] = el => {
  const ex = S.active.exercises[+el.dataset.ex], j = +el.dataset.set;
  actionSheet(`Série ${j + 1}`, [
    { label: 'Dupliquer la série', fn: () => { const s = ex.sets[j]; ex.sets.splice(j + 1, 0, { ...newSet(0), weight: s.weight, reps: s.reps }); renum(ex); persistActive(); renderWorkout(); } },
    { label: 'Supprimer la série', danger: true, fn: () => { ex.sets.splice(j, 1); renum(ex); recomputeRecords(ex); persistActive(); renderWorkout(); } }
  ]);
};
const renum = ex => ex.sets.forEach((s, k) => { s.setNumber = k + 1; });

ACTIONS['w-add-ex'] = () => openPicker(ids => {
  ids.forEach(id => S.active.exercises.push({ exerciseId: id, restTime: S.settings.restTimerDefault, tempo: '', targetReps: null, sets: [newSet(1), newSet(2), newSet(3)] }));
  persistActive(); renderWorkout();
  setTimeout(() => { const b = $('.w-body'); b && b.scrollTo({ top: b.scrollHeight, behavior: 'smooth' }); }, 50);
});

ACTIONS['w-rest-edit'] = async el => {
  const ex = S.active.exercises[+el.dataset.ex];
  const v = await restPickerSheet(ex.restTime);
  if (v != null) { ex.restTime = v; persistActive(); renderWorkout(); }
};
ACTIONS['w-tempo'] = async el => {
  const ex = S.active.exercises[+el.dataset.ex];
  const v = await inputSheet('Tempo', ex.tempo, 'Ex. : 3-1-1-0 (excentrique-pause-concentrique-pause)');
  if (v != null) { ex.tempo = v; persistActive(); renderWorkout(); }
};
ACTIONS['w-rename'] = async () => {
  const v = await inputSheet('Nom de la séance', S.active.name);
  if (v) { S.active.name = v; persistActive(); renderWorkout(); }
};

ACTIONS['w-ex-menu'] = el => {
  const a = S.active, i = +el.dataset.ex, ex = a.exercises[i];
  actionSheet(exName(ex.exerciseId), [
    { label: 'Historique de l\'exercice', fn: () => openExerciseDetail(ex.exerciseId) },
    { label: 'Temps de repos', fn: () => ACTIONS['w-rest-edit']({ dataset: { ex: i } }) },
    { label: ex.tempo ? 'Modifier le tempo' : 'Ajouter un tempo', fn: () => ACTIONS['w-tempo']({ dataset: { ex: i } }) },
    { label: 'Remplacer l\'exercice', fn: () => openPicker(ids => { ex.exerciseId = ids[0]; ex.sets.forEach(s => { s.isRecord = false; }); recomputeRecords(ex); persistActive(); renderWorkout(); }) },
    ...(i > 0 ? [{ label: 'Monter', fn: () => { [a.exercises[i - 1], a.exercises[i]] = [a.exercises[i], a.exercises[i - 1]]; persistActive(); renderWorkout(); } }] : []),
    ...(i < a.exercises.length - 1 ? [{ label: 'Descendre', fn: () => { [a.exercises[i + 1], a.exercises[i]] = [a.exercises[i], a.exercises[i + 1]]; persistActive(); renderWorkout(); } }] : []),
    { label: 'Supprimer l\'exercice', danger: true, fn: () => { a.exercises.splice(i, 1); if (a.rest && a.rest.exIdx === i) stopRest(); persistActive(); renderWorkout(); } }
  ]);
};

function maximizeWorkout() { if (!S.active) return; S.active.minimized = false; persistActive(); $('#workout-root').className = 'open'; renderMiniBar(); }
ACTIONS['w-minimize'] = () => { S.active.minimized = true; persistActive(); $('#workout-root').className = ''; renderMiniBar(); refreshAll(); };
ACTIONS['w-maximize'] = maximizeWorkout;

ACTIONS['w-cancel'] = async () => {
  if (!await confirmSheet('Abandonner l\'entraînement ?', 'Les séries saisies seront perdues.', 'Abandonner', true)) return;
  stopRest(); S.active = null; persistActive(); renderWorkout();
};

/** Barre "LIVE" affichée au-dessus des onglets quand la séance est réduite */
function renderMiniBar() {
  const bar = $('#mini-bar');
  const a = S.active;
  const show = a && a.minimized;
  document.body.classList.toggle('has-mini', !!show);
  if (!show) { bar.classList.remove('show'); return; }
  bar.innerHTML = `<span class="live"><i></i>LIVE</span><b>${esc(a.name)}</b><span id="mini-time">${a.manual ? fmtDateShort(a.startTime) : fmtClock((Date.now() - a.startTime) / 1000)}</span>
    <span id="mini-rest" class="mini-rest">${a.rest ? fmtClock(Math.ceil((a.rest.endAt - Date.now()) / 1000)) : ''}</span>${ICON.chevD.replace('<svg', '<svg class="up"')}`;
  bar.classList.add('show');
}

/* ----- Minuteur de repos -----
   On stocke l'heure de fin (endAt) : le décompte reste juste même si
   l'app est suspendue (écran verrouillé) et reprend au retour. */
function startRest(sec, exIdx, setIdx) {
  S.active.rest = { endAt: Date.now() + sec * 1000, total: sec, exIdx, setIdx, done: false };
  scheduleRestNotification(sec);
}
function stopRest() {
  if (S.active) S.active.rest = null;
  cancelRestNotification();
  renderRest(); renderMiniBar();
}
ACTIONS['w-rest-plus'] = () => {
  const r = S.active.rest; if (!r) return;
  r.endAt += 30000; r.total += 30; r.done = false;
  scheduleRestNotification((r.endAt - Date.now()) / 1000);
  persistActive(); updateRestUI();
};
ACTIONS['w-rest-minus'] = () => {
  const r = S.active.rest; if (!r) return;
  r.endAt -= 15000; r.total = Math.max(15, r.total - 15);
  scheduleRestNotification((r.endAt - Date.now()) / 1000);
  persistActive(); updateRestUI();
};
ACTIONS['w-rest-skip'] = () => { stopRest(); persistActive(); $('.w-screen')?.classList.remove('has-rest'); };

/** Texte "Suivant : …" — prochaine série non validée */
function nextSetText() {
  const a = S.active, r = a.rest;
  for (let i = r ? r.exIdx : 0; i < a.exercises.length; i++) {
    const ex = a.exercises[i];
    const j = ex.sets.findIndex((s, k) => !s.completed && (i > r.exIdx || k > r.setIdx));
    if (j >= 0) return `${exName(ex.exerciseId)} — série ${j + 1}`;
  }
  return 'Dernière série terminée 💪';
}

function renderRest() {
  const el = $('#rest-panel'); if (!el) return;
  const r = S.active && S.active.rest;
  $('.w-screen')?.classList.toggle('has-rest', !!r);
  if (!r) { el.className = ''; el.innerHTML = ''; return; }
  const C = 2 * Math.PI * 26;
  el.className = 'show';
  el.innerHTML = `
    <div class="rest-ring">
      <svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" class="ring-bg"/><circle id="ring-fg" cx="30" cy="30" r="26" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>
      <span id="rest-time">0:00</span>
    </div>
    <div class="rest-info"><span class="rest-label">Repos</span><span class="rest-next">Suivant : ${esc(nextSetText())}</span></div>
    <div class="rest-btns">
      <button class="rest-btn" data-action="w-rest-minus">−15</button>
      <button class="rest-btn" data-action="w-rest-plus">+30s</button>
      <button class="rest-btn primary" data-action="w-rest-skip">Passer</button>
    </div>`;
  updateRestUI();
}

function updateRestUI() {
  const r = S.active && S.active.rest; if (!r) return;
  const rem = Math.max(0, (r.endAt - Date.now()) / 1000);
  const t = $('#rest-time'); if (t) t.textContent = fmtClock(Math.ceil(rem));
  const fg = $('#ring-fg');
  if (fg) { const C = 2 * Math.PI * 26; fg.style.strokeDashoffset = C * (1 - rem / r.total); }
  $('#rest-panel')?.classList.toggle('ending', rem <= 5);
  const m = $('#mini-rest'); if (m) m.textContent = fmtClock(Math.ceil(rem));
}

/** Boucle principale (chrono + minuteur), 4 fois par seconde */
function tick() {
  const a = S.active; if (!a) return;
  const el = $('#w-elapsed'); if (el) el.textContent = fmtClock((Date.now() - a.startTime) / 1000);
  const mt = !a.manual && $('#mini-time'); if (mt) mt.textContent = fmtClock((Date.now() - a.startTime) / 1000);
  if (a.rest) {
    const rem = (a.rest.endAt - Date.now()) / 1000;
    if (rem <= 0 && !a.rest.done) { a.rest.done = true; persistActive(); restFinished(); }
    if (rem <= -1.5) { a.rest = null; persistActive(); renderRest(); renderMiniBar(); return; }
    updateRestUI();
  }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

function restFinished() {
  beep();
  vibrate([200, 100, 200]);
  if (document.hidden) showNotification('Repos terminé ⏱', 'C\'est reparti : ' + nextSetText());
  else toast('Repos terminé — c\'est reparti !');
}

/* ----- Son : AudioContext débloqué au premier geste (exigence iOS) ----- */
let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { audioCtx = null; }
}
function beep() {
  if (!audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    [0, 0.18, 0.36].forEach((dt, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = i === 2 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.15);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + dt); o.stop(t0 + dt + 0.16);
    });
  } catch (e) { /* ignore */ }
}

/* ----- Notifications (iOS 16.4+ : uniquement en PWA installée) ----- */
function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch (e) { /* ignore */ }
  }
}
async function showNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'rest', renotify: true, vibrate: [200, 100, 200] });
    else new Notification(title, { body, icon: 'icons/icon-192.png' });
  } catch (e) { /* ignore */ }
}
/* Notification programmée (Notification Triggers, si le navigateur la supporte).
   Sinon on se rabat sur un setTimeout — qui ne s'exécute que si l'app n'est
   pas suspendue. Le décompte, lui, reste toujours exact grâce à endAt. */
let restTimeout = null;
async function scheduleRestNotification(sec) {
  cancelRestNotification();
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    if ('showTrigger' in Notification.prototype && 'TimestampTrigger' in window) {
      const reg = await navigator.serviceWorker?.getRegistration();
      reg && reg.showNotification('Repos terminé ⏱', { body: 'C\'est reparti !', tag: 'rest', showTrigger: new window.TimestampTrigger(Date.now() + sec * 1000), icon: 'icons/icon-192.png' });
      return;
    }
  } catch (e) { /* ignore */ }
  restTimeout = setTimeout(() => { if (document.hidden && S.active?.rest && !S.active.rest.done) { S.active.rest.done = true; restFinished(); } }, sec * 1000);
}
function cancelRestNotification() { clearTimeout(restTimeout); restTimeout = null; }

/* ----- Fin de séance ----- */
ACTIONS['w-finish'] = async () => {
  const a = S.active;
  const st = wStats(a);
  if (!st.sets) {
    if (await confirmSheet('Aucune série validée', 'Valide au moins une série pour enregistrer la séance. Abandonner ?', 'Abandonner la séance', true)) { stopRest(); S.active = null; persistActive(); renderWorkout(); }
    return;
  }
  const pending = st.total - st.sets;
  const opt = { makeTemplate: false, name: a.name };
  const sh = openSheet({
    html: `<div class="dialog">
      <h3>Terminer l'entraînement ?</h3>
      <input class="field center" data-input="sum-name" value="${esc(a.name)}" aria-label="Nom de la séance">
      ${pending ? `<p class="muted sm">${pending} série${pending > 1 ? 's' : ''} non validée${pending > 1 ? 's' : ''} ne ser${pending > 1 ? 'ont' : 'a'} pas enregistrée${pending > 1 ? 's' : ''}.</p>` : ''}
      ${!a.templateId ? `<button class="toggle-row" data-action="sum-tpl"><span class="tgl"></span><span>Enregistrer aussi comme séance type</span></button>` : ''}
      <button class="btn-primary" data-action="sum-save">${ICON.check} Terminer</button>
      <button class="btn-plain" data-action="sheet-close">Reprendre la séance</button>
    </div>`,
    inputs: { 'sum-name': el => { opt.name = el.value; } },
    actions: {
      'sum-tpl': el => { opt.makeTemplate = !opt.makeTemplate; el.classList.toggle('on', opt.makeTemplate); },
      'sum-save': async () => { sh.close(); await saveWorkout(opt); }
    }
  });
};

async function saveWorkout({ name, makeTemplate }) {
  const a = S.active;
  const end = a.manual ? a.startTime + a.durationMin * 60000 : Date.now();
  const w = {
    id: a.id, name: (name || '').trim() || a.name, templateId: a.templateId,
    date: dayKey(a.startTime), startTime: a.startTime, endTime: end,
    duration: Math.round((end - a.startTime) / 1000),
    plannedSets: wStats(a).total,
    exercises: a.exercises
      .map(ex => ({ exerciseId: ex.exerciseId, restTime: ex.restTime, tempo: ex.tempo, sets: ex.sets.filter(s => s.completed).map((s, k) => ({ ...s, setNumber: k + 1 })) }))
      .filter(ex => ex.sets.length)
  };
  await save('workouts', w);
  if (makeTemplate) {
    await save('templates', {
      id: uid(), name: w.name, folderId: null,
      exercises: w.exercises.map(ex => ({ exerciseId: ex.exerciseId, restTime: ex.restTime, tempo: ex.tempo, targetSets: ex.sets.length, targetReps: ex.sets[0]?.reps || 10 }))
    });
  }
  stopRest();
  S.active = null; persistActive();
  renderWorkout();
  S.tab = 'activity'; S.selDay = null;
  S.calMonth = new Date(new Date(w.startTime).getFullYear(), new Date(w.startTime).getMonth(), 1);
  if (a.manual) await recomputeAllRecords(); // une séance passée peut changer les records suivants
  refreshAll();
  showSummary(w);
}

/* ----- Écran « Entraînement terminé » ----- */
const DAYS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
/** Intensité pour une seule séance (seuils plus bas que sur 7 jours) */
const sessionLevel = n => n <= 0 ? 0 : n < 2 ? 1 : n < 4 ? 2 : n < 6 ? 3 : n < 9 ? 4 : 5;

function showSummary(w) {
  const st = wStats(w);
  const planned = Math.max(w.plannedSets || 0, st.sets);
  const min = Math.round((w.duration || 0) / 60);
  const dur = `${Math.floor(min / 60)}:${pad(min % 60)}`;
  const vol = st.volume >= 1000 ? [fmtNum(st.volume / 1000, 1), 'tonnes'] : [fmtNum(st.volume), unit()];
  const d = new Date(w.startTime);
  const date = `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
  const ms = muscleSets([w]);
  const lv = Object.fromEntries(Object.keys(MUSCLES).map(m => [m, sessionLevel(ms[m] || 0)]));
  const top = Object.entries(ms).filter(([, n]) => n >= 1).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => MUSCLES[m]).join(' · ');
  const recs = w.exercises.flatMap(ex => ex.sets.filter(s => s.isRecord).map(s => ({ ex, s })));
  const confetti = Array.from({ length: 16 }, (_, i) => {
    const ang = (i / 16) * Math.PI * 2, r = 70 + (i % 3) * 22;
    const col = ['#FFCC00', '#34C759', '#FF9F0A', '#5AC8FA'][i % 4];
    return `<i style="--x:${Math.cos(ang) * r}px;--y:${Math.sin(ang) * r}px;--c:${col};--dl:${(i % 4) * 40}ms"></i>`;
  }).join('');

  const root = $('#summary-root');
  root.innerHTML = `
    <div class="sum-screen">
      <div class="sum-body">
        <p class="sum-kicker">✓ ENTRAÎNEMENT TERMINÉ</p>
        <div class="sum-badge"><div class="sum-confetti">${confetti}</div><span>${ICON.check}</span></div>
        <h1 class="sum-title">${esc(w.name)}</h1>
        <p class="sum-date">${date}</p>
        <div class="sum-stats">
          <div class="sum-stat"><b>${dur}</b><span>DURÉE</span></div>
          <div class="sum-stat"><b>${vol[0]}<small> ${vol[1]}</small></b><span>VOLUME</span></div>
          <div class="sum-stat"><b>${st.sets}<small> / ${planned}</small></b><span>SÉRIES</span></div>
        </div>
        <div class="sum-card">
          <div class="sum-card-head"><h3>Muscles travaillés</h3><span>CETTE SÉANCE</span></div>
          <div class="body-maps sum-maps">
            <figure>${bodySvg('front', lv)}<figcaption>FACE</figcaption></figure>
            <figure>${bodySvg('back', lv)}<figcaption>DOS</figcaption></figure>
          </div>
          <div class="sum-legend"><span>Moins de séries</span><i></i><span>Plus de séries</span></div>
          <div class="sum-foot"><span>${top || '—'}</span><span>Séries effectives</span></div>
        </div>
        ${recs.length ? `<div class="sum-card">
          <div class="sum-card-head"><h3>${recs.length} record${recs.length > 1 ? 's' : ''} battu${recs.length > 1 ? 's' : ''}</h3><span>CETTE SÉANCE</span></div>
          ${recs.map(r => `<div class="sum-rec">${ICON.trophy}<span>${esc(exName(r.ex.exerciseId))}</span><b>${fmtNum(r.s.weight, 2)} ${unit()} × ${r.s.reps}</b></div>`).join('')}
        </div>` : ''}
        <button class="btn-primary" data-action="sum-close">Terminé</button>
        <button class="btn-plain" data-action="sum-detail" data-id="${w.id}">Voir le détail de la séance</button>
      </div>
    </div>`;
  root.className = '';
  requestAnimationFrame(() => requestAnimationFrame(() => { root.className = 'open'; }));
  vibrate([20, 40, 20]);
}
function closeSummary() {
  const root = $('#summary-root');
  root.className = '';
  setTimeout(() => { if (!root.classList.contains('open')) root.innerHTML = ''; }, 400);
}
ACTIONS['sum-close'] = closeSummary;
ACTIONS['sum-detail'] = el => { closeSummary(); openWorkoutDetail(el.dataset.id); };

/* ===================== 9. ONGLET PROGRÈS ================================= */
/** Semaines consécutives avec au moins une séance */
function weekStreak() {
  const weeks = new Set(S.data.workouts.map(w => startOfWeek(w.startTime).getTime()));
  let cur = startOfWeek(Date.now());
  if (!weeks.has(cur.getTime())) cur = addDays(cur, -7); // la semaine en cours ne casse pas la série
  let n = 0;
  while (weeks.has(cur.getTime())) { n++; cur = addDays(cur, -7); }
  return n;
}

/** Niveau d'intensité 0..5 selon le nombre de séries */
const muscleLevel = n => n <= 0 ? 0 : n < 4 ? 1 : n < 7 ? 2 : n < 11 ? 3 : n < 16 ? 4 : 5;

function viewProgress() {
  const now = Date.now();
  const streak = weekStreak();
  const wk = startOfWeek(now);
  const goal = S.settings.weeklyGoal || 3;
  const thisWeek = S.data.workouts.filter(w => w.startTime >= wk.getTime()).length;
  // 8 dernières semaines
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const s = addDays(wk, -7 * i).getTime(), e = s + 7 * DAY;
    weeks.push({ s, n: S.data.workouts.filter(w => w.startTime >= s && w.startTime < e).length });
  }
  // Muscles sur 7 jours
  const ms = muscleSets(S.data.workouts.filter(w => w.startTime >= now - 7 * DAY));
  const levels = Object.fromEntries(Object.keys(MUSCLES).map(m => [m, muscleLevel(ms[m] || 0)]));
  const top = Object.entries(ms).sort((a, b) => b[1] - a[1]).slice(0, 4);

  // Mes séances : regroupement par nom
  const groups = {};
  for (const w of workoutsDesc()) (groups[w.name] ||= []).push(w);
  const groupList = Object.entries(groups).sort((a, b) => b[1].length - a[1].length).slice(0, 8);

  return `
    <header class="big-head"><h1>Progrès</h1>
      ${avatarBtn()}</header>

    <div class="card streak-card">
      <div class="streak-top">
        <div class="streak-ic">${ICON.flame}</div>
        <div><b class="streak-n">${streak} semaine${streak > 1 ? 's' : ''}</b><span class="muted sm">d'affilée</span></div>
        <div class="streak-goal"><b>${thisWeek}/${goal}</b><span class="muted sm">cette semaine</span></div>
      </div>
      <div class="progress"><i style="width:${clamp(thisWeek / goal * 100, 0, 100)}%"></i></div>
      <div class="weeks">${weeks.map((w, i) => `<div class="wk ${w.n ? 'on' : ''} ${i === 7 ? 'cur' : ''}"><i style="height:${clamp(w.n / goal * 100, w.n ? 25 : 8, 100)}%"></i><span>${new Date(w.s).getDate()}</span></div>`).join('')}</div>
    </div>

    <div class="card">
      <div class="card-head"><h3 class="card-title">Muscles travaillés</h3><span class="muted sm">7 derniers jours</span></div>
      <div class="body-maps">
        <figure>${bodySvg('front', levels)}<figcaption>Face</figcaption></figure>
        <figure>${bodySvg('back', levels)}<figcaption>Dos</figcaption></figure>
      </div>
      <div class="legend"><span>Moins</span>${[1, 2, 3, 4, 5].map(l => `<i class="lv l${l}"></i>`).join('')}<span>Plus</span></div>
      ${top.length ? `<div class="top-muscles">${top.map(([m, n]) => `<span class="chip on-soft">${MUSCLES[m]} · ${fmtNum(n, 1)} séries</span>`).join('')}</div>` : '<p class="empty-sm">Aucune séance ces 7 derniers jours.</p>'}
    </div>

    <div class="menu-grid">
      <button class="card menu-tile tap" data-action="open-stats"><span class="mt-ic">${ICON.chart}</span><b>Statistiques</b><span class="muted sm">Volume, heatmap</span></button>
      <button class="card menu-tile tap" data-action="open-measures"><span class="mt-ic">${ICON.ruler}</span><b>Mensurations</b><span class="muted sm">${S.data.measurements.length} relevé${S.data.measurements.length > 1 ? 's' : ''}</span></button>
      <button class="card menu-tile tap" data-action="open-records"><span class="mt-ic">${ICON.trophy}</span><b>Records</b><span class="muted sm">1RM estimés</span></button>
      <button class="card menu-tile tap" data-action="open-library"><span class="mt-ic">${ICON.book}</span><b>Exercices</b><span class="muted sm">${S.data.exercises.length} exercices</span></button>
    </div>

    <div class="section-head"><h2>Mes séances</h2></div>
    ${groupList.length ? `<div class="card list-card">${groupList.map(([name, ws]) => {
      const vols = ws.slice(0, 6).reverse().map(w => wStats(w).volume);
      const max = Math.max(...vols, 1);
      return `<div class="sess-row"><div class="sess-txt"><b>${esc(name)}</b><span class="muted sm">${ws.length} fois · ${relDay(ws[0].startTime)}</span></div>
        <div class="sparkbars">${vols.map(v => `<i style="height:${Math.max(8, v / max * 100)}%"></i>`).join('')}</div>
        <span class="sess-vol">${fmtVol(vols[vols.length - 1])}</span></div>`;
    }).join('')}</div>` : '<p class="empty-sm">Tes séances réalisées apparaîtront ici.</p>'}`;
}

/* ----- Statistiques ----- */
const PERIODS = { '30J': 30, '3M': 91, '6M': 182, '1A': 365 };
ACTIONS['open-stats'] = () => {
  const pg = pushPage({
    title: 'Statistiques',
    render: () => {
      const days = PERIODS[S.statsPeriod];
      const end = addDays(startOfDay(Date.now()), 1).getTime();
      const from = end - days * DAY;
      const prevFrom = from - days * DAY;
      const ws = S.data.workouts.filter(w => w.startTime >= from && w.startTime < end);
      const pws = S.data.workouts.filter(w => w.startTime >= prevFrom && w.startTime < from);
      const sum = list => list.reduce((acc, w) => { const s = wStats(w); acc.vol += s.volume; acc.sets += s.sets; acc.pr += s.pr; acc.dur += w.duration || 0; return acc; }, { vol: 0, sets: 0, pr: 0, dur: 0 });
      const cur = sum(ws), prv = sum(pws);
      const delta = (a, b) => {
        if (!b) return a ? '<span class="delta up">nouveau</span>' : '';
        const p = (a - b) / b * 100;
        return `<span class="delta ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(p))} %</span>`;
      };
      // Volume cumulé jour par jour
      const byDay = {};
      ws.forEach(w => { const k = dayKey(w.startTime); byDay[k] = (byDay[k] || 0) + wStats(w).volume; });
      let acc = 0;
      const pts = [];
      for (let t = from; t < end; t += DAY) { acc += byDay[dayKey(t)] || 0; pts.push({ x: t, y: acc }); }
      // Répartition par groupe
      const ms = muscleSets(ws);
      const cats = {};
      Object.entries(ms).forEach(([m, n]) => { const c = MUSCLE_CATEGORY[m]; if (c) cats[c] = (cats[c] || 0) + n; });
      const catList = Object.entries(cats).sort((a, b) => b[1] - a[1]);
      const catTotal = catList.reduce((a, c) => a + c[1], 0) || 1;

      return `
        <div class="seg">${Object.keys(PERIODS).map(p => `<button class="${S.statsPeriod === p ? 'on' : ''}" data-action="period" data-v="${p}">${p}</button>`).join('')}</div>
        <div class="card">
          <div class="card-head"><h3 class="card-title">Activité</h3><span class="muted sm">${ws.length} séance${ws.length > 1 ? 's' : ''}</span></div>
          ${heatmap(from, end, byDay)}
        </div>
        <div class="stat-grid">
          <div class="card stat"><span>Volume total</span><b>${fmtVol(cur.vol)}</b>${delta(cur.vol, prv.vol)}</div>
          <div class="card stat"><span>Séances</span><b>${ws.length}</b>${delta(ws.length, pws.length)}</div>
          <div class="card stat"><span>Séries</span><b>${cur.sets}</b>${delta(cur.sets, prv.sets)}</div>
          <div class="card stat"><span>Temps total</span><b>${fmtDur(cur.dur)}</b>${delta(cur.dur, prv.dur)}</div>
          <div class="card stat"><span>Records</span><b>${cur.pr}</b>${delta(cur.pr, prv.pr)}</div>
          <div class="card stat"><span>Durée moy.</span><b>${ws.length ? fmtDur(cur.dur / ws.length) : '—'}</b></div>
        </div>
        <div class="card">
          <div class="card-head"><h3 class="card-title">Volume cumulé</h3><span class="muted sm">vs période préc. : ${fmtVol(prv.vol)}</span></div>
          ${cur.vol ? lineChart([{ color: 'var(--accent)', points: pts }], { yFmt: v => v >= 1000 ? fmtNum(v / 1000, 1) + 't' : fmtNum(v), area: true }) : '<p class="empty-sm">Pas de volume sur la période.</p>'}
        </div>
        <div class="card">
          <h3 class="card-title">Répartition des muscles</h3>
          ${catList.length ? catList.map(([c, n]) => `<div class="hbar"><span>${c}</span><div class="hbar-track"><i style="width:${n / catList[0][1] * 100}%"></i></div><b>${fmtNum(n / catTotal * 100)} %</b></div>`).join('') : '<p class="empty-sm">Aucune donnée.</p>'}
        </div>`;
    },
    actions: { period: el => { S.statsPeriod = el.dataset.v; renderPage(pg); } }
  });
};

/* ----- Records ----- */
ACTIONS['open-records'] = () => pushPage({
  title: 'Records',
  render: () => {
    const rows = S.data.exercises.map(e => {
      const h = exerciseHistory(e.id); if (!h.length) return null;
      const best = h.reduce((b, x) => x.e1rm > b.e1rm ? x : b, h[0]);
      return { e, best, n: h.length };
    }).filter(Boolean).sort((a, b) => b.best.w.startTime - a.best.w.startTime);
    if (!rows.length) return emptyState(ICON.trophy, 'Tes records apparaîtront ici après ta première séance.');
    return `<p class="muted sm pad">1RM estimé avec la formule d'Epley : poids × (1 + reps / 30).</p>
      <div class="card list-card">${rows.map(r => `<button class="rec-row tap" data-action="open-exercise" data-id="${r.e.id}">
        ${exThumb(r.e)}<span class="ex-row-txt"><b>${esc(r.e.name)}</b><span class="muted sm">${fmtNum(r.best.best.weight, 2)} × ${r.best.best.reps} · ${fmtDateShort(r.best.w.startTime)}</span></span>
        <span class="rec-val"><b>${fmtNum(r.best.e1rm, 1)}</b><small>${unit()} 1RM</small></span></button>`).join('')}</div>`;
  }
});

/* ----- Mensurations ----- */
const MEAS = [
  { k: 'weight', label: 'Poids', unit: 'kg', color: '#34C759' },
  { k: 'bodyFat', label: 'Masse grasse', unit: '%', color: '#FF9500' },
  { k: 'height', label: 'Taille', unit: 'cm', color: '#8E8E93' },
  { k: 'arms', label: 'Tour de bras', unit: 'cm', color: '#007AFF' },
  { k: 'chest', label: 'Tour de poitrine', unit: 'cm', color: '#AF52DE' },
  { k: 'thighs', label: 'Tour de cuisse', unit: 'cm', color: '#FF2D55' },
  { k: 'waist', label: 'Tour de taille', unit: 'cm', color: '#5AC8FA' },
  { k: 'hips', label: 'Tour de hanches', unit: 'cm', color: '#FFCC00' }
];
const MEAS_PERIODS = { '1M': 31, '3M': 92, '6M': 183, 'Tout': 99999 };
const measSorted = () => [...S.data.measurements].sort((a, b) => a.date.localeCompare(b.date));

ACTIONS['open-measures'] = () => {
  const pg = pushPage({
    title: 'Mensurations',
    right: `<button class="icon-btn" data-action="m-add" aria-label="Ajouter un relevé">${ICON.plus}</button>`,
    render: () => {
      const all = measSorted();
      const fromKey = dayKey(Date.now() - MEAS_PERIODS[S.measPeriod] * DAY);
      const inP = all.filter(m => m.date >= fromKey);
      // Courbes de variation relative (%) par rapport au premier relevé de la période
      const series = S.measSel.map(k => {
        const def = MEAS.find(x => x.k === k);
        const pts = inP.filter(m => m[k] != null);
        if (!pts.length) return null;
        const base = pts[0][k];
        return { color: def.color, points: pts.map(m => ({ x: parseDayKey(m.date).getTime(), y: base ? (m[k] - base) / base * 100 : 0 })) };
      }).filter(Boolean);
      const cards = MEAS.map(def => {
        const vals = all.filter(m => m[def.k] != null);
        const last = vals[vals.length - 1], prev = vals[vals.length - 2];
        const d = last && prev ? last[def.k] - prev[def.k] : null;
        return `<button class="card meas-card ${S.measSel.includes(def.k) ? 'on' : ''}" data-action="m-toggle" data-k="${def.k}" style="--mc:${def.color}">
          <span class="meas-lbl"><i></i>${def.label}</span>
          <b>${last ? fmtNum(last[def.k], 1) : '—'}<small> ${def.unit}</small></b>
          <span class="meas-d ${d == null ? '' : d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d == null ? (last ? fmtDateShort(parseDayKey(last.date)) : 'Aucun relevé') : `${d > 0 ? '+' : ''}${fmtNum(d, 1)} ${def.unit}`}</span>
        </button>`;
      }).join('');
      return `
        <button class="btn-primary" data-action="m-add">${ICON.plus} Ajouter un relevé</button>
        <div class="card">
          <div class="card-head"><h3 class="card-title">Évolution (%)</h3></div>
          <div class="seg sm">${Object.keys(MEAS_PERIODS).map(p => `<button class="${S.measPeriod === p ? 'on' : ''}" data-action="m-period" data-v="${p}">${p}</button>`).join('')}</div>
          ${series.length && series.some(s => s.points.length > 1) ? lineChart(series, { yFmt: v => `${v > 0 ? '+' : ''}${fmtNum(v, 1)}%`, zero: true }) : '<p class="empty-sm">Au moins deux relevés sont nécessaires sur la période pour tracer une courbe.</p>'}
          <p class="muted sm">Touche une mesure ci-dessous pour l'afficher sur le graphique.</p>
        </div>
        <div class="meas-grid">${cards}</div>
        <div class="section-head"><h2>Historique</h2></div>
        ${all.length ? `<div class="card list-card">${[...all].reverse().map(m => `<button class="meas-row tap" data-action="m-edit" data-id="${m.id}">
          <b>${fmtDateLong(parseDayKey(m.date))} ${parseDayKey(m.date).getFullYear()}</b>
          <span class="muted sm">${MEAS.filter(d => m[d.k] != null).map(d => `${d.label} ${fmtNum(m[d.k], 1)}${d.unit}`).join(' · ')}</span></button>`).join('')}</div>` : '<p class="empty-sm">Aucun relevé pour l\'instant.</p>'}`;
    },
    actions: {
      'm-add': () => openMeasureForm(null, () => renderPage(pg)),
      'm-edit': el => openMeasureForm(el.dataset.id, () => renderPage(pg)),
      'm-period': el => { S.measPeriod = el.dataset.v; renderPage(pg); },
      'm-toggle': el => {
        const k = el.dataset.k, i = S.measSel.indexOf(k);
        if (i >= 0) S.measSel.splice(i, 1); else S.measSel.push(k);
        renderPage(pg);
      }
    }
  });
};

function openMeasureForm(id, onDone) {
  const src = id ? S.data.measurements.find(m => m.id === id) : null;
  const last = measSorted().pop() || {};
  const d = src ? { ...src } : { id: uid(), date: dayKey(Date.now()) };
  const sh = openSheet({
    full: true,
    html: `<div class="sheet-top"><button class="link-btn" data-action="sheet-close">Annuler</button><h3>${src ? 'Modifier le relevé' : 'Nouveau relevé'}</h3><button class="link-btn strong" data-action="m-save">OK</button></div>
      <label class="lbl">Date</label><input class="field" type="date" data-input="m-date" value="${d.date}" max="${dayKey(Date.now())}">
      <div class="card list-card form-list">${MEAS.map(def => `<label class="form-row"><span>${def.label}</span>
        <input inputmode="decimal" data-input="m-val" data-k="${def.k}" value="${d[def.k] ?? ''}" placeholder="${last[def.k] != null ? fmtNum(last[def.k], 1) : '—'}"><em>${def.unit}</em></label>`).join('')}</div>
      <button class="btn-primary" data-action="m-save">Enregistrer</button>
      ${src ? '<button class="btn-plain danger" data-action="m-del">Supprimer ce relevé</button>' : ''}`,
    inputs: {
      'm-date': el => { d.date = el.value; },
      'm-val': el => { d[el.dataset.k] = parseNum(el.value); }
    },
    actions: {
      'm-save': async () => {
        if (!d.date) { toast('Choisis une date'); return; }
        if (!MEAS.some(def => d[def.k] != null)) { toast('Saisis au moins une valeur'); return; }
        MEAS.forEach(def => { if (d[def.k] == null) delete d[def.k]; });
        await save('measurements', d);
        sh.close(); onDone(); toast('Relevé enregistré');
      },
      'm-del': async () => {
        if (!await confirmSheet('Supprimer ce relevé ?', '', 'Supprimer', true)) return;
        await removeItem('measurements', d.id); sh.close(); onDone();
      }
    }
  });
}

/* ----- Réglages ----- */
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
ACTIONS['open-settings'] = () => {
  const pg = pushPage({
    title: 'Réglages',
    render: () => {
      const perm = 'Notification' in window ? Notification.permission : 'unsupported';
      const permTxt = { granted: 'Activées', denied: 'Refusées (réglages iOS)', default: 'Activer', unsupported: 'Non supportées' }[perm];
      return `
        <div class="section-head"><h2>Profil</h2></div>
        <div class="card list-card">
          <label class="set-row-btn"><span>Ton prénom</span><input class="inline-in" data-input="s-name" value="${esc(S.settings.profileName || '')}" placeholder="Ex. : Alex" autocomplete="given-name"></label>
        </div>
        <div class="section-head"><h2>Entraînement</h2></div>
        <div class="card list-card">
          <button class="set-row-btn" data-action="s-rest"><span>Repos par défaut</span><b>${fmtClock(S.settings.restTimerDefault)}</b>${ICON.chevR}</button>
          <label class="set-row-btn"><span>Objectif hebdomadaire</span>
            <select data-input="s-goal">${[1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${S.settings.weeklyGoal === n ? 'selected' : ''}>${n} séance${n > 1 ? 's' : ''}</option>`).join('')}</select></label>
          <label class="set-row-btn"><span>Unité</span>
            <select data-input="s-units"><option value="kg" ${unit() === 'kg' ? 'selected' : ''}>Kilogrammes (kg)</option><option value="lbs" ${unit() === 'lbs' ? 'selected' : ''}>Livres (lbs)</option></select></label>
          <button class="set-row-btn" data-action="s-notif"><span>Notifications de repos</span><b>${permTxt}</b></button>
        </div>
        <div class="section-head"><h2>Apparence</h2></div>
        <div class="seg">${[['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, l]) => `<button class="${S.settings.theme === k ? 'on' : ''}" data-action="s-theme" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="section-head"><h2>Données</h2></div>
        <div class="card list-card">
          <button class="set-row-btn" data-action="s-export"><span>Exporter une sauvegarde (JSON)</span>${ICON.chevR}</button>
          <label class="set-row-btn"><span>Importer une sauvegarde</span>${ICON.chevR}<input type="file" accept="application/json,.json" data-change="s-import" hidden></label>
          <button class="set-row-btn" data-action="s-demo"><span>Générer des données de démo</span>${ICON.chevR}</button>
          <button class="set-row-btn danger" data-action="s-reset"><span>Effacer toutes les données</span></button>
        </div>
        <p class="muted sm pad">Stockage : ${DB.mode === 'indexedDB' ? 'IndexedDB' : 'localStorage (repli)'} · ${S.data.workouts.length} séances · ${S.data.exercises.length} exercices.<br>
        Toutes tes données restent sur cet appareil. Pense à exporter une sauvegarde de temps en temps.</p>
        <p class="muted sm pad">Astuce iPhone : dans Safari, touche Partager puis « Sur l'écran d'accueil » pour installer GymLog en plein écran.</p>`;
    },
    inputs: {
      's-name': async el => { S.settings.profileName = el.value; await saveSettings(); renderTab(); },
      's-goal': async el => { S.settings.weeklyGoal = +el.value; await saveSettings(); renderTab(); },
      's-units': async el => { S.settings.units = el.value; await saveSettings(); refreshAll(); }
    },
    changes: { 's-import': el => importBackup(el.files[0]) },
    actions: {
      's-rest': async () => { const v = await restPickerSheet(S.settings.restTimerDefault); if (v != null) { S.settings.restTimerDefault = v; await saveSettings(); renderPage(pg); } },
      's-theme': async el => { S.settings.theme = el.dataset.v; applyTheme(); await saveSettings(); renderPage(pg); },
      's-notif': async () => {
        if (!('Notification' in window)) { toast('Installe l\'app sur l\'écran d\'accueil pour les notifications'); return; }
        if (Notification.permission === 'default') await Notification.requestPermission();
        else if (Notification.permission === 'denied') toast('Autorise les notifications dans les réglages de l\'iPhone');
        renderPage(pg);
      },
      's-export': exportBackup,
      's-demo': async () => {
        if (!await confirmSheet('Générer des données de démo ?', 'Environ 10 semaines de séances et de mensurations fictives seront ajoutées à tes données.', 'Générer')) return;
        await generateDemo(); refreshAll(); toast('Données de démo ajoutées');
      },
      's-reset': async () => {
        if (!await confirmSheet('Tout effacer ?', 'Séances, modèles, mensurations et exercices perso seront supprimés définitivement.', 'Tout effacer', true)) return;
        for (const st of DB.STORES) await DB.clear(st);
        localStorage.removeItem(ACTIVE_KEY);
        location.reload();
      }
    }
  });
};

function exportBackup() {
  const data = { app: 'GymLog', version: 1, exportedAt: new Date().toISOString(), settings: S.settings, ...S.data };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gymlog-sauvegarde-${dayKey(Date.now())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function importBackup(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'GymLog') throw new Error('format');
    if (!await confirmSheet('Importer la sauvegarde ?', 'Tes données actuelles seront remplacées.', 'Importer', true)) return;
    for (const st of ['exercises', 'workouts', 'templates', 'folders', 'measurements']) {
      await DB.clear(st);
      await DB.putMany(st, Array.isArray(data[st]) ? data[st] : []);
    }
    if (data.settings) await DB.put('settings', { ...data.settings, id: 'main' });
    location.reload();
  } catch (e) { toast('Fichier de sauvegarde invalide'); }
}

/* ===================== 10. GRAPHIQUES SVG ================================ */
/**
 * Courbe(s) responsive. series = [{ color, points:[{x (timestamp), y}] }]
 * options : yFmt (format des valeurs), area (remplissage), zero (ligne 0)
 */
function lineChart(series, { h = 170, w = 340, yFmt = v => v, area = false, zero = false } = {}) {
  const all = series.flatMap(s => s.points);
  if (all.length < 2) return '<p class="empty-sm">Pas assez de données.</p>';
  let minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x));
  let minY = Math.min(...all.map(p => p.y)), maxY = Math.max(...all.map(p => p.y));
  if (zero) { minY = Math.min(minY, 0); maxY = Math.max(maxY, 0); }
  if (area && !zero) minY = Math.min(minY, minY > 0 ? minY * 0.9 : minY);
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const padY = (maxY - minY) * 0.1; minY -= area && minY >= 0 ? 0 : padY; maxY += padY;
  if (maxX === minX) maxX = minX + DAY;
  const pl = 40, pr = 10, pt = 10, pb = 22;
  const sx = x => pl + (x - minX) / (maxX - minX) * (w - pl - pr);
  const sy = y => pt + (1 - (y - minY) / (maxY - minY)) * (h - pt - pb);
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  let out = `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">`;
  // Grille horizontale + valeurs
  for (let i = 0; i <= 3; i++) {
    const v = minY + (maxY - minY) * i / 3, y = sy(v);
    out += `<line x1="${pl}" x2="${w - pr}" y1="${y}" y2="${y}" class="grid"/><text x="${pl - 6}" y="${y + 3}" text-anchor="end" class="axis">${esc(yFmt(v))}</text>`;
  }
  if (zero && minY < 0 && maxY > 0) out += `<line x1="${pl}" x2="${w - pr}" y1="${sy(0)}" y2="${sy(0)}" class="zero"/>`;
  // Dates
  [minX, (minX + maxX) / 2, maxX].forEach((x, i) => {
    out += `<text x="${sx(x)}" y="${h - 6}" text-anchor="${['start', 'middle', 'end'][i]}" class="axis">${fmtDateShort(x)}</text>`;
  });
  series.forEach((s, si) => {
    const pts = [...s.points].sort((a, b) => a.x - b.x);
    if (!pts.length) return;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
    if (area) {
      out += `<defs><linearGradient id="${gid}${si}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".28"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>`;
      out += `<path d="${d}L${sx(pts[pts.length - 1].x).toFixed(1)},${sy(minY)}L${sx(pts[0].x).toFixed(1)},${sy(minY)}Z" fill="url(#${gid}${si})"/>`;
    }
    out += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
    const lp = pts[pts.length - 1];
    out += `<circle cx="${sx(lp.x)}" cy="${sy(lp.y)}" r="3.5" fill="${s.color}" stroke="var(--card)" stroke-width="1.5"/>`;
  });
  return out + '</svg>';
}

/** Heatmap d'activité façon GitHub (colonnes = semaines, lignes = jours) */
function heatmap(from, end, volByDay) {
  const start = startOfWeek(from);
  const nWeeks = Math.ceil((end - start.getTime()) / (7 * DAY));
  const vals = Object.values(volByDay);
  const max = Math.max(1, ...vals);
  const cell = 12, gap = 3, left = 14;
  const W = left + nWeeks * (cell + gap), H = 7 * (cell + gap);
  let out = `<div class="heatmap-wrap"><svg class="heatmap" viewBox="0 0 ${W} ${H}" style="max-width:${Math.max(W * 1.6, 200)}px">`;
  ['L', '', 'M', '', 'V', '', 'D'].forEach((l, i) => { if (l) out += `<text x="0" y="${i * (cell + gap) + 9}" class="axis">${l}</text>`; });
  for (let wk = 0; wk < nWeeks; wk++) for (let d = 0; d < 7; d++) {
    const t = addDays(start, wk * 7 + d).getTime();
    if (t >= end) continue;
    const v = volByDay[dayKey(t)] || 0;
    const lvl = t < from ? -1 : v ? Math.min(4, 1 + Math.floor(v / max * 3.99)) : 0;
    out += `<rect x="${left + wk * (cell + gap)}" y="${d * (cell + gap)}" width="${cell}" height="${cell}" rx="3" class="hm l${lvl}"><title>${fmtDateShort(t)} : ${fmtVol(v)}</title></rect>`;
  }
  return out + '</svg></div>';
}

/* bodySvg() est défini dans body.js */

/* ======================== 11. DÉMARRAGE ================================== */
/** Séances d'exemple créées au premier lancement */
async function seedTemplates() {
  const id = n => 'ex-' + slugify(n);
  let order = S.data.templates.length;
  const t = (name, folderId, list) => ({ id: uid(), name, folderId, order: order++, exercises: list.map(([n, sets, reps, rest]) => ({ exerciseId: id(n), targetSets: sets, targetReps: reps, restTime: rest, tempo: '' })) });
  const folder = { id: uid(), name: 'PPL + Upper', order: 0 };
  const tpls = [
    t('Push', folder.id, [['Développé couché barre', 4, 8, 180], ['Développé incliné haltères', 3, 10, 120], ['Écarté poulie', 3, 12, 90], ['Développé militaire haltères', 3, 10, 120], ['Élévations latérales', 4, 15, 60], ['Extension poulie haute', 3, 12, 90]]),
    t('Pull', folder.id, [['Tractions pronation', 4, 8, 180], ['Rowing barre', 4, 8, 150], ['Tirage vertical', 3, 10, 120], ['Face pull', 3, 15, 60], ['Curl barre', 3, 10, 90], ['Curl marteau', 3, 12, 60]]),
    t('Legs', folder.id, [['Squat barre', 4, 6, 180], ['Soulevé de terre roumain', 3, 10, 150], ['Presse à cuisses', 3, 12, 120], ['Leg curl', 3, 12, 90], ['Mollets debout', 4, 15, 60]]),
    t('Upper', folder.id, [['Développé couché haltères', 4, 10, 150], ['Rowing haltère', 4, 10, 120], ['Développé militaire barre', 3, 8, 150], ['Tirage horizontal', 3, 12, 90], ['Dips', 3, 10, 90], ['Curl haltères', 3, 12, 60]])
  ];
  S.data.folders.push(folder); await DB.put('folders', folder);
  S.data.templates.push(...tpls); await DB.putMany('templates', tpls);
}

/** Données de démo : ~10 semaines de séances progressives + mensurations */
async function generateDemo() {
  if (!S.data.templates.length) await seedTemplates();
  const tpls = S.data.templates.slice(0, 4);
  const baseW = { barre: 55, halteres: 20, machine: 60, poulie: 25, pdc: 0 };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ws = [];
  const today = startOfDay(Date.now());
  let k = 0;
  for (let d = 70; d >= 1; d--) {
    const day = addDays(today, -d);
    const wd = day.getDay();
    if (![1, 2, 4, 6].includes(wd) || Math.random() < 0.15) continue;
    const t = tpls[k++ % tpls.length];
    const prog = 1 + (70 - d) / 70 * 0.15; // +15 % sur la période
    const start = new Date(day); start.setHours(18, Math.floor(rnd(0, 50)), 0, 0);
    let ts = start.getTime() + 5 * 60000;
    const exercises = t.exercises.filter(e => EX.has(e.exerciseId)).map(e => {
      const ex = EX.get(e.exerciseId);
      const bw = (ex.id === 'ex-squat-barre' ? 80 : baseW[ex.equipment]) * prog;
      const sets = Array.from({ length: e.targetSets }, (_, i) => {
        ts += (e.restTime + 40) * 1000;
        return { setNumber: i + 1, weight: Math.round(bw * rnd(0.95, 1.05) / 2.5) * 2.5, reps: Math.max(3, (e.targetReps || 10) + Math.round(rnd(-2, 1))), completed: true, isRecord: false, timestamp: ts };
      });
      return { exerciseId: e.exerciseId, restTime: e.restTime, tempo: '', sets };
    });
    ws.push({ id: uid(), name: t.name, templateId: t.id, date: dayKey(start), startTime: start.getTime(), endTime: ts, duration: Math.round((ts - start.getTime()) / 1000), exercises });
  }
  S.data.workouts.push(...ws);
  await DB.putMany('workouts', ws);
  await recomputeAllRecords();
  const ms = [];
  for (let wk = 10; wk >= 0; wk--) {
    const p = (10 - wk) / 10;
    ms.push({ id: uid(), date: dayKey(addDays(today, -wk * 7)), weight: +(78 - p * 2.5 + rnd(-0.3, 0.3)).toFixed(1), bodyFat: +(18 - p * 2).toFixed(1), waist: +(84 - p * 3).toFixed(1), arms: +(35 + p * 1).toFixed(1), chest: +(100 + p * 1.5).toFixed(1), thighs: +(57 + p * 0.8).toFixed(1), hips: +(96 - p).toFixed(1), height: 178 });
  }
  S.data.measurements.push(...ms);
  await DB.putMany('measurements', ms);
}

async function init() {
  await DB.init();
  for (const st of ['exercises', 'workouts', 'templates', 'folders', 'measurements']) {
    try { S.data[st] = await DB.getAll(st); } catch (e) { S.data[st] = []; }
  }
  const saved = await DB.get('settings', 'main').catch(() => null);
  if (saved) Object.assign(S.settings, saved);

  // Ajoute les exercices par défaut manquants (nouvelles versions)
  const have = new Set(S.data.exercises.map(e => e.id));
  const missing = GYM_EXERCISES.filter(e => !have.has(e.id));
  if (missing.length) { S.data.exercises.push(...missing); await DB.putMany('exercises', missing); }
  rebuildExIndex();

  if (!S.settings.seeded) {
    await seedTemplates();
    S.settings.seeded = true;
    await saveSettings();
  }
  applyTheme();

  // Reprise d'un entraînement en cours (app fermée en pleine séance)
  try { const a = JSON.parse(localStorage.getItem(ACTIVE_KEY)); if (a && a.exercises) S.active = a; } catch (e) { /* ignore */ }

  renderTab();
  if (S.active) renderWorkout();
  setInterval(tick, 250);

  // Masque l'écran de démarrage
  const sp = $('#splash');
  sp.classList.add('hide');
  setTimeout(() => sp.remove(), 500);

  // Débloque l'audio au premier contact (iOS)
  document.addEventListener('touchend', unlockAudio, { once: true, passive: true });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW non enregistré', e));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
}

init();
