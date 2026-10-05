/**
 * Données du site vitrine — partie STRUCTURELLE uniquement.
 *
 * Tout le texte affiché vit désormais dans `messages/<locale>/marketing.json` ;
 * ce fichier ne conserve que ce qui ne se traduit pas : identifiants, chemins
 * d'images, catégories, chiffres, coordonnées et liens.
 *
 * Les constructeurs `buildSections`, `buildDifferences`, etc. prennent un
 * traducteur en paramètre plutôt que d'appeler `useTranslations` eux-mêmes.
 * C'est volontaire : les pages vitrine mêlent composants client, composants
 * serveur synchrones et composants serveur asynchrones (celles qui vont
 * chercher le blog), et `useTranslations` ne fonctionne pas dans ces derniers.
 * En recevant le traducteur, ces fonctions marchent dans les trois cas —
 * l'appelant choisit entre `useTranslations()` et `await getTranslations()`.
 */

/** Signature minimale commune à `useTranslations()` et `getTranslations()`. */
export type MarketingTranslator = {
  (key: string): string
  raw: (key: string) => unknown
}

/** Coordonnées et identité — aucun de ces champs ne se traduit.
 *  La baseline, l'adresse et les libellés d'horaires, eux, sont dans les
 *  catalogues (cf. `buildBrandCopy`). */
export const BRAND = {
  name: 'Les Petits Rayons de Soleil',
  shortName: 'LPRDS',
  since: 2022,
  phone: '+228 98 60 29 20',
  phoneHref: 'tel:+22898602920',
  whatsapp: 'https://wa.me/22898602920',
  email: 'hello@lespetitsrayonsdesoleil.net',
  social: {
    facebook: 'https://www.facebook.com/p/Les-Petits-Rayons-de-Soleil-61559745601729/',
    instagram: 'https://www.instagram.com/lespetitsrayonsdesoleil_',
    linkedin: 'https://www.linkedin.com/company/lespetitsrayonsdesoleil/',
    tiktok: 'https://www.tiktok.com/@lespetitsrayonsdesoleil',
  },
  /** Plages horaires — les heures sont universelles, seuls les jours se
   *  traduisent (clé `marketing.brand.hours.*`). */
  hours: [
    { key: 'weekdays', hours: '7h00 – 19h00' },
    { key: 'saturday', hours: '11h00 – 19h00' },
    { key: 'sunday', hours: '14h00 – 19h00' },
  ],
} as const

/** Navigation du site vitrine — partagée par l'en-tête et le pied de page.
 *  Clé de libellé (catalogue `marketing.nav.*`) + destination. Vit ici plutôt
 *  que dans l'un des deux composants : le pied de page est un composant
 *  serveur et l'en-tête un composant client, et importer l'un depuis l'autre
 *  entraînerait le premier dans le bundle client. */
export const MARKETING_NAV = [
  { key: 'home', href: '/' },
  { key: 'about', href: '/a-propos' },
  { key: 'sections', href: '/nos-sections' },
  { key: 'gallery', href: '/galerie' },
  { key: 'news', href: '/actualites' },
  { key: 'contact', href: '/contact' },
] as const

export function buildBrandCopy(t: MarketingTranslator) {
  return {
    baseline: t('brand.baseline'),
    address: t('brand.address'),
    hours: BRAND.hours.map(({ key, hours }) => ({
      day: t(`brand.hours.${key}`),
      hours,
    })),
  }
}

// ── Chiffres clés ────────────────────────────────────────────────
const STAT_KEYS = [
  { key: 'children', value: '100+' },
  { key: 'professionals', value: '15' },
  { key: 'sections', value: '6' },
  { key: 'satisfaction', value: '100%' },
] as const

export function buildStats(t: MarketingTranslator) {
  return STAT_KEYS.map(({ key, value }) => ({ value, label: t(`stats.${key}`) }))
}

const WHY_US_KEYS = [
  { key: 'children', value: '+100' },
  { key: 'professionals', value: '+15' },
  { key: 'playground' },
  { key: 'safety' },
] as const

export function buildWhyUs(t: MarketingTranslator) {
  return WHY_US_KEYS.map((entry) => ({
    value: 'value' in entry ? entry.value : undefined,
    label: t(`whyUs.${entry.key}`),
  }))
}

// ── Sections d'âge ───────────────────────────────────────────────
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

/** Ordre d'affichage, catégorie et visuel — invariants d'une langue à l'autre. */
const SECTION_STRUCTURE = [
  { id: 'creche_etoile', category: 'creche', image: '/images/marketing/', hasMorning: true },
  { id: 'creche_nuage', category: 'creche', image: '/images/marketing/about-image-2-Cg9tJUCQ.jpg', hasMorning: true },
  { id: 'creche_soleil', category: 'creche', image: '/images/marketing/about-image-3-DRV-uMPE.jpg', hasMorning: true },
  // La garderie n'accueille qu'après l'école : pas de créneau du matin.
  { id: 'garderie', category: 'garderie', image: '/images/marketing/life-gard.jpg', hasMorning: false },
  { id: 'maternelle_ps', category: 'maternelle', image: '/images/marketing/about-img-2.jpg', hasMorning: true },
  { id: 'maternelle_ms', category: 'maternelle', image: '/images/marketing/about-img-3.jpg', hasMorning: true },
  { id: 'maternelle_gs', category: 'maternelle', image: '/images/marketing/about-img.jpg', hasMorning: true },
] as const satisfies readonly {
  id: string
  category: SectionAgeGroup['category']
  image: string
  hasMorning: boolean
}[]

export function buildSections(t: MarketingTranslator): SectionAgeGroup[] {
  return SECTION_STRUCTURE.map(({ id, category, image, hasMorning }) => ({
    id,
    category,
    image,
    title: t(`sections.${id}.title`),
    shortTitle: t(`sections.${id}.shortTitle`),
    ageRange: t(`sections.${id}.ageRange`),
    capacity: t(`sections.${id}.capacity`),
    ratio: t(`sections.${id}.ratio`),
    description: t(`sections.${id}.description`),
    activities: t.raw(`sections.${id}.activities`) as string[],
    schedule: {
      ...(hasMorning ? { morning: t(`sections.${id}.schedule.morning`) } : {}),
      midday: t(`sections.${id}.schedule.midday`),
      afternoon: t(`sections.${id}.schedule.afternoon`),
    },
  }))
}

// ── Ce qui nous distingue ────────────────────────────────────────
export type Difference = {
  id: string
  title: string
  description: string
}

const DIFFERENCE_IDS = [
  'bilingue',
  'montessori',
  'soins-personnalises',
  'environnement-securise',
  'educatrices-formees',
  'routines-structurees',
  'activites-extrascolaires',
  'espace-de-jeux',
] as const

export function buildDifferences(t: MarketingTranslator): Difference[] {
  return DIFFERENCE_IDS.map((id) => ({
    id,
    title: t(`differences.${id}.title`),
    description: t(`differences.${id}.description`),
  }))
}

// ── Comment nous rejoindre ───────────────────────────────────────
export type JoinStep = {
  id: string
  title: string
  description: string
}

const JOIN_STEP_IDS = ['visite', 'fiche-inscription', 'demarrage-confirme'] as const

export function buildJoinSteps(t: MarketingTranslator): JoinStep[] {
  return JOIN_STEP_IDS.map((id) => ({
    id,
    title: t(`joinSteps.${id}.title`),
    description: t(`joinSteps.${id}.description`),
  }))
}

// ── Intervenants partenaires ─────────────────────────────────────
const PARTNER_IDS = [
  'pediatre',
  'psychologue',
  'psychomotricienne',
  'orthophoniste',
  'maitre-nageur',
  'professeur-musique',
  'professeur-karate',
  'professeure-danse',
  'maitre-armes',
] as const

export function buildPartners(t: MarketingTranslator) {
  return PARTNER_IDS.map((id) => ({
    id,
    name: t(`partners.${id}.name`),
    role: t(`partners.${id}.role`),
  }))
}
