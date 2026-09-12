import type { Owner, Ownership, Topic } from './schema/ownership.js';

/**
 * Resolving "who decides this?". Three skill trees with no arbiter means choosing
 * between contradictory instructions at random.
 */

export interface OwnershipMatch {
  readonly topic: Topic;
  readonly owner: Owner;
  readonly score: number;
  readonly matched: readonly string[];
}

/** `contested` means another owner scored comparably: the table is too coarse here. */
export interface OwnedAnswer {
  readonly kind: 'owned';
  readonly query: string;
  readonly best: OwnershipMatch;
  readonly alternatives: readonly OwnershipMatch[];
  readonly contested: boolean;
}

/** An unowned topic is a gap to fill in ownership.yaml, not licence to improvise. */
export interface UnownedAnswer {
  readonly kind: 'unowned';
  readonly query: string;
}

export type OwnershipAnswer = OwnedAnswer | UnownedAnswer;

/** Second-best is "comparable" at three quarters of the winning score. */
const CONTESTED_RATIO = 0.75;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.\-@ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Crude singularisation. Guarded so `css` does not become `cs`. */
function singular(word: string): string {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

/**
 * Whole tokens, never substrings: `data-testid` contains both `data` and `test`,
 * which sent selector questions to the test-data owner.
 */
function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((word) => word.length > 0)
    .map(singular);
}

function containsSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** A curated keyword outweighs overlap with the title, which was written to be read. */
function scoreTopic(topic: Topic, tokens: readonly string[]): { score: number; matched: string[] } {
  const matched: string[] = [];
  let score = 0;

  for (const keyword of topic.keywords) {
    const needle = tokenize(keyword);
    if (containsSequence(tokens, needle)) {
      // Longer phrases are stronger evidence: "storage state" over "state".
      score += needle.length * 3;
      matched.push(keyword);
    }
  }

  const present = new Set(tokens);
  for (const word of new Set(tokenize(topic.topic))) {
    if (word.length > 3 && present.has(word)) score += 1;
  }

  return { score, matched };
}

export function whoOwns(ownership: Ownership, query: string): OwnershipAnswer {
  const tokens = tokenize(query);
  const owners = new Map(ownership.owners.map((o) => [o.id, o]));

  const matches: OwnershipMatch[] = [];
  for (const topic of ownership.topics) {
    const { score, matched } = scoreTopic(topic, tokens);
    if (score === 0) continue;
    const owner = owners.get(topic.owner);
    if (owner) matches.push({ topic, owner, score, matched });
  }

  if (matches.length === 0) return { kind: 'unowned', query };

  matches.sort(
    (a, b) =>
      b.score - a.score ||
      // A tie goes to the absolute-precedence source. That is what it means.
      Number(b.topic.precedence === 'absolute') - Number(a.topic.precedence === 'absolute') ||
      a.topic.topic.localeCompare(b.topic.topic),
  );

  const [best, ...alternatives] = matches as [OwnershipMatch, ...OwnershipMatch[]];
  const runnerUp = alternatives[0];
  const contested =
    runnerUp !== undefined &&
    runnerUp.owner.id !== best.owner.id &&
    runnerUp.score >= best.score * CONTESTED_RATIO;

  return { kind: 'owned', query, best, alternatives, contested };
}

/** Topics that claim a given constitution `skill`. */
export function topicsForSkill(ownership: Ownership, skill: string): Topic[] {
  return ownership.topics.filter((t) => t.skills.includes(skill));
}

/** The decision, why it binds, and what to go and do. */
export function formatAnswer(answer: OwnershipAnswer): string {
  if (answer.kind === 'unowned') {
    return [
      `No owner is declared for "${answer.query}".`,
      '',
      'This is a gap in rules/ownership.yaml, not an open question. Do not pick a',
      'convention on the spot: say that the topic is unowned, and open an issue to',
      'add it to the table. A rule everyone follows because it was written down',
      'beats a rule invented consistently by nobody.',
    ].join('\n');
  }

  const { best, contested, alternatives } = answer;
  const out: string[] = [];

  out.push(`Topic: ${best.topic.topic}`);
  out.push(`Owner: ${best.owner.name} (${best.owner.id}, ${best.owner.kind})`);
  out.push(
    best.topic.precedence === 'absolute'
      ? 'Precedence: ABSOLUTE — this wins over any other source that says otherwise.'
      : 'Precedence: default — authoritative unless an absolute owner also covers the question.',
  );
  if (best.topic.channel) out.push(`Use it through: ${best.topic.channel}`);
  out.push('');
  out.push(`What to do: ${best.owner.consult.replace(/\s+/g, ' ').trim()}`);
  if (best.topic.note) out.push(`Note: ${best.topic.note.replace(/\s+/g, ' ').trim()}`);

  if (contested && alternatives[0]) {
    out.push('');
    out.push(
      `Contested: "${alternatives[0].topic.topic}" (${alternatives[0].owner.id}) scored ` +
        `comparably. The answer above stands, but the table is too coarse here — ` +
        `worth splitting the topic.`,
    );
  }

  return out.join('\n');
}
