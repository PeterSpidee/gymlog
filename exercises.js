/* ==========================================================================
   GymLog — Bibliothèque d'exercices pré-remplie
   Chaque exercice : nom, muscle principal, muscle secondaire, équipement.
   Les identifiants sont dérivés du nom (stables entre les versions).
   ========================================================================== */

/** Muscles détaillés (utilisés pour la silhouette "muscles travaillés") */
const MUSCLES = {
  pectoraux: 'Pectoraux',
  dos: 'Dorsaux',
  trapezes: 'Trapèzes',
  lombaires: 'Lombaires',
  epaules: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  'avant-bras': 'Avant-bras',
  abdos: 'Abdominaux',
  obliques: 'Obliques',
  quadriceps: 'Quadriceps',
  ischios: 'Ischio-jambiers',
  fessiers: 'Fessiers',
  mollets: 'Mollets'
};

/** Groupes musculaires affichés dans les filtres */
const CATEGORIES = {
  'Pectoraux': ['pectoraux'],
  'Dos': ['dos', 'lombaires'],
  'Épaules': ['epaules', 'trapezes'],
  'Biceps': ['biceps', 'avant-bras'],
  'Triceps': ['triceps'],
  'Jambes': ['quadriceps', 'ischios', 'fessiers', 'mollets'],
  'Abdominaux': ['abdos', 'obliques']
};

/** muscle détaillé -> groupe */
const MUSCLE_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORIES).flatMap(([cat, list]) => list.map(m => [m, cat]))
);

/** Types d'équipement */
const EQUIPMENT = {
  barre: 'Barre',
  halteres: 'Haltères',
  machine: 'Machine',
  poulie: 'Poulie',
  pdc: 'Poids du corps'
};

/** "Développé couché barre" -> "developpe-couche-barre" */
function slugify(str) {
  return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const GYM_EXERCISES = [
  // --- Pectoraux ---
  ['Développé couché barre', 'pectoraux', 'triceps', 'barre'],
  ['Développé couché haltères', 'pectoraux', 'triceps', 'halteres'],
  ['Développé incliné barre', 'pectoraux', 'epaules', 'barre'],
  ['Développé incliné haltères', 'pectoraux', 'epaules', 'halteres'],
  ['Développé décliné barre', 'pectoraux', 'triceps', 'barre'],
  ['Développé couché machine', 'pectoraux', 'triceps', 'machine'],
  ['Écarté poulie', 'pectoraux', null, 'poulie'],
  ['Écarté poulie basse', 'pectoraux', 'epaules', 'poulie'],
  ['Écarté haltères', 'pectoraux', null, 'halteres'],
  ['Pec deck', 'pectoraux', null, 'machine'],
  ['Dips', 'pectoraux', 'triceps', 'pdc'],
  ['Pompes', 'pectoraux', 'triceps', 'pdc'],

  // --- Dos ---
  ['Soulevé de terre', 'dos', 'ischios', 'barre'],
  ['Tractions pronation', 'dos', 'biceps', 'pdc'],
  ['Tractions supination', 'dos', 'biceps', 'pdc'],
  ['Rowing barre', 'dos', 'biceps', 'barre'],
  ['Rowing haltère', 'dos', 'biceps', 'halteres'],
  ['Rowing T-bar', 'dos', 'biceps', 'barre'],
  ['Rowing machine', 'dos', 'biceps', 'machine'],
  ['Tirage vertical', 'dos', 'biceps', 'poulie'],
  ['Tirage vertical prise serrée', 'dos', 'biceps', 'poulie'],
  ['Tirage horizontal', 'dos', 'biceps', 'poulie'],
  ['Pullover', 'dos', 'pectoraux', 'halteres'],
  ['Pull-over poulie', 'dos', null, 'poulie'],
  ['Extension lombaires', 'lombaires', 'fessiers', 'pdc'],

  // --- Épaules ---
  ['Développé militaire barre', 'epaules', 'triceps', 'barre'],
  ['Développé militaire haltères', 'epaules', 'triceps', 'halteres'],
  ['Développé Arnold', 'epaules', 'triceps', 'halteres'],
  ['Développé épaules machine', 'epaules', 'triceps', 'machine'],
  ['Élévations latérales', 'epaules', null, 'halteres'],
  ['Élévations latérales poulie', 'epaules', null, 'poulie'],
  ['Élévations frontales', 'epaules', null, 'halteres'],
  ['Oiseau', 'epaules', 'trapezes', 'halteres'],
  ['Face pull', 'epaules', 'trapezes', 'poulie'],
  ['Rowing menton', 'epaules', 'trapezes', 'barre'],
  ['Shrugs', 'trapezes', null, 'halteres'],

  // --- Biceps ---
  ['Curl barre', 'biceps', 'avant-bras', 'barre'],
  ['Curl barre EZ', 'biceps', 'avant-bras', 'barre'],
  ['Curl haltères', 'biceps', 'avant-bras', 'halteres'],
  ['Curl marteau', 'biceps', 'avant-bras', 'halteres'],
  ['Curl incliné', 'biceps', null, 'halteres'],
  ['Curl pupitre', 'biceps', null, 'barre'],
  ['Curl concentré', 'biceps', null, 'halteres'],
  ['Curl poulie', 'biceps', null, 'poulie'],

  // --- Triceps ---
  ['Barre au front', 'triceps', null, 'barre'],
  ['Développé couché prise serrée', 'triceps', 'pectoraux', 'barre'],
  ['Extension poulie haute', 'triceps', null, 'poulie'],
  ['Extension corde', 'triceps', null, 'poulie'],
  ['Dips prise serrée', 'triceps', 'pectoraux', 'pdc'],
  ['Kickback', 'triceps', null, 'halteres'],
  ['Extension overhead', 'triceps', null, 'halteres'],
  ['Pompes diamant', 'triceps', 'pectoraux', 'pdc'],

  // --- Jambes ---
  ['Squat barre', 'quadriceps', 'fessiers', 'barre'],
  ['Front squat', 'quadriceps', 'abdos', 'barre'],
  ['Hack squat', 'quadriceps', 'fessiers', 'machine'],
  ['Goblet squat', 'quadriceps', 'fessiers', 'halteres'],
  ['Presse à cuisses', 'quadriceps', 'fessiers', 'machine'],
  ['Fentes', 'quadriceps', 'fessiers', 'halteres'],
  ['Bulgarian split squat', 'quadriceps', 'fessiers', 'halteres'],
  ['Leg extension', 'quadriceps', null, 'machine'],
  ['Adducteurs machine', 'quadriceps', null, 'machine'],
  ['Leg curl', 'ischios', null, 'machine'],
  ['Leg curl assis', 'ischios', null, 'machine'],
  ['Soulevé de terre roumain', 'ischios', 'fessiers', 'barre'],
  ['Soulevé de terre sumo', 'fessiers', 'ischios', 'barre'],
  ['Hip thrust', 'fessiers', 'ischios', 'barre'],
  ['Abducteurs machine', 'fessiers', null, 'machine'],
  ['Kickback fessier poulie', 'fessiers', 'ischios', 'poulie'],
  ['Mollets debout', 'mollets', null, 'machine'],
  ['Mollets assis', 'mollets', null, 'machine'],

  // --- Abdominaux ---
  ['Crunch', 'abdos', null, 'pdc'],
  ['Crunch inversé', 'abdos', null, 'pdc'],
  ['Crunch poulie', 'abdos', null, 'poulie'],
  ['Planche', 'abdos', 'obliques', 'pdc'],
  ['Gainage latéral', 'obliques', 'abdos', 'pdc'],
  ['Relevé de jambes', 'abdos', null, 'pdc'],
  ['Russian twist', 'obliques', 'abdos', 'pdc'],
  ['Ab wheel', 'abdos', 'lombaires', 'pdc'],
  ['Mountain climbers', 'abdos', 'quadriceps', 'pdc'],

  // --- Avant-bras ---
  ['Curl poignets', 'avant-bras', null, 'barre'],
  ['Farmer walk', 'avant-bras', 'trapezes', 'halteres']
].map(([name, muscleGroup, secondaryMuscle, equipment]) => ({
  id: 'ex-' + slugify(name),
  name,
  muscleGroup,
  secondaryMuscle,
  equipment,
  isCustom: false
}));
