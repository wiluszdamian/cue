// understudy-route: /signup
import type { Locator, Page } from '@playwright/test';

export class SignupPage {
  constructor(private readonly page: Page) {}

  // Locators
  get emailField(): Locator {
    return this.page.getByRole('textbox', { name: 'Email address' });
  }
  get passwordField(): Locator {
    return this.page.getByLabel('Choose a password');
  }
  get createAccountButton(): Locator {
    return this.page.getByRole('button', { name: 'Create account' });
  }
  get emailError(): Locator {
    return this.page.getByRole('alert');
  }
  get confirmation(): Locator {
    return this.page.getByRole('status');
  }

  // Actions
  async open(): Promise<void> {
    await this.page.goto('/signup');
  }

  async signUp(email: string, password: string): Promise<void> {
    await this.emailField.fill(email);
    await this.passwordField.fill(password);
    await this.createAccountButton.click();
  }
}
