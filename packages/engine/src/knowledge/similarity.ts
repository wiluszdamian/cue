/**
 * How well a description matches an element, on whole words rather than fragments.
 * One implementation, so "the nearest known locator" means the same thing to the
 * `locator` command and to the checker that suggests it.
 */

/** Lower-case words: everything that is not a letter or digit separates. */
export function words(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** 0 means no match at all. A role on its own never matches: it would return the first button. */
export function nameSimilarity(name: string | undefined, role: string, query: string): number {
  const own = words(name ?? '');
  if (own.length === 0) return 0;

  const wanted = words(query)
    .split(' ')
    .filter((w) => w.length > 0);
  if (wanted.length === 0) return 0;

  const known = new Set(own.split(' '));
  let hits = 0;
  for (const word of wanted) {
    if (known.has(word)) hits += 2;
    else if (word.length > 3 && own.includes(word)) hits += 1;
  }
  if (hits === 0) return 0;

  // With the name matched, the role separates "submit button" from "submit heading".
  return wanted.includes(role.toLowerCase()) ? hits + 1 : hits;
}
