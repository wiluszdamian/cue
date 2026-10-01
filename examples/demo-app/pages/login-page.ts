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
}
