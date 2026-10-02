# Write your first test

_The shape of a test here, and the two files it lives in._

Cue set up a working example when you ran `init`. Let's walk through it,
because everything else follows the same shape.

## Two files, two jobs

A test here is split across two files, and the split is the whole idea.

**The test says what a person does.** Read it out loud and it should sound like a
sentence.

```ts title="tests/app/functional/login.spec.ts"
test('a known user reaches their dashboard', { tag: ['@smoke'] }, async ({ loginPage }) => {
  await loginPage.goto();
  await loginPage.logIn('user@example.com', 'correct-password');

  await expect(loginPage.welcomeHeading).toBeVisible();
});
```

**The page object says where things are.** All the fiddly details live here.

```ts title="pages/app/login.page.ts"
export class LoginPage {
  get emailField() {
    return this.page.getByLabel('Email');
  }

  get logInButton() {
    return this.page.getByRole('button', { name: 'Log in' });
  }

  get welcomeHeading() {
    return this.page.getByRole('heading', { name: /welcome/i });
  }
}
```

### Why bother splitting them

When a designer renames a button, you change **one line in one file**. Without
the split, you'd search the whole test suite for every place that button appears.

That's it. That's the entire reason.

## Run it

```bash
npx playwright test
```

Or just the fast ones:

```bash
npx playwright test --grep @smoke
```

## Three habits that matter

### Wait for things, not for seconds

<Callout type="warn">
  Never write `waitForTimeout`. It waits a fixed number of seconds whether your app is ready or not
  — too short and the test fails randomly, too long and your suite crawls.
</Callout>

```ts
// Don't
await page.waitForTimeout(5000);

// Do — this waits exactly as long as it needs to
await expect(loginPage.welcomeHeading).toBeVisible();
```

### Tag every test

```ts
test('user can log in', { tag: ['@smoke'] }, async ({ loginPage }) => {
```

Tags decide when a test runs. `@smoke` means "fast and reliable enough to run on
every push". Without a tag, a test either runs everywhere or nowhere — and both
are wrong.

[The full list of tags →](../reference/constitution.md)

### Let the fixture hand you the page

```ts
// Do — it arrives ready to use
test('...', async ({ loginPage }) => {

// Don't — now this test knows how to build one
const loginPage = new LoginPage(page);
```

## If a check stops you

You'll see a message explaining what's wrong, why, and what to write instead. Want
the longer version?

```bash
npx @wiluszdamian/cue explain no-hard-waits
```

<Callout>
  Fix the code rather than turning the rule off. Every rule is there because somebody lost time to
  the thing it prevents.
</Callout>

## Next

- **[Teach it about your app](./teach-it-your-app.md)** — So nobody has to guess what a button is called.
- **[Finding elements](../guides/finding-elements.md)** — How to choose a good way to point at something.
