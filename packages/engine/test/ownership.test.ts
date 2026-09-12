import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRules } from '../src/loader.js';
import { formatAnswer, whoOwns } from '../src/ownership.js';
import { validateRules } from '../src/validate.js';

/**
 * The arbitration layer. These pin routing decisions rather than implementation,
 * because the failure that matters is silent: a keyword added to one topic steals
 * questions from another, and a misrouted question does not error — it sends the
 * agent confidently to the wrong authority.
 */

const rules = loadRules(join(import.meta.dirname, '..', '..', '..', 'rules'));

function ownerOf(question: string): string {
  const answer = whoOwns(rules.ownership, question);
  return answer.kind === 'unowned' ? 'unowned' : answer.best.owner.id;
}

function topicOf(question: string): string {
  const answer = whoOwns(rules.ownership, question);
  return answer.kind === 'unowned' ? 'unowned' : answer.best.topic.topic;
}

describe('the table is internally consistent', () => {
  it('passes every cross-check', () => {
    expect(validateRules(rules)).toEqual([]);
  });

  it('declares an owner for every topic', () => {
    const ids = new Set(rules.ownership.owners.map((o) => o.id));
    for (const topic of rules.ownership.topics) {
      expect(ids.has(topic.owner), `${topic.topic} -> ${topic.owner}`).toBe(true);
    }
  });

  it('gives every owner at least one topic', () => {
    for (const owner of rules.ownership.owners) {
      const owned = rules.ownership.topics.filter((t) => t.owner === owner.id);
      expect(owned.length, `${owner.id} owns nothing`).toBeGreaterThan(0);
    }
  });

  it('reserves absolute precedence for sources nobody upstream can know', () => {
    // An external source cannot know what this repo decided or what this
    // application looks like, which is all absolute precedence is for.
    const internal = new Set(
      rules.ownership.owners.filter((o) => o.kind === 'internal').map((o) => o.id),
    );
    for (const topic of rules.ownership.topics) {
      if (topic.precedence === 'absolute') {
        expect(internal.has(topic.owner), `${topic.topic} is absolute but external`).toBe(true);
      }
    }
  });
});

describe('routing', () => {
  it.each([
    // How to choose a locator is ours; which one exists is the knowledge base's.
    ['which locator should I use', 'understudy'],
    ['what is the data-testid for the checkout button', 'agent-kb'],
    ['where should locators live', 'understudy'],

    ['how do I record a trace', 'playwright-official'],
    ['how do I set up storage state', 'playwright-official'],
    ['how do I test a Svelte component', 'reference-skill'],
    ['how do I do visual regression', 'reference-skill'],
    ['what tag should this test carry', 'understudy'],
    ['should this zod schema be strict', 'understudy'],
  ])('routes %j to %s', (question, owner) => {
    expect(ownerOf(question)).toBe(owner);
  });

  it('sends browser exploration to the CLI rather than to MCP', () => {
    const answer = whoOwns(rules.ownership, 'how do I explore the page and inspect elements');
    expect(answer.kind).toBe('owned');
    if (answer.kind !== 'owned') return;
    expect(answer.best.owner.id).toBe('playwright-official');
    // A full accessibility tree through MCP costs more context than the task it serves.
    expect(answer.best.topic.channel).toBe('cli');
  });

  it('matches on whole tokens, never on substrings', () => {
    // `data-testid` contains `data` and `test`, and substring matching sent this
    // to the test-data owner: confidently wrong.
    expect(topicOf('what is the data-testid for the checkout button')).not.toBe(
      'test data strategy',
    );
  });

  it('treats singular and plural alike', () => {
    expect(ownerOf('where should locators live')).toBe(ownerOf('where should a locator live'));
  });
});

describe('an unowned topic is a stated gap, not silence', () => {
  it('reports no owner for a question the table does not cover', () => {
    const answer = whoOwns(rules.ownership, 'what colour should the primary button be');
    expect(answer.kind).toBe('unowned');
  });

  it('tells the reader to flag the gap rather than improvise', () => {
    const text = formatAnswer(whoOwns(rules.ownership, 'what colour should the button be'));
    expect(text).toContain('gap in rules/ownership.yaml');
    expect(text).toMatch(/do not pick a\s*\n?\s*convention/i);
  });
});

describe('answers are written to be acted on', () => {
  it('states the precedence, the owner, and what to consult', () => {
    const text = formatAnswer(whoOwns(rules.ownership, 'which locator should I use'));
    expect(text).toContain('Owner: Understudy');
    expect(text).toContain('ABSOLUTE');
    expect(text).toContain('rules/constitution.yaml');
  });

  it('names the channel when one is specified', () => {
    const text = formatAnswer(whoOwns(rules.ownership, 'how do I explore the page'));
    expect(text).toContain('Use it through: cli');
  });
});
