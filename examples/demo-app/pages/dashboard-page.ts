// understudy-route: /dashboard
import type { Locator, Page } from '@playwright/test';

export class DashboardPage {
  constructor(private readonly page: Page) {}

  // Locators
  get welcomeHeading(): Locator {
    return this.page.getByRole('heading', { name: /^Welcome back, / });
  }

  // Actions
  async open(): Promise<void> {
    await this.page.goto('/dashboard');
  }
}
