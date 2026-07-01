import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const readSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('auth routes and registration onboarding', () => {
  it('keeps the root route protected and removes the dashboard from public routes', async () => {
    const routesSource = await readSource('src/app/routes.jsx');
    const publicRoutesBlock = routesSource.match(/export const publicRoutes = \[([\s\S]*?)\];/)?.[1] || '';
    const appRoutesBlock = routesSource.match(/export const appRoutes = \[([\s\S]*?)\];/)?.[1] || '';

    assert.doesNotMatch(publicRoutesBlock, /path:\s*['"]\/['"]/, 'publicRoutes must not expose the root path');
    assert.match(publicRoutesBlock, /path:\s*['"]\/login['"]/, 'login must stay public');
    assert.match(publicRoutesBlock, /path:\s*['"]\/register['"]/, 'register must stay public');
    assert.match(appRoutesBlock, /path:\s*['"]\/['"].*<Navigate to=['"]\/dashboard['"] replace/s, 'root must be a protected redirect to /dashboard');
  });

  it('creates the Firestore profile and initial company during public registration', async () => {
    const registerSource = await readSource('src/modules/auth/pages/RegisterPage.jsx');

    assert.match(registerSource, /syncUserProfile/, 'registration must create or update users/{uid}');
    assert.match(registerSource, /createCompanyForCurrentUser/, 'registration must create an initial company and membership');
    assert.match(registerSource, /register-company/, 'registration must ask for an initial company name');
  });
});
