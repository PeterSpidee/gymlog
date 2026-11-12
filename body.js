/* ==========================================================================
   GymLog — Silhouette anatomique (face / dos)
   Chaque muscle est un tracé SVG. On dessine la moitié gauche du corps,
   puis on la duplique en miroir pour obtenir la moitié droite.
   Les muscles non travaillés restent gris, séparés par de fins traits clairs,
   ce qui donne l'aspect "planche anatomique".
   ========================================================================== */

/* Contour du corps (moitié gauche, axe de symétrie x = 50) */
const BODY_OUTLINE = `M50 25 L46.5 25.5 Q46 29 44 30.5 Q40 32 35 32.6 Q28 33.6 25.6 38.5 Q23.6 43 23.4 50
  Q22.6 58 21.6 66 Q20.2 75 19.4 84 Q18.8 91 17.6 97 Q15.8 101 15.6 105 Q15.6 110 17.4 112.5 Q19.4 113.6 20.4 111.6
  Q21 108.5 21.6 104 Q23.6 96 25.4 87 Q27.6 77 29.6 68 L31 61 Q31.6 68 32.4 75 Q33 84 32 92
  Q30.4 99 30.4 106 Q30 118 31 130 Q32 142 33.4 151 Q32.4 160 32.4 170 Q33 183 34.6 196
  Q34.8 201 33.4 205 Q33 209 37 209.6 L42.4 209.6 Q44.8 208.6 44 204.4 Q43.4 199 44 192
  Q45 180 45.2 168 Q45.4 159 45.6 152 Q47 140 48 128 Q48.8 118 49.4 110 L50 110 Z`;

/* Muscles visibles de face : [muscle, tracé] */
const BODY_FRONT = [
  ['trapezes', 'M46.6 26 Q45.6 29.6 42 31 Q39.6 31.8 37.4 32.4 L45.6 32.6 Q47.4 30 46.6 26 Z'],
  ['epaules', 'M35 32.8 Q28 33.8 25.8 39 Q24.6 44 25.4 50.4 Q27.4 47 30.4 43.6 Q33.4 40 36.4 36.6 Q37 34 35 32.8 Z'],
  ['pectoraux', 'M49.4 34 L41 33.4 Q36.6 35.2 34.2 39.4 Q32 44 33 48.6 Q37 52 42.6 52.2 Q47 52 49.4 49.6 Z'],
  ['biceps', 'M25.6 51.6 Q23.4 57 23.4 63 Q23.8 68 26.4 70 Q29.4 67 30.6 61 Q31.4 55.4 29.6 51 Q27.6 49.6 25.6 51.6 Z'],
  ['avant-bras', 'M23.4 71.4 Q20.8 78 19.8 86 Q19.2 92 19.6 96.4 L23 96.6 Q25.6 88 27.6 79 Q28.8 74 27.6 71 Q25.4 69.6 23.4 71.4 Z'],
  ['abdos', 'M49.4 53.6 L44 54 Q42.4 60 42.6 67 Q42.6 76 43.6 84 Q45 91 49.4 96 Z'],
  ['obliques', 'M42.4 53.6 Q37.6 53.8 34.6 57 Q34.8 64 35 71 Q35.2 79 36.6 85 Q39.6 90 43 92 Q41.6 84 41.4 76 Q41.2 66 42.4 53.6 Z'],
  ['quadriceps', 'M32.4 106 Q31.2 116 32 127 Q33 138 35.6 146 Q38.6 150.4 42.6 149.6 Q45.4 145 46.4 136 Q47.6 125 47.8 114 Q46.8 107 42 103.4 Q36.4 101.6 32.4 106 Z'],
  ['quadriceps', 'M47.8 104.6 Q49.2 108 49.4 112 L49.2 124 Q48 116 47.8 104.6 Z'],
  ['mollets', 'M33.6 158 Q32.6 168 33.6 179 Q34.8 189 37.2 195.4 Q39.6 190 40.6 181 Q41.4 171 40.8 162.6 Q39.2 157 36.2 156.6 Q34.4 156.8 33.6 158 Z'],
  ['mollets', 'M42.6 160 Q44.6 168 44.4 178 Q44 187 42.6 194 Q41.4 186 41.8 176 Q42 167 42.6 160 Z']
];

/* Muscles visibles de dos */
const BODY_BACK = [
  ['trapezes', 'M50 21.6 L46.6 25.6 Q44 30 37 32.8 Q41.4 37 44.4 43.6 Q47 50 50 58 Z'],
  ['epaules', 'M35.4 33 Q28.2 33.8 25.8 39 Q24.6 44 25.4 50.4 Q28 46.4 31.4 42.6 Q34.6 39 37 35.6 Q37 33.8 35.4 33 Z'],
  ['dos', 'M44 44 Q38.6 39.4 35.4 41.4 Q32.6 47 33.4 55 Q34.6 63 38 70 Q42 76.6 47.4 79 L49.4 72 Q48.4 62 47 54 Q45.8 48 44 44 Z'],
  ['dos', 'M38.4 36.4 Q42.6 38.4 44.2 43 Q40.6 40 37 40.4 Z'],
  ['triceps', 'M25.6 51.6 Q23.4 57 23.4 63 Q23.8 68 26.4 70 Q29.4 67 30.6 61 Q31.4 55.4 29.6 51 Q27.6 49.6 25.6 51.6 Z'],
  ['avant-bras', 'M23.4 71.4 Q20.8 78 19.8 86 Q19.2 92 19.6 96.4 L23 96.6 Q25.6 88 27.6 79 Q28.8 74 27.6 71 Q25.4 69.6 23.4 71.4 Z'],
  ['lombaires', 'M49.4 74.6 L47.6 80.4 Q44.4 84 43.6 90 Q45 95 49.4 97 Z'],
  ['obliques', 'M36.6 70.6 Q34.8 78 35.6 86 Q38.6 91.6 42.6 92.4 Q42.6 85 46.2 80 Q40.4 76.6 36.6 70.6 Z'],
  ['fessiers', 'M49.4 98.6 Q42 96.4 36 99.6 Q31.6 104 32 111 Q33.6 118.6 40.4 120.6 Q46.4 121 49.4 117.4 Z'],
  ['ischios', 'M32.6 120.4 Q31.4 130 33 140 Q35 148 38.6 151.6 Q42.6 151.6 44.8 146 Q46.6 138 47.2 128 Q47.4 123.6 46.6 121.6 Q42 123.6 37 122.6 Q34.4 122 32.6 120.4 Z'],
  ['mollets', 'M34.2 157 Q31.6 165 32.6 174.6 Q34.4 182.6 38.2 184.6 Q41.4 179 41.8 170.6 Q42 162 39.4 156.4 Q36.4 154.6 34.2 157 Z'],
  ['mollets', 'M41.4 156.6 Q44.6 161 45 169 Q45 177 42.8 183.4 Q41.8 176 42.4 168 Q42.6 161 41.4 156.6 Z']
];

/* Détails décoratifs (lignes des abdos, rotules) */
const BODY_DETAILS_FRONT = `<path d="M44.2 62.4 Q46.8 61.6 49.4 62.2 M43.8 70.4 Q46.6 69.6 49.4 70.2 M44 78.2 Q46.6 77.6 49.4 78" class="bd-line"/>
  <ellipse cx="39.8" cy="153" rx="3.6" ry="3" class="bd-joint"/>`;

/**
 * Silhouette SVG.
 * side : 'front' | 'back' ; lv : { muscle: niveau 0..5 }
 */
function bodySvg(side, lv) {
  const list = side === 'front' ? BODY_FRONT : BODY_BACK;
  const muscles = list.map(([m, d]) => `<path d="${d}" class="mz l${lv[m] || 0}"/>`).join('');
  const half = `<path d="${BODY_OUTLINE}" class="bd-skin"/>${muscles}${side === 'front' ? BODY_DETAILS_FRONT : ''}`;
  const head = side === 'front'
    ? `<ellipse cx="50" cy="13.4" rx="7.4" ry="9.4" class="bd-skin"/><path d="M42.8 11 Q43.4 3.6 50 3.4 Q56.6 3.6 57.2 11 Q55.4 6.6 50 6.6 Q44.6 6.6 42.8 11 Z" class="bd-hair"/>`
    : `<ellipse cx="50" cy="13.4" rx="7.4" ry="9.4" class="bd-hair"/>`;
  return `<svg viewBox="12 0 76 212" class="body-svg" aria-hidden="true">
    <g>${half}</g><g transform="translate(100 0) scale(-1 1)">${half}</g>${head}
    ${side === 'back' ? '<line x1="50" y1="58" x2="50" y2="97" class="bd-line"/>' : '<line x1="50" y1="34" x2="50" y2="96" class="bd-line"/>'}
  </svg>`;
}
