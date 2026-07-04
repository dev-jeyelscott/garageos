import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

interface ApiErrorDetail {
  readonly field?: string;
  readonly code?: string;
  readonly message?: string;
}

interface AuthScreen {
  readonly path: string;
  readonly heading: string;
  readonly texts: readonly string[];
  readonly controls: readonly string[];
  readonly expectedValues?: readonly ExpectedControlValue[];
}

interface ExpectedControlValue {
  readonly name: string;
  readonly value: string;
}

const apiMeta = {
  request_id: 'req_e2e_auth',
  correlation_id: 'corr_e2e_auth',
};

const authScreens: readonly AuthScreen[] = [
  {
    path: '/auth/login',
    heading: 'Login',
    texts: ['Access GarageOS with your verified user account.', 'Remember me on this device'],
    controls: ['email', 'password'],
  },
  {
    path: '/auth/signup-owner',
    heading: 'Owner Signup',
    texts: [
      'Create a pending-setup tenant and owner account',
      'Owner signup may be blocked until the platform default plan',
      'Password rules',
    ],
    controls: ['business_name', 'shop_email', 'owner_full_name', 'owner_email', 'password'],
  },
  {
    path: '/auth/email-verification',
    heading: 'Email Verification Required',
    texts: [
      'Verify your email before using GarageOS operational screens.',
      'Before verification, only verification actions and logout are available.',
    ],
    controls: [],
  },
  {
    path: '/auth/email-verification/confirm?token=e2e-email-token',
    heading: 'Email Verification Result',
    texts: ['Confirm a single-use email verification token.'],
    controls: ['token'],
    expectedValues: [
      {
        name: 'token',
        value: 'e2e-email-token',
      },
    ],
  },
  {
    path: '/auth/password/forgot',
    heading: 'Forgot Password',
    texts: ['Request a rate-limited password reset link.'],
    controls: ['email'],
  },
  {
    path: '/auth/password/reset?token=e2e-reset-token',
    heading: 'Reset Password',
    texts: ['Use a single-use password reset token before it expires.', 'Password rules'],
    controls: ['token', 'new_password'],
    expectedValues: [
      {
        name: 'token',
        value: 'e2e-reset-token',
      },
    ],
  },
];

test.describe('GarageOS auth PWA smoke', () => {
  test('renders public auth screens on a mobile viewport', async ({ page }) => {
    for (const screen of authScreens) {
      await page.goto(screen.path);

      await expectAuthHeading(page, screen.heading);

      for (const text of screen.texts) {
        await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
      }

      for (const name of screen.controls) {
        await expect(formControl(page, name)).toBeVisible();
      }

      for (const expectedValue of screen.expectedValues ?? []) {
        await expect(formControl(page, expectedValue.name)).toHaveValue(expectedValue.value);
      }
    }
  });

  test('supports public auth navigation from login', async ({ page }) => {
    await page.goto('/auth/login');

    await page.getByRole('link', { name: /Create shop owner account/i }).click();
    await expect(page).toHaveURL(/\/auth\/signup-owner$/);
    await expectAuthHeading(page, 'Owner Signup');

    await page.getByRole('link', { name: /Already have an account/i }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);
    await expectAuthHeading(page, 'Login');

    await page.getByRole('link', { name: /Forgot password/i }).click();
    await expect(page).toHaveURL(/\/auth\/password\/forgot$/);
    await expectAuthHeading(page, 'Forgot Password');

    await page.getByRole('link', { name: /Back to login/i }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);
    await expectAuthHeading(page, 'Login');
  });

  test('surfaces standard API error envelope for invalid login', async ({ page }) => {
    await page.route('**/api/v1/auth/login', async (route) => {
      expect(route.request().method()).toBe('POST');

      await fulfillApiError(route, {
        status: 401,
        code: 'unauthenticated',
        message: 'Invalid email or password.',
        details: [
          {
            field: 'email',
            code: 'invalid_credentials',
            message: 'Check your email and password.',
          },
        ],
      });
    });

    await page.goto('/auth/login');
    await fillFormControl(page, 'email', 'owner@example.com');
    await fillFormControl(page, 'password', 'wrong-password');
    await page.getByRole('button', { name: 'Login', exact: true }).click();

    const alert = page.getByRole('alert').filter({ hasText: 'Login failed.' });

    await expect(alert).toBeVisible();

    await expect(alert).toContainText('Login failed.');
    await expect(alert).toContainText('Invalid email or password.');
    await expect(alert).toContainText('unauthenticated');
    await expect(alert).toContainText('email: Check your email and password.');
    await expect(alert).toContainText(apiMeta.request_id);
    await expect(alert).toContainText(apiMeta.correlation_id);
  });

  test('submits owner signup with idempotency key and redirects to email verification gate', async ({
    page,
  }) => {
    let capturedSignupRequest: unknown = null;
    let capturedIdempotencyKey: string | undefined;

    await page.route('**/api/v1/auth/signup-owner', async (route) => {
      const request = route.request();

      expect(request.method()).toBe('POST');

      capturedSignupRequest = parseJsonRequest(route);
      capturedIdempotencyKey = request.headers()['idempotency-key'];

      await fulfillApiSuccess(
        route,
        {
          message: 'Signup submitted. Verify the owner email before operational access.',
        },
        201,
      );
    });

    await page.goto('/auth/signup-owner');
    await fillFormControl(page, 'business_name', 'E2E Moto Shop');
    await fillFormControl(page, 'shop_email', 'shop@example.com');
    await fillFormControl(page, 'owner_full_name', 'E2E Owner');
    await fillFormControl(page, 'owner_email', 'owner@example.com');
    await fillFormControl(page, 'password', 'StrongPass1');
    await page.getByRole('button', { name: 'Submit signup', exact: true }).click();

    await expect(page).toHaveURL(/\/auth\/email-verification$/);
    await expectAuthHeading(page, 'Email Verification Required');

    expect(capturedIdempotencyKey).toMatch(/^signup-owner-/);
    expect(capturedSignupRequest).toEqual({
      business_name: 'E2E Moto Shop',
      shop_email: 'shop@example.com',
      owner: {
        full_name: 'E2E Owner',
        email: 'owner@example.com',
        password: 'StrongPass1',
      },
    });
  });

  test('submits forgot-password request and displays safe success message', async ({ page }) => {
    let capturedForgotPasswordRequest: unknown = null;

    await page.route('**/api/v1/auth/password/forgot', async (route) => {
      expect(route.request().method()).toBe('POST');

      capturedForgotPasswordRequest = parseJsonRequest(route);

      await fulfillApiSuccess(route, {
        message: 'If the account exists and is eligible, a reset link will be sent.',
      });
    });

    await page.goto('/auth/password/forgot');
    await fillFormControl(page, 'email', 'owner@example.com');
    await page.getByRole('button', { name: 'Send reset link', exact: true }).click();

    await expect(
      page.getByText('If the account exists and is eligible, a reset link will be sent.'),
    ).toBeVisible();

    expect(capturedForgotPasswordRequest).toEqual({
      email: 'owner@example.com',
    });
  });
});

async function expectAuthHeading(page: Page, heading: string): Promise<void> {
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
}

async function fillFormControl(page: Page, name: string, value: string): Promise<void> {
  const control = formControl(page, name);

  await expect(control).toBeVisible();
  await control.fill(value);
}

function formControl(page: Page, name: string): Locator {
  return page.locator('input[name="' + cssAttributeValue(name) + '"]').first();
}

function cssAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parseJsonRequest(route: Route): unknown {
  const body = route.request().postData();

  if (body === null) {
    return null;
  }

  return JSON.parse(body) as unknown;
}

async function fulfillApiSuccess<TData>(route: Route, data: TData, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({
      data,
      meta: apiMeta,
    }),
  });
}

async function fulfillApiError(
  route: Route,
  input: {
    readonly status: number;
    readonly code: string;
    readonly message: string;
    readonly details?: readonly ApiErrorDetail[];
  },
): Promise<void> {
  await route.fulfill({
    status: input.status,
    contentType: 'application/json',
    body: JSON.stringify({
      error: {
        code: input.code,
        message: input.message,
        details: input.details ?? [],
        request_id: apiMeta.request_id,
        correlation_id: apiMeta.correlation_id,
      },
    }),
  });
}
