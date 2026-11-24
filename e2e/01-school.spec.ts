import { expect, nav, schoolSignIn, SCHOOL, test } from './fixtures';

test.describe('school app', () => {
  test('wrong password is refused with a clear message, right one signs in', async ({ page }) => {
    await page.goto(`${SCHOOL}/login`);
    await expect(page.getByText('Sunrise Public School (demo)')).toBeVisible();
    await page.getByLabel('Email').fill('principal@demo.school');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
    await page.getByLabel('Password').fill('Demo@12345');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hello, Anita');
    await expect(page.getByText('Students present today')).toBeVisible();
    await expect(page.getByText('Staff checked in')).toBeVisible();
  });

  test('a signed-out visitor is sent to sign in, then back where they were going', async ({ page }) => {
    await page.goto(`${SCHOOL}/staff`);
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email').fill('principal@demo.school');
    await page.getByLabel('Password').fill('Demo@12345');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Staff' })).toBeVisible();
  });

  test('the principal can open every screen without errors', async ({ page }) => {
    await schoolSignIn(page, 'principal@demo.school');
    const screens: [string, string][] = [
      ['Students', 'Students'],
      ['Attendance', 'Attendance'],
      ['Classes & sections', 'Classes & sections'],
      ['My check-in', 'My check-in'],
      ['Staff attendance', 'Staff attendance'],
      ['Staff', 'Staff'],
      ['Attendance zones', 'Attendance zones'],
      ['Roles & access', 'Roles & access'],
      ['School settings', 'School settings'],
      ['Dashboard', 'Hello, Anita'],
    ];
    for (const [link, heading] of screens) {
      await nav(page, link);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await expect(page.locator('.notice-bad')).toHaveCount(0);
    }
  });

  test('a class teacher marks the register in one save, and it sticks', async ({ page }) => {
    await schoolSignIn(page, 'teacher@demo.school');
    await nav(page, 'Attendance');
    await expect(page.getByLabel('Section')).toHaveValue(/.+/);
    await expect(page.locator('select[class="select"] option:checked')).toHaveText('7-B (your class)');
    const rows = page.locator('.roster-row');
    await expect(rows).toHaveCount(12);
    const firstName = (await rows.first().locator('.who .strong').textContent())!;
    await page.getByRole('group', { name: `Status for ${firstName}` }).getByRole('button', { name: 'Absent' }).click();
    await expect(page.locator('.tally .bad p').last()).toHaveText('1');
    await page.getByRole('button', { name: 'Save attendance for 12 students' }).click();
    await expect(page.getByText(/^Saved at/)).toBeVisible();

    await page.reload();
    await expect(page.getByRole('group', { name: `Status for ${firstName}` }).getByRole('button', { name: 'Absent' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/Marked by Meera Iyer/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  test('a teacher only sees what their role allows', async ({ page }) => {
    await schoolSignIn(page, 'teacher@demo.school');
    const menu = page.getByRole('navigation', { name: 'Main' });
    for (const hidden of ['Staff', 'Roles & access', 'School settings', 'Attendance zones', 'Classes & sections']) {
      await expect(menu.getByRole('link', { name: hidden, exact: true })).toHaveCount(0);
    }
    await page.goto(`${SCHOOL}/roles`);
    await expect(page.getByText("You can't view roles and access.")).toBeVisible();
  });

  test('students: search, open a profile, edit, and add a new student', async ({ page }) => {
    await schoolSignIn(page, 'principal@demo.school');
    await nav(page, 'Students');
    await expect(page.getByText(/^180 students$/)).toBeVisible();
    const firstRow = page.locator('tbody tr').first();
    const name = (await firstRow.locator('.link-btn').textContent())!.trim();
    await page.getByLabel('Search').fill(name.split(' ')[0]);
    await expect(page.locator('tbody tr').first()).toContainText(name.split(' ')[0]);
    await page.locator('tbody tr').first().locator('.link-btn').click();
    const profile = page.getByRole('complementary').filter({ has: page.getByRole('button', { name: 'Edit details' }) });
    await expect(profile.getByRole('heading', { level: 2 })).toBeVisible();

    await profile.getByRole('button', { name: 'Edit details' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Last name').fill('Testwala');
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    await expect(profile.getByRole('heading', { level: 2 })).toContainText('Testwala');

    await page.getByRole('button', { name: 'Add student' }).click();
    const add = page.getByRole('dialog');
    await add.getByLabel('First name').fill('Navya');
    await add.getByLabel('Last name').fill('Krishnan');
    await add.getByLabel('Admission number').fill('2026/9001');
    await add.getByLabel('Roll number').fill('40');
    await add.getByLabel('Name', { exact: true }).fill('Lata Krishnan');
    await add.getByLabel('Phone').fill('+91 98765 00000');
    await add.getByRole('button', { name: 'Add student' }).click();
    await expect(add).toBeHidden();
    await expect(page.getByRole('heading', { level: 2, name: 'Navya Krishnan' })).toBeVisible();

    // The same admission number can't be used twice.
    await page.getByRole('button', { name: 'Add student' }).click();
    const again = page.getByRole('dialog');
    await again.getByLabel('First name').fill('Copy');
    await again.getByLabel('Admission number').fill('2026/9001');
    await again.getByLabel('Name', { exact: true }).fill('Someone');
    await again.getByRole('button', { name: 'Add student' }).click();
    await expect(again.getByRole('alert')).toContainText('already used');
    await again.getByRole('button', { name: 'Cancel' }).click();
  });

  test('invite a teacher, who sets a password and lands in the app', async ({ page, browser }) => {
    await schoolSignIn(page, 'principal@demo.school');
    await nav(page, 'Staff');
    await page.getByRole('button', { name: 'Invite staff' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Full name').fill('Ritu Malhotra');
    await dialog.getByLabel('Email').fill('ritu@demo.school');
    await dialog.getByRole('button', { name: 'Create invite link' }).click();
    const link = await page.locator('.notice p.tiny').textContent();
    expect(link).toMatch(/\/accept-invite\?token=/);
    await expect(page.getByRole('row', { name: /Ritu Malhotra/ })).toContainText('Invite pending');

    const ctx = await browser.newContext();
    const invitee = await ctx.newPage();
    await invitee.goto(link!);
    await expect(invitee.getByText('Welcome to')).toBeVisible();
    await invitee.getByLabel('New password').fill('a-good-password');
    await invitee.getByLabel('Type it again').fill('a-good-password');
    await invitee.getByRole('button', { name: 'Set password and continue' }).click();
    await expect(invitee.getByRole('heading', { level: 1 })).toHaveText('Hello, Ritu');

    // The same link can't be used again.
    await invitee.goto(link!);
    await expect(invitee.getByRole('alert')).toContainText('expired or was already used');
    await ctx.close();
  });

  test('roles matrix: change a cell, see it flagged, save it', async ({ page }) => {
    await schoolSignIn(page, 'principal@demo.school');
    await nav(page, 'Roles & access');
    const cell = page.getByRole('button', { name: /^Mark today's attendance for Subject teacher: No access/ });
    await cell.click();
    await expect(page.getByText('1 change not saved yet')).toBeVisible();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Mark today's attendance for Subject teacher: Whole school/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Change roles and access for Principal/ })).toBeDisabled();
  });

  test('classes: assign a class teacher, who gets the role automatically', async ({ page }) => {
    await schoolSignIn(page, 'principal@demo.school');
    await nav(page, 'Classes & sections');
    await page.getByLabel('Class teacher for 7-A').selectOption({ label: 'Pradeep Nair' });
    await expect(page.getByText('Class teacher for 7-A updated. They now have the role they need.')).toBeVisible();
  });

  test('settings: changing the school colour repaints the app', async ({ page }) => {
    await schoolSignIn(page, 'principal@demo.school');
    await nav(page, 'School settings');
    await page.getByRole('button', { name: 'Use #B4532A' }).click();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase())).toBe('#b4532a');
  });

  test('attendance zones: add a second zone', async ({ page }) => {
    await schoolSignIn(page, 'principal@demo.school');
    await nav(page, 'Attendance zones');
    await page.getByRole('button', { name: 'Add zone' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Sports ground');
    await dialog.getByLabel('Or paste a Google Maps link').fill('https://www.google.com/maps/@26.9201,75.7902,17z');
    await expect(dialog.getByLabel('Latitude')).toHaveValue('26.9201');
    await dialog.getByRole('button', { name: 'Save zone' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Sports ground' })).toBeVisible();
  });

  test('phone-sized screen: the menu folds away and opens on demand', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await schoolSignIn(page, 'teacher@demo.school');
    const menu = page.getByRole('navigation', { name: 'Main' });
    await expect(menu).toBeHidden();
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(menu).toBeVisible();
    await nav(page, 'Attendance');
    await expect(page.getByRole('heading', { level: 1, name: 'Attendance' })).toBeVisible();
    await expect(menu).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no sideways scrolling on a phone').toBeLessThanOrEqual(1);
  });

  test('signing out clears the session', async ({ page }) => {
    await schoolSignIn(page, 'office@demo.school');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto(`${SCHOOL}/students`);
    await expect(page).toHaveURL(/\/login$/);
  });
});
