import { test as base } from '@playwright/test';
import { DashboardPage } from '../../pages/dashboard-page.js';
import { ItemsPage } from '../../pages/items-page.js';
import { LoginPage } from '../../pages/login-page.js';
import { SecurityPage } from '../../pages/security-page.js';
import { SignupPage } from '../../pages/signup-page.js';

/** The only place specs import `test` from, so a fixture changes in one file. */
export const test = base.extend<{
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  signupPage: SignupPage;
  securityPage: SecurityPage;
  itemsPage: ItemsPage;
}>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  signupPage: async ({ page }, use) => {
    await use(new SignupPage(page));
  },
  securityPage: async ({ page }, use) => {
    await use(new SecurityPage(page));
  },
  itemsPage: async ({ page }, use) => {
    await use(new ItemsPage(page));
  },
});

export { expect } from '@playwright/test';
