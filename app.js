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
/** Version affichée dans Réglages (à augmenter à chaque mise en ligne) */
const APP_VERSION = '1.7';

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
function fmtVol(v) { v = toU(v || 0); return v >= 10000 ? `${fmtNum(v / 1000, 1)} ${isLbs() ? 'k lbs' : 't'}` : `${fmtNum(v)} ${unit()}`; }
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
/* Conversion d'unités : les poids sont TOUJOURS stockés en kg ; on convertit à l'affichage et à la saisie */
const LB = 2.20462;
const isLbs = () => S.settings.units === 'lbs';
const toU = kg => kg == null ? null : (isLbs() ? kg * LB : kg);
const fromU = v => v == null ? null : (isLbs() ? v / LB : v);
/** Poids formaté dans l'unité choisie */
const fmtW = (kg, dec = 2) => fmtNum(toU(kg || 0), isLbs() ? Math.min(dec, 1) : dec);
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
  measPeriod: '3 mois',
  musPeriod: '8S', musMetric: 'sets',          // détail par muscle
  statsOffset: 0, statsCustom: null, statsMetric: 'volume',
  exMetric: 'e1rm', exPeriod: 'Tout'            // fiche exercice
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
  for (const ex of w.exercises) {
    if (ex.kind === 'circuit') { const c = circuitStats(ex); volume += c.volume; sets += c.sets; total += c.total; continue; }
    for (const s of ex.sets) {
      if (!isWork(s)) continue; // l'échauffement ne compte pas
      total++;
      if (!s.completed) continue;
      sets++;
      volume += (s.weight || 0) * (s.reps || 0);
      if (s.isRecord) pr++;
    }
  }
  return { volume, sets, pr, total };
}

/** Séries validées par muscle (principal = 1, secondaire = 0,5) */
function muscleSets(workouts) {
  const m = {};
  for (const w of workouts) for (const ex of w.exercises) {
    const e = EX.get(ex.exerciseId); if (!e) continue;
    const n = (ex.sets || []).filter(s => s.completed && isWork(s)).length; if (!n) continue;
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
      for (const s of ex.sets) if (s.completed && isWork(s)) best = Math.max(best, e1rm(s.weight, s.reps));
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
    const work = sets.filter(isWork).length ? sets.filter(isWork) : sets;
    const best = work.reduce((b, s) => e1rm(s.weight, s.reps) > e1rm(b.weight, b.reps) ? s : b, work[0]);
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
        const v = s.completed && isWork(s) ? e1rm(s.weight, s.reps) : 0;
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
      <span class="w-row-meta"><span class="mono">${fmtHour(w.startTime)} → ${fmtHour(w.endTime)}</span> · ${fmtDur(w.duration)} · ${st.sets} série${st.sets > 1 ? 's' : ''} · ${fmtW(st.volume, 0)} ${unit()}</span>
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
          exercises: t ? t.exercises.map(e => ({ exerciseId: e.exerciseId, restTime: e.restTime, tempo: e.tempo, targetReps: e.targetReps, supersetId: e.supersetId, nSets: e.targetSets || 3 })) : []
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
            <div class="hist-sets">${sets.map((s, i) => `<div class="hist-set ${s.isRecord ? 'rec' : ''}"><span class="n">${i + 1}</span><span>${fmtW(s.weight)} ${unit()} × ${s.reps}</span><span class="muted sm">1RM ${fmtW(e1rm(s.weight, s.reps), 1)}</span>${s.isRecord ? '<span class="rec-badge">RECORD</span>' : ''}</div>`).join('')}</div>
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
          exercises: w.exercises.filter(ex => !ex.circuit).map(ex => ({ exerciseId: ex.exerciseId, restTime: ex.restTime, tempo: ex.tempo, targetReps: ex.targetReps, supersetId: ex.supersetId, nSets: Math.max(1, ex.sets.filter(s => s.completed).length) }))
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
    title: () => groupTemplate(id)?.name || 'Progression',
    render: () => {
      const t = groupTemplate(id);
      if (!t) return emptyState(ICON.trash, 'Séance supprimée.');
      const ws = groupWorkouts(id).sort((a, b) => a.startTime - b.startTime);
      if (!ws.length) return emptyState(ICON.trend, 'Pas encore réalisée. Démarre-la pour suivre ta progression.', `<button class="btn-primary inline" data-action="start-template" data-id="${id}">${ICON.play} Démarrer</button>`);
      const rows = ws.map(w => ({ w, ...wStats(w) }));
      const avg = k => rows.reduce((a, r) => a + r[k], 0) / rows.length;
      const best = rows.reduce((b, r) => r.volume > b.volume ? r : b, rows[0]);
      const first = rows[0], last = rows[rows.length - 1];
      const evo = first.volume ? (last.volume - first.volume) / first.volume * 100 : 0;
      const metric = { volume: r => toU(r.volume), duree: r => (r.w.duration || 0) / 60, series: r => r.sets }[st.metric];
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
          <span class="ex-row-txt"><b>${esc(exName(e.exerciseId))}</b><span class="muted sm">1RM estimé : ${fmtW(pts[0], 1)} → ${fmtW(pts[pts.length - 1], 1)} ${unit()}</span></span>
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
  drag = { item, ph, kind: item.dataset.kind, startY: e.clientY, top: r.top, y: e.clientY, scroller: item.closest('.w-body') || item.closest('.page-body') || $('#views') };
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
  const lists = $$(`.dnd-list[data-dnd="${kind === 'folder' ? 'folders' : kind === 'wex' ? 'wex' : 'tpl'}"]`).filter(l => l.offsetParent !== null);
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
  if (kind === 'wex') {
    // Exercices de la séance en cours : nouvel ordre d'après le DOM
    const a = S.active, old = a.exercises;
    const order = $$('.dnd-list[data-dnd="wex"] > [data-kind="wex"]').map(el => +el.dataset.dragId);
    a.exercises = order.map(k => old[k]);
    if (a.rest) a.rest.exIdx = order.indexOf(a.rest.exIdx);
    if (a.restReady) a.restReady.exIdx = order.indexOf(a.restReady.exIdx);
    cleanSupersets(a.exercises);
    persistActive(); vibrate(8); renderWorkout();
    return;
  }
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
    exercises: t.exercises.map(e => ({ exerciseId: e.exerciseId, restTime: e.restTime, tempo: e.tempo, targetReps: e.targetReps, supersetId: e.supersetId, nSets: e.targetSets || 3 }))
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
        <div class="card tpl-ex-card ${e.supersetId ? 'ss' : ''}">${e.supersetId && !(draft.exercises[i - 1] && draft.exercises[i - 1].supersetId === e.supersetId) ? '<span class="ss-label">SUPERSET</span>' : ''}
          <div class="ex-head">${exThumb(EX.get(e.exerciseId))}<div class="ex-info"><h3>${esc(exName(e.exerciseId))}</h3></div>
            <button class="icon-btn" data-action="tpl-ex-menu" data-i="${i}">${ICON.more}</button></div>
          <div class="tpl-params">
            <div class="param"><span>Séries</span><div class="stepper">
              <button data-action="tpl-sets" data-i="${i}" data-d="-1">−</button><b>${e.targetSets}</b><button data-action="tpl-sets" data-i="${i}" data-d="1">+</button></div></div>
            <div class="param"><span>Reps</span><input class="field sm" data-input="tpl-reps" data-change="tpl-reps-ok" data-i="${i}" value="${esc(e.targetReps ?? '')}" placeholder="8-12" autocomplete="off"></div>
            <div class="param"><span>Repos</span><button class="chip-sm" data-action="tpl-rest" data-i="${i}">${ICON.timer}${fmtClock(e.restTime)}</button></div>
          </div>
        </div>`).join('') || '<p class="empty-sm">Ajoute des exercices à ta séance.</p>'}
      <button class="btn-soft wide" data-action="tpl-add">${ICON.plus}<span>Ajouter des exercices</span></button>
      ${src ? `<button class="btn-primary" data-action="tpl-start">${ICON.play} Démarrer cette séance</button>
               <button class="btn-plain" data-action="tpl-dup">Dupliquer</button>
               <button class="btn-plain danger" data-action="tpl-del">Supprimer la séance</button>` : ''}`,
    changes: { 'tpl-reps-ok': el => { if (el.value && !parseRange(el.value)) { toast('Reps : un nombre (10) ou une fourchette (8-12)'); el.value = draft.exercises[+el.dataset.i].targetReps || ''; } } },
    inputs: {
      'tpl-name': el => { draft.name = el.value; },
      'tpl-folder': el => { draft.folderId = el.value || null; },
      'tpl-reps': el => { const r = parseRange(el.value); draft.exercises[+el.dataset.i].targetReps = r ? r.text : null; }
    },
    actions: {
      'tpl-save': async () => {
        if (!draft.name.trim()) { toast('Donne un nom à ta séance'); $('.field', pg.el)?.focus(); return; }
        draft.name = draft.name.trim();
        await save('templates', draft);
        popPage(); refreshAll(); toast('Séance enregistrée');
      },
      'tpl-add': () => openPicker(ids => {
        ids.forEach(exId => draft.exercises.push({ exerciseId: exId, restTime: S.settings.restTimerDefault, targetSets: 3, targetReps: '10', tempo: '' }));
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
          ...(i < draft.exercises.length - 1 && !(draft.exercises[i].supersetId && draft.exercises[i + 1].supersetId === draft.exercises[i].supersetId)
            ? [{ label: 'Superset avec l\'exercice suivant', fn: () => { const sid = draft.exercises[i].supersetId || draft.exercises[i + 1].supersetId || uid(); draft.exercises[i].supersetId = sid; draft.exercises[i + 1].supersetId = sid; renderPage(pg); } }] : []),
          ...(draft.exercises[i].supersetId ? [{ label: 'Retirer du superset', fn: () => { draft.exercises[i].supersetId = null; cleanSupersets(draft.exercises); renderPage(pg); } }] : []),
          { label: 'Tempo', fn: async () => { const v = await inputSheet('Tempo', draft.exercises[i].tempo || '', 'Ex. : 3-1-1-0'); if (v != null) { draft.exercises[i].tempo = v; renderPage(pg); } } },
          { label: 'Retirer l\'exercice', danger: true, fn: () => { draft.exercises.splice(i, 1); cleanSupersets(draft.exercises); renderPage(pg); } }
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
    .filter(e => !st.lv || (e.level || 'debutant') === st.lv)
    .filter(e => !q || norm(e.name).includes(q) || norm(MUSCLES[e.muscleGroup] || '').includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function filterChips(st, catAction, eqAction, lvAction) {
  return `<div class="chips scroll-x">${Object.keys(CATEGORIES).map(c => `<button class="chip ${st.cat === c ? 'on' : ''}" data-action="${catAction}" data-v="${c}">${c}</button>`).join('')}</div>
    <div class="chips scroll-x">${Object.entries(EQUIPMENT).map(([k, v]) => `<button class="chip ${st.eq === k ? 'on' : ''}" data-action="${eqAction}" data-v="${k}">${v}</button>`).join('')}</div>
    <div class="chips scroll-x">${Object.entries(LEVELS).map(([k, v]) => `<button class="chip lvl ${st.lv === k ? 'on' : ''}" data-action="${lvAction}" data-v="${k}">${v}</button>`).join('')}</div>`;
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
  const st = { q: '', cat: '', eq: '', lv: '' };
  const pg = pushPage({
    title: 'Exercices',
    right: `<button class="icon-btn" data-action="lib-new" aria-label="Créer un exercice">${ICON.plus}</button>`,
    render: () => `
      <div class="search-wrap">${ICON.search}<input class="search" type="search" placeholder="Rechercher un exercice" data-input="lib-q" value="${esc(st.q)}"></div>
      <div id="lib-chips">${filterChips(st, 'lib-cat', 'lib-eq', 'lib-lv')}</div>
      <div id="lib-list" class="ex-list">${exerciseRows(filterExercises(st), { action: 'open-exercise' })}</div>`,
    inputs: { 'lib-q': el => { st.q = el.value; $('#lib-list', pg.el).innerHTML = exerciseRows(filterExercises(st), { action: 'open-exercise' }); } },
    actions: {
      'lib-cat': el => { st.cat = st.cat === el.dataset.v ? '' : el.dataset.v; renderPage(pg); },
      'lib-eq': el => { st.eq = st.eq === el.dataset.v ? '' : el.dataset.v; renderPage(pg); },
      'lib-lv': el => { st.lv = st.lv === el.dataset.v ? '' : el.dataset.v; renderPage(pg); },
      'lib-new': () => openExerciseForm(() => renderPage(pg))
    }
  });
};

/** Sélecteur d'exercices (plein écran, multi-sélection) */
function openPicker(onPick) {
  const st = { q: '', cat: '', eq: '', lv: '', sel: [] };
  const list = () => exerciseRows(filterExercises(st), { action: 'pk-item', sel: st.sel });
  const upd = () => {
    $('#pk-chips', sh.el).innerHTML = filterChips(st, 'pk-cat', 'pk-eq', 'pk-lv');
    $('#pk-list', sh.el).innerHTML = list();
    const b = $('#pk-done', sh.el);
    b.disabled = !st.sel.length;
    b.textContent = st.sel.length ? `Ajouter (${st.sel.length})` : 'Ajouter';
  };
  const sh = openSheet({
    full: true,
    html: `<div class="sheet-top"><button class="link-btn" data-action="sheet-close">Annuler</button><h3>Exercices</h3><button class="link-btn strong" id="pk-done" data-action="pk-done" disabled>Ajouter</button></div>
      <div class="search-wrap">${ICON.search}<input class="search" type="search" placeholder="Rechercher" data-input="pk-q"></div>
      <div id="pk-chips">${filterChips(st, 'pk-cat', 'pk-eq', 'pk-lv')}</div>
      <button class="ex-row tap create" data-action="pk-create"><span class="ex-thumb c0">${ICON.plus}</span><span class="ex-row-txt"><b>Créer un exercice</b></span></button>
      <div id="pk-list" class="ex-list">${list()}</div>`,
    inputs: { 'pk-q': el => { st.q = el.value; $('#pk-list', sh.el).innerHTML = list(); } },
    actions: {
      'pk-cat': el => { st.cat = st.cat === el.dataset.v ? '' : el.dataset.v; upd(); },
      'pk-eq': el => { st.eq = st.eq === el.dataset.v ? '' : el.dataset.v; upd(); },
      'pk-lv': el => { st.lv = st.lv === el.dataset.v ? '' : el.dataset.v; upd(); },
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

/** Contenu de la fiche exercice : stats, courbe (mesure + période + records), consignes, historique */
const EX_METRICS = {
  e1rm: { label: '1RM estimé', of: h => h.e1rm, fmt: v => fmtW(v, 1) + ' ' + unit(), conv: toU },
  top: { label: 'Top set', of: h => h.maxW, fmt: v => fmtW(v) + ' ' + unit(), conv: toU },
  volume: { label: 'Volume', of: h => h.volume, fmt: v => fmtVol(v), conv: toU },
  reps: { label: 'Reps', of: h => h.sets.filter(isWork).reduce((a, s) => a + (s.reps || 0), 0), fmt: v => fmtNum(v) + ' reps', conv: v => v }
};
const EX_PERIODS = { '6S': 42, '3M': 92, '6M': 183, '1A': 365, 'Tout': 1e5 };
function exerciseDetailHtml(id) {
  const e = EX.get(id);
  if (!e) return emptyState(ICON.trash, 'Exercice introuvable.');
  const hist = exerciseHistory(id);
  const best = hist.reduce((b, h) => h.e1rm > (b?.e1rm || 0) ? h : b, null);
  const maxW = Math.max(0, ...hist.map(h => h.maxW));
  const totalSets = hist.reduce((a, h) => a + h.sets.length, 0);
  const M = EX_METRICS[S.exMetric] || EX_METRICS.e1rm;
  const fromT = Date.now() - EX_PERIODS[S.exPeriod] * DAY;
  const hp = hist.filter(h => h.w.startTime >= fromT);
  const pts = hp.map(h => ({ x: h.w.startTime, y: M.conv(M.of(h)), rec: h.sets.some(s => s.isRecord) }));
  const nRec = pts.filter(p => p.rec).length;
  return `
    <div class="ex-detail-head">${exThumb(e)}<div><h1>${esc(e.name)}</h1>
      <p class="muted">${MUSCLES[e.muscleGroup]}${e.secondaryMuscle ? ' · ' + MUSCLES[e.secondaryMuscle] : ''} · ${EQUIPMENT[e.equipment]}</p>
      ${e.level ? `<span class="lvl-badge lv-${e.level}">${LEVELS[e.level]}</span>` : ''}</div></div>
    ${e.note ? `<div class="card note-card">${ICON.note}<p>${esc(e.note)}</p></div>` : ''}
    <div class="stat-grid">
      <div class="card stat"><span>1RM estimé</span><b>${best ? fmtW(best.e1rm, 1) : '—'}<small> ${unit()}</small></b></div>
      <div class="card stat"><span>Charge max</span><b>${maxW ? fmtW(maxW) : '—'}<small> ${unit()}</small></b></div>
      <div class="card stat"><span>Séances</span><b>${hist.length}</b></div>
      <div class="card stat"><span>Séries</span><b>${totalSets}</b></div>
    </div>
    ${hist.length ? `<div class="card">
      <div class="tabs-line">${Object.entries(EX_METRICS).map(([k, m]) => `<button class="${S.exMetric === k ? 'on' : ''}" data-action="exd-metric" data-v="${k}">${m.label}</button>`).join('')}</div>
      <div class="chips scroll-x tight">${Object.keys(EX_PERIODS).map(k => `<button class="chip ${S.exPeriod === k ? 'on' : ''}" data-action="exd-period" data-v="${k}">${k}</button>`).join('')}</div>
      ${pts.length >= 2 ? lineChart([{ color: 'var(--accent)', points: pts, area: true }], { yFmt: v => fmtNum(v, v < 100 ? 1 : 0) })
        : '<p class="empty-sm">Pas assez de séances sur cette période.</p>'}
      ${nRec ? `<p class="muted sm"><i class="rec-dot"></i>${nRec} séance${nRec > 1 ? 's' : ''} avec un record</p>` : ''}
    </div>` : ''}
    ${best ? `<div class="card rec-card">${ICON.trophy}<div><b>Meilleure série : ${fmtW(best.best.weight)} ${unit()} × ${best.best.reps}</b><span class="muted sm">${fmtDateLong(best.w.startTime)} · 1RM ${fmtW(best.e1rm, 1)} ${unit()}</span></div></div>` : ''}
    ${e.instructions ? `<div class="card how-card"><h3 class="card-title">Comment faire</h3><p>${esc(e.instructions)}</p></div>` : ''}
    <div class="section-head"><h2>Historique</h2></div>
    ${hist.length ? [...hist].reverse().slice(0, 30).map(h => `<div class="card hist-item">
        <div class="hist-top"><b>${esc(h.w.name)}</b><span class="muted sm">${fmtDateLong(h.w.startTime)}</span></div>
        <div class="hist-chips">${h.sets.map(s => `<span class="set-chip ${s.isRecord ? 'rec' : ''} ${isWork(s) ? '' : 'wu'}">${isWork(s) ? '' : 'É '}${fmtW(s.weight)}×${s.reps}</span>`).join('')}</div>
      </div>`).join('') : '<p class="empty-sm">Pas encore réalisé. Ton historique apparaîtra ici.</p>'}
    ${e.isCustom ? `<button class="btn-plain danger" data-action="ex-del" data-id="${e.id}">Supprimer cet exercice</button>` : ''}`;
}
/** Re-rend la fiche (page ou feuille) après un changement de mesure / période */
function rerenderCtx(el) { const ctx = findCtx(el); if (ctx && ctx.render) renderPage(ctx); else if (ctx && ctx.refresh) ctx.refresh(); }
ACTIONS['exd-metric'] = el => { S.exMetric = el.dataset.v; rerenderCtx(el); };
ACTIONS['exd-period'] = el => { S.exPeriod = el.dataset.v; rerenderCtx(el); };

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
    sh.refresh = () => sh.set(`<div class="sheet-top"><span></span><h3>Exercice</h3><button class="link-btn strong" data-action="sheet-close">OK</button></div>${exerciseDetailHtml(id)}`);
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
const newSet = n => ({ setNumber: n, weight: null, reps: null, completed: false, isRecord: false, timestamp: null, type: 'normal' });

/** Types de séries. L'échauffement ne compte ni dans le volume, ni dans les records. */
const SET_TYPES = {
  normal: { label: 'Série normale', short: '' },
  warmup: { label: 'Échauffement', short: 'É' },
  drop: { label: 'Drop set', short: 'D' },
  failure: { label: 'Jusqu\'à l\'échec', short: 'F' }
};
const isWork = s => (s.type || 'normal') !== 'warmup';

/** "5-8" -> { min: 5, max: 8, text: "5-8" } ; "10" -> { min: 10, max: 10 } */
function parseRange(v) {
  if (v == null || v === '') return null;
  const m = String(v).match(/^\s*(\d+)\s*(?:[-–à]\s*(\d+))?\s*$/);
  if (!m) return null;
  const a = +m[1], b = m[2] ? +m[2] : a;
  const min = Math.min(a, b), max = Math.max(a, b);
  return { min, max, text: min === max ? String(min) : `${min}-${max}` };
}

ICON.note = svg('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 8h6M9 12h6M9 16h3.5"/>');
ICON.metro = svg('<path d="M9 3h6l3.5 18h-13z"/><path d="M12 15l5-8"/>');
ICON.pause = svg('<path d="M8.5 5v14M15.5 5v14"/>', 3);
ICON.circuit = svg('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/>');

/**
 * Démarre un entraînement.
 * spec = { name, templateId, exercises: [{ exerciseId, restTime, tempo, targetReps, nSets, supersetId }] }
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
    startTime: spec.startTime || Date.now(), minimized: false, rest: null, restReady: null,
    pausedAt: null, pausedTotal: 0,
    manual: !!spec.manual, durationMin: spec.durationMin || null,
    exercises: spec.exercises.filter(e => EX.has(e.exerciseId)).map(e => ({
      exerciseId: e.exerciseId,
      restTime: e.restTime ?? S.settings.restTimerDefault,
      tempo: e.tempo || '',
      targetReps: e.targetReps != null && e.targetReps !== '' ? String(e.targetReps) : null,
      supersetId: e.supersetId || null,
      sets: Array.from({ length: e.nSets || 3 }, (_, k) => newSet(k + 1))
    }))
  };
  persistActive();
  while (pages.length) popPage();
  renderWorkout(true);
  if (!spec.manual) requestNotifPermission();
}

/** Durée écoulée en secondes (pauses déduites) */
function elapsedSec(a = S.active) {
  if (a.manual) return (a.durationMin || 0) * 60;
  const now = a.pausedAt || Date.now();
  return Math.max(0, (now - a.startTime - (a.pausedTotal || 0)) / 1000);
}

/** Valeurs proposées pour une série : charge de la séance précédente, reps cibles */
function placeholderFor(ex, j, prev) {
  const p = prev[j] || (j > 0 ? ex.sets[j - 1] : null) || prev[prev.length - 1];
  const range = parseRange(ex.targetReps);
  const pReps = p && p.reps != null ? p.reps : null;
  return {
    weight: p && p.weight != null ? p.weight : null,
    reps: range ? range.text : pReps,
    repsFill: pReps != null && (!range || (pReps >= range.min && pReps <= range.max)) ? pReps : (range ? range.min : null)
  };
}

/** Ordre d'exécution [exIdx, setIdx] : les supersets alternent les exercices */
function setOrder(a = S.active) {
  const out = [], ex = a.exercises;
  for (let i = 0; i < ex.length;) {
    if (ex[i].kind === 'circuit') { i++; continue; }
    let j = i;
    const sid = ex[i].supersetId;
    if (sid) while (j + 1 < ex.length && ex[j + 1].kind !== 'circuit' && ex[j + 1].supersetId === sid) j++;
    const group = [];
    for (let k = i; k <= j; k++) group.push(k);
    const max = Math.max(...group.map(k => ex[k].sets.length));
    for (let s = 0; s < max; s++) for (const k of group) if (s < ex[k].sets.length) out.push([k, s]);
    i = j + 1;
  }
  return out;
}
/** Prochaine série à faire (la « série en cours ») */
function currentSet(a = S.active) {
  return setOrder(a).find(([i, j]) => !a.exercises[i].sets[j].completed) || null;
}
/** Numéro affiché : É pour l'échauffement, sinon 1, 2, 3… (sans compter l'échauffement) */
function setLabel(ex, j) {
  if (!isWork(ex.sets[j])) return 'É';
  let n = 0;
  for (let k = 0; k <= j; k++) if (isWork(ex.sets[k])) n++;
  return String(n);
}
function inputW(kg) {
  if (kg == null) return '';
  const v = toU(kg);
  return String(Math.round(v * 100) / 100).replace('.', ',');
}

/* ----------------------------- Rendu ------------------------------------ */
function renderWorkout(animateOpen = false) {
  const a = S.active;
  const root = $('#workout-root');
  if (!a) { root.className = ''; setTimeout(() => { if (!S.active) root.innerHTML = ''; }, 350); renderMiniBar(); return; }
  const body = $('.w-body', root);
  const scroll = body ? body.scrollTop : 0;
  const st = wStats(a);
  const paused = !!a.pausedAt;
  const cur = currentSet(a);
  const started = (Date.now() - a.startTime) < 90000 ? 'MAINTENANT' : 'DÉBUT ' + fmtHour(a.startTime);
  const kicker = a.manual ? `SAISIE · ${fmtDateShort(a.startTime).toUpperCase()}` : paused ? 'EN PAUSE' : `LIVE · ${started}`;
  root.innerHTML = `
    <div class="w-screen ${a.rest || a.restReady ? 'has-rest' : ''}">
      <header class="wh">
        <div class="wh-card">
          <div class="wh-top">
            <button class="circle-btn" data-action="w-minimize" aria-label="Réduire">${ICON.chevD}</button>
            <div class="wh-title"><span class="live-k ${a.manual ? 'manual' : paused ? 'paused' : ''}"><i></i>${kicker}</span><h2 data-action="w-rename">${esc(a.name)}</h2></div>
            <button class="circle-btn" data-action="w-timer-menu" aria-label="Minuteur de repos">${ICON.timer}</button>
            <button class="circle-btn" data-action="w-menu" aria-label="Options de la séance">${ICON.more}</button>
          </div>
          <div class="wh-stats">
            <button class="wh-cell time ${paused ? 'paused' : ''}" data-action="w-pause" aria-label="${paused ? 'Reprendre' : 'Mettre en pause'}">
              <span>TEMPS</span><b><em id="w-elapsed">${a.manual ? fmtDur(elapsedSec(a)) : fmtClock(elapsedSec(a))}</em>${a.manual ? '' : paused ? ICON.play : ICON.pause}</b></button>
            <div class="wh-cell"><span>VOLUME</span><b id="w-volume">${fmtW(st.volume, 1)}<small> ${unit()}</small></b></div>
            <div class="wh-cell"><span>SÉRIES</span><b id="w-sets">${st.sets} / ${st.total}</b></div>
            <i class="wh-prog"><em id="w-prog" style="width:${st.total ? st.sets / st.total * 100 : 0}%"></em></i>
          </div>
        </div>
      </header>
      <div class="w-body">
        <div class="dnd-list" data-dnd="wex">${a.exercises.map((ex, i) => ex.kind === 'circuit' ? circuitBlock(ex, i) : exerciseBlock(ex, i, cur)).join('')}</div>
        ${a.exercises.length ? '' : emptyState(EQ_ICON.halteres, 'Séance vide. Ajoute un exercice ou un circuit.')}
        <div class="w-add-row">
          <button class="dash-btn" data-action="w-add-ex">${ICON.plus}Exercice</button>
          <button class="dash-btn purple" data-action="w-add-circuit">${ICON.plus}Circuit</button>
        </div>
        <button class="btn-primary" data-action="w-finish">${ICON.check} Terminer la séance</button>
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

function exerciseBlock(ex, i, cur) {
  const a = S.active;
  const e = EX.get(ex.exerciseId);
  const prev = prevSets(ex.exerciseId);
  const prevEx = a.exercises[i - 1], nextEx = a.exercises[i + 1];
  const ss = !!ex.supersetId;
  const ssFirst = ss && !(prevEx && prevEx.supersetId === ex.supersetId);
  const ssLast = ss && !(nextEx && nextEx.supersetId === ex.supersetId);
  const rows = ex.sets.map((s, j) => {
    const p = prev[j];
    const ph = placeholderFor(ex, j, prev);
    const isCur = cur && cur[0] === i && cur[1] === j;
    const t = s.type || 'normal';
    return `<div class="set-row ${s.completed ? 'done' : ''} ${isCur ? 'cur' : ''} t-${t}">
      <button class="set-num" data-action="w-set-menu" data-ex="${i}" data-set="${j}">${setLabel(ex, j)}${t === 'drop' || t === 'failure' ? `<sup>${SET_TYPES[t].short}</sup>` : ''}</button>
      <span class="set-prev">${p ? `${fmtW(p.weight)}×${p.reps}` : '—'}</span>
      <input class="set-in" inputmode="decimal" enterkeyhint="next" data-input="w-weight" data-change="w-commit" data-ex="${i}" data-set="${j}" value="${inputW(s.weight)}" placeholder="${ph.weight != null ? inputW(ph.weight) : ''}">
      <input class="set-in" inputmode="numeric" enterkeyhint="done" data-input="w-reps" data-change="w-commit" data-ex="${i}" data-set="${j}" value="${s.reps ?? ''}" placeholder="${ph.reps ?? ''}">
      <button class="set-check" data-action="w-check" data-ex="${i}" data-set="${j}" aria-label="Valider la série">${ICON.check}</button>
    </div>
    ${s.isRecord && s.completed ? `<div class="rec-line"><span class="rec-pill">${ICON.trophy}RECORD <b>${fmtW(s.weight)} ${unit()} × ${s.reps}</b></span></div>` : ''}`;
  }).join('');
  return `<section class="ex-card ${ss ? 'ss' : ''} ${ssFirst ? 'ss-first' : ''} ${ssLast ? 'ss-last' : ''}" data-drag-id="${i}" data-kind="wex">
    ${ssFirst ? '<span class="ss-label">SUPERSET</span>' : ''}
    <div class="ex-head">
      <span class="drag-h" aria-label="Déplacer l'exercice">${GRIP}</span>
      ${exThumb(e)}
      <h3 class="ex-name tap" data-action="open-exercise" data-id="${ex.exerciseId}">${esc(exName(ex.exerciseId))}</h3>
      <button class="icon-btn sm ${e && e.note ? 'has-note' : ''}" data-action="w-note" data-ex="${i}" aria-label="Note">${ICON.note}</button>
      <button class="icon-btn sm" data-action="w-ex-menu" data-ex="${i}" aria-label="Options">${ICON.more}</button>
    </div>
    ${e && e.note ? `<p class="ex-note tap" data-action="w-note" data-ex="${i}">${esc(e.note)}</p>` : ''}
    <div class="ex-params">
      <button data-action="w-rest-edit" data-ex="${i}">${ICON.timer}<span>REPOS</span>›<b>${ex.restTime ? fmtClock(ex.restTime) : 'Aucun'}</b></button>
      <button data-action="w-tempo" data-ex="${i}">${ICON.metro}<span>TEMPO</span>›<b class="${ex.tempo ? '' : 'muted'}">${ex.tempo ? esc(ex.tempo) : 'Aucun'}</b></button>
    </div>
    <div class="set-table">
      <div class="set-row head"><span>#</span><span>PREV</span><span>${unit().toUpperCase()}</span><span>REPS</span><span></span></div>
      ${rows}
    </div>
    <button class="btn-add-set dashed" data-action="w-add-set" data-ex="${i}">${ICON.plus} Ajouter une série</button>
  </section>`;
}

/** Met à jour l'en-tête (volume, séries, progression) sans tout re-rendre */
function updateWorkoutStats() {
  if (!S.active) return;
  const st = wStats(S.active);
  const v = $('#w-volume'), s = $('#w-sets'), p = $('#w-prog');
  if (v) v.innerHTML = `${fmtW(st.volume, 1)}<small> ${unit()}</small>`;
  if (s) s.textContent = `${st.sets} / ${st.total}`;
  if (p) p.style.width = (st.total ? st.sets / st.total * 100 : 0) + '%';
}

/** Recalcule le record de l'exercice dans la séance en cours. Renvoie la série record. */
function recomputeRecords(ex) {
  if (!ex || ex.kind === 'circuit') return null;
  const hist = bestE1RM(ex.exerciseId, S.active.id);
  let top = null, topV = 0;
  for (const s of ex.sets) {
    const v = s.completed && isWork(s) ? e1rm(s.weight, s.reps) : 0;
    if (v > topV) { topV = v; top = s; }
  }
  for (const s of ex.sets) s.isRecord = s === top && hist > 0 && topV > hist;
  return ex.sets.find(s => s.isRecord) || null;
}

let persistTimer;
const persistSoon = () => { clearTimeout(persistTimer); persistTimer = setTimeout(persistActive, 300); };
const setAt = el => S.active.exercises[+el.dataset.ex].sets[+el.dataset.set];

INPUTS['w-weight'] = el => { setAt(el).weight = fromU(parseNum(el.value)); updateWorkoutStats(); persistSoon(); };
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
    if (s.reps == null) s.reps = ph.repsFill ?? null;
    if (s.weight == null) s.weight = ph.weight ?? 0;
    if (!s.reps) { toast('Indique le nombre de répétitions'); s.reps = null; return; }
    s.completed = true; s.timestamp = Date.now();
    vibrate(12);
    const rec = recomputeRecords(ex);
    if (rec === s) { toast('🏆 Nouveau record !'); vibrate([30, 60, 30]); }
    // Superset : pas de repos entre les exercices du groupe, seulement après le dernier
    const next = a.exercises[exIdx + 1];
    const chained = ex.supersetId && next && next.kind !== 'circuit' && next.supersetId === ex.supersetId;
    if (ex.restTime > 0 && !a.manual && !chained) {
      if (S.settings.restAuto !== false) startRest(ex.restTime, exIdx, setIdx);
      else { a.rest = null; a.restReady = { sec: ex.restTime, exIdx, setIdx }; }
    }
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
  const s = ex.sets[j], t = s.type || 'normal';
  const setType = type => { s.type = type; if (type === 'warmup') s.isRecord = false; recomputeRecords(ex); persistActive(); renderWorkout(); };
  actionSheet(`Série ${setLabel(ex, j)}`, [
    ...Object.entries(SET_TYPES).filter(([k]) => k !== t).map(([k, v]) => ({ label: v.label, fn: () => setType(k) })),
    { label: 'Dupliquer la série', fn: () => { ex.sets.splice(j + 1, 0, { ...newSet(0), weight: s.weight, reps: s.reps, type: t }); renum(ex); persistActive(); renderWorkout(); } },
    { label: 'Supprimer la série', danger: true, fn: () => { ex.sets.splice(j, 1); renum(ex); recomputeRecords(ex); persistActive(); renderWorkout(); } }
  ]);
};
const renum = ex => ex.sets.forEach((s, k) => { s.setNumber = k + 1; });

ACTIONS['w-add-ex'] = () => openPicker(ids => {
  ids.forEach(id => S.active.exercises.push({ exerciseId: id, restTime: S.settings.restTimerDefault, tempo: '', targetReps: null, supersetId: null, sets: [newSet(1), newSet(2), newSet(3)] }));
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
  const v = await inputSheet('Tempo', ex.tempo, 'Ex. : 3-1-1-0 (descente-pause-montée-pause)');
  if (v != null) { ex.tempo = v; persistActive(); renderWorkout(); }
};
ACTIONS['w-rename'] = async () => {
  const v = await inputSheet('Nom de la séance', S.active.name);
  if (v) { S.active.name = v; persistActive(); renderWorkout(); }
};

/** Note d'un exercice : conservée sur l'exercice, retrouvée à chaque séance */
ACTIONS['w-note'] = el => editExerciseNote(S.active.exercises[+el.dataset.ex].exerciseId, () => renderWorkout());
function editExerciseNote(exerciseId, onDone) {
  const e = EX.get(exerciseId); if (!e) return;
  const sh = openSheet({
    html: `<div class="dialog left"><h3>Note · ${esc(e.name)}</h3>
      <textarea class="field area" id="note-in" placeholder="Ex. : siège cran 4, prise serrée, douleur épaule gauche…">${esc(e.note || '')}</textarea>
      <p class="muted sm">La note est gardée et réaffichée à chaque séance avec cet exercice.</p>
      <button class="btn-primary" data-action="note-save">Enregistrer</button>
      ${e.note ? '<button class="btn-plain danger" data-action="note-del">Effacer la note</button>' : '<button class="btn-plain" data-action="sheet-close">Annuler</button>'}</div>`,
    actions: {
      'note-save': async () => { e.note = $('#note-in', sh.el).value.trim(); await save('exercises', e); sh.close(); onDone && onDone(); },
      'note-del': async () => { e.note = ''; await save('exercises', e); sh.close(); onDone && onDone(); }
    }
  });
  setTimeout(() => $('#note-in', sh.el)?.focus(), 350);
}

ACTIONS['w-ex-menu'] = el => {
  const a = S.active, i = +el.dataset.ex, ex = a.exercises[i];
  const next = a.exercises[i + 1];
  const canSS = next && next.kind !== 'circuit' && !(ex.supersetId && next.supersetId === ex.supersetId);
  const move = d => { [a.exercises[i + d], a.exercises[i]] = [a.exercises[i], a.exercises[i + d]]; persistActive(); renderWorkout(); };
  actionSheet(exName(ex.exerciseId), [
    { label: 'Historique de l\'exercice', fn: () => openExerciseDetail(ex.exerciseId) },
    { label: (EX.get(ex.exerciseId)?.note ? 'Modifier la note' : 'Ajouter une note'), fn: () => ACTIONS['w-note']({ dataset: { ex: i } }) },
    { label: 'Objectif de répétitions', fn: async () => { const v = await inputSheet('Répétitions visées', ex.targetReps || '', 'Ex. : 10 ou 8-12'); if (v == null) return; if (v && !parseRange(v)) { toast('Format : 10 ou 8-12'); return; } ex.targetReps = v ? parseRange(v).text : null; persistActive(); renderWorkout(); } },
    ...(canSS ? [{ label: 'Superset avec l\'exercice suivant', fn: () => { const sid = ex.supersetId || next.supersetId || uid(); ex.supersetId = sid; next.supersetId = sid; persistActive(); renderWorkout(); } }] : []),
    ...(ex.supersetId ? [{ label: 'Retirer du superset', fn: () => { ex.supersetId = null; cleanSupersets(a.exercises); persistActive(); renderWorkout(); } }] : []),
    { label: 'Remplacer l\'exercice', fn: () => openPicker(ids => { ex.exerciseId = ids[0]; ex.sets.forEach(s => { s.isRecord = false; }); recomputeRecords(ex); persistActive(); renderWorkout(); }) },
    ...(i > 0 ? [{ label: 'Monter', fn: () => move(-1) }] : []),
    ...(i < a.exercises.length - 1 ? [{ label: 'Descendre', fn: () => move(1) }] : []),
    { label: 'Supprimer l\'exercice', danger: true, fn: () => { a.exercises.splice(i, 1); cleanSupersets(a.exercises); stopRest(); persistActive(); renderWorkout(); } }
  ]);
};
/** Un superset d'un seul exercice n'a pas de sens : on le dissout */
function cleanSupersets(list) {
  const count = {};
  list.forEach((e, k) => {
    if (!e.supersetId) return;
    const linked = (list[k - 1] && list[k - 1].supersetId === e.supersetId) || (list[k + 1] && list[k + 1].supersetId === e.supersetId);
    if (!linked) e.supersetId = null;
    else count[e.supersetId] = (count[e.supersetId] || 0) + 1;
  });
}

/** Menu « … » de l'en-tête */
ACTIONS['w-menu'] = () => {
  const a = S.active;
  actionSheet(a.name, [
    { label: 'Terminer la séance', icon: ICON.check, fn: () => ACTIONS['w-finish']() },
    ...(a.manual ? [{ label: 'Modifier la durée', fn: async () => { const v = await inputSheet('Durée (minutes)', String(a.durationMin), '60'); const n = parseInt(v, 10); if (n > 0) { a.durationMin = n; persistActive(); renderWorkout(); } } }]
      : [{ label: a.pausedAt ? 'Reprendre le chrono' : 'Mettre en pause', fn: () => ACTIONS['w-pause']() }]),
    { label: 'Renommer la séance', fn: () => ACTIONS['w-rename']() },
    { label: 'Ajouter un exercice', fn: () => ACTIONS['w-add-ex']() },
    { label: 'Ajouter un circuit', fn: () => ACTIONS['w-add-circuit']() },
    { label: 'Abandonner l\'entraînement', danger: true, fn: () => ACTIONS['w-cancel']() }
  ]);
};

/** Bouton ⏱ de l'en-tête : réglages du minuteur de repos */
ACTIONS['w-timer-menu'] = () => {
  const auto = S.settings.restAuto !== false;
  const sh = openSheet({
    html: `<div class="dialog left"><h3>Minuteur de repos</h3>
      <button class="toggle-row ${auto ? 'on' : ''}" data-action="tm-auto"><span class="tgl"></span><span>Lancer le repos automatiquement à la validation d'une série</span></button>
      <div class="opt-list">
        <button class="opt" data-action="tm-default">${ICON.timer}<span>Repos par défaut : ${fmtClock(S.settings.restTimerDefault)}</span></button>
        <button class="opt" data-action="tm-all">${ICON.timer}<span>Appliquer un repos à tous les exercices…</span></button>
        ${S.active.rest ? `<button class="opt" data-action="tm-stop">${ICON.close}<span>Arrêter le repos en cours</span></button>` : ''}
      </div>
      <button class="btn-plain" data-action="sheet-close">Fermer</button></div>`,
    actions: {
      'tm-auto': async el => { S.settings.restAuto = !(S.settings.restAuto !== false); el.classList.toggle('on', S.settings.restAuto); await saveSettings(); renderRest(); },
      'tm-default': async () => { const v = await restPickerSheet(S.settings.restTimerDefault); if (v != null) { S.settings.restTimerDefault = v; await saveSettings(); sh.close(); } },
      'tm-all': async () => { const v = await restPickerSheet(null); if (v == null) return; S.active.exercises.forEach(e => { if (e.kind !== 'circuit') e.restTime = v; }); persistActive(); sh.close(); renderWorkout(); },
      'tm-stop': () => { stopRest(); persistActive(); sh.close(); }
    }
  });
};

/** Pause / reprise du chrono de séance */
ACTIONS['w-pause'] = () => {
  const a = S.active; if (!a || a.manual) return;
  if (a.pausedAt) { a.pausedTotal = (a.pausedTotal || 0) + (Date.now() - a.pausedAt); a.pausedAt = null; }
  else a.pausedAt = Date.now();
  persistActive(); renderWorkout();
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
  bar.innerHTML = `<span class="live"><i></i>${a.pausedAt ? 'PAUSE' : 'LIVE'}</span><b>${esc(a.name)}</b><span id="mini-time">${a.manual ? fmtDateShort(a.startTime) : fmtClock(elapsedSec(a))}</span>
    <span id="mini-rest" class="mini-rest">${a.rest ? fmtClock(Math.ceil((a.rest.endAt - Date.now()) / 1000)) : ''}</span>${ICON.chevD.replace('<svg', '<svg class="up"')}`;
  bar.classList.add('show');
}

/* ----- Minuteur de repos -----
   On stocke l'heure de fin (endAt) : le décompte reste juste même si
   l'app est suspendue (écran verrouillé) et reprend au retour. */
function startRest(sec, exIdx, setIdx) {
  S.active.restReady = null;
  S.active.rest = { endAt: Date.now() + sec * 1000, total: sec, exIdx, setIdx, done: false };
  scheduleRestNotification(sec);
}
function stopRest() {
  if (S.active) { S.active.rest = null; S.active.restReady = null; }
  cancelRestNotification();
  renderRest(); renderMiniBar();
}
ACTIONS['w-rest-plus'] = () => {
  const r = S.active.rest; if (!r) return;
  r.endAt += 30000; r.total += 30; r.done = false;
  scheduleRestNotification((r.endAt - Date.now()) / 1000);
  persistActive(); updateRestUI();
};
ACTIONS['w-rest-skip'] = () => { stopRest(); persistActive(); };
ACTIONS['w-rest-go'] = () => { const r = S.active.restReady; if (!r) return; unlockAudio(); startRest(r.sec, r.exIdx, r.setIdx); persistActive(); renderRest(); };
ACTIONS['w-rest-mode'] = async () => { S.settings.restAuto = !(S.settings.restAuto !== false); await saveSettings(); toast(S.settings.restAuto ? 'Repos automatique' : 'Repos à lancer manuellement'); renderRest(); };

/** « Suivant · Squat à la barre · S3 » */
function nextSetText() {
  const c = currentSet();
  if (!c) return 'Dernière série terminée 💪';
  const ex = S.active.exercises[c[0]];
  const lab = setLabel(ex, c[1]);
  return `${exName(ex.exerciseId)} · ${lab === 'É' ? 'échauffement' : 'S' + lab}`;
}

function renderRest() {
  const el = $('#rest-panel'); if (!el) return;
  const a = S.active;
  const r = a && a.rest, ready = a && !r && a.restReady;
  $('.w-screen')?.classList.toggle('has-rest', !!(r || ready));
  if (!r && !ready) { el.className = ''; el.innerHTML = ''; return; }
  const C = 2 * Math.PI * 26;
  const mode = S.settings.restAuto !== false ? 'AUTO' : 'MANUEL';
  const total = r ? r.total : ready.sec;
  el.className = 'show';
  el.innerHTML = `
    <div class="rest-ring">
      <svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" class="ring-bg"/><circle id="ring-fg" cx="30" cy="30" r="26" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>
      <span id="rest-pct">${r ? '' : '100%'}</span>
    </div>
    <div class="rest-info">
      <span class="rest-k"><i></i>REPOS · ${fmtClock(total)} · <button data-action="w-rest-mode">${mode}</button></span>
      <b id="rest-time">${fmtClock(total)}</b>
      <span class="rest-next">Suivant · ${esc(nextSetText())}</span>
    </div>
    <div class="rest-side">
      ${r ? `<button class="rest-plus" data-action="w-rest-plus">+30s</button><button class="rest-skip" data-action="w-rest-skip">Passer</button>`
        : `<button class="rest-plus" data-action="w-rest-go">${ICON.play}Lancer</button><button class="rest-skip" data-action="w-rest-skip">Ignorer</button>`}
    </div>`;
  updateRestUI();
}

function updateRestUI() {
  const r = S.active && S.active.rest; if (!r) return;
  const rem = Math.max(0, (r.endAt - Date.now()) / 1000);
  const pct = r.total ? rem / r.total : 0;
  const t = $('#rest-time'); if (t) t.textContent = fmtClock(Math.ceil(rem));
  const p = $('#rest-pct'); if (p) p.textContent = Math.round(pct * 100) + '%';
  const fg = $('#ring-fg');
  if (fg) { const C = 2 * Math.PI * 26; fg.style.strokeDashoffset = C * (1 - pct); }
  $('#rest-panel')?.classList.toggle('ending', rem <= 5);
  const m = $('#mini-rest'); if (m) m.textContent = fmtClock(Math.ceil(rem));
}

/* ============================ Circuits ==================================
   Un circuit est un bloc de la séance : { kind: 'circuit', format, … }
   - rounds : tours libres (chrono qui monte, « Tour terminé »)
   - hiit   : travail / repos au chrono, N tours
   - emom   : un effort au début de chaque minute, N minutes
   - amrap  : un maximum de tours en X minutes
   Le temps est calculé à partir d'horodatages (fiable même écran verrouillé). */
const CIRCUIT_FORMATS = { rounds: 'Tours libres', hiit: 'HIIT', emom: 'EMOM', amrap: 'AMRAP' };
const CIRCUIT_HELP = {
  rounds: 'Enchaîne les exercices, valide chaque tour à ton rythme.',
  hiit: 'Alternance travail / repos au chrono, pendant N tours.',
  emom: 'Au début de chaque minute, fais le tour ; repose-toi le reste de la minute.',
  amrap: 'Un maximum de tours dans le temps imparti.'
};

function circuitElapsed(c) {
  if (!c.t.start) return 0;
  const now = c.t.pausedAt || Date.now();
  return Math.max(0, (now - c.t.start - (c.t.pausedTotal || 0)) / 1000);
}
/** État du chrono : texte principal, sous-titre, phase, tours faits automatiquement */
function circuitState(c) {
  const el = circuitElapsed(c);
  if (c.format === 'amrap') {
    const tot = c.minutes * 60;
    return { big: fmtClock(Math.ceil(Math.max(0, tot - el))), sub: `${c.done} TOUR${c.done > 1 ? 'S' : ''}`, over: el >= tot, key: el >= tot ? 'over' : 'run' };
  }
  if (c.format === 'emom') {
    const tot = c.rounds * 60, over = el >= tot;
    const m = Math.min(c.rounds, Math.floor(el / 60) + 1);
    return { big: fmtClock(over ? 0 : Math.ceil(60 - (el % 60))), sub: `MINUTE ${m} / ${c.rounds}`, over, auto: Math.min(c.rounds, Math.floor(el / 60)), key: over ? 'over' : 'm' + m };
  }
  if (c.format === 'hiit') {
    const cyc = c.work + c.rest, tot = c.rounds * cyc - c.rest, over = el >= tot;
    const r = Math.min(c.rounds, Math.floor(el / cyc) + 1);
    const inC = el - (r - 1) * cyc, work = inC < c.work;
    return { big: fmtClock(over ? 0 : Math.ceil(work ? c.work - inC : cyc - inC)), sub: over ? 'TERMINÉ' : `${work ? 'TRAVAIL' : 'REPOS'} · TOUR ${r} / ${c.rounds}`,
      phase: work ? 'work' : 'rest', over, auto: Math.min(c.rounds, Math.floor((el + c.rest) / cyc)), key: over ? 'over' : r + (work ? 'w' : 'r') };
  }
  const over = c.done >= c.rounds;
  return { big: fmtClock(el), sub: over ? 'TERMINÉ' : `TOUR ${Math.min(c.done + 1, c.rounds)} / ${c.rounds}`, over, key: 'r' + c.done };
}
function circuitStats(c) {
  const perRound = c.items.reduce((acc, it) => acc + (it.weight || 0) * (parseRange(it.reps)?.min || 0), 0);
  const total = c.format === 'amrap' ? Math.max(c.done, 1) * c.items.length : c.rounds * c.items.length;
  return { volume: c.done * perRound, sets: c.done * c.items.length, total };
}

function circuitBlock(c, i) {
  const st = circuitState(c);
  const pct = c.format === 'amrap' ? Math.min(100, circuitElapsed(c) / (c.minutes * 60) * 100) : Math.min(100, c.done / c.rounds * 100);
  const params = { rounds: `${c.rounds} TOURS`, hiit: `${c.rounds} TOURS · ${c.work}S / ${c.rest}S`, emom: `${c.rounds} MIN`, amrap: `${c.minutes} MIN` }[c.format];
  const nDots = Math.min(12, c.format === 'amrap' ? Math.max(c.done + 1, 2) : c.rounds);
  const running = c.t.start && !c.t.pausedAt && !st.over;
  return `<section class="ex-card circuit" data-drag-id="${i}" data-kind="wex">
    <div class="circ-top">
      <span class="drag-h" aria-label="Déplacer le circuit">${GRIP}</span>
      <span class="circ-badge">${ICON.circuit}CIRCUIT · ${CIRCUIT_FORMATS[c.format].toUpperCase()}</span>
      <button class="icon-btn sm" data-action="c-menu" data-ex="${i}" aria-label="Options du circuit">${ICON.more}</button>
    </div>
    <h3 class="circ-name">${esc(c.name)}</h3>
    <p class="circ-meta">${c.items.length} EXO${c.items.length > 1 ? 'S' : ''} · ${params} · ${Math.round(pct)} %</p>
    <div class="circ-round"><span>${c.format === 'amrap' ? 'TOURS FAITS' : 'TOUR EN COURS'}</span>
      <b>${c.format === 'amrap' ? c.done : `${Math.min(c.done + (st.over ? 0 : 1), c.rounds)} / ${c.rounds}`}</b>
      <i><em id="ct-prog-${i}" style="width:${pct}%"></em></i></div>
    <div class="circ-timer ${st.phase === 'rest' ? 'rest' : ''} ${st.over ? 'over' : ''}">
      <span class="circ-fmt">${CIRCUIT_FORMATS[c.format].toUpperCase()}</span>
      <b id="ct-big-${i}">${st.big}</b>
      <span id="ct-sub-${i}" class="circ-sub">${st.sub}</span>
      <div class="circ-btns">
        ${!c.t.start ? `<button class="circ-done wide" data-action="c-start" data-ex="${i}">${ICON.play} Démarrer</button>`
          : st.over ? `<span class="circ-end">Circuit terminé 💪</span>`
          : `<button class="circ-pause" data-action="c-pause" data-ex="${i}">${c.t.pausedAt ? 'Reprendre' : 'Pause'}</button>
             ${c.format === 'rounds' || c.format === 'amrap' ? `<button class="circ-done" data-action="c-round" data-ex="${i}">Tour terminé</button>` : ''}`}
      </div>
    </div>
    <div class="circ-items">${c.items.map((it, k) => `
      <button class="circ-item ${running && k === 0 ? 'cur' : ''}" data-action="c-item" data-ex="${i}" data-k="${k}">
        <span class="ci-n">${k + 1}</span>
        <span class="ci-txt"><b>${esc(exName(it.exerciseId))}</b><small>${it.reps ? esc(it.reps) + ' reps' : '—'} · ${it.weight ? fmtW(it.weight) + ' ' + unit() : 'poids du corps'}</small></span>
        <span class="ci-dots">${Array.from({ length: nDots }, (_, d) => `<i class="${d < c.done ? 'on' : ''}"></i>`).join('')}</span>
      </button>`).join('') || '<p class="empty-sm">Ajoute des exercices au circuit.</p>'}</div>
    <button class="btn-add-set dashed purple" data-action="c-add" data-ex="${i}">${ICON.plus} Ajouter un exercice</button>
  </section>`;
}

/** Création / modification d'un circuit */
ACTIONS['w-add-circuit'] = () => openCircuitForm(null);
function openCircuitForm(idx) {
  const c0 = idx == null ? null : S.active.exercises[idx];
  const d = c0 ? { format: c0.format, rounds: c0.rounds, work: c0.work, rest: c0.rest, minutes: c0.minutes, name: c0.name }
    : { format: 'amrap', rounds: 3, work: 40, rest: 20, minutes: 15, name: 'Circuit' };
  const num = (k, label, unitTxt) => `<label class="form-row"><span>${label}</span><input inputmode="numeric" data-input="cf-num" data-k="${k}" value="${d[k]}"><em>${unitTxt}</em></label>`;
  const body = () => `<div class="dialog left"><h3>${c0 ? 'Modifier le circuit' : 'Nouveau circuit'}</h3>
    <div class="grid-opts two">${Object.entries(CIRCUIT_FORMATS).map(([k, v]) => `<button class="opt-pill ${d.format === k ? 'on purple' : ''}" data-action="cf-fmt" data-v="${k}">${v}</button>`).join('')}</div>
    <p class="muted sm">${CIRCUIT_HELP[d.format]}</p>
    <label class="lbl">Nom</label><input class="field" data-input="cf-name" value="${esc(d.name)}" autocomplete="off">
    <div class="card list-card form-list">
      ${d.format === 'amrap' ? num('minutes', 'Durée', 'min') : d.format === 'emom' ? num('rounds', 'Durée', 'min') : num('rounds', 'Tours', '')}
      ${d.format === 'hiit' ? num('work', 'Travail', 's') + num('rest', 'Repos', 's') : ''}
    </div>
    <button class="btn-primary purple" data-action="cf-go">${c0 ? 'Enregistrer' : 'Choisir les exercices'}</button>
    <button class="btn-plain" data-action="sheet-close">Annuler</button></div>`;
  const sh = openSheet({
    html: body(),
    inputs: { 'cf-num': el => { d[el.dataset.k] = parseInt(el.value, 10) || 0; }, 'cf-name': el => { d.name = el.value; } },
    actions: {
      'cf-fmt': el => { d.format = el.dataset.v; sh.set(body()); },
      'cf-go': () => {
        if (d.format === 'amrap' && !(d.minutes > 0)) { toast('Indique une durée'); return; }
        if (d.format !== 'amrap' && !(d.rounds > 0)) { toast('Indique un nombre de tours'); return; }
        if (d.format === 'hiit' && !(d.work > 0)) { toast('Indique un temps de travail'); return; }
        d.rounds = clamp(d.rounds || 1, 1, 99); d.minutes = clamp(d.minutes || 1, 1, 180);
        d.work = clamp(d.work || 1, 1, 600); d.rest = clamp(d.rest || 0, 0, 600);
        d.name = d.name.trim() || 'Circuit';
        sh.close();
        if (c0) { Object.assign(c0, d); c0.lastKey = null; persistActive(); renderWorkout(); return; }
        openPicker(ids => {
          S.active.exercises.push({ kind: 'circuit', id: uid(), ...d, done: 0, items: ids.map(id => ({ exerciseId: id, reps: '10', weight: null })), t: { start: null, pausedAt: null, pausedTotal: 0 } });
          persistActive(); renderWorkout();
          setTimeout(() => { const b = $('.w-body'); b && b.scrollTo({ top: b.scrollHeight, behavior: 'smooth' }); }, 50);
        });
      }
    }
  });
}

const circAt = el => S.active.exercises[+el.dataset.ex];
ACTIONS['c-start'] = el => { const c = circAt(el); unlockAudio(); c.t = { start: Date.now(), pausedAt: null, pausedTotal: 0 }; c.lastKey = null; beep(); persistActive(); renderWorkout(); };
ACTIONS['c-pause'] = el => {
  const c = circAt(el);
  if (c.t.pausedAt) { c.t.pausedTotal += Date.now() - c.t.pausedAt; c.t.pausedAt = null; } else c.t.pausedAt = Date.now();
  persistActive(); renderWorkout();
};
ACTIONS['c-round'] = el => {
  const c = circAt(el);
  c.done++; vibrate(15);
  if (c.format === 'rounds' && c.done >= c.rounds) { c.t.pausedAt = Date.now(); beep(); toast('Circuit terminé 💪'); }
  else toast(`Tour ${c.done} terminé`);
  persistActive(); renderWorkout();
};
ACTIONS['c-add'] = el => {
  const c = circAt(el);
  openPicker(ids => { ids.forEach(id => c.items.push({ exerciseId: id, reps: '10', weight: null })); persistActive(); renderWorkout(); });
};
ACTIONS['c-item'] = el => {
  const c = circAt(el), k = +el.dataset.k, it = c.items[k];
  const sh = openSheet({
    html: `<div class="dialog left"><h3>${esc(exName(it.exerciseId))}</h3>
      <div class="card list-card form-list">
        <label class="form-row"><span>Répétitions</span><input data-input="ci-reps" value="${esc(it.reps || '')}" placeholder="10"><em>reps</em></label>
        <label class="form-row"><span>Charge</span><input inputmode="decimal" data-input="ci-w" value="${inputW(it.weight)}" placeholder="0"><em>${unit()}</em></label>
      </div>
      <p class="muted sm">Laisse la charge vide pour un exercice au poids du corps.</p>
      <button class="btn-primary purple" data-action="ci-ok">OK</button>
      <div class="opt-list">
        ${k > 0 ? `<button class="opt" data-action="ci-up"><span>Monter</span></button>` : ''}
        <button class="opt danger" data-action="ci-del"><span>Retirer du circuit</span></button>
      </div></div>`,
    inputs: { 'ci-reps': e2 => { it.reps = e2.value.trim(); }, 'ci-w': e2 => { const v = parseNum(e2.value); it.weight = v ? fromU(v) : null; } },
    actions: {
      'ci-ok': () => { sh.close(); persistActive(); renderWorkout(); },
      'ci-up': () => { [c.items[k - 1], c.items[k]] = [c.items[k], c.items[k - 1]]; sh.close(); persistActive(); renderWorkout(); },
      'ci-del': () => { c.items.splice(k, 1); sh.close(); persistActive(); renderWorkout(); }
    }
  });
};
ACTIONS['c-menu'] = el => {
  const i = +el.dataset.ex, c = S.active.exercises[i];
  actionSheet(c.name, [
    { label: 'Modifier le format', fn: () => openCircuitForm(i) },
    ...(c.done > 0 && (c.format === 'rounds' || c.format === 'amrap') ? [{ label: 'Annuler le dernier tour', fn: () => { c.done--; if (c.format === 'rounds' && c.t.pausedAt && c.done < c.rounds) { c.t.pausedTotal += Date.now() - c.t.pausedAt; c.t.pausedAt = null; } persistActive(); renderWorkout(); } }] : []),
    ...(c.t.start ? [{ label: 'Réinitialiser le chrono', fn: () => { c.t = { start: null, pausedAt: null, pausedTotal: 0 }; c.done = 0; c.lastKey = null; persistActive(); renderWorkout(); } }] : []),
    { label: 'Supprimer le circuit', danger: true, fn: async () => { if (!await confirmSheet('Supprimer le circuit ?', '', 'Supprimer', true)) return; S.active.exercises.splice(i, 1); persistActive(); renderWorkout(); } }
  ]);
};

/** Mise à jour des chronos de circuit (appelée par tick) */
function tickCircuits(a) {
  let rerender = false;
  a.exercises.forEach((c, i) => {
    if (c.kind !== 'circuit' || !c.t.start) return;
    const st = circuitState(c);
    if (st.auto != null && st.auto > c.done) c.done = st.auto;
    if (c.lastKey && c.lastKey !== st.key) { beep(); vibrate(150); rerender = true; }
    if (c.lastKey !== st.key) { c.lastKey = st.key; persistSoon(); }
    const b = $('#ct-big-' + i); if (b) b.textContent = st.big;
    const s = $('#ct-sub-' + i); if (s) s.textContent = st.sub;
    if (c.format === 'amrap') { const p = $('#ct-prog-' + i); if (p) p.style.width = Math.min(100, circuitElapsed(c) / (c.minutes * 60) * 100) + '%'; }
  });
  if (rerender && !document.activeElement?.matches('input, textarea')) renderWorkout();
}

/** Boucle principale (chrono, minuteur, circuits), 4 fois par seconde */
function tick() {
  const a = S.active; if (!a) return;
  if (!a.manual) {
    const t = fmtClock(elapsedSec(a));
    const el = $('#w-elapsed'); if (el) el.textContent = t;
    const mt = $('#mini-time'); if (mt) mt.textContent = t;
  }
  if (a.rest) {
    const rem = (a.rest.endAt - Date.now()) / 1000;
    if (rem <= 0 && !a.rest.done) { a.rest.done = true; persistActive(); restFinished(); }
    if (rem <= -1.5) { a.rest = null; persistActive(); renderRest(); renderMiniBar(); }
    else updateRestUI();
  }
  tickCircuits(a);
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
  // Les circuits sont enregistrés comme des séries classiques (1 série par tour)
  const circuitEntries = c => c.items.map(it => ({
    exerciseId: it.exerciseId, restTime: 0, tempo: '', circuit: c.format,
    sets: Array.from({ length: c.done }, (_, k) => ({ setNumber: k + 1, weight: it.weight || 0, reps: parseRange(it.reps)?.min || 0, completed: true, isRecord: false, timestamp: null, type: 'normal' }))
  })).filter(e => e.sets.length && e.sets[0].reps);
  const hasCircuit = a.exercises.some(e => e.kind === 'circuit');
  const w = {
    id: a.id, name: (name || '').trim() || a.name, templateId: a.templateId,
    date: dayKey(a.startTime), startTime: a.startTime, endTime: end,
    duration: Math.round(elapsedSec(a)),
    plannedSets: wStats(a).total,
    exercises: a.exercises
      .flatMap(ex => ex.kind === 'circuit' ? circuitEntries(ex)
        : [{ exerciseId: ex.exerciseId, restTime: ex.restTime, tempo: ex.tempo, targetReps: ex.targetReps || null, supersetId: ex.supersetId || null, sets: ex.sets.filter(s => s.completed).map((s, k) => ({ ...s, setNumber: k + 1 })) }])
      .filter(ex => ex.sets.length)
  };
  await save('workouts', w);
  if (makeTemplate) {
    await save('templates', {
      id: uid(), name: w.name, folderId: null,
      exercises: w.exercises.map(ex => ({ exerciseId: ex.exerciseId, restTime: ex.restTime, tempo: ex.tempo, supersetId: ex.supersetId || null, targetSets: ex.sets.length, targetReps: ex.targetReps || String(ex.sets[0]?.reps || 10) }))
    });
  }
  stopRest();
  S.active = null; persistActive();
  renderWorkout();
  S.tab = 'activity'; S.selDay = null;
  S.calMonth = new Date(new Date(w.startTime).getFullYear(), new Date(w.startTime).getMonth(), 1);
  if (a.manual || hasCircuit) await recomputeAllRecords(); // séance passée ou circuit : on recalcule les records
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
  const vU = toU(st.volume);
  const vol = vU >= 1000 ? [fmtNum(vU / 1000, 1), isLbs() ? 'k lbs' : 'tonnes'] : [fmtNum(vU), unit()];
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
          ${recs.map(r => `<div class="sum-rec">${ICON.trophy}<span>${esc(exName(r.ex.exerciseId))}</span><b>${fmtW(r.s.weight)} ${unit()} × ${r.s.reps}</b></div>`).join('')}
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

/** Tonnage par muscle (principal = 100 %, secondaire = 50 %) */
function muscleTonnage(workouts) {
  const m = {};
  for (const w of workouts) for (const ex of w.exercises) {
    const e = EX.get(ex.exerciseId); if (!e || !ex.sets) continue;
    const v = ex.sets.filter(s => s.completed && isWork(s)).reduce((a, s) => a + (s.weight || 0) * (s.reps || 0), 0);
    if (!v) continue;
    m[e.muscleGroup] = (m[e.muscleGroup] || 0) + v;
    if (e.secondaryMuscle) m[e.secondaryMuscle] = (m[e.secondaryMuscle] || 0) + v * 0.5;
  }
  return m;
}
/** Débuts de semaine (lundi), de la plus ancienne à la semaine en cours */
function weekStarts(n) {
  const cur = startOfWeek(Date.now());
  return Array.from({ length: n }, (_, i) => addDays(cur, -7 * (n - 1 - i)).getTime());
}
const workoutsBetween = (from, end) => S.data.workouts.filter(w => w.startTime >= from && w.startTime < end);
/** "aujourd'hui", "hier", "28 sept." */
function relShort(ts) {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
  return diff <= 0 ? 'aujourd\'hui' : diff === 1 ? 'hier' : fmtDateShort(ts);
}

/* ----- Regroupement des séances (par séance type, sinon par nom) ----- */
function groupKeyOf(w) { return w.templateId && S.data.templates.some(t => t.id === w.templateId) ? w.templateId : 'name:' + w.name; }
function workoutGroups() {
  const m = new Map();
  for (const w of workoutsDesc()) { const k = groupKeyOf(w); if (!m.has(k)) m.set(k, []); m.get(k).push(w); }
  return [...m.entries()];
}
function groupWorkouts(key) { return S.data.workouts.filter(w => groupKeyOf(w) === key); }
function groupTemplate(key) {
  if (!String(key).startsWith('name:')) return S.data.templates.find(t => t.id === key) || null;
  const ws = groupWorkouts(key).sort((a, b) => b.startTime - a.startTime);
  return ws.length ? { id: key, name: key.slice(5), exercises: ws[0].exercises.map(e => ({ exerciseId: e.exerciseId })) } : null;
}
function sessionRow([key, ws]) {
  const vols = ws.map(w => wStats(w).volume);
  const prev = vols.slice(1, 4);
  const avg = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : null;
  const trend = avg == null || !avg ? '' : vols[0] > avg * 1.02 ? 'up' : vols[0] < avg * 0.98 ? 'down' : 'flat';
  return `<button class="sess2 tap" data-action="open-group" data-key="${esc(key)}">
    <span class="sess2-top"><i class="dot"></i><b>${esc(ws[0].name)}</b><small>${ws.length}×</small>${trend ? `<em class="tr ${trend}">${{ up: '↗', down: '↘', flat: '→' }[trend]}</em>` : ''}<span class="chev-r">${ICON.chevR}</span></span>
    <span class="sess2-chips">${ws.slice(0, 2).map(w => `<span class="chip-out">${relShort(w.startTime)} · <b>${fmtW(wStats(w).volume, 0)} ${unit()}</b></span>`).join('')}</span>
  </button>`;
}
ACTIONS['open-group'] = el => openTemplateStats(el.dataset.key);
ACTIONS['open-sessions'] = () => pushPage({
  title: 'Mes séances',
  render: () => { const g = workoutGroups(); return g.length ? `<div class="card list-card">${g.map(sessionRow).join('')}</div>` : emptyState(ICON.chart, 'Aucune séance réalisée.'); }
});

/* ----- Accueil Progrès ----- */
function viewProgress() {
  const now = Date.now();
  const streak = weekStreak();
  const goal = S.settings.weeklyGoal || 3;
  const weeks = weekStarts(8).map(s => workoutsBetween(s, s + 7 * DAY).length);
  const thisWeek = weeks[7];
  const from = startOfDay(now - 6 * DAY);
  const ms = muscleSets(workoutsBetween(from.getTime(), now + 1));
  const levels = Object.fromEntries(Object.keys(MUSCLES).map(m => [m, muscleLevel(ms[m] || 0)]));
  const groups = workoutGroups();
  return `
    <header class="big-head"><h1>Progrès</h1>${avatarBtn()}</header>
    <div class="card streak2">
      <span class="streak-pill">${ICON.flame}${streak}</span>
      <div class="streak-txt"><b>${streak} semaine${streak > 1 ? 's' : ''} d'affilée</b><span>${thisWeek} séance${thisWeek > 1 ? 's' : ''} cette semaine · objectif ${goal}</span></div>
      <div class="streak-bars">${weeks.map((n, i) => `<i class="${n ? 'on' : ''} ${i === 7 ? 'cur' : ''}" style="height:${n ? clamp(n / goal * 100, 40, 100) : 28}%"></i>`).join('')}</div>
    </div>
    <div class="card">
      <div class="card-head"><h3 class="card-title">Muscles travaillés</h3><span class="mono-sm">7 J</span></div>
      <div class="body-maps"><figure>${bodySvg('front', levels)}<figcaption>FACE</figcaption></figure><figure>${bodySvg('back', levels)}<figcaption>DOS</figcaption></figure></div>
      <div class="sum-legend"><span>Moins de séries</span><i></i><span>Plus de séries</span></div>
      <div class="mus-foot"><span><small>Séries effectives</small><small>${fmtDateShort(from)} – ${fmtDateShort(now)}</small></span>
        <button class="link-btn strong" data-action="open-muscles">Voir le détail ↗</button></div>
    </div>
    <div class="section-head"><h2 class="cond">Mes séances</h2>${groups.length > 3 ? '<button class="link-btn strong" data-action="open-sessions">Tout voir ›</button>' : ''}</div>
    ${groups.length ? `<div class="card list-card">${groups.slice(0, 3).map(sessionRow).join('')}</div>` : '<p class="empty-sm">Tes séances réalisées apparaîtront ici.</p>'}
    <div class="menu-grid">
      <button class="card menu-tile tap" data-action="open-stats"><span class="mt-ic">${ICON.chart}</span><b>Statistiques</b><span class="muted sm">Volume, calendrier</span></button>
      <button class="card menu-tile tap" data-action="open-measures"><span class="mt-ic">${ICON.ruler}</span><b>Mesures</b><span class="muted sm">Mensurations, photos</span></button>
      <button class="card menu-tile tap" data-action="open-records"><span class="mt-ic">${ICON.trophy}</span><b>Records</b><span class="muted sm">1RM estimés</span></button>
      <button class="card menu-tile tap" data-action="open-library"><span class="mt-ic">${ICON.book}</span><b>Exercices</b><span class="muted sm">${S.data.exercises.length} exercices</span></button>
    </div>`;
}

/* ----- Détail par muscle (« rattrapez vos points faibles ») ----- */
const MUS_PERIODS = { '4S': 4, '8S': 8, '12S': 12, '6M': 26, '1A': 52 };
ACTIONS['open-muscles'] = () => {
  const pg = pushPage({
    title: 'Muscles',
    render: () => {
      const n = MUS_PERIODS[S.musPeriod];
      const weeks = weekStarts(n);
      const from = weeks[0], end = Date.now() + 1;
      const fn = S.musMetric === 'tonnage' ? muscleTonnage : muscleSets;
      const perWeek = weeks.map(s => fn(workoutsBetween(s, s + 7 * DAY)));
      const total = fn(workoutsBetween(from, end));
      const setsAvg = muscleSets(workoutsBetween(from, end));
      // semaine en cours partielle : on la compte au prorata pour la moyenne
      const effWeeks = n - 1 + Math.min(1, (Date.now() - weeks[n - 1]) / (7 * DAY));
      const levels = Object.fromEntries(Object.keys(MUSCLES).map(m => [m, muscleLevel((setsAvg[m] || 0) / effWeeks)]));
      const fmtV = v => S.musMetric === 'tonnage' ? fmtVol(v) : fmtNum(v, 1);
      const rows = Object.keys(MUSCLES).map(m => {
        const vals = perWeek.map(w => w[m] || 0);
        const half = Math.floor(n / 2);
        const a = vals.slice(0, half).reduce((x, y) => x + y, 0), b = vals.slice(half).reduce((x, y) => x + y, 0);
        const tr = !a && !b ? '' : b > a * 1.1 ? 'up' : b < a * 0.9 ? 'down' : 'flat';
        return { m, total: total[m] || 0, avg: (total[m] || 0) / effWeeks, vals, tr };
      }).sort((x, y) => y.total - x.total);
      const max = Math.max(1, ...rows.flatMap(r => r.vals));
      const weak = Object.keys(MUSCLES).map(m => ({ m, avg: (setsAvg[m] || 0) / effWeeks })).sort((x, y) => x.avg - y.avg).slice(0, 3);
      const suggest = m => S.data.exercises.filter(e => e.muscleGroup === m).sort((x, y) => (x.level === 'debutant' ? 0 : 1) - (y.level === 'debutant' ? 0 : 1)).slice(0, 2);
      return `
        <p class="page-sub">${fmtDateShort(from)} – ${fmtDateShort(Date.now())}</p>
        <div class="seg">${Object.keys(MUS_PERIODS).map(p => `<button class="${S.musPeriod === p ? 'on' : ''}" data-action="mu-period" data-v="${p}">${p}</button>`).join('')}</div>
        <div class="card">
          <div class="body-maps"><figure>${bodySvg('front', levels)}<figcaption>FACE</figcaption></figure><figure>${bodySvg('back', levels)}<figcaption>DOS</figcaption></figure></div>
          <div class="sum-legend"><span>Moins de séries</span><i></i><span>Plus de séries</span></div>
          <p class="muted sm center">Couleur = séries effectives par semaine en moyenne. Repère courant : 10 à 20 séries par muscle et par semaine.</p>
        </div>
        <div class="card weak-card">
          <h3 class="card-title">Points faibles</h3>
          ${weak.map(w => `<div class="weak-row"><div><b>${MUSCLES[w.m]}</b><span class="muted sm">${fmtNum(w.avg, 1)} série${w.avg >= 2 ? 's' : ''} / semaine</span></div>
            <div class="weak-ex">${suggest(w.m).map(e => `<button class="chip-out tap" data-action="open-exercise" data-id="${e.id}">${esc(e.name)}</button>`).join('')}</div></div>`).join('')}
        </div>
        <div class="section-head"><h2 class="cond">Par muscle</h2>
          <div class="seg sm mini">${[['sets', 'Séries'], ['tonnage', 'Tonnage']].map(([k, l]) => `<button class="${S.musMetric === k ? 'on' : ''}" data-action="mu-metric" data-v="${k}">${l}</button>`).join('')}</div></div>
        <div class="card list-card">${rows.map(r => `<div class="mus-row">
          <div class="mus-name"><b>${MUSCLES[r.m]}</b><span class="muted sm">${fmtV(r.total)} au total · ${fmtV(r.avg)} / sem.</span></div>
          <div class="sparkbars wide">${r.vals.map(v => `<i style="height:${v ? Math.max(8, v / max * 100) : 4}%" class="${v ? '' : 'zero'}"></i>`).join('')}</div>
          ${r.tr ? `<em class="tr ${r.tr}">${{ up: '↗', down: '↘', flat: '→' }[r.tr]}</em>` : '<em class="tr"></em>'}
        </div>`).join('')}</div>
        <p class="muted sm pad">Séries effectives : séries validées hors échauffement. Le muscle secondaire d'un exercice compte pour moitié.</p>`;
    },
    actions: {
      'mu-period': el => { S.musPeriod = el.dataset.v; renderPage(pg); },
      'mu-metric': el => { S.musMetric = el.dataset.v; renderPage(pg); }
    }
  });
};

/* ----- Statistiques ----- */
const PERIODS = { '30J': 30, '3M': 91, '6M': 182, '1A': 365 };
/** Période affichée (avec décalage ‹ › et période sur mesure) */
function statsRange() {
  if (S.statsCustom) {
    const f = parseDayKey(S.statsCustom.from).getTime(), e = addDays(parseDayKey(S.statsCustom.to), 1).getTime();
    const len = e - f;
    return { from: f - S.statsOffset * len, end: e - S.statsOffset * len, len };
  }
  const len = PERIODS[S.statsPeriod] * DAY;
  const end0 = addDays(startOfDay(Date.now()), 1).getTime();
  return { from: end0 - len - S.statsOffset * len, end: end0 - S.statsOffset * len, len };
}
const STAT_METRICS = {
  volume: { label: 'Volume', of: w => wStats(w).volume, fmt: v => fmtVol(v), axis: v => { v = toU(v); return v >= 1000 ? fmtNum(v / 1000, 0) + 'k' : fmtNum(v); }, conv: toU },
  reps: { label: 'Reps', of: w => w.exercises.reduce((a, ex) => a + (ex.sets || []).filter(s => s.completed && isWork(s)).reduce((b, s) => b + (s.reps || 0), 0), 0), fmt: v => fmtNum(v) + ' reps', axis: v => fmtNum(v), conv: v => v },
  duree: { label: 'Durée', of: w => (w.duration || 0), fmt: v => fmtDur(v), axis: v => fmtNum(v / 3600, 1) + 'h', conv: v => v }
};
ACTIONS['open-stats'] = () => {
  const pg = pushPage({
    title: 'Statistiques',
    render: () => {
      const { from, end, len } = statsRange();
      const prevFrom = from - len;
      const ws = workoutsBetween(from, end), pws = workoutsBetween(prevFrom, from);
      const M = STAT_METRICS[S.statsMetric];
      const tot = list => list.reduce((a, w) => a + M.of(w), 0);
      const cur = tot(ws), prv = tot(pws);
      const pct = prv ? (cur - prv) / prv * 100 : null;
      const sum = list => list.reduce((acc, w) => { const s = wStats(w); acc.sets += s.sets; acc.pr += s.pr; acc.dur += w.duration || 0; acc.vol += s.volume; return acc; }, { sets: 0, pr: 0, dur: 0, vol: 0 });
      const c = sum(ws), p = sum(pws);
      const volPct = p.vol ? (c.vol - p.vol) / p.vol * 100 : null;
      // Faits marquants
      const chips = [];
      if (ws.length) {
        const big = ws.reduce((b, w) => wStats(w).volume > wStats(b).volume ? w : b, ws[0]);
        chips.push(`💪 Record : plus gros entraînement (${fmtVol(wStats(big).volume)})`);
      }
      if (volPct != null) chips.push(`${volPct >= 0 ? '↑' : '↓'} ${volPct >= 0 ? '+' : ''}${fmtNum(volPct)} % de volume vs période précédente`);
      if (c.pr) chips.push(`🏆 ${c.pr} record${c.pr > 1 ? 's' : ''} battu${c.pr > 1 ? 's' : ''}`);
      if (ws.length) {
        const long = ws.reduce((b, w) => (w.duration || 0) > (b.duration || 0) ? w : b, ws[0]);
        chips.push(`⏱ Plus longue séance : ${fmtDur(long.duration)}`);
        const days = [0, 0, 0, 0, 0, 0, 0]; ws.forEach(w => days[new Date(w.startTime).getDay()]++);
        const fav = days.indexOf(Math.max(...days));
        chips.push(`📅 Jour préféré : ${DAYS_LONG[fav]}`);
      }
      // Courbes cumulées : période actuelle + précédente (alignée jour par jour)
      const cumul = (list, start) => {
        const byDay = {}; list.forEach(w => { const k = dayKey(w.startTime); byDay[k] = (byDay[k] || 0) + M.of(w); });
        let acc = 0; const pts = [];
        for (let d = new Date(start), i = 0; d.getTime() < start + len - 1000; d = addDays(d, 1), i++) {
          acc += byDay[dayKey(d)] || 0;
          pts.push({ x: from + i * DAY, y: M.conv(acc) });
        }
        return pts;
      };
      const curPts = cumul(ws, from), prevPts = cumul(pws, prevFrom);
      const today = Date.now();
      const curShown = curPts.filter(pt => pt.x <= today);
      // Muscles sur la période
      const ms = muscleSets(ws);
      const effWeeks = Math.max(1, len / (7 * DAY));
      const levels = Object.fromEntries(Object.keys(MUSCLES).map(m => [m, muscleLevel((ms[m] || 0) / effWeeks)]));
      const cats = {}; Object.entries(ms).forEach(([m, n]) => { const k = MUSCLE_CATEGORY[m]; if (k) cats[k] = (cats[k] || 0) + n; });
      const catList = Object.entries(cats).sort((a, b) => b[1] - a[1]);
      const catTotal = catList.reduce((a, x) => a + x[1], 0) || 1;
      const y1 = new Date(from).getFullYear() !== new Date(end - DAY).getFullYear() || new Date(from).getFullYear() !== new Date().getFullYear();
      const label = d => fmtDateShort(d) + (y1 ? ' ' + new Date(d).getFullYear() : '');
      return `
        <p class="page-sub">${label(from)} – ${label(end - DAY)}</p>
        <div class="per-nav">
          <button class="circle-btn sm" data-action="st-prev" aria-label="Période précédente">${ICON.chevL}</button>
          <div class="seg">${Object.keys(PERIODS).map(k => `<button class="${!S.statsCustom && S.statsPeriod === k ? 'on' : ''}" data-action="period" data-v="${k}">${k}</button>`).join('')}</div>
          <button class="circle-btn sm ${S.statsCustom ? 'on' : ''}" data-action="st-cal" aria-label="Période sur mesure">${ICON.cal}</button>
          <button class="circle-btn sm" data-action="st-next" aria-label="Période suivante" ${S.statsOffset === 0 ? 'disabled' : ''}>${ICON.chevR}</button>
        </div>
        ${chips.length ? `<div class="chips scroll-x hl-chips">${chips.map(t => `<span class="hl-chip">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="card">${monthCalendars(from, end)}
          <div class="cal-legend"><span><i class="c1"></i>1 entraînement</span><span><i class="c2"></i>2 entraînements</span><span><i class="c3"></i>3+ entraînements</span></div></div>
        <div class="card">
          <h3 class="card-title">Résumé d'activité</h3>
          <div class="sum-big"><div><b>${M.fmt(cur)}</b>${pct == null ? '' : `<span class="delta ${pct >= 0 ? 'up' : 'down'}">${pct >= 0 ? '↑ +' : '↓ '}${fmtNum(pct)} %</span>`}</div>
            <span class="prev-lbl"><i></i>Précédent : ${M.fmt(prv)}</span></div>
          <div class="tabs-line">${Object.entries(STAT_METRICS).map(([k, m]) => `<button class="${S.statsMetric === k ? 'on' : ''}" data-action="st-metric" data-v="${k}">${m.label}</button>`).join('')}</div>
          ${cur || prv ? lineChart([
            { color: 'var(--text-2)', points: prevPts, width: 1.6, opacity: .55, noEnd: true },
            { color: 'var(--accent)', points: curShown.length > 1 ? curShown : curPts, area: true }
          ], { yFmt: M.axis, yMin0: true }) : '<p class="empty-sm">Aucune donnée sur ces deux périodes.</p>'}
        </div>
        <div class="card">
          <div class="card-head"><h3 class="card-title">Muscles travaillés</h3><span class="mono-sm">${Math.round(len / DAY)} J</span></div>
          <div class="body-maps"><figure>${bodySvg('front', levels)}<figcaption>FACE</figcaption></figure><figure>${bodySvg('back', levels)}<figcaption>DOS</figcaption></figure></div>
          <div class="sum-legend"><span>Moins de séries</span><i></i><span>Plus de séries</span></div>
          ${catList.map(([k, n]) => `<div class="hbar"><span>${k}</span><div class="hbar-track"><i style="width:${n / catList[0][1] * 100}%"></i></div><b>${fmtNum(n / catTotal * 100)} %</b></div>`).join('')}
        </div>
        <div class="stat-grid">
          <div class="card stat"><span>Séances</span><b>${ws.length}</b>${p.sets || pws.length ? `<span class="muted sm">préc. ${pws.length}</span>` : ''}</div>
          <div class="card stat"><span>Séries</span><b>${c.sets}</b><span class="muted sm">préc. ${p.sets}</span></div>
          <div class="card stat"><span>Temps total</span><b>${fmtDur(c.dur)}</b><span class="muted sm">préc. ${fmtDur(p.dur)}</span></div>
          <div class="card stat"><span>Durée moyenne</span><b>${ws.length ? fmtDur(c.dur / ws.length) : '—'}</b></div>
        </div>`;
    },
    actions: {
      period: el => { S.statsPeriod = el.dataset.v; S.statsCustom = null; S.statsOffset = 0; renderPage(pg); },
      'st-prev': () => { S.statsOffset++; renderPage(pg); },
      'st-next': () => { if (S.statsOffset > 0) { S.statsOffset--; renderPage(pg); } },
      'st-metric': el => { S.statsMetric = el.dataset.v; renderPage(pg); },
      'st-cal': () => {
        const r = statsRange();
        const d = { from: dayKey(r.from), to: dayKey(r.end - DAY) };
        const sh = openSheet({
          html: `<div class="dialog left"><h3>Période sur mesure</h3>
            <div class="row2"><div><label class="lbl">Du</label><input class="field" type="date" data-input="sc-from" value="${d.from}" max="${dayKey(Date.now())}"></div>
            <div><label class="lbl">Au</label><input class="field" type="date" data-input="sc-to" value="${d.to}" max="${dayKey(Date.now())}"></div></div>
            <button class="btn-primary" data-action="sc-ok">Afficher</button>
            ${S.statsCustom ? '<button class="btn-plain" data-action="sc-reset">Revenir aux périodes standard</button>' : '<button class="btn-plain" data-action="sheet-close">Annuler</button>'}</div>`,
          inputs: { 'sc-from': el => { d.from = el.value; }, 'sc-to': el => { d.to = el.value; } },
          actions: {
            'sc-ok': () => {
              if (!d.from || !d.to || d.from > d.to) { toast('Choisis une date de début avant la date de fin'); return; }
              S.statsCustom = { ...d }; S.statsOffset = 0; sh.close(); renderPage(pg);
            },
            'sc-reset': () => { S.statsCustom = null; S.statsOffset = 0; sh.close(); renderPage(pg); }
          }
        });
      }
    }
  });
};

/** Calendriers mensuels de la période (pastilles selon le nombre d'entraînements) */
function monthCalendars(from, end) {
  const count = {};
  workoutsBetween(from, end).forEach(w => { const k = dayKey(w.startTime); count[k] = (count[k] || 0) + 1; });
  const months = [];
  for (let m = new Date(new Date(from).getFullYear(), new Date(from).getMonth(), 1); m.getTime() < end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) months.push(m);
  const fromK = dayKey(from), endK = dayKey(end - DAY);
  return `<div class="months ${months.length > 2 ? 'many' : ''}">${months.map(m => {
    const y = m.getFullYear(), mo = m.getMonth();
    const off = (m.getDay() + 6) % 7, n = new Date(y, mo + 1, 0).getDate();
    let cells = '<i class="mc mc-e"></i>'.repeat(off);
    for (let d = 1; d <= n; d++) {
      const k = dayKey(new Date(y, mo, d));
      const c = count[k] || 0;
      cells += `<i class="mc c${Math.min(3, c)} ${k < fromK || k > endK ? 'out' : ''}" title="${d} ${MONTHS_SHORT[mo]} : ${c} entraînement${c > 1 ? 's' : ''}"></i>`;
    }
    return `<div class="month"><span class="month-t">${MONTHS_SHORT[mo]} ${y}</span>
      <div class="mgrid">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span>${x}</span>`).join('')}${cells}</div></div>`;
  }).join('')}</div>`;
}

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
        ${exThumb(r.e)}<span class="ex-row-txt"><b>${esc(r.e.name)}</b><span class="muted sm">${fmtW(r.best.best.weight)} × ${r.best.best.reps} · ${fmtDateShort(r.best.w.startTime)}</span></span>
        <span class="rec-val"><b>${fmtW(r.best.e1rm, 1)}</b><small>${unit()} 1RM</small></span></button>`).join('')}</div>`;
  }
});

/* ----- Mesures (mensurations + photos) ----- */
ICON.cal = svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>');
ICON.camera = svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>');

/** Mesures prédéfinies (les 4 dernières sont masquées par défaut) */
const MEAS_DEFAULT = [
  { k: 'weight', label: 'Poids', unit: 'kg', color: '#1FA855' },
  { k: 'bodyFat', label: 'Masse grasse', unit: '%', color: '#3E6FD8' },
  { k: 'waist', label: 'Tour de taille', unit: 'cm', color: '#B58A1E' },
  { k: 'arms', label: 'Tour de bras', unit: 'cm', color: '#9461D9' },
  { k: 'chest', label: 'Tour de poitrine', unit: 'cm', color: '#E0445A' },
  { k: 'thighs', label: 'Tour de cuisse', unit: 'cm', color: '#E07B1F' },
  { k: 'hips', label: 'Tour de hanches', unit: 'cm', color: '#1797A6' },
  { k: 'height', label: 'Taille', unit: 'cm', color: '#7C7C84' },
  { k: 'neck', label: 'Tour de cou', unit: 'cm', color: '#5B8C2A' },
  { k: 'shoulders', label: 'Tour d\'épaules', unit: 'cm', color: '#C2479B' },
  { k: 'calves', label: 'Tour de mollet', unit: 'cm', color: '#3A9E8F' },
  { k: 'forearms', label: 'Tour d\'avant-bras', unit: 'cm', color: '#8A6A4F' }
];
const MEAS_HIDDEN_DEFAULT = ['neck', 'shoulders', 'calves', 'forearms'];
const MEAS_PIN_DEFAULT = ['weight', 'bodyFat', 'waist', 'arms'];
const CUSTOM_COLORS = ['#D9534F', '#2E86AB', '#8E44AD', '#16A085', '#D35400', '#2C3E50'];
/** Styles de courbe : trait + marqueur, pour distinguer les mesures sans compter sur la couleur */
const LINE_STYLES = [
  { dash: '', marker: 'circle' }, { dash: '7 4', marker: 'square' }, { dash: '2 4', marker: 'triangle' },
  { dash: '9 3 2 3', marker: 'diamond' }, { dash: '', marker: 'square' }, { dash: '5 5', marker: 'circle' }
];
const MEAS_PERIODS = { '1 mois': 31, '3 mois': 92, '6 mois': 183, 'Tout': 99999 };

const allMeas = () => [...MEAS_DEFAULT, ...(S.settings.customMeas || [])];
const visibleMeas = () => { const h = S.settings.measHidden ?? MEAS_HIDDEN_DEFAULT; return allMeas().filter(d => !h.includes(d.k)); };
const pinnedMeas = () => (S.settings.measPinned ?? MEAS_PIN_DEFAULT).map(k => allMeas().find(d => d.k === k)).filter(Boolean);
const measSorted = () => [...S.data.measurements].sort((a, b) => a.date.localeCompare(b.date));
const fmtDateY = k => { const d = parseDayKey(k); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`; };

function markerSvg(x, y, type, color, r = 3.2) {
  const st = `fill="${color}" stroke="var(--card)" stroke-width="1"`;
  if (type === 'square') return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" ${st}/>`;
  if (type === 'triangle') return `<path d="M${x} ${y - r * 1.2}L${x + r * 1.1} ${y + r * .9}L${x - r * 1.1} ${y + r * .9}Z" ${st}/>`;
  if (type === 'diamond') return `<path d="M${x} ${y - r * 1.25}L${x + r * 1.1} ${y}L${x} ${y + r * 1.25}L${x - r * 1.1} ${y}Z" ${st}/>`;
  return `<circle cx="${x}" cy="${y}" r="${r}" ${st}/>`;
}
function lineIcon(color, style) {
  return `<svg viewBox="0 0 30 10" class="lg-ic"><line x1="1" y1="5" x2="29" y2="5" stroke="${color}" stroke-width="2" ${style.dash ? `stroke-dasharray="${style.dash}"` : ''}/>${markerSvg(15, 5, style.marker, color, 3)}</svg>`;
}
/** Écart en unité (« pt » pour un pourcentage) et en % */
function measDelta(def, a, b) {
  const d = b - a, p = a ? d / a * 100 : 0;
  const sign = v => (v > 0 ? '+' : '') + fmtNum(v, 1);
  return `${sign(d)} ${def.unit === '%' ? 'pt' : def.unit} · ${sign(p)} %`;
}

let photosCache = null;
async function loadPhotos() { if (!photosCache) { try { photosCache = await DB.getAll('photos'); } catch (e) { photosCache = []; } } return photosCache; }
const photosSorted = () => [...(photosCache || [])].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

ACTIONS['open-measures'] = async () => {
  await loadPhotos();
  const pg = pushPage({
    title: 'Mesures',
    right: `<button class="icon-btn" data-action="m-add" aria-label="Ajouter un relevé">${ICON.plus}</button>`,
    render: () => {
      const all = measSorted();
      const fromKey = dayKey(Date.now() - MEAS_PERIODS[S.measPeriod] * DAY);
      const inP = all.filter(m => m.date >= fromKey);
      const pins = pinnedMeas();
      const series = pins.map((def, i) => {
        const pts = inP.filter(m => m[def.k] != null);
        if (!pts.length) return null;
        const base = pts[0][def.k], st = LINE_STYLES[i % LINE_STYLES.length];
        return { color: def.color, dash: st.dash, marker: st.marker, width: 2, noEnd: true, points: pts.map(m => ({ x: parseDayKey(m.date).getTime(), y: base ? (m[def.k] - base) / base * 100 : 0 })) };
      }).filter(Boolean);
      const legend = pins.map((def, i) => {
        const pts = inP.filter(m => m[def.k] != null), allPts = all.filter(m => m[def.k] != null);
        const last = allPts[allPts.length - 1];
        return `<div class="lg-item">
          <span class="lg-name">${lineIcon(def.color, LINE_STYLES[i % LINE_STYLES.length])}${esc(def.label)}</span>
          <b>${last ? fmtNum(last[def.k], 1) : '—'}<small> ${esc(def.unit)}</small></b>
          <span class="muted sm">${pts.length > 1 ? measDelta(def, pts[0][def.k], pts[pts.length - 1][def.k]) : 'Pas assez de relevés'}</span>
          <span class="muted sm">${last ? fmtDateY(last.date) : '—'}</span>
        </div>`;
      }).join('');
      const vis = visibleMeas();
      const photos = photosSorted();
      return `
        <p class="page-sub">Ton suivi corporel</p>
        <button class="btn-primary" data-action="m-add">${ICON.plus} Ajouter un relevé</button>
        <div class="card">
          <div class="card-head"><div><h3 class="card-title" style="margin:0">Évolution</h3><span class="muted sm">${pins.length} mesure${pins.length > 1 ? 's' : ''} épinglée${pins.length > 1 ? 's' : ''}</span></div>
            <button class="link-btn u" data-action="m-pins">Modifier</button></div>
          <div class="seg sm">${Object.keys(MEAS_PERIODS).map(p => `<button class="${S.measPeriod === p ? 'on' : ''}" data-action="m-period" data-v="${p}">${p}</button>`).join('')}</div>
          <p class="muted sm">Variation relative (%)</p>
          ${series.some(s => s.points.length > 1) ? lineChart(series, { yFmt: v => `${fmtNum(v, 1)} %`, zero: true }) : '<p class="empty-sm">Au moins deux relevés sont nécessaires sur la période pour tracer une courbe.</p>'}
          <p class="muted sm">0 % = premier relevé de chaque mesure dans la période</p>
          <div class="lg-grid">${legend}</div>
          <button class="link-btn muted-link" data-action="m-explain">Comprendre la comparaison</button>
        </div>
        <button class="row-link tap" data-action="m-all"><span>Toutes les mesures</span><span class="muted sm">${all.length} relevé${all.length > 1 ? 's' : ''}</span>${ICON.chevR}</button>
        <div class="section-head"><h2 class="cond">Mes mensurations</h2><button class="link-btn u" data-action="m-custom">Personnaliser</button></div>
        <div class="card list-card">${vis.map(def => {
          const vals = all.filter(m => m[def.k] != null), last = vals[vals.length - 1], prev = vals[vals.length - 2];
          return `<button class="meas-row2 tap" data-action="m-detail" data-k="${def.k}"><i style="background:${def.color}"></i>
            <span class="mr-txt"><b>${esc(def.label)}</b><span class="muted sm">${last ? fmtDateY(last.date) : 'Aucun relevé'}</span></span>
            <span class="mr-val"><b>${last ? fmtNum(last[def.k], 1) : '—'}<small> ${esc(def.unit)}</small></b>${last && prev ? `<span class="muted sm">${measDelta(def, prev[def.k], last[def.k]).split(' · ')[0]}</span>` : ''}</span>${ICON.chevR}</button>`;
        }).join('')}</div>
        <div class="section-head"><h2 class="cond">Photos avant / après</h2>${photos.length ? `<button class="link-btn strong" data-action="ph-all">Tout voir ›</button>` : ''}</div>
        <div class="card">
          ${photos.length ? `<div class="ph-strip">${photos.slice(-6).reverse().map(ph => `<button class="ph-thumb" data-action="ph-view" data-id="${ph.id}"><img src="${ph.data}" alt="" loading="lazy"><span>${fmtDateShort(parseDayKey(ph.date))}</span></button>`).join('')}</div>` : '<p class="empty-sm">Ajoute une photo pour suivre ta transformation. Elles restent uniquement sur ce téléphone.</p>'}
          <div class="row-actions" style="margin-top:12px">
            <label class="btn-soft" for="ph-file">${ICON.camera}<span>Ajouter</span></label>
            <button class="btn-soft" data-action="ph-compare" ${photos.length < 2 ? 'disabled' : ''}>${ICON.chart}<span>Comparer</span></button>
          </div>
          <input type="file" id="ph-file" accept="image/*" data-change="ph-file" hidden>
        </div>`;
    },
    changes: { 'ph-file': async el => { await addPhotoFromFile(el.files[0]); el.value = ''; renderPage(pg); } },
    actions: {
      'm-add': () => openMeasureForm(null, () => renderPage(pg)),
      'm-period': el => { S.measPeriod = el.dataset.v; renderPage(pg); },
      'm-pins': () => openPinsSheet(() => renderPage(pg)),
      'm-custom': () => openCustomMeasSheet(() => renderPage(pg)),
      'm-detail': el => openMeasureDetail(el.dataset.k, () => renderPage(pg)),
      'm-all': () => openAllMeasures(() => renderPage(pg)),
      'm-explain': () => openSheet({ html: `<div class="dialog left"><h3>Comprendre la comparaison</h3>
        <p>Le graphique compare des mesures d'unités différentes (kg, %, cm). Pour les mettre sur la même échelle, chaque courbe part de <b>0 %</b> : c'est le premier relevé de cette mesure dans la période choisie.</p>
        <p>Ensuite, chaque point indique l'écart <b>en pourcentage</b> par rapport à ce premier relevé. Exemple : un tour de taille qui passe de 84 à 81 cm affiche −3,6 %.</p>
        <p>Sous le graphique, l'écart est donné en unité (kg, cm, ou « pt » pour la masse grasse) puis en %.</p>
        <button class="btn-primary" data-action="sheet-close">Compris</button></div>` }),
      'ph-all': () => openPhotosPage(() => renderPage(pg)),
      'ph-view': el => openPhotoViewer(el.dataset.id, () => renderPage(pg)),
      'ph-compare': () => openPhotoCompare()
    }
  });
};

/** Choix des mesures épinglées sur le graphique */
function openPinsSheet(onDone) {
  const sel = [...(S.settings.measPinned ?? MEAS_PIN_DEFAULT)];
  const body = () => `<div class="dialog left"><h3>Mesures épinglées</h3><p class="muted sm">Jusqu'à 6 mesures sur le graphique.</p>
    <div class="opt-list">${visibleMeas().map(d => `<button class="opt check-opt ${sel.includes(d.k) ? 'on' : ''}" data-action="pin-t" data-k="${d.k}"><i style="background:${d.color}"></i><span>${esc(d.label)}</span>${sel.includes(d.k) ? ICON.check : ''}</button>`).join('')}</div>
    <button class="btn-primary" data-action="pin-ok">Enregistrer</button></div>`;
  const sh = openSheet({
    html: body(),
    actions: {
      'pin-t': el => { const k = el.dataset.k, i = sel.indexOf(k); if (i >= 0) sel.splice(i, 1); else if (sel.length < 6) sel.push(k); else toast('6 mesures maximum'); sh.set(body()); },
      'pin-ok': async () => { S.settings.measPinned = sel; await saveSettings(); sh.close(); onDone(); }
    }
  });
}

/** Personnaliser : afficher / masquer les mesures, créer les siennes */
function openCustomMeasSheet(onDone) {
  const hidden = [...(S.settings.measHidden ?? MEAS_HIDDEN_DEFAULT)];
  const custom = [...(S.settings.customMeas || [])];
  const body = () => `<div class="dialog left"><h3>Mes mensurations</h3>
    <p class="muted sm">Coche les mesures à suivre. Tu peux aussi créer les tiennes (bras droit / gauche, mollet…).</p>
    <div class="opt-list">${[...MEAS_DEFAULT, ...custom].map(d => `<div class="opt check-opt ${hidden.includes(d.k) ? '' : 'on'}">
      <button class="co-main" data-action="cm-t" data-k="${d.k}"><i style="background:${d.color}"></i><span>${esc(d.label)} <small class="muted">${esc(d.unit)}</small></span>${hidden.includes(d.k) ? '' : ICON.check}</button>
      ${d.k.startsWith('c_') ? `<button class="co-del" data-action="cm-del" data-k="${d.k}" aria-label="Supprimer">${ICON.trash}</button>` : ''}</div>`).join('')}</div>
    <button class="btn-soft wide" data-action="cm-new">${ICON.plus}<span>Nouvelle mesure</span></button>
    <button class="btn-primary" data-action="cm-ok">Enregistrer</button></div>`;
  const sh = openSheet({
    html: body(),
    actions: {
      'cm-t': el => { const k = el.dataset.k, i = hidden.indexOf(k); if (i >= 0) hidden.splice(i, 1); else hidden.push(k); sh.set(body()); },
      'cm-del': async el => {
        const k = el.dataset.k;
        const used = S.data.measurements.some(m => m[k] != null);
        if (used && !await confirmSheet('Supprimer cette mesure ?', 'Ses valeurs seront retirées de tous tes relevés.', 'Supprimer', true)) return;
        custom.splice(custom.findIndex(c => c.k === k), 1);
        if (used) { const changed = S.data.measurements.filter(m => m[k] != null); changed.forEach(m => { delete m[k]; }); await DB.putMany('measurements', changed); }
        sh.set(body());
      },
      'cm-new': async () => {
        const label = await inputSheet('Nom de la mesure', '', 'Ex. : Bras droit', 'Continuer');
        if (!label) return;
        const sh2 = openSheet({
          html: `<div class="dialog"><h3>Unité de « ${esc(label)} »</h3><div class="grid-opts two">${['cm', 'kg', '%', 'mm'].map(u => `<button class="opt-pill" data-action="u" data-v="${u}">${u}</button>`).join('')}</div></div>`,
          actions: { u: el => { custom.push({ k: 'c_' + uid(), label, unit: el.dataset.v, color: CUSTOM_COLORS[custom.length % CUSTOM_COLORS.length] }); sh2.close(); sh.set(body()); } }
        });
      },
      'cm-ok': async () => {
        S.settings.customMeas = custom; S.settings.measHidden = hidden;
        S.settings.measPinned = (S.settings.measPinned ?? MEAS_PIN_DEFAULT).filter(k => allMeas().some(d => d.k === k) && !hidden.includes(k));
        await saveSettings(); sh.close(); onDone();
      }
    }
  });
}

/** Détail d'une mesure : valeurs absolues + historique */
function openMeasureDetail(k, onChange) {
  const pg = pushPage({
    title: () => allMeas().find(d => d.k === k)?.label || 'Mesure',
    render: () => {
      const def = allMeas().find(d => d.k === k);
      if (!def) return emptyState(ICON.ruler, 'Mesure supprimée.');
      const vals = measSorted().filter(m => m[k] != null);
      if (!vals.length) return emptyState(ICON.ruler, 'Aucun relevé pour cette mesure.', '<button class="btn-primary inline" data-action="m-add">Ajouter un relevé</button>');
      const nums = vals.map(m => m[k]);
      const first = vals[0], last = vals[vals.length - 1];
      return `
        <div class="stat-grid">
          <div class="card stat"><span>Actuel</span><b>${fmtNum(last[k], 1)}<small> ${esc(def.unit)}</small></b><span class="muted sm">${fmtDateY(last.date)}</span></div>
          <div class="card stat"><span>Depuis le début</span><b style="font-size:17px">${vals.length > 1 ? measDelta(def, first[k], last[k]).replace(' · ', '<br>') : '—'}</b></div>
          <div class="card stat"><span>Minimum</span><b>${fmtNum(Math.min(...nums), 1)}<small> ${esc(def.unit)}</small></b></div>
          <div class="card stat"><span>Maximum</span><b>${fmtNum(Math.max(...nums), 1)}<small> ${esc(def.unit)}</small></b></div>
        </div>
        ${vals.length > 1 ? `<div class="card">${lineChart([{ color: def.color, marker: 'circle', area: true, points: vals.map(m => ({ x: parseDayKey(m.date).getTime(), y: m[k] })) }], { yFmt: v => fmtNum(v, 1) })}</div>` : ''}
        <div class="section-head"><h2 class="cond">Historique</h2></div>
        <div class="card list-card">${[...vals].reverse().map((m, i, arr) => `<button class="meas-row2 tap" data-action="m-edit" data-id="${m.id}">
          <span class="mr-txt"><b>${fmtDateY(m.date)}</b></span>
          <span class="mr-val"><b>${fmtNum(m[k], 1)}<small> ${esc(def.unit)}</small></b>${arr[i + 1] ? `<span class="muted sm">${measDelta(def, arr[i + 1][k], m[k]).split(' · ')[0]}</span>` : ''}</span>${ICON.chevR}</button>`).join('')}</div>`;
    },
    actions: {
      'm-add': () => openMeasureForm(null, () => { renderPage(pg); onChange(); }),
      'm-edit': el => openMeasureForm(el.dataset.id, () => { renderPage(pg); onChange(); })
    }
  });
}

/** Tous les relevés */
function openAllMeasures(onChange) {
  const pg = pushPage({
    title: 'Toutes les mesures',
    render: () => {
      const all = measSorted();
      if (!all.length) return emptyState(ICON.ruler, 'Aucun relevé pour l\'instant.');
      return `<div class="card list-card">${[...all].reverse().map(m => `<button class="meas-row tap" data-action="m-edit" data-id="${m.id}">
        <b>${cap(fmtDateLong(parseDayKey(m.date)))} ${parseDayKey(m.date).getFullYear()}</b>
        <span class="muted sm">${allMeas().filter(d => m[d.k] != null).map(d => `${esc(d.label)} ${fmtNum(m[d.k], 1)} ${esc(d.unit)}`).join(' · ')}</span></button>`).join('')}</div>`;
    },
    actions: { 'm-edit': el => openMeasureForm(el.dataset.id, () => { renderPage(pg); onChange(); }) }
  });
}

/** Formulaire d'un relevé (mesures visibles + mesures déjà renseignées) */
function openMeasureForm(id, onDone) {
  const src = id ? S.data.measurements.find(m => m.id === id) : null;
  const last = {};
  measSorted().forEach(m => allMeas().forEach(d => { if (m[d.k] != null) last[d.k] = m[d.k]; }));
  const d = src ? { ...src } : { id: uid(), date: dayKey(Date.now()) };
  const defs = allMeas().filter(x => visibleMeas().includes(x) || (src && src[x.k] != null));
  const sh = openSheet({
    full: true,
    html: `<div class="sheet-top"><button class="link-btn" data-action="sheet-close">Annuler</button><h3>${src ? 'Modifier le relevé' : 'Nouveau relevé'}</h3><button class="link-btn strong" data-action="m-save">OK</button></div>
      <label class="lbl">Date</label><input class="field" type="date" data-input="m-date" value="${d.date}" max="${dayKey(Date.now())}">
      <div class="card list-card form-list">${defs.map(def => `<label class="form-row"><span>${esc(def.label)}</span>
        <input inputmode="decimal" data-input="m-val" data-k="${def.k}" value="${d[def.k] != null ? String(d[def.k]).replace('.', ',') : ''}" placeholder="${last[def.k] != null ? fmtNum(last[def.k], 1) : '—'}"><em>${esc(def.unit)}</em></label>`).join('')}</div>
      <p class="muted sm pad">Les champs vides ne sont pas enregistrés. Ajoute d'autres mesures avec « Personnaliser ».</p>
      <button class="btn-primary" data-action="m-save">Enregistrer</button>
      ${src ? '<button class="btn-plain danger" data-action="m-del">Supprimer ce relevé</button>' : ''}`,
    inputs: {
      'm-date': el => { d.date = el.value; },
      'm-val': el => { d[el.dataset.k] = parseNum(el.value); }
    },
    actions: {
      'm-save': async () => {
        if (!d.date) { toast('Choisis une date'); return; }
        if (!allMeas().some(def => d[def.k] != null)) { toast('Saisis au moins une valeur'); return; }
        allMeas().forEach(def => { if (d[def.k] == null) delete d[def.k]; });
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

/* ----- Photos avant / après (stockées uniquement sur le téléphone) ----- */
/** Redimensionne la photo (1280 px max) et la compresse en JPEG */
function fileToDataURL(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}
async function addPhotoFromFile(file) {
  if (!file) return;
  try {
    toast('Ajout de la photo…');
    const data = await fileToDataURL(file);
    const ph = { id: uid(), date: dayKey(Date.now()), data, createdAt: Date.now() };
    await DB.put('photos', ph);
    (await loadPhotos()).push(ph);
    toast('Photo ajoutée');
  } catch (e) { toast('Impossible de lire cette photo'); }
}
function openPhotosPage(onChange) {
  const pg = pushPage({
    title: 'Photos',
    right: `<label class="icon-btn" for="ph-file2" aria-label="Ajouter une photo">${ICON.plus}</label>`,
    render: () => {
      const list = photosSorted().reverse();
      const byDate = {};
      list.forEach(p => (byDate[p.date] ||= []).push(p));
      return `<input type="file" id="ph-file2" accept="image/*" data-change="ph-file" hidden>
        ${list.length >= 2 ? `<button class="btn-primary" data-action="ph-compare">${ICON.chart} Comparer avant / après</button>` : ''}
        ${Object.entries(byDate).map(([k, ps]) => `<div class="day-head"><h3>${fmtDateY(k).toUpperCase()}</h3><span class="mono-sm">${ps.length} photo${ps.length > 1 ? 's' : ''}</span></div>
          <div class="ph-grid">${ps.map(p => `<button class="ph-thumb" data-action="ph-view" data-id="${p.id}"><img src="${p.data}" alt="" loading="lazy"></button>`).join('')}</div>`).join('') || emptyState(ICON.camera, 'Aucune photo.')}`;
    },
    changes: { 'ph-file': async el => { await addPhotoFromFile(el.files[0]); el.value = ''; renderPage(pg); onChange(); } },
    actions: {
      'ph-view': el => openPhotoViewer(el.dataset.id, () => { renderPage(pg); onChange(); }),
      'ph-compare': () => openPhotoCompare()
    }
  });
}
function openPhotoViewer(id, onChange) {
  const ph = (photosCache || []).find(p => p.id === id); if (!ph) return;
  const sh = openSheet({
    full: true,
    html: `<div class="sheet-top"><span></span><h3>${fmtDateY(ph.date)}</h3><button class="link-btn strong" data-action="sheet-close">OK</button></div>
      <img class="ph-full" src="${ph.data}" alt="">
      <label class="lbl">Date de la photo</label><input class="field" type="date" data-input="pv-date" value="${ph.date}" max="${dayKey(Date.now())}">
      <button class="btn-plain danger" data-action="pv-del">Supprimer la photo</button>`,
    inputs: { 'pv-date': async el => { if (!el.value) return; ph.date = el.value; await DB.put('photos', ph); onChange(); } },
    actions: {
      'pv-del': async () => {
        if (!await confirmSheet('Supprimer cette photo ?', 'Elle sera effacée de ce téléphone.', 'Supprimer', true)) return;
        await DB.del('photos', id);
        photosCache = photosCache.filter(p => p.id !== id);
        sh.close(); onChange();
      }
    }
  });
}
/** Comparaison côte à côte : touche « Avant » ou « Après », puis une miniature */
function openPhotoCompare() {
  const list = photosSorted();
  if (list.length < 2) return;
  const st = { a: list[0].id, b: list[list.length - 1].id, target: 'a' };
  const get = id => list.find(p => p.id === id);
  const body = () => {
    const A = get(st.a), B = get(st.b);
    const days = Math.round((parseDayKey(B.date) - parseDayKey(A.date)) / DAY);
    return `<div class="sheet-top"><span></span><h3>Avant / après</h3><button class="link-btn strong" data-action="sheet-close">OK</button></div>
      <div class="cmp">${[['a', 'AVANT', A], ['b', 'APRÈS', B]].map(([k, l, p]) => `<button class="cmp-col ${st.target === k ? 'on' : ''}" data-action="cmp-target" data-v="${k}">
        <span class="cmp-l">${l}</span><img src="${p.data}" alt=""><span class="cmp-d">${fmtDateY(p.date)}</span></button>`).join('')}</div>
      <p class="muted sm center">${days > 0 ? `${days} jours d'écart` : days < 0 ? `${-days} jours d'écart` : 'Même jour'} · touche « Avant » ou « Après » puis choisis une photo</p>
      <div class="ph-strip">${[...list].reverse().map(p => `<button class="ph-thumb ${p.id === st.a || p.id === st.b ? 'sel' : ''}" data-action="cmp-pick" data-id="${p.id}"><img src="${p.data}" alt="" loading="lazy"><span>${fmtDateShort(parseDayKey(p.date))}</span></button>`).join('')}</div>`;
  };
  const sh = openSheet({
    full: true, html: body(),
    actions: {
      'cmp-target': el => { st.target = el.dataset.v; sh.set(body()); },
      'cmp-pick': el => { st[st.target] = el.dataset.id; st.target = st.target === 'a' ? 'b' : 'a'; sh.set(body()); }
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
          <button class="set-row-btn" data-action="s-rest-auto"><span>Lancer le repos automatiquement</span><b>${S.settings.restAuto !== false ? 'Oui' : 'Non'}</b></button>
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
        <div class="section-head"><h2>Application</h2></div>
        <div class="card list-card">
          <div class="set-row-btn"><span>Version</span><b>${APP_VERSION}</b></div>
          <button class="set-row-btn" data-action="s-check"><span>Rechercher une mise à jour</span>${ICON.chevR}</button>
          <button class="set-row-btn" data-action="s-force"><span>Forcer la mise à jour</span>${ICON.chevR}</button>
        </div>
        <p class="muted sm pad">« Forcer la mise à jour » recharge l'app depuis Internet. Tes séances et mensurations sont conservées.</p>
        <p class="muted sm pad">Stockage : ${DB.mode === 'indexedDB' ? 'IndexedDB' : 'localStorage (repli)'} · ${S.data.workouts.length} séances · ${S.data.exercises.length} exercices.<br>
        Toutes tes données restent sur cet appareil. Pense à exporter une sauvegarde de temps en temps.</p>
        <p class="muted sm pad">Astuce iPhone : dans Safari, touche Partager puis « Sur l'écran d'accueil » pour installer GymLog en plein écran.</p>`;
    },
    inputs: {
      's-name': async el => { S.settings.profileName = el.value; await saveSettings(); renderTab(); },
      's-goal': async el => { S.settings.weeklyGoal = +el.value; await saveSettings(); renderTab(); },
      's-units': async el => { S.settings.units = el.value; await saveSettings(); refreshAll(); if (S.active) renderWorkout(); }
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
      's-rest-auto': async () => { S.settings.restAuto = !(S.settings.restAuto !== false); await saveSettings(); renderPage(pg); },
      's-export': exportBackup,
      's-check': async () => {
        if (!navigator.onLine) { toast('Pas de connexion Internet'); return; }
        toast('Recherche de mise à jour…');
        await checkForUpdate(true);
        setTimeout(() => toast(`Tu as la dernière version (${APP_VERSION})`), 2500);
      },
      's-force': async () => {
        if (!navigator.onLine) { toast('Connecte-toi à Internet d\'abord'); return; }
        if (!await confirmSheet('Forcer la mise à jour ?', 'L\'app va se recharger depuis Internet. Tes données sont conservées.', 'Mettre à jour')) return;
        forceUpdate();
      },
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

async function exportBackup() {
  const data = { app: 'GymLog', version: 2, exportedAt: new Date().toISOString(), settings: S.settings, ...S.data, photos: await loadPhotos() };
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
    for (const st of ['exercises', 'workouts', 'templates', 'folders', 'measurements', 'photos']) {
      await DB.clear(st);
      await DB.putMany(st, Array.isArray(data[st]) ? data[st] : []);
    }
    if (data.settings) await DB.put('settings', { ...data.settings, id: 'main' });
    location.reload();
  } catch (e) { toast('Fichier de sauvegarde invalide'); }
}

/* ===================== 10. GRAPHIQUES SVG ================================ */
/**
 * Courbe(s) responsive.
 * series = [{ color, points:[{x (timestamp), y, rec?}], area?, dash?, marker?, width?, opacity?, noEnd? }]
 *  - area : remplissage dégradé sous la courbe
 *  - dash : pointillés (ex. '6 4') ; marker : 'circle' | 'square' | 'triangle' | 'diamond' sur chaque point
 *  - points marqués rec: true -> point violet « record »
 * options : yFmt (format des valeurs), zero (inclure la ligne 0), yMin0 (axe qui part de 0)
 */
function lineChart(series, { h = 170, w = 340, yFmt = v => v, zero = false, yMin0 = false, area = false } = {}) {
  const all = series.flatMap(s => s.points);
  if (all.length < 2) return '<p class="empty-sm">Pas assez de données.</p>';
  let minX = Math.min(...all.map(p => p.x)), maxX = Math.max(...all.map(p => p.x));
  let minY = Math.min(...all.map(p => p.y)), maxY = Math.max(...all.map(p => p.y));
  if (zero) { minY = Math.min(minY, 0); maxY = Math.max(maxY, 0); }
  if (yMin0) minY = Math.min(minY, 0);
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const pad = (maxY - minY) * 0.1;
  if (!(yMin0 && minY === 0)) minY -= pad;
  maxY += pad;
  if (maxX === minX) maxX = minX + DAY;
  const pl = 42, pr = 10, pt = 10, pb = 22;
  const sx = x => pl + (x - minX) / (maxX - minX) * (w - pl - pr);
  const sy = y => pt + (1 - (y - minY) / (maxY - minY)) * (h - pt - pb);
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  let out = `<svg class="chart" viewBox="0 0 ${w} ${h}">`;
  for (let i = 0; i <= 4; i++) {
    const v = minY + (maxY - minY) * i / 4, y = sy(v);
    out += `<line x1="${pl}" x2="${w - pr}" y1="${y}" y2="${y}" class="grid"/><text x="${pl - 6}" y="${y + 3}" text-anchor="end" class="axis">${esc(yFmt(v))}</text>`;
  }
  if (zero && minY < 0 && maxY > 0) out += `<line x1="${pl}" x2="${w - pr}" y1="${sy(0)}" y2="${sy(0)}" class="zero"/>`;
  [minX, (minX + maxX) / 2, maxX].forEach((x, i) => {
    out += `<text x="${sx(x)}" y="${h - 6}" text-anchor="${['start', 'middle', 'end'][i]}" class="axis">${fmtDateShort(x)}</text>`;
  });
  series.forEach((s, si) => {
    const pts = [...s.points].sort((a, b) => a.x - b.x);
    if (!pts.length) return;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
    if (s.area ?? (area && si === 0)) {
      out += `<defs><linearGradient id="${gid}${si}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".28"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>`;
      out += `<path d="${d}L${sx(pts[pts.length - 1].x).toFixed(1)},${sy(minY)}L${sx(pts[0].x).toFixed(1)},${sy(minY)}Z" fill="url(#${gid}${si})"/>`;
    }
    out += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.4}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} ${s.opacity ? `opacity="${s.opacity}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    if (s.marker) pts.forEach(p => { out += markerSvg(sx(p.x), sy(p.y), s.marker, s.color); });
    pts.filter(p => p.rec).forEach(p => { out += `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="4.6" fill="var(--rec)" stroke="var(--card)" stroke-width="1.6"/>`; });
    if (!s.marker && !s.noEnd) { const lp = pts[pts.length - 1]; out += `<circle cx="${sx(lp.x)}" cy="${sy(lp.y)}" r="3.8" fill="${s.color}" stroke="var(--card)" stroke-width="1.6"/>`; }
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

/* ----- Mises à jour de l'app -----
   À chaque ouverture (et retour au premier plan), on demande au navigateur
   de vérifier sw.js sans passer par son cache. Si une nouvelle version
   s'installe, elle prend la main : on recharge tout de suite si aucune
   séance n'est en cours, sinon on propose de recharger. */
let lastUpdateCheck = 0;
async function checkForUpdate(force = false) {
  if (!('serviceWorker' in navigator)) return;
  if (!force && Date.now() - lastUpdateCheck < 60000) return;
  lastUpdateCheck = Date.now();
  try { const reg = await navigator.serviceWorker.getRegistration(); reg && await reg.update(); } catch (e) { /* hors ligne */ }
}
function setupUpdates() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(() => checkForUpdate(true))
    .catch(e => console.warn('SW non enregistré', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // 1re installation : rien à recharger
    if (S.active && !S.active.minimized) { showUpdateBanner(); return; }
    reloading = true;
    location.reload();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
}
function showUpdateBanner() {
  if ($('#update-banner')) return;
  const b = document.createElement('button');
  b.id = 'update-banner';
  b.dataset.action = 'reload-app';
  b.innerHTML = `<span>Nouvelle version disponible</span><b>Recharger</b>`;
  document.body.appendChild(b);
  requestAnimationFrame(() => b.classList.add('show'));
}
ACTIONS['reload-app'] = () => location.reload();

/** Dernier recours : vide le cache de l'app et recharge (les données sont conservées) */
async function forceUpdate() {
  try {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  } catch (e) { /* ignore */ }
  location.reload();
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
  const defs = new Map(GYM_EXERCISES.map(e => [e.id, e]));
  const upd = S.data.exercises.filter(e => { const d = defs.get(e.id); if (!d || (e.level === d.level && e.instructions === d.instructions)) return false; e.level = d.level; e.instructions = d.instructions; return true; });
  if (upd.length) await DB.putMany('exercises', upd);
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

  setupUpdates();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
}

init();
