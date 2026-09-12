/**
 * The prompt set: fixed and versioned, because inputs that move cannot be
 * compared with an earlier run. Adding a prompt means a new version, not an edit.
 *
 * Written the way somebody would actually ask — no hint of a rule, no mention of
 * Understudy — and each targets rules the constitution can check mechanically.
 */

export const PROMPT_SET_VERSION = 1;

export interface Prompt {
  readonly id: string;
  readonly text: string;
  /** Rules this prompt gives an assistant an obvious chance to break. */
  readonly exercises: readonly string[];
}

export const PROMPTS: readonly Prompt[] = [
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

export function promptsExercising(ruleId: string): Prompt[] {
  return PROMPTS.filter((prompt) => prompt.exercises.includes(ruleId));
}
