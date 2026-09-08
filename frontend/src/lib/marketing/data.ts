/**
 * Contenu du site vitrine — extrait et réécrit à partir du site existant
 * (lprds.netlify.app) puis retravaillé pour la refonte. Source de vérité
 * unique pour les pages marketing (accueil, à propos, sections, galerie,
 * actualités, contact).
 */

export const BRAND = {
  name: 'Les Petits Rayons de Soleil',
  shortName: 'LPRDS',
  baseline: 'La maison de l’éveil',
  since: 2022,
  address: 'Quatrième voie à droite, en face du commissariat du 3ᵉ district, Djidjolé, Lomé — Togo',
  phone: '+228 98 60 29 20',
  phoneHref: 'tel:+22898602920',
  whatsapp: 'https://wa.me/22890554121',
  email: 'hello@lespetitsrayonsdesoleil.net',
  social: {
    facebook: 'https://www.facebook.com/p/Les-Petits-Rayons-de-Soleil-61559745601729/',
    instagram: 'https://www.instagram.com/lespetitsrayonsdesoleil_',
    linkedin: 'https://www.linkedin.com/company/lespetitsrayonsdesoleil/',
    tiktok: 'https://www.tiktok.com/@lespetitsrayonsdesoleil',
  },
  hours: [
    { day: 'Lundi — Vendredi', hours: '7h30 – 19h00' },
    { day: 'Samedi (espace de jeux extérieur)', hours: '11h00 – 19h00' },
    { day: 'Dimanche (espace de jeux extérieur)', hours: '14h00 – 19h00' },
  ],
} as const

export const STATS = [
  { value: '80+', label: 'Enfants accueillis' },
  { value: '15', label: 'Professionnels qualifiés' },
  { value: '9', label: 'Sections, de 3 mois à 8 ans' },
  { value: '100%', label: 'Parents satisfaits' },
] as const

export const WHY_US = [
  { value: '+80', label: 'Enfants confiés par leurs parents' },
  { value: '+10', label: 'Professionnels passionnés et formés' },
  { label: 'Espace de jeux spacieux et équipé' },
  { label: 'Environnement 100 % sécurisé' },
] as const

export type SectionAgeGroup = {
  id: string
  category: 'creche' | 'garderie' | 'maternelle'
  title: string
  shortTitle: string
  ageRange: string
  capacity: string
  ratio: string
  description: string
  activities: string[]
  schedule: { morning?: string; midday?: string; afternoon?: string }
  image: string
}

export const SECTIONS: SectionAgeGroup[] = [
  {
    id: 'creche_etoile',
    category: 'creche',
    title: 'Crèche — Section Étoile',
    shortTitle: 'Étoile',
    ageRange: '3 – 18 mois',
    capacity: '15 enfants',
    ratio: '1 adulte pour 5 bébés',
    description: 'Un cocon douillet pour les premiers mois de découverte.',
    activities: [
      'Éveil sensoriel et motricité douce',
      'Exploration des textures et des sons',
      'Initiation musicale et moments de détente',
      'Jeux de manipulation et d’exploration libre',
    ],
    schedule: {
      morning: 'Accueil personnalisé, temps de soin, biberon et activités sensorielles',
      midday: 'Repas adapté, moments calmes et sieste longue',
      afternoon: 'Éveil en douceur, découverte en plein air et goûter',
    },
    image: '/images/marketing/about-image-1-B_by9-Oc.jpg',
  },
  {
    id: 'creche_nuage',
    category: 'creche',
    title: 'Crèche — Section Nuage',
    shortTitle: 'Nuage',
    ageRange: '18 – 24 mois',
    capacity: '16 enfants',
    ratio: '1 adulte pour 8 enfants',
    description: 'L’âge des premières explorations et de l’autonomie naissante.',
    activities: [
      'Motricité libre et parcours de découverte',
      'Premiers gestes artistiques : peinture, collage, modelage',
      'Chansons, comptines et manipulation',
      'Jeux de construction et d’imitation',
      'Observation et exploration en extérieur',
    ],
    schedule: {
      morning: 'Accueil chaleureux, activités sportives, cercle matinal, collation, éveil et motricité',
      midday: 'Repas en groupe, rituel de sieste',
      afternoon: 'Bricolage, activités en extérieur, jeux libres, histoires, comptines',
    },
    image: '/images/marketing/about-image-2-Cg9tJUCQ.jpg',
  },
  {
    id: 'creche_soleil',
    category: 'creche',
    title: 'Crèche — Section Soleil',
    shortTitle: 'Soleil',
    ageRange: '24 – 36 mois',
    capacity: '16 enfants',
    ratio: '1 adulte pour 8 enfants',
    description: 'Une préparation douce et joyeuse vers l’école maternelle.',
    activities: [
      'Pré-graphisme et découverte de l’écrit',
      'Expériences scientifiques simples et observations ludiques',
      'Théâtre, expression corporelle et jeux de rôle',
      'Ateliers créatifs et sensoriels',
      'Découvertes extérieures et mini-sorties pédagogiques',
    ],
    schedule: {
      morning: 'Accueil chaleureux, activités sportives, cercle matinal, ateliers d’éveil et de motricité',
      midday: 'Repas en semi-autonomie, rituel de sieste',
      afternoon: 'Ateliers créatifs, activités en plein air, lecture, comptines, exploration libre',
    },
    image: '/images/marketing/about-image-3-DRV-uMPE.jpg',
  },
  {
    id: 'garderie',
    category: 'garderie',
    title: 'Garderie périscolaire',
    shortTitle: 'Garderie',
    ageRange: '3 – 8 ans',
    capacity: '10 enfants',
    ratio: '1 adulte pour 10 enfants',
    description: 'Un espace d’épanouissement et d’accompagnement après l’école.',
    activities: [
      'Aide personnalisée aux devoirs (niveau primaire)',
      'Ateliers créatifs et manuels',
      'Activités sportives et jeux collectifs',
      'Découvertes culturelles et ludiques',
      'Projets de groupe favorisant coopération et autonomie',
    ],
    schedule: {
      midday: 'Repas à la cantine, temps calme',
      afternoon: 'Aide aux devoirs, activités thématiques, goûter, jeux en plein air',
    },
    image: '/images/marketing/life-gard.jpg',
  },
  {
    id: 'maternelle_ps',
    category: 'maternelle',
    title: 'Maternelle — Petite Section',
    shortTitle: 'Petite Section',
    ageRange: '3 ans',
    capacity: '20 enfants',
    ratio: '1 adulte pour 10 enfants',
    description: 'La Petite Section marque le début du parcours scolaire : l’enfant découvre le plaisir d’apprendre à travers le jeu, le mouvement et la communication.',
    activities: [
      'Langage : expression orale, premières comptines, salutations, couleurs, objets',
      'Motricité fine et globale, jeux d’équilibre et parcours moteurs',
      'Activités artistiques : dessin, peinture, modelage, musique',
      'Premiers jeux mathématiques : tri, classement, formes et couleurs',
      'Explorer le monde : nature, animaux, saisons et cinq sens',
    ],
    schedule: {
      morning: 'Accueil individualisé, jeux libres, rituels du jour, ateliers dirigés, chansons',
      midday: 'Repas autonome suivi d’un temps de sieste',
      afternoon: 'Ateliers créatifs, exploration et jeux en extérieur',
    },
    image: '/images/marketing/about-img-2.jpg',
  },
  {
    id: 'maternelle_ms',
    category: 'maternelle',
    title: 'Maternelle — Moyenne Section',
    shortTitle: 'Moyenne Section',
    ageRange: '3 – 4 ans',
    capacity: '20 enfants',
    ratio: '1 adulte pour 10 enfants',
    description: 'Les apprentissages se consolident : l’enfant affine son langage, sa motricité, et commence à organiser sa pensée.',
    activities: [
      'Langage : vocabulaire, phrases complètes, phonologie, anglais oral quotidien',
      'Coordination, jeux collectifs, équilibre, danses',
      'Arts et expression : peinture, bricolage, expression corporelle, chant',
      'Repérage dans le temps et l’espace, tri, comparaison, nombres',
      'Petites expériences sensorielles, découverte des plantes et animaux',
    ],
    schedule: {
      morning: 'Accueil individualisé, jeux libres, rituels du jour, ateliers dirigés, chansons',
      midday: 'Repas en autonomie, sieste ou temps calme',
      afternoon: 'Ateliers scientifiques, activités artistiques, exploration en extérieur',
    },
    image: '/images/marketing/about-img-3.jpg',
  },
  {
    id: 'maternelle_gs',
    category: 'maternelle',
    title: 'Maternelle — Grande Section',
    shortTitle: 'Grande Section',
    ageRange: '4 – 5 ans',
    capacity: '20 enfants',
    ratio: '1 adulte pour 10 enfants',
    description: 'La Grande Section prépare en douceur le passage vers l’école primaire : curiosité intellectuelle, rigueur, confiance en soi et envie d’apprendre.',
    activities: [
      'Conscience phonologique, reconnaissance des lettres, initiation à la lecture',
      'Activités sportives, danses, motricité fine et autonomie',
      'Dessin d’observation, créations collectives, théâtre et musique',
      'Comparaison, suite logique, comptage jusqu’à 20, premiers calculs',
      'Anglais structuré à travers jeux, chansons et vie quotidienne',
    ],
    schedule: {
      morning: 'Accueil individualisé, rituels du jour, ateliers dirigés, langage',
      midday: 'Repas en autonomie, temps calme',
      afternoon: 'Ateliers de lecture, projets collectifs, jeux en extérieur',
    },
    image: '/images/marketing/about-img.jpg',
  },
]

export type Difference = {
  id: string
  title: string
  description: string
}

export const DIFFERENCES: Difference[] = [
  {
    id: 'bilingue',
    title: 'Programme bilingue français / anglais',
    description: 'Une ouverture au monde dès le plus jeune âge grâce à un apprentissage naturel des deux langues.',
  },
  {
    id: 'montessori',
    title: 'Pédagogie Montessori',
    description: 'Une approche favorisant l’autonomie, la curiosité et l’apprentissage par l’expérience.',
  },
  {
    id: 'soins-personnalises',
    title: 'Soins personnalisés',
    description: 'Chaque enfant reçoit une attention adaptée à ses besoins spécifiques et à son développement.',
  },
  {
    id: 'environnement-securise',
    title: 'Environnement sécurisé',
    description: 'Notre établissement est conçu pour la sécurité des enfants, avec un personnel formé.',
  },
  {
    id: 'educatrices-formees',
    title: 'Éducatrices formées',
    description: 'Une équipe qualifiée, passionnée et en formation continue, dédiée au bien-être et à la progression de chaque enfant.',
  },
  {
    id: 'routines-structurees',
    title: 'Routines structurées',
    description: 'Des journées équilibrées entre apprentissage, jeu et repos, pour un développement harmonieux.',
  },
  {
    id: 'activites-extrascolaires',
    title: 'Activités extrascolaires enrichissantes',
    description: 'Natation, karaté, escrime et danse contemporaine — pour stimuler la motricité, la confiance et la discipline.',
  },
  {
    id: 'espace-de-jeux',
    title: 'Espace de jeux spacieux et équipé',
    description: 'Un lieu sûr et stimulant où l’enfant apprend en explorant et en s’amusant.',
  },
]

export type JoinStep = {
  id: string
  title: string
  description: string
}

export const JOIN_STEPS: JoinStep[] = [
  {
    id: 'visite',
    title: 'Une visite (30 min)',
    description: 'Explorez les locaux. Posez vos questions. Rassurez-vous.',
  },
  {
    id: 'fiche-inscription',
    title: "Fiche d'inscription",
    description: 'Infos essentielles + besoins de votre enfant.',
  },
  {
    id: 'demarrage-confirme',
    title: 'Démarrage confirmé',
    description: 'Bienvenue chez Les Petits Rayons de Soleil !',
  },
]

export const PARTNERS = [
  { name: 'Pédiatre', role: 'Intervient en cas de besoin pour la santé et le bien-être général des enfants.' },
  { name: 'Psychologue d’éducation', role: 'Accompagne le développement émotionnel et social.' },
  { name: 'Psychomotricienne', role: 'Observe et soutient la motricité et la coordination corporelle.' },
  { name: 'Orthophoniste', role: 'Veille au développement du langage et de la communication.' },
  { name: 'Maître-nageur', role: 'Initie les enfants à la natation en toute sécurité.' },
  { name: 'Professeur de musique', role: 'Développe la sensibilité musicale et la créativité.' },
  { name: 'Professeure de karaté', role: 'Enseigne discipline, confiance et coordination.' },
  { name: 'Professeure de danse', role: 'Favorise l’expression corporelle et le rythme.' },
  { name: 'Maître d’armes d’escrime', role: 'Stimule la concentration, les réflexes et l’esprit sportif.' },
] as const

export const GALLERY_CATEGORIES = [
  { id: 'all', name: 'Tout voir' },
  { id: 'activities', name: 'Activités manuelles' },
  { id: 'outdoor', name: 'Jeux extérieurs' },
  { id: 'meals', name: 'Repas' },
  { id: 'rest', name: 'Temps calme' },
  { id: 'events', name: 'Fêtes & sorties' },
] as const
