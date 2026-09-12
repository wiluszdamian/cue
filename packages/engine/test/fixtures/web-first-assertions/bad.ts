import { expect } from '@playwright/test';

export async function check(total: Locator) {
  expect(await total.textContent()).toBe('42');
  expect(await total.isVisible()).toBe(true);
}
