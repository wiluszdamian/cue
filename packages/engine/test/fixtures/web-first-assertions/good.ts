import { expect } from '@playwright/test';

export async function check(total: Locator) {
  await expect(total).toHaveText('42');
  await expect(total).toBeVisible();
  await expect.poll(() => fetchTotal()).toBe(42);
}
