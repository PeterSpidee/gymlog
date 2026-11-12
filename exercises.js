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


/** Niveaux de difficulté */
const LEVELS = { debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé' };

/** Niveau + consignes d'exécution de chaque exercice : [niveau, consignes] */
const EX_INFO = {
  'Développé couché barre': ['intermediaire', 'Allongé, pieds au sol, omoplates serrées. Descends la barre au bas des pectoraux, coudes à ~45°, puis pousse en gardant les fesses sur le banc.'],
  'Développé couché haltères': ['debutant', 'Haltères au-dessus de la poitrine, paumes vers les pieds. Descends en ouvrant légèrement les coudes jusqu\'à l\'étirement, puis remonte en rapprochant les haltères.'],
  'Développé incliné barre': ['intermediaire', 'Banc incliné à 30-45°. Descends la barre vers le haut des pectoraux, coudes sous la barre, puis pousse verticalement.'],
  'Développé incliné haltères': ['debutant', 'Banc à 30-45°. Descends les haltères à hauteur de poitrine en contrôlant, puis pousse vers le haut sans cogner les haltères.'],
  'Développé décliné barre': ['intermediaire', 'Jambes calées, tête plus basse que le bassin. Descends la barre vers le bas des pectoraux, puis pousse. Fais-toi assister pour sortir la barre.'],
  'Développé couché machine': ['debutant', 'Règle le siège pour que les poignées soient à hauteur de poitrine. Pousse sans verrouiller les coudes et reviens lentement.'],
  'Écarté poulie': ['debutant', 'Poulies hautes, buste légèrement penché. Bras presque tendus, ramène les mains devant toi en arc de cercle et serre les pectoraux.'],
  'Écarté poulie basse': ['debutant', 'Poulies basses, ramène les mains de bas en haut devant le haut de la poitrine, coudes légèrement fléchis.'],
  'Écarté haltères': ['intermediaire', 'Allongé, coudes légèrement fléchis et fixes. Ouvre les bras jusqu\'à sentir l\'étirement des pectoraux, puis referme en arc.'],
  'Pec deck': ['debutant', 'Dos collé au dossier, avant-bras ou mains sur les poignées. Ferme les bras devant toi, marque une pause, reviens lentement.'],
  'Dips': ['intermediaire', 'Buste légèrement penché en avant pour cibler les pectoraux. Descends jusqu\'à ce que les épaules passent sous les coudes, puis remonte.'],
  'Pompes': ['debutant', 'Mains un peu plus larges que les épaules, corps gainé. Descends la poitrine près du sol, puis pousse sans creuser le dos.'],
  'Soulevé de terre': ['avance', 'Barre au-dessus du milieu du pied, dos plat, poitrine sortie. Pousse dans le sol en gardant la barre collée aux jambes, verrouille hanches et genoux en haut.'],
  'Tractions pronation': ['intermediaire', 'Prise paumes vers l\'avant, un peu plus large que les épaules. Tire les coudes vers les hanches jusqu\'au menton au-dessus de la barre, descends bras tendus.'],
  'Tractions supination': ['intermediaire', 'Prise paumes vers toi, largeur d\'épaules. Monte la poitrine vers la barre en serrant les omoplates, redescends en contrôle.'],
  'Rowing barre': ['intermediaire', 'Buste penché à ~45°, dos plat, genoux fléchis. Tire la barre vers le nombril en serrant les omoplates, redescends lentement.'],
  'Rowing haltère': ['debutant', 'Une main et un genou sur le banc, dos plat. Tire l\'haltère vers la hanche, coude près du corps, puis allonge le bras.'],
  'Rowing T-bar': ['intermediaire', 'Buste penché, dos plat. Tire la poignée vers le bas de la poitrine en serrant les omoplates, sans donner d\'élan avec les jambes.'],
  'Rowing machine': ['debutant', 'Poitrine contre l\'appui. Tire les poignées vers toi en ramenant les coudes en arrière, serre le dos une seconde, reviens lentement.'],
  'Tirage vertical': ['debutant', 'Cuisses calées, buste légèrement incliné en arrière. Tire la barre vers le haut de la poitrine en abaissant les épaules, remonte bras tendus.'],
  'Tirage vertical prise serrée': ['debutant', 'Poignée en V, buste légèrement incliné. Tire vers le haut de la poitrine, coudes le long du corps, puis remonte en contrôle.'],
  'Tirage horizontal': ['debutant', 'Assis, dos droit, genoux légèrement fléchis. Tire la poignée vers le ventre en serrant les omoplates, sans basculer le buste.'],
  'Pullover': ['intermediaire', 'Allongé, un haltère tenu à deux mains au-dessus de la poitrine. Descends derrière la tête bras légèrement fléchis, puis ramène au-dessus de la poitrine.'],
  'Pull-over poulie': ['debutant', 'Face à la poulie haute, bras presque tendus. Ramène la barre jusqu\'aux cuisses en contractant les dorsaux, remonte lentement.'],
  'Extension lombaires': ['debutant', 'Bassin calé sur le banc à 45°. Descends le buste dos plat, puis remonte jusqu\'à l\'alignement du corps, sans hyper-cambrer.'],
  'Développé militaire barre': ['intermediaire', 'Debout, abdos et fessiers serrés. Pousse la barre au-dessus de la tête en passant la tête légèrement en arrière, verrouille bras tendus.'],
  'Développé militaire haltères': ['debutant', 'Assis ou debout, haltères à hauteur d\'oreilles. Pousse vers le haut sans cambrer, redescends jusqu\'aux épaules.'],
  'Développé Arnold': ['intermediaire', 'Départ paumes vers toi devant les épaules. Pousse en tournant les poignets pour finir paumes vers l\'avant, fais l\'inverse en descendant.'],
  'Développé épaules machine': ['debutant', 'Règle le siège pour avoir les poignées à hauteur d\'épaules. Pousse vers le haut sans décoller le dos, reviens lentement.'],
  'Élévations latérales': ['debutant', 'Coudes légèrement fléchis, monte les haltères sur les côtés jusqu\'à hauteur d\'épaules, en menant avec les coudes. Redescends lentement.'],
  'Élévations latérales poulie': ['debutant', 'Poulie basse, câble devant ou derrière toi. Monte le bras sur le côté jusqu\'à l\'horizontale, garde la tension en descendant.'],
  'Élévations frontales': ['debutant', 'Monte les haltères devant toi jusqu\'à hauteur des yeux, bras presque tendus, sans balancer le buste.'],
  'Oiseau': ['debutant', 'Buste penché vers l\'avant, dos plat. Ouvre les bras sur les côtés, coudes légèrement fléchis, en serrant l\'arrière des épaules.'],
  'Face pull': ['debutant', 'Corde à hauteur de visage. Tire vers le front en écartant les mains et en ramenant les coudes hauts et en arrière.'],
  'Rowing menton': ['intermediaire', 'Prise un peu plus large que les épaules. Monte la barre le long du corps jusqu\'au bas de la poitrine, coudes plus hauts que les mains.'],
  'Shrugs': ['debutant', 'Bras tendus, haltères le long du corps. Monte les épaules vers les oreilles, marque une pause, redescends sans rouler les épaules.'],
  'Curl barre': ['debutant', 'Debout, coudes collés au corps. Monte la barre en contractant les biceps sans balancer, redescends lentement bras presque tendus.'],
  'Curl barre EZ': ['debutant', 'Prise sur les angles de la barre EZ, coudes fixes. Monte jusqu\'à la contraction, redescends en contrôle.'],
  'Curl haltères': ['debutant', 'Coudes le long du corps, monte les haltères en tournant les paumes vers le haut. Redescends lentement.'],
  'Curl marteau': ['debutant', 'Paumes face à face (prise neutre). Monte les haltères sans bouger les coudes, redescends lentement.'],
  'Curl incliné': ['intermediaire', 'Allongé sur un banc incliné, bras pendants. Monte les haltères sans avancer les coudes : l\'étirement est maximal en bas.'],
  'Curl pupitre': ['debutant', 'Arrière des bras à plat sur le pupitre. Monte la barre, puis redescends lentement sans verrouiller totalement les coudes.'],
  'Curl concentré': ['debutant', 'Assis, coude calé contre l\'intérieur de la cuisse. Monte l\'haltère vers l\'épaule, serre, redescends lentement.'],
  'Curl poulie': ['debutant', 'Face à la poulie basse, coudes fixes le long du corps. Monte la barre jusqu\'à la contraction, garde la tension en descendant.'],
  'Barre au front': ['intermediaire', 'Allongé, barre au-dessus du front. Fléchis uniquement les coudes pour descendre vers le front, puis tends les bras.'],
  'Développé couché prise serrée': ['intermediaire', 'Mains à largeur d\'épaules. Descends la barre vers le bas des pectoraux, coudes près du corps, puis pousse.'],
  'Extension poulie haute': ['debutant', 'Coudes collés au corps, tends les bras vers le bas jusqu\'au verrouillage, remonte sans décoller les coudes.'],
  'Extension corde': ['debutant', 'Corde à la poulie haute. Tends les bras en écartant les mains en bas du mouvement, coudes fixes.'],
  'Dips prise serrée': ['intermediaire', 'Buste vertical, coudes près du corps. Descends jusqu\'à ~90° aux coudes, puis pousse en verrouillant les bras.'],
  'Kickback': ['debutant', 'Buste penché, coude fixe à hauteur du torse. Tends l\'avant-bras vers l\'arrière, serre le triceps, reviens lentement.'],
  'Extension overhead': ['debutant', 'Haltère tenu à deux mains au-dessus de la tête. Descends derrière la nuque en gardant les coudes serrés, puis tends les bras.'],
  'Pompes diamant': ['intermediaire', 'Mains jointes sous la poitrine (index et pouces en losange). Descends en gardant les coudes près du corps, puis pousse.'],
  'Squat barre': ['intermediaire', 'Barre sur les trapèzes, pieds largeur d\'épaules. Descends en poussant les hanches en arrière, genoux dans l\'axe des pieds, au moins jusqu\'à la parallèle, puis remonte.'],
  'Front squat': ['avance', 'Barre sur l\'avant des épaules, coudes hauts. Descends buste droit, puis remonte en gardant les coudes levés.'],
  'Hack squat': ['debutant', 'Dos collé au dossier, pieds au milieu de la plateforme. Descends jusqu\'à ~90° aux genoux, pousse dans les talons.'],
  'Goblet squat': ['debutant', 'Haltère tenu contre la poitrine. Descends entre les genoux en gardant le buste droit, puis remonte.'],
  'Presse à cuisses': ['debutant', 'Pieds largeur d\'épaules au milieu de la plateforme. Descends jusqu\'à ~90° sans décoller le bas du dos, pousse sans verrouiller les genoux.'],
  'Fentes': ['debutant', 'Grand pas en avant, descends jusqu\'à ce que le genou arrière frôle le sol, genou avant au-dessus de la cheville. Pousse pour revenir.'],
  'Bulgarian split squat': ['intermediaire', 'Pied arrière posé sur un banc. Descends verticalement sur la jambe avant, puis remonte en poussant dans le talon.'],
  'Leg extension': ['debutant', 'Dos calé, rouleau sur le bas des tibias. Tends les jambes, serre les quadriceps une seconde, redescends lentement.'],
  'Adducteurs machine': ['debutant', 'Jambes écartées contre les appuis. Rapproche les cuisses en contrôle, puis reviens lentement.'],
  'Leg curl': ['debutant', 'Allongé, rouleau au-dessus des talons. Ramène les talons vers les fesses sans décoller le bassin, redescends lentement.'],
  'Leg curl assis': ['debutant', 'Cuisses calées, rouleau sous les mollets. Ramène les talons sous le siège, reviens lentement.'],
  'Soulevé de terre roumain': ['intermediaire', 'Genoux légèrement fléchis et fixes, dos plat. Descends la barre le long des cuisses en reculant les hanches jusqu\'à l\'étirement des ischios, puis remonte.'],
  'Soulevé de terre sumo': ['avance', 'Pieds très écartés, pointes vers l\'extérieur, mains entre les jambes. Pousse dans le sol en ouvrant les genoux, dos plat.'],
  'Hip thrust': ['intermediaire', 'Haut du dos sur un banc, barre sur les hanches. Pousse le bassin vers le haut jusqu\'à l\'alignement genoux-hanches-épaules, serre les fessiers.'],
  'Abducteurs machine': ['debutant', 'Jambes contre les appuis extérieurs. Écarte les cuisses, marque une pause, reviens lentement.'],
  'Kickback fessier poulie': ['debutant', 'Sangle à la cheville, buste légèrement penché. Pousse la jambe vers l\'arrière en serrant le fessier, sans cambrer.'],
  'Mollets debout': ['debutant', 'Avant des pieds sur le rebord. Descends les talons au maximum, puis monte le plus haut possible sur la pointe des pieds.'],
  'Mollets assis': ['debutant', 'Genoux sous l\'appui, avant des pieds sur le rebord. Descends les talons puis monte sur la pointe, avec une pause en haut.'],
  'Crunch': ['debutant', 'Allongé, genoux fléchis. Enroule le haut du dos en rapprochant les côtes du bassin, sans tirer sur la nuque.'],
  'Crunch inversé': ['debutant', 'Allongé, jambes fléchies en l\'air. Enroule le bassin pour amener les genoux vers la poitrine, redescends lentement.'],
  'Crunch poulie': ['intermediaire', 'À genoux face à la poulie haute, corde derrière la tête. Enroule le buste vers le sol en contractant les abdos.'],
  'Planche': ['debutant', 'Sur les avant-bras et la pointe des pieds, corps aligné. Serre abdos et fessiers et tiens la position. Note la durée en secondes dans « reps ».'],
  'Gainage latéral': ['debutant', 'Sur un avant-bras, corps aligné de profil, hanches hautes. Tiens la position. Note la durée en secondes dans « reps ».'],
  'Relevé de jambes': ['intermediaire', 'Suspendu à une barre ou en appui sur une chaise romaine. Monte les jambes sans balancer, en enroulant le bassin.'],
  'Russian twist': ['debutant', 'Assis, buste incliné en arrière, pieds décollés si possible. Tourne le buste d\'un côté puis de l\'autre.'],
  'Ab wheel': ['avance', 'À genoux, mains sur la roue. Avance en gardant le dos plat et les abdos serrés, puis reviens sans cambrer.'],
  'Mountain climbers': ['debutant', 'En position de pompe, ramène alternativement et rapidement les genoux vers la poitrine, hanches basses.'],
  'Curl poignets': ['debutant', 'Avant-bras posés sur les cuisses, poignets dans le vide. Enroule la barre en fléchissant les poignets, redescends lentement.'],
  'Farmer walk': ['debutant', 'Une charge lourde dans chaque main, épaules basses, buste droit. Marche à petits pas rapides sur la distance ou la durée voulue.']
};

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
  level: (EX_INFO[name] || [])[0] || 'debutant',
  instructions: (EX_INFO[name] || [])[1] || '',
  isCustom: false
}));
