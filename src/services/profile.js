/*
 * Food DNA and profile stats, derived rather than stored: they are a reading of
 * what the user has actually swiped, blended with the seed preferences in
 * user.json. Pure functions so they can be tested without React.
 *
 * Explicitly not machine learning. Each dimension is a counted rule you can
 * read off the page, which is the point — a profile feature, not a model.
 */

/** Which cuisines feed which dimension. */
const DIMENSIONS = [
  { id: 'indian', label: 'Indian', cuisines: ['South Indian', 'North Indian', 'Hyderabadi', 'Andhra', 'Awadhi', 'Biryani', 'Breakfast'] },
  { id: 'asian', label: 'Asian', cuisines: ['Japanese', 'Ramen', 'Chinese', 'Burmese', 'Thai'] },
  { id: 'fastFood', label: 'Fast Food', cuisines: ['American', 'Burgers', 'Pizza', 'Middle Eastern', 'Grill'] },
  { id: 'healthy', label: 'Healthy', cuisines: ['Vegetarian', 'Healthy', 'Salads'] },
  { id: 'sweet', label: 'Sweet', cuisines: ['Cafe', 'Bakery', 'Desserts'] }
];

const SPICY_CUISINES = ['Andhra', 'Hyderabadi', 'Biryani', 'South Indian', 'Thai'];

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Every card id this user has liked: the group they are playing right now, plus
 * the liked ids recorded on each past match. History carries its own copy so a
 * profile does not empty out when the active group is reset.
 *
 * Returns ids rather than records so this module stays free of data imports and
 * can be unit tested without the catalog.
 */
export function likedCardIdsFor(userId, { group = null, history = [] } = {}) {
  const ids = new Set();

  const active = group?.votes?.[userId] || {};
  Object.entries(active).forEach(([cardId, dir]) => {
    if (dir === 'like') ids.add(cardId);
  });

  history.forEach((entry) => {
    if (entry?.userId && entry.userId !== userId) return;
    (entry?.likedCardIds || []).forEach((cardId) => ids.add(cardId));
  });

  return [...ids];
}

/**
 * @param seed  user.foodDNA from the mock profile
 * @param liked cards the user has liked
 * @returns [{ id, label, value, basis }] value 0-100
 */
export function computeFoodDNA(seed = {}, liked = []) {
  const total = liked.length;
  const seedCuisines = new Set(seed.topCuisines || []);

  const dims = DIMENSIONS.map((d) => {
    const hits = liked.filter((c) => c.cuisines?.some((x) => d.cuisines.includes(x))).length;
    // Seed preferences act as a starting lean so a brand new profile is not
    // flat at zero; swipes then move it.
    const seedLean = d.cuisines.some((c) => seedCuisines.has(c)) ? 45 : 12;
    const swiped = total ? (hits / total) * 100 : null;
    const value = swiped === null ? seedLean : swiped * 0.7 + seedLean * 0.3;
    return { id: d.id, label: d.label, value: clamp(value), hits, basis: total };
  });

  const spicyHits = liked.filter((c) => c.cuisines?.some((x) => SPICY_CUISINES.includes(x))).length;
  const vegHits = liked.filter((c) => c.veg === true).length;
  const vegBasis = liked.filter((c) => typeof c.veg === 'boolean').length;

  dims.push({
    id: 'spicy',
    label: 'Spicy',
    value: clamp(total ? (spicyHits / total) * 70 + (seed.spice || 0) * 6 : (seed.spice || 0) * 20),
    hits: spicyHits,
    basis: total
  });
  dims.push({
    id: 'vegetarian',
    label: 'Vegetarian',
    value: clamp(vegBasis ? (vegHits / vegBasis) * 100 : seed.veg ? 80 : 20),
    hits: vegHits,
    basis: vegBasis
  });
  dims.push({
    id: 'adventurous',
    label: 'Adventurous',
    // Breadth relative to how much has been swiped. Normalised against ~1.8
    // cuisine tags per card, since one card can carry several and a plain
    // distinct/total ratio pegged everyone at 100. The floor of 3 stops a
    // single multi-tag card from reading as maximally adventurous.
    value: clamp(total ? (distinctCuisines(liked) / (Math.max(3, total) * 1.8)) * 100 : seed.adventurous || 0),
    hits: distinctCuisines(liked),
    basis: total
  });

  return dims;
}

function distinctCuisines(liked) {
  const set = new Set();
  liked.forEach((c) => (c.cuisines || []).forEach((x) => set.add(x)));
  return set.size;
}

/** Headline stats for the profile screen. */
export function computeStats({ history = [], liked = [] } = {}) {
  const withWinner = history.filter((h) => h.winner);
  const counts = {};
  liked.forEach((c) => (c.cuisines || []).forEach((x) => (counts[x] = (counts[x] || 0) + 1)));
  const favourite = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  return {
    matchesPlayed: history.length,
    matchesFound: withWinner.length,
    placesLiked: liked.length,
    favouriteCuisine: favourite ? favourite[0] : null
  };
}

/** One-line summary under the user's name. */
export function summarise(stats, dna) {
  if (!stats.placesLiked) return 'Swipe a few places and your Food DNA will fill in.';
  const top = [...dna].sort((a, b) => b.value - a.value)[0];
  const fav = stats.favouriteCuisine ? `${stats.favouriteCuisine} regular` : 'still deciding';
  return `${fav}, leaning ${top.label.toLowerCase()}. ${stats.placesLiked} places liked so far.`;
}
