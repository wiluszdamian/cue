// understudy-route: /login
import type { Locator, Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  // Locators
  get emailField(): Locator {
    return this.page.getByRole('textbox', { name: 'Email' });
  }
  get passwordField(): Locator {
    return this.page.getByLabel('Password');
  }
  get logInButton(): Locator {
    return this.page.getByRole('button', { name: 'Log in' });
  }
  get errorMessage(): Locator {
    return this.page.getByRole('alert');
  }
  get forgotPasswordLink(): Locator {
    return this.page.getByRole('link', { name: 'Forgot password?' });
  }

  // Actions
  async open(): Promise<void> {
    await this.page.goto('/login');
  }

  async logIn(email: string, password: string): Promise<void> {
    await this.emailField.fill(email);
    await this.passwordField.fill(password);
    await this.logInButton.click();
  }

  /**
   * Logs in and waits until the session exists. A test that goes straight on to another
   * page would otherwise interrupt the redirect that follows the login, and sometimes
   * arrive with no session at all.
   */
  async signIn(email: string, password: string): Promise<void> {
    await this.logIn(email, password);
    await this.page.waitForURL(/\/dashboard$/);
  }
}
