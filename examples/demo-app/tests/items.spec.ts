import { expect, test } from '../fixtures/pom/test-options.js';

test.describe('items', () => {
  test('an item can be added and then deleted', { tag: ['@e2e'] }, async ({ itemsPage }) => {
    await itemsPage.open();
    await expect(itemsPage.emptyMessage).toBeVisible();

    await itemsPage.add('Buy milk');
    await expect(itemsPage.itemRow('Buy milk')).toBeVisible();
    await expect(itemsPage.emptyMessage).toBeHidden();

    await itemsPage.deleteButton('Buy milk').click();
    await expect(itemsPage.itemRow('Buy milk')).toBeHidden();
    await expect(itemsPage.emptyMessage).toBeVisible();
  });
});
