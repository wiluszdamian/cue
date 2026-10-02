// understudy-route: /items
import type { Locator, Page } from '@playwright/test';

export class ItemsPage {
  constructor(private readonly page: Page) {}

  // Locators
  get newItemField(): Locator {
    return this.page.getByRole('textbox', { name: 'New item' });
  }
  get addButton(): Locator {
    return this.page.getByRole('button', { name: 'Add item' });
  }
  get emptyMessage(): Locator {
    return this.page.getByText('No items yet');
  }
  itemRow(title: string): Locator {
    return this.page.getByRole('listitem').filter({ hasText: title });
  }
  deleteButton(title: string): Locator {
    return this.page.getByRole('button', { name: `Delete ${title}` });
  }

  // Actions
  async open(): Promise<void> {
    await this.page.goto('/items');
  }

  async add(title: string): Promise<void> {
    await this.newItemField.fill(title);
    await this.addButton.click();
  }
}
