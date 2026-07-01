import { randomUUID } from 'node:crypto';

import { Client } from 'pg';

import { PasswordHashingService } from '../modules/auth/application/password-hashing.service';

interface ActivationConfig {
  readonly databaseUrl: string;
  readonly tenantId: string;
  readonly ownerEmail: string | null;
  readonly normalizedOwnerEmail: string | null;
  readonly ownerPassword: string;
  readonly ownerFullName: string;
}

interface TenantRow {
  readonly id: string;
  readonly business_name: string;
  readonly status: string;
}

interface PendingOwnerInvitationRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly email: string;
  readonly normalized_email: string;
  readonly expires_at: Date | string;
}

interface ActiveUserRow {
  readonly id: string;
  readonly email: string;
  readonly tenant_id: string | null;
}

interface ShopOwnerRoleRow {
  readonly id: string;
  readonly role_type: string;
}

interface CountRow {
  readonly count: string;
}

const ACTIVATION_ENABLE_FLAG = 'GARAGEOS_ALLOW_TENANT_OWNER_ACTIVATION';
const TENANT_ID_ENV = 'GARAGEOS_TENANT_ID';
const TENANT_OWNER_EMAIL_ENV = 'GARAGEOS_TENANT_OWNER_EMAIL';
const TENANT_OWNER_PASSWORD_ENV = 'GARAGEOS_TENANT_OWNER_PASSWORD';
const TENANT_OWNER_FULL_NAME_ENV = 'GARAGEOS_TENANT_OWNER_FULL_NAME';

const LOCAL_SCRIPT_USER_AGENT = 'garageos-local-tenant-owner-activation-script';

async function main(): Promise<void> {
  assertActivationAllowed();

  const config = readActivationConfig();
  const client = new Client({
    connectionString: config.databaseUrl,
  });

  await client.connect();

  try {
    await client.query('begin');

    const tenant = await findTenant(client, config.tenantId);

    if (tenant === null) {
      throw new ActivationError(`Tenant ${config.tenantId} was not found.`);
    }

    assertTenantCanBeActivated(tenant);

    const invitation = await findPendingOwnerInvitation(client, {
      tenantId: tenant.id,
      normalizedOwnerEmail: config.normalizedOwnerEmail,
    });

    const activeUser = await findActiveUserByNormalizedEmail(client, invitation.normalized_email);

    if (activeUser !== null) {
      throw new ActivationError(
        `An active user already exists for ${activeUser.email}. Refusing to create a duplicate tenant owner.`,
      );
    }

    const activeShopOwnerCount = await countActiveShopOwners(client, tenant.id);

    if (activeShopOwnerCount > 0) {
      throw new ActivationError(
        `Tenant ${tenant.business_name} already has an active Shop Owner. Refusing to create another owner through the local activation script.`,
      );
    }

    const now = new Date();
    const passwordHashingService = new PasswordHashingService();
    const passwordHash = await passwordHashingService.hashPassword(config.ownerPassword);

    const roleId = await findOrCreateShopOwnerRole(client, {
      tenantId: tenant.id,
      createdAt: now,
    });

    await grantAllTenantPermissionsToRole(client, {
      tenantId: tenant.id,
      roleId,
      createdAt: now,
    });

    const userId = randomUUID();
    const employeeId = randomUUID();

    await createTenantOwnerUser(client, {
      userId,
      tenantId: tenant.id,
      email: invitation.email,
      normalizedEmail: invitation.normalized_email,
      passwordHash,
      fullName: config.ownerFullName,
      createdAt: now,
    });

    await createTenantOwnerEmployeeProfile(client, {
      employeeId,
      tenantId: tenant.id,
      userId,
      fullName: config.ownerFullName,
      createdAt: now,
    });

    await assignShopOwnerRole(client, {
      tenantId: tenant.id,
      userId,
      roleId,
      assignedAt: now,
    });

    await markOwnerInvitationAccepted(client, {
      tenantId: tenant.id,
      invitationId: invitation.id,
      acceptedAt: now,
    });

    await recordActivationAuditLog(client, {
      tenantId: tenant.id,
      userId,
      employeeId,
      roleId,
      invitationId: invitation.id,
      email: invitation.email,
      fullName: config.ownerFullName,
      createdAt: now,
    });

    await client.query('commit');

    console.log('Tenant owner activation completed.');
    console.log(`Tenant: ${tenant.business_name} (${tenant.id})`);
    console.log(`Owner email: ${invitation.email}`);
    console.log(
      'Password: not printed. Use the password value supplied through environment variables.',
    );
    console.log('Next: start API/web, then login at /auth/login.');
    console.log(
      'Note: the tenant remains in its existing lifecycle state. Complete onboarding before expecting operational modules.',
    );
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

function assertActivationAllowed(): void {
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase() ?? '';

  if (nodeEnv === 'production') {
    throw new ActivationError(
      'Refusing to activate a tenant owner in production. This script is local/dev-only.',
    );
  }

  if (process.env[ACTIVATION_ENABLE_FLAG] !== 'true') {
    throw new ActivationError(
      `Refusing to run tenant owner activation unless ${ACTIVATION_ENABLE_FLAG}=true is set.`,
    );
  }
}

function readActivationConfig(): ActivationConfig {
  const databaseUrl = readRequiredEnv('DATABASE_URL');
  const tenantId = readRequiredEnv(TENANT_ID_ENV);
  const ownerEmail = readOptionalEnv(TENANT_OWNER_EMAIL_ENV);
  const ownerPassword = readRequiredEnv(TENANT_OWNER_PASSWORD_ENV);
  const ownerFullName = readRequiredEnv(TENANT_OWNER_FULL_NAME_ENV);

  validateUuid(tenantId, TENANT_ID_ENV);

  const normalizedOwnerEmail = ownerEmail === null ? null : normalizeEmail(ownerEmail);

  if (normalizedOwnerEmail !== null) {
    validateEmail(normalizedOwnerEmail, TENANT_OWNER_EMAIL_ENV);
  }

  validatePassword(ownerPassword);
  validateFullName(ownerFullName);

  return {
    databaseUrl,
    tenantId,
    ownerEmail: normalizedOwnerEmail,
    normalizedOwnerEmail,
    ownerPassword,
    ownerFullName,
  };
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (value === undefined || value.length === 0) {
    throw new ActivationError(`${name} is required.`);
  }

  return value;
}

function readOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();

  return value === undefined || value.length === 0 ? null : value;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function validateUuid(value: string, envName: string): void {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(value)) {
    throw new ActivationError(`${envName} must be a valid UUID.`);
  }
}

function validateEmail(value: string, envName: string): void {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(value)) {
    throw new ActivationError(`${envName} must be a valid email address.`);
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
    throw new ActivationError(`${TENANT_OWNER_PASSWORD_ENV} must contain ${failures.join(', ')}.`);
  }
}

function validateFullName(value: string): void {
  if (value.length < 2 || value.length > 150) {
    throw new ActivationError(
      `${TENANT_OWNER_FULL_NAME_ENV} must be between 2 and 150 characters.`,
    );
  }
}

async function findTenant(client: Client, tenantId: string): Promise<TenantRow | null> {
  const result = await client.query<TenantRow>(
    `
      select id, business_name, status
      from tenants
      where id = $1::uuid
      limit 1
    `,
    [tenantId],
  );

  return result.rows[0] ?? null;
}

function assertTenantCanBeActivated(tenant: TenantRow): void {
  if (tenant.status === 'deleted' || tenant.status === 'pending_deletion') {
    throw new ActivationError(
      `Tenant ${tenant.business_name} is ${tenant.status}. Refusing local owner activation.`,
    );
  }
}

async function findPendingOwnerInvitation(
  client: Client,
  input: {
    readonly tenantId: string;
    readonly normalizedOwnerEmail: string | null;
  },
): Promise<PendingOwnerInvitationRow> {
  const result = await client.query<PendingOwnerInvitationRow>(
    `
      select
        id,
        tenant_id,
        email,
        normalized_email,
        expires_at
      from employee_invitations
      where tenant_id = $1::uuid
        and status = 'pending'
        and accepted_at is null
        and revoked_at is null
        and expires_at > now()
        and assigned_role_config_json ->> 'role_type' = 'shop_owner'
        and ($2::text is null or normalized_email = $2)
      order by created_at desc, id desc
      limit 2
    `,
    [input.tenantId, input.normalizedOwnerEmail],
  );

  if (result.rows.length === 0) {
    throw new ActivationError(
      input.normalizedOwnerEmail === null
        ? 'No active pending Shop Owner invitation was found for this tenant.'
        : `No active pending Shop Owner invitation was found for ${input.normalizedOwnerEmail}.`,
    );
  }

  if (result.rows.length > 1 && input.normalizedOwnerEmail === null) {
    throw new ActivationError(
      `Multiple pending Shop Owner invitations were found. Set ${TENANT_OWNER_EMAIL_ENV} to choose one.`,
    );
  }

  return result.rows[0] as PendingOwnerInvitationRow;
}

async function findActiveUserByNormalizedEmail(
  client: Client,
  normalizedEmail: string,
): Promise<ActiveUserRow | null> {
  const result = await client.query<ActiveUserRow>(
    `
      select id, email, tenant_id
      from users
      where normalized_email = $1
        and status = 'active'
      limit 1
    `,
    [normalizedEmail],
  );

  return result.rows[0] ?? null;
}

async function countActiveShopOwners(client: Client, tenantId: string): Promise<number> {
  const result = await client.query<CountRow>(
    `
      select count(*)::text as count
      from users u
      inner join employee_profiles ep
        on ep.tenant_id = u.tenant_id
       and ep.user_id = u.id
       and ep.status = 'active'
      inner join user_roles ur
        on ur.tenant_id = u.tenant_id
       and ur.user_id = u.id
       and ur.removed_at is null
      inner join roles r
        on r.tenant_id = ur.tenant_id
       and r.id = ur.role_id
       and r.status = 'active'
       and r.role_type = 'shop_owner'
      where u.tenant_id = $1::uuid
        and u.status = 'active'
    `,
    [tenantId],
  );

  return Number(result.rows[0]?.count ?? '0');
}

async function findOrCreateShopOwnerRole(
  client: Client,
  input: {
    readonly tenantId: string;
    readonly createdAt: Date;
  },
): Promise<string> {
  const existingRole = await client.query<ShopOwnerRoleRow>(
    `
      select id, role_type
      from roles
      where tenant_id = $1::uuid
        and status = 'active'
        and (
          role_type = 'shop_owner'
          or normalized_name = 'shop owner'
        )
      order by
        case when role_type = 'shop_owner' then 0 else 1 end,
        is_seeded_template desc,
        created_at asc,
        id asc
      limit 1
    `,
    [input.tenantId],
  );

  const existing = existingRole.rows[0];

  if (existing !== undefined) {
    if (existing.role_type !== 'shop_owner') {
      throw new ActivationError(
        'An active role named Shop Owner already exists but is not role_type=shop_owner. Resolve the role conflict before running this script.',
      );
    }

    return existing.id;
  }

  const roleId = randomUUID();

  await client.query(
    `
      insert into roles (
        id,
        tenant_id,
        name,
        normalized_name,
        role_type,
        is_seeded_template,
        status,
        created_at,
        updated_at,
        lock_version
      )
      values (
        $1::uuid,
        $2::uuid,
        'Shop Owner',
        'shop owner',
        'shop_owner',
        true,
        'active',
        $3::timestamptz,
        $3::timestamptz,
        0
      )
    `,
    [roleId, input.tenantId, input.createdAt],
  );

  return roleId;
}

async function grantAllTenantPermissionsToRole(
  client: Client,
  input: {
    readonly tenantId: string;
    readonly roleId: string;
    readonly createdAt: Date;
  },
): Promise<void> {
  await client.query(
    `
      insert into role_permissions (
        tenant_id,
        role_id,
        permission_id,
        created_at
      )
      select
        $1::uuid,
        $2::uuid,
        p.id,
        $3::timestamptz
      from permissions p
      where p.code not like 'platform.%'
      on conflict (role_id, permission_id) do nothing
    `,
    [input.tenantId, input.roleId, input.createdAt],
  );
}

async function createTenantOwnerUser(
  client: Client,
  input: {
    readonly userId: string;
    readonly tenantId: string;
    readonly email: string;
    readonly normalizedEmail: string;
    readonly passwordHash: string;
    readonly fullName: string;
    readonly createdAt: Date;
  },
): Promise<void> {
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
        mobile_number,
        password_changed_at,
        created_at,
        updated_at,
        lock_version
      )
      values (
        $1::uuid,
        $2::uuid,
        'tenant_user',
        $3,
        $4,
        $5,
        $6::timestamptz,
        'active',
        $7,
        null,
        $6::timestamptz,
        $6::timestamptz,
        $6::timestamptz,
        0
      )
    `,
    [
      input.userId,
      input.tenantId,
      input.email,
      input.normalizedEmail,
      input.passwordHash,
      input.createdAt,
      input.fullName,
    ],
  );
}

async function createTenantOwnerEmployeeProfile(
  client: Client,
  input: {
    readonly employeeId: string;
    readonly tenantId: string;
    readonly userId: string;
    readonly fullName: string;
    readonly createdAt: Date;
  },
): Promise<void> {
  await client.query(
    `
      insert into employee_profiles (
        id,
        tenant_id,
        user_id,
        full_name,
        mobile_number,
        status,
        tenant_wide_branch_access,
        created_at,
        updated_at
      )
      values (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4,
        null,
        'active',
        true,
        $5::timestamptz,
        $5::timestamptz
      )
    `,
    [input.employeeId, input.tenantId, input.userId, input.fullName, input.createdAt],
  );
}

async function assignShopOwnerRole(
  client: Client,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly roleId: string;
    readonly assignedAt: Date;
  },
): Promise<void> {
  await client.query(
    `
      insert into user_roles (
        id,
        tenant_id,
        user_id,
        role_id,
        assigned_at
      )
      values (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::uuid,
        $5::timestamptz
      )
    `,
    [randomUUID(), input.tenantId, input.userId, input.roleId, input.assignedAt],
  );
}

async function markOwnerInvitationAccepted(
  client: Client,
  input: {
    readonly tenantId: string;
    readonly invitationId: string;
    readonly acceptedAt: Date;
  },
): Promise<void> {
  const result = await client.query(
    `
      update employee_invitations
      set
        status = 'accepted',
        accepted_at = $3::timestamptz
      where tenant_id = $1::uuid
        and id = $2::uuid
        and status = 'pending'
        and accepted_at is null
        and revoked_at is null
    `,
    [input.tenantId, input.invitationId, input.acceptedAt],
  );

  if (result.rowCount !== 1) {
    throw new ActivationError('Failed to mark the owner invitation as accepted.');
  }
}

async function recordActivationAuditLog(
  client: Client,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly employeeId: string;
    readonly roleId: string;
    readonly invitationId: string;
    readonly email: string;
    readonly fullName: string;
    readonly createdAt: Date;
  },
): Promise<void> {
  await client.query(
    `
      insert into audit_logs (
        id,
        tenant_id,
        actor_user_id,
        actor_type,
        support_access_session_id,
        action,
        entity_type,
        entity_id,
        branch_id,
        before_json,
        after_json,
        metadata_json,
        reason,
        ip_address,
        user_agent,
        retention_class,
        created_at
      )
      values (
        $1::uuid,
        $2::uuid,
        null,
        'system',
        null,
        'tenant_owner.local_activation.completed',
        'user',
        $3::uuid,
        null,
        null,
        $4::jsonb,
        $5::jsonb,
        'local_dev_owner_activation_without_email_delivery',
        null,
        $6,
        'standard_3_year',
        $7::timestamptz
      )
    `,
    [
      randomUUID(),
      input.tenantId,
      input.userId,
      JSON.stringify({
        user_id: input.userId,
        employee_id: input.employeeId,
        email: input.email,
        full_name: input.fullName,
        user_type: 'tenant_user',
        status: 'active',
        email_verified: true,
        tenant_wide_branch_access: true,
        role_type: 'shop_owner',
      }),
      JSON.stringify({
        source: 'local_dev_activation_script',
        invitation_id: input.invitationId,
        role_id: input.roleId,
        password_hash_algorithm: 'argon2id',
        plaintext_password_logged: false,
      }),
      LOCAL_SCRIPT_USER_AGENT,
      input.createdAt,
    ],
  );
}

class ActivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivationError';
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
