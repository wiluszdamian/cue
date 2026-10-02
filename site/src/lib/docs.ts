export interface DocPage {
  slug: string;
  title: string;
  group: string;
  description: string;
}

/** Sidebar order, which is also the previous/next order. */
export const DOCS: DocPage[] = [
  {
    slug: '',
    title: 'Introduction',
    group: 'Getting started',
    description:
      'Cue helps you and your AI agent write Playwright tests that match how your team already works.',
  },
  {
    slug: 'quickstart',
    title: 'Quickstart',
    group: 'Getting started',
    description: 'Add Cue to a Playwright project in about five minutes.',
  },
  {
    slug: 'agents',
    title: 'Set up your agent',
    group: 'Getting started',
    description:
      'Cue wires itself into the agents it finds. You can add or remove one at any time.',
  },
  {
    slug: 'survey',
    title: 'Teach it your app',
    group: 'Your application',
    description: 'Let Cue visit your app and write down what is actually there.',
  },
  {
    slug: 'verify',
    title: 'Keep the map current',
    group: 'Your application',
    description: 'Check the map against the running app, and see plainly what was not checked.',
  },
  {
    slug: 'commands',
    title: 'Commands',
    group: 'Reference',
    description: 'Every command, with what it is for.',
  },
  {
    slug: 'rules',
    title: 'Rules',
    group: 'Reference',
    description:
      'Eleven rules, ten enforced by ESLint. Each one says what is wrong, why, and what to write instead.',
  },
  {
    slug: 'owners',
    title: 'Who decides what',
    group: 'Reference',
    description: 'When sources of Playwright advice disagree, this table says which one wins.',
  },
];

export const GROUPS = [...new Set(DOCS.map((d) => d.group))];
