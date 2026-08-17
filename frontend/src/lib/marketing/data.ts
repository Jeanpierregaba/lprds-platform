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
  email: 'contact@lespetitsrayonsdesoleil.fr',
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

export type NewsArticle = {
  id: string
  title: string
  category: 'events' | 'outings' | 'pedagogy' | 'info'
  date: string
  emoji: string
  excerpt: string
  content: string[]
  featured?: boolean
}

export const NEWS_CATEGORIES = [
  { id: 'all', name: 'Toutes les actualités' },
  { id: 'events', name: 'Événements' },
  { id: 'outings', name: 'Sorties' },
  { id: 'pedagogy', name: 'Projets pédagogiques' },
  { id: 'info', name: 'Informations parents' },
] as const

export const NEWS: NewsArticle[] = [
  {
    id: 'carnaval-2026',
    title: 'Carnaval 2026 : une fête colorée et joyeuse !',
    category: 'events',
    date: '2026-03-15',
    emoji: '🎭',
    excerpt: 'Les enfants ont célébré le carnaval avec des déguisements magnifiques et une parade dans le jardin. Une journée inoubliable !',
    content: [
      'Costumes faits main, maquillage et musique : le jardin de la crèche s’est transformé en défilé le temps d’un après-midi.',
      'Chaque section a préparé sa propre parade, avec l’aide des éducatrices, avant un grand goûter commun pour clôturer la fête.',
    ],
    featured: true,
  },
  {
    id: 'sortie-parc',
    title: 'Sortie pédagogique au parc',
    category: 'outings',
    date: '2026-03-10',
    emoji: '🌳',
    excerpt: 'Découverte de la nature et des animaux pour les sections Moyenne et Grande Section. Les enfants ont adoré observer les oiseaux.',
    content: [
      'Une matinée en plein air pour observer la faune et la flore locales, avec un carnet d’observation confectionné en classe.',
      'Retour à la crèche avec un atelier dessin pour restituer ce que chacun a vu et préféré pendant la sortie.',
    ],
  },
  {
    id: 'jardin-pedagogique',
    title: 'Nouveau projet : le jardin pédagogique',
    category: 'pedagogy',
    date: '2026-03-05',
    emoji: '🌱',
    excerpt: 'Lancement de notre jardin pédagogique ! Les enfants vont pouvoir planter, arroser et voir pousser leurs propres légumes.',
    content: [
      'Un coin du jardin a été réservé aux sections maternelles pour un projet au long cours : semer, entretenir, récolter.',
      'L’objectif : éveiller la curiosité scientifique et la patience, tout en reconnectant les enfants avec le rythme des saisons.',
    ],
  },
  {
    id: 'fermeture-formation',
    title: 'Fermeture exceptionnelle — journée de formation',
    category: 'info',
    date: '2026-02-28',
    emoji: '📅',
    excerpt: 'La crèche sera fermée le temps d’une journée pour une formation continue de toute l’équipe pédagogique.',
    content: [
      'Cette journée est consacrée à la formation continue de nos éducatrices, sur les gestes de premiers secours et les nouvelles approches pédagogiques.',
      'Merci de votre compréhension — la date exacte est communiquée aux familles au moins deux semaines à l’avance.',
    ],
  },
  {
    id: 'atelier-cuisine',
    title: 'Atelier cuisine : les petits chefs !',
    category: 'events',
    date: '2026-02-20',
    emoji: '👨‍🍳',
    excerpt: 'Les enfants ont préparé des cookies avec notre cuisinière. Ils étaient si fiers de repartir avec leurs créations !',
    content: [
      'Un atelier pas à pas, du pesage des ingrédients à la cuisson, pour apprendre en s’amusant les gestes simples de la cuisine.',
      'Chaque enfant est reparti avec sa propre boîte de cookies à partager en famille.',
    ],
  },
  {
    id: 'spectacle-marionnettes',
    title: 'Spectacle de marionnettes sur les émotions',
    category: 'events',
    date: '2026-02-15',
    emoji: '🎪',
    excerpt: 'Une compagnie de marionnettistes est venue présenter un spectacle sur les émotions. Les enfants étaient captivés !',
    content: [
      'À travers des personnages hauts en couleur, le spectacle a permis d’aborder la joie, la tristesse et la colère avec des mots simples.',
      'Un temps d’échange avec les artistes a suivi la représentation, très apprécié des plus curieux.',
    ],
  },
  {
    id: 'baby-yoga',
    title: 'Nouvelle activité : baby yoga',
    category: 'pedagogy',
    date: '2026-02-10',
    emoji: '🧘',
    excerpt: 'Introduction du baby yoga pour les tout-petits, une activité douce qui favorise la détente et la coordination.',
    content: [
      'Des postures simples, adaptées à l’âge, animées en musique douce pour accompagner le développement moteur des tout-petits.',
      'Une séance hebdomadaire désormais intégrée au programme des sections Étoile et Nuage.',
    ],
  },
  {
    id: 'inscriptions-ouvertes',
    title: 'Inscriptions 2026–2027 ouvertes',
    category: 'info',
    date: '2026-02-01',
    emoji: '📝',
    excerpt: 'Les inscriptions pour la prochaine rentrée sont ouvertes ! N’hésitez pas à nous contacter pour planifier une visite.',
    content: [
      'Places limitées par section — nous recommandons de nous contacter tôt pour organiser une visite et échanger sur les besoins de votre enfant.',
      'Un dossier d’inscription complet vous est remis lors de la visite, avec le détail des tarifs et des pièces à fournir.',
    ],
  },
]

export const GALLERY_CATEGORIES = [
  { id: 'all', name: 'Tout voir' },
  { id: 'activities', name: 'Activités manuelles' },
  { id: 'outdoor', name: 'Jeux extérieurs' },
  { id: 'meals', name: 'Repas' },
  { id: 'rest', name: 'Temps calme' },
  { id: 'events', name: 'Fêtes & sorties' },
] as const

export type GalleryItem = {
  id: number
  category: 'activities' | 'outdoor' | 'meals' | 'rest' | 'events'
  title: string
  description: string
  image: string
}

export const GALLERY: GalleryItem[] = [
  { id: 1, category: 'activities', title: 'Atelier peinture', description: 'Les enfants découvrent les couleurs', image: '/images/marketing/gallery-1.jpg' },
  { id: 2, category: 'outdoor', title: 'Jeux dans le jardin', description: 'Moment de détente à l’extérieur', image: '/images/marketing/gallery-2.jpg' },
  { id: 3, category: 'meals', title: 'Déjeuner ensemble', description: 'Apprentissage de l’autonomie', image: '/images/marketing/gallery-main.jpg' },
  { id: 4, category: 'events', title: 'Fête de printemps', description: 'Célébration avec les familles', image: '/images/marketing/choose-img-v1.jpg' },
  { id: 5, category: 'rest', title: 'Lecture calme', description: 'Moment de détente et d’éveil', image: '/images/marketing/choose-img-v2.jpg' },
  { id: 6, category: 'activities', title: 'Construction libre', description: 'Développement de la créativité', image: '/images/marketing/about-img-2.jpg' },
  { id: 7, category: 'outdoor', title: 'Découverte nature', description: 'Sortie pédagogique au parc', image: '/images/marketing/about-img-3.jpg' },
  { id: 8, category: 'meals', title: 'Goûter d’anniversaire', description: 'Moment de partage et de joie', image: '/images/marketing/about-img.jpg' },
  { id: 9, category: 'events', title: 'Spectacle de marionnettes', description: 'Animation spéciale pour les enfants', image: '/images/marketing/news-gard.jpg' },
  { id: 10, category: 'rest', title: 'Sieste paisible', description: 'Repos mérité après les activités', image: '/images/marketing/life-gard.jpg' },
  { id: 11, category: 'activities', title: 'Éveil musical', description: 'Rituel musical quotidien', image: '/images/marketing/hero-image.jpg' },
  { id: 12, category: 'outdoor', title: 'Motricité en extérieur', description: 'Parcours et jeux collectifs', image: '/images/marketing/our-sec.jpg' },
]
