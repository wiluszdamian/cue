// understudy-route: /admin/settings/security
import type { Locator, Page } from '@playwright/test';

export class SecurityPage {
  constructor(private readonly page: Page) {}

  // Locators
  get heading(): Locator {
    return this.page.getByRole('heading', { name: 'Security settings' });
  }
  get currentPasswordField(): Locator {
    return this.page.getByLabel('Current password');
  }
  get newPasswordField(): Locator {
    return this.page.getByLabel('New password');
  }
  get changePasswordButton(): Locator {
    return this.page.getByRole('button', { name: 'Change password' });
  }
  get confirmation(): Locator {
    return this.page.getByRole('status');
  }
  get forbiddenHeading(): Locator {
    return this.page.getByRole('heading', { name: 'Forbidden' });
  }

  // Actions
  async open(): Promise<void> {
    await this.page.goto('/admin/settings/security');
  }

  async changePassword(current: string, next: string): Promise<void> {
    await this.currentPasswordField.fill(current);
    await this.newPasswordField.fill(next);
    await this.changePasswordButton.click();
  }
}
