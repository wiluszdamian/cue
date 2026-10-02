import { describe, expect, it } from 'vitest';
import { findPageObjectClasses } from '../src/discovery/page-objects.js';

describe('finding page objects', () => {
  it.each([
    [
      'a constructor parameter property',
      'class LoginPage { constructor(private readonly page: Page) {} }',
    ],
    [
      'a plain constructor parameter',
      'class LoginPage { constructor(page: Page) { this.p = page; } }',
    ],
    ['a field', 'class LoginPage { page: Page; constructor() {} }'],
    ['a readonly field', 'class LoginPage { readonly page: Page = undefined as never; }'],
    ['a default parameter', 'class LoginPage { constructor(page: Page = defaultPage()) {} }'],
    [
      'an exported class',
      "import type { Page } from '@playwright/test';\nexport class LoginPage { constructor(public page: Page) {} }",
    ],
  ])('finds a class holding a Page as %s', (_what, source) => {
    expect(findPageObjectClasses(source)).toEqual(['LoginPage']);
  });

  it('finds every one in a file, whatever it is called', () => {
    expect(
      findPageObjectClasses(`
        class Header { constructor(private page: Page) {} }
        class Footer { constructor(private page: Page) {} }
        class Helper { run() {} }
      `),
    ).toEqual(['Header', 'Footer']);
  });

  it('does not take a class that merely mentions Page', () => {
    expect(findPageObjectClasses('class Paginator { constructor(page: number) {} }')).toEqual([]);
    expect(findPageObjectClasses('class Router { page: string = ""; }')).toEqual([]);
    expect(findPageObjectClasses('class X { constructor(page: Pages) {} }')).toEqual([]);
  });

  it('finds none in code that does not parse, rather than throwing', () => {
    expect(findPageObjectClasses('class { not (')).toEqual([]);
    expect(findPageObjectClasses('')).toEqual([]);
  });
});
