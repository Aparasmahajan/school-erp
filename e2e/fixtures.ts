import { test as base, expect, type Page } from '@playwright/test';

export const SCHOOL = 'http://localhost:8797';
export const CONSOLE = 'http://localhost:8798';
export const PASSWORD = 'Demo@12345';

/**
 * Every test fails if the page throws or logs an error. Failed network requests the app
 * handles on purpose (a 401 before sign-in, a 403 the page explains) are not errors.
 */
export const test = base.extend<{ watch: string[] }>({
  watch: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (/Failed to load resource/.test(text)) return;
        problems.push(`console error: ${text}`);
      });
      await use(problems);
      expect(problems, 'browser errors during the test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function schoolSignIn(page: Page, email: string, password = PASSWORD) {
  await page.goto(`${SCHOOL}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Hello');
}

export async function consoleSignIn(page: Page, email: string) {
  await page.goto(`${CONSOLE}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'The network today' })).toBeVisible();
}

export async function nav(page: Page, label: string) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label, exact: true }).click();
}
