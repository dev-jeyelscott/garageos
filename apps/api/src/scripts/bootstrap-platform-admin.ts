import { randomUUID } from 'node:crypto';

import { argon2id, hash } from 'argon2';
import { Client } from 'pg';

interface BootstrapConfig {
  readonly databaseUrl: string;
  readonly email: string;
  readonly normalizedEmail: string;
  readonly password: string;
  readonly fullName: string;
}

interface CountRow {
  readonly count: string;
}

interface ExistingPlatformAdminRow {
  readonly id: string;
  readonly email: string;
}

const BOOTSTRAP_ENABLE_FLAG = 'GARAGEOS_ALLOW_PLATFORM_BOOTSTRAP';
const PLATFORM_ADMIN_EMAIL_ENV = 'GARAGEOS_PLATFORM_ADMIN_EMAIL';
const PLATFORM_ADMIN_PASSWORD_ENV = 'GARAGEOS_PLATFORM_ADMIN_PASSWORD';
const PLATFORM_ADMIN_FULL_NAME_ENV = 'GARAGEOS_PLATFORM_ADMIN_FULL_NAME';

async function main(): Promise<void> {
  assertBootstrapAllowed();

  const config = readBootstrapConfig();
  const client = new Client({
    connectionString: config.databaseUrl,
  });

  await client.connect();

  try {
    await client.query('begin');

    const platformPermissionCount = await countPlatformPermissions(client);

    if (platformPermissionCount === 0) {
      throw new BootstrapError(
        'No platform permissions were found. Run `pnpm db:seed` before bootstrapping the platform admin.',
      );
    }

    const existingPlatformAdmin = await findExistingPlatformAdmin(client);

    if (existingPlatformAdmin !== null) {
      await client.query('rollback');

      console.log('Platform admin bootstrap skipped.');
      console.log(`Existing platform admin: ${existingPlatformAdmin.email}`);
      console.log(
        'The bootstrap command is disabled after the first active platform admin exists.',
      );

      return;
    }

    const now = new Date();
    const userId = randomUUID();
    const passwordHash = await hash(config.password, {
      type: argon2id,
    });

    await client.query(
      `
        insert into users (
          id,
          tenant_id,
          user_type,
          email,
          normalized_email,
          password_hash,
          email_verified_at,
          status,
          full_name,
          password_changed_at,
          created_at,
          updated_at,
          lock_version
        )
        values (
          $1::uuid,
          null,
          'platform_admin',
          $2,
          $3,
          $4,
          $5::timestamptz,
          'active',
          $6,
          $5::timestamptz,
          $5::timestamptz,
          $5::timestamptz,
          0
        )
      `,
      [userId, config.email, config.normalizedEmail, passwordHash, now, config.fullName],
    );

    await client.query(
      `
        insert into audit_logs (
          id,
          tenant_id,
          actor_user_id,
          actor_type,
          action,
          entity_type,
          entity_id,
          after_json,
          metadata_json,
          reason,
          user_agent,
          retention_class,
          created_at
        )
        values (
          $1::uuid,
          null,
          $2::uuid,
          'platform_admin',
          'platform_admin.bootstrap.created',
          'user',
          $2::uuid,
          $3::jsonb,
          $4::jsonb,
          'dev_first_platform_admin_bootstrap',
          'garageos-bootstrap-platform-admin-script',
          'standard_3_year',
          $5::timestamptz
        )
      `,
      [
        randomUUID(),
        userId,
        JSON.stringify({
          id: userId,
          email: config.email,
          user_type: 'platform_admin',
          status: 'active',
          email_verified: true,
        }),
        JSON.stringify({
          source: 'local_dev_bootstrap_script',
          password_hash_algorithm: 'argon2id',
          email_verified_for_local_dashboard_access: true,
        }),
        now,
      ],
    );

    await client.query('commit');

    console.log('Platform admin bootstrap completed.');
    console.log(`Email: ${config.email}`);
    console.log(
      'Password: not printed. Use the password value supplied through environment variables.',
    );
    console.log('Next: start API/web, then login at /auth/login.');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

function assertBootstrapAllowed(): void {
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase() ?? '';

  if (nodeEnv === 'production') {
    throw new BootstrapError(
      'Refusing to run platform admin bootstrap in production. This script is local/dev-only.',
    );
  }

  if (process.env[BOOTSTRAP_ENABLE_FLAG] !== 'true') {
    throw new BootstrapError(
      `Refusing to run platform admin bootstrap unless ${BOOTSTRAP_ENABLE_FLAG}=true is set.`,
    );
  }
}

function readBootstrapConfig(): BootstrapConfig {
  const databaseUrl = readRequiredEnv('DATABASE_URL');
  const email = normalizeEmail(readRequiredEnv(PLATFORM_ADMIN_EMAIL_ENV));
  const password = readRequiredEnv(PLATFORM_ADMIN_PASSWORD_ENV);
  const fullName = readRequiredEnv(PLATFORM_ADMIN_FULL_NAME_ENV);

  validateEmail(email);
  validatePassword(password);
  validateFullName(fullName);

  return {
    databaseUrl,
    email,
    normalizedEmail: email,
    password,
    fullName,
  };
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (value === undefined || value.length === 0) {
    throw new BootstrapError(`${name} is required.`);
  }

  return value;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function validateEmail(value: string): void {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(value)) {
    throw new BootstrapError(`${PLATFORM_ADMIN_EMAIL_ENV} must be a valid email address.`);
  }
}

function validatePassword(value: string): void {
  const failures: string[] = [];

  if (value.length < 8) {
    failures.push('at least 8 characters');
  }

  if (!/[A-Z]/.test(value)) {
    failures.push('at least 1 uppercase letter');
  }

  if (!/[a-z]/.test(value)) {
    failures.push('at least 1 lowercase letter');
  }

  if (!/[0-9]/.test(value)) {
    failures.push('at least 1 number');
  }

  if (failures.length > 0) {
    throw new BootstrapError(`${PLATFORM_ADMIN_PASSWORD_ENV} must contain ${failures.join(', ')}.`);
  }
}

function validateFullName(value: string): void {
  if (value.length < 2 || value.length > 150) {
    throw new BootstrapError(
      `${PLATFORM_ADMIN_FULL_NAME_ENV} must be between 2 and 150 characters.`,
    );
  }
}

async function countPlatformPermissions(client: Client): Promise<number> {
  const result = await client.query<CountRow>(
    `
      select count(*)::text as count
      from permissions
      where code like 'platform.%'
    `,
  );

  return Number(result.rows[0]?.count ?? '0');
}

async function findExistingPlatformAdmin(client: Client): Promise<ExistingPlatformAdminRow | null> {
  const result = await client.query<ExistingPlatformAdminRow>(
    `
      select id, email
      from users
      where user_type = 'platform_admin'
        and status = 'active'
      order by created_at asc
      limit 1
    `,
  );

  return result.rows[0] ?? null;
}

class BootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapError';
  }
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(`${error.name}: ${error.message}`);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});
