/*
 * Formatting for fields a live provider may not supply.
 *
 * Geoapify returns no rating, review count or price, so every one of these
 * returns null rather than a placeholder. Callers drop nulls out of the facts
 * line, which keeps a card with three facts and a card with one looking
 * equally deliberate.
 */

export const has = (value) => value !== null && value !== undefined && value !== '';

export const ratingText = (value) => (has(value) ? '\u2605 ' + value : null);

export const distanceText = (value) => (has(value) ? value + ' km' : null);

export const priceForTwoText = (value) => (has(value) ? '\u20B9' + value + ' for two' : null);

export const priceText = (value) => (has(value) ? '\u20B9' + value : null);

/** Drops absent entries so no separator is ever rendered next to nothing. */
export const factList = (...values) => values.filter(has);
