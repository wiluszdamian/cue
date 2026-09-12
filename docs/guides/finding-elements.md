# Finding elements

_How to point at a button, and where the right answer comes from._

Two questions that get muddled together:

1. **What kind of locator should I use?** Answered here.
2. **What is this particular button called in my app?** Answered by
   [your app's notes](../start/teach-it-your-app.md).

## Prefer what a person would say

In order of preference:

```ts
// Best — matches what a user sees and a screen reader announces
page.getByRole('button', { name: 'Log in' });

// Good — for form fields
page.getByLabel('Email');
page.getByPlaceholder('you@example.com');

// Fine — when there is nothing else to grab hold of
page.getByTestId('checkout-submit');

// Avoid
page.locator('.btn-primary > span:nth-child(2)');
```

## Why not CSS

```ts
page.locator('.btn-primary');
```

That is tied to how the page is styled. Somebody renames a class during a
redesign, your test breaks, and nothing about the application actually changed.

`getByRole('button', { name: 'Log in' })` is tied to what the button _is_. It
only breaks when the button genuinely changes — which is exactly when you want to
hear about it.

<Callout type="warn">
  CSS and XPath strings are blocked by a check. If you genuinely need one, write it explicitly as
  `page.locator('css=...')`, so the choice stays visible in review rather than slipping past
  unnoticed.
</Callout>

## Never invent one

If you do not know what something is called, look it up.

```bash
npx @understudy/cli locator "checkout button"
```

If Understudy does not know either, it says so and tells you which page to go and
look at. It will not make one up, and neither should you.

An invented locator does not fail with "I guessed". It fails as though your app
is broken — and that is an afternoon gone.

## Organising them

Locators live in a page object, in three groups.

```ts
export class LoginPage {
  // --- inputs ---
  get emailField() {
    return this.page.getByLabel('Email');
  }

  // --- actions ---
  get logInButton() {
    return this.page.getByRole('button', { name: 'Log in' });
  }

  // --- feedback ---
  get errorMessage() {
    return this.page.getByRole('alert');
  }
}
```

The grouping earns its keep because the feedback ones are what your checks use,
and they are the ones you go hunting for. Buried among the click targets, they
make the file harder to read every single time.
