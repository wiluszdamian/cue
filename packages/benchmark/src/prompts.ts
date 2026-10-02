/**
 * The prompt set: fixed and versioned, because inputs that move cannot be
 * compared with an earlier run. Adding a prompt means a new version, not an edit.
 *
 * Written the way somebody would actually ask — no hint of a rule, no mention of
 * Cue — and each targets rules the constitution can check mechanically.
 */

export const PROMPT_SET_VERSION = 1;

export interface Prompt {
  readonly id: string;
  readonly text: string;
  /** Rules this prompt gives an assistant an obvious chance to break. */
  readonly exercises: readonly string[];
  /** The application the answer is run against, when it is run at all. */
  readonly app?: 'demo';
  /**
   * A defect of that application (see examples/demo-app/mutations.mjs) that a good
   * test for this task should catch. Used by the mutation check.
   */
  readonly mutation?: string;
}

/** Version 1: no application behind it, so it can be scored but never run. */
export const PROMPTS_V1: readonly Prompt[] = [
  {
    id: 'login-success',
    text: 'Write a Playwright test that logs in with a valid email and password and checks the user reaches their dashboard.',
    exercises: ['require-test-tags', 'no-locators-in-tests', 'selectors-from-agent-kb'],
  },
  {
    id: 'login-failure',
    text: 'Write a Playwright test that a wrong password shows an error message and does not log the user in.',
    exercises: ['require-test-tags', 'web-first-assertions', 'selectors-from-agent-kb'],
  },
  {
    id: 'slow-page',
    text: 'Write a Playwright test for a dashboard that takes a couple of seconds to finish loading before the welcome heading appears.',
    // The phrasing invites a fixed wait without ever suggesting one.
    exercises: ['no-hard-waits', 'web-first-assertions'],
  },
  {
    id: 'form-validation',
    text: 'Write Playwright tests checking that the sign-up form rejects several invalid email addresses.',
    exercises: ['require-test-tags', 'no-locators-in-tests'],
  },
  {
    id: 'api-contract',
    text: 'Write a Playwright API test that GET /api/users returns a list of users, and validate the response shape with zod.',
    exercises: ['strict-zod-objects', 'no-explicit-any', 'require-test-tags'],
  },
  {
    id: 'forgot-password',
    text: 'Write a Playwright test for the forgot-password link on the login page: clicking it should take the user to the password reset page.',
    exercises: ['selectors-from-agent-kb', 'no-locators-in-tests'],
  },
  {
    id: 'checkout',
    text: 'Write a Playwright test that adds an item to the basket and completes checkout.',
    // Nothing here has been surveyed, so a grounded answer is impossible. The
    // right behaviour is to say so; inventing selectors is the failure.
    exercises: ['selectors-from-agent-kb'],
  },
  {
    id: 'staging-smoke',
    text: 'Write a quick Playwright smoke test that hits our staging site at https://staging.example.com and checks the home page loads.',
    exercises: ['no-hardcoded-urls', 'require-test-tags'],
  },
  {
    id: 'flaky-quarantine',
    text: 'The refund test is failing intermittently. Skip it for now so the build goes green.',
    exercises: ['skips-need-a-reason'],
  },
  {
    id: 'debug-one-test',
    text: 'I only want to run the login test while I debug it. Change the file so just that one runs.',
    // The obvious move is `.only`, which is the thing that silently reduces CI
    // to one test while still reporting green.
    exercises: ['no-focused-tests'],
  },
];

/** The set every earlier recording was made against. Kept as it was. */
export const PROMPTS: readonly Prompt[] = PROMPTS_V1;

/**
 * Version 2: tasks on the demo application, so the answer can be compiled, run in
 * a browser and checked against what the application really has. The credentials
 * and the base URL convention are part of the task for both conditions: neither
 * is something the knowledge base is meant to supply.
 */
export const PROMPT_SET_V2_VERSION = 2;

const DEMO =
  ' The application is served at the configured baseURL, so use relative paths. ' +
  'Sign in as user@demo.test / user-pass, or admin@demo.test / admin-pass for an admin.';

export const PROMPTS_V2: readonly Prompt[] = [
  {
    id: 'demo-login',
    text:
      'Write a Playwright test that logs in with a valid account and checks the user reaches their dashboard and is greeted by name.' +
      DEMO,
    exercises: [
      'require-test-tags',
      'no-locators-in-tests',
      'selectors-from-agent-kb',
      'no-hard-waits',
    ],
    app: 'demo',
    mutation: 'auth-silent-fail',
  },
  {
    id: 'demo-login-failure',
    text:
      'Write a Playwright test that a wrong password shows an error message and does not log the user in.' +
      DEMO,
    exercises: ['require-test-tags', 'web-first-assertions', 'selectors-from-agent-kb'],
    app: 'demo',
    mutation: 'wrong-password-accepted',
  },
  {
    id: 'demo-signup-validation',
    text:
      'Write Playwright tests checking that the sign-up form rejects several invalid email addresses and accepts a valid one.' +
      DEMO,
    exercises: ['require-test-tags', 'no-locators-in-tests', 'selectors-from-agent-kb'],
    app: 'demo',
    mutation: 'signup-validation-off',
  },
  {
    id: 'demo-admin-security',
    text:
      'Write a Playwright test that an admin can change their password from the security settings page, and that a regular user is not allowed to open it.' +
      DEMO,
    exercises: ['require-test-tags', 'selectors-from-agent-kb', 'no-locators-in-tests'],
    app: 'demo',
    mutation: 'button-renamed',
  },
  {
    id: 'demo-navigation',
    text:
      'Write a Playwright test that after logging in the user can move from the dashboard to the items page using the navigation.' +
      DEMO,
    exercises: ['require-test-tags', 'selectors-from-agent-kb', 'web-first-assertions'],
    app: 'demo',
  },
  {
    id: 'demo-items-crud',
    text:
      'Write a Playwright test that an item can be added to the items list and then deleted, and that the empty state is shown when none are left.' +
      DEMO,
    exercises: ['require-test-tags', 'selectors-from-agent-kb', 'no-locators-in-tests'],
    app: 'demo',
  },
  {
    id: 'demo-api-and-ui',
    text:
      'Write a Playwright test that creates an item through the API (POST /api/items) and then checks it appears on the items page in the browser.' +
      DEMO,
    exercises: ['require-test-tags', 'selectors-from-agent-kb', 'no-hardcoded-urls'],
    app: 'demo',
  },
];

export interface PromptSet {
  readonly version: number;
  readonly prompts: readonly Prompt[];
}

export const PROMPT_SETS: readonly PromptSet[] = [
  { version: PROMPT_SET_VERSION, prompts: PROMPTS_V1 },
  { version: PROMPT_SET_V2_VERSION, prompts: PROMPTS_V2 },
];

/** Undefined for a version that does not exist, so the caller can say which do. */
export function promptSet(version: number): PromptSet | undefined {
  return PROMPT_SETS.find((candidate) => candidate.version === version);
}

export function promptsExercising(ruleId: string): Prompt[] {
  return PROMPTS.filter((prompt) => prompt.exercises.includes(ruleId));
}
