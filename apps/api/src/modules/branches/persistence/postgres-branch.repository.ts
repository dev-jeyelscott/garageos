import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  type BranchDeactivationBlocker,
  type BranchSummaryRecord,
  BranchStore,
  type ChangeBranchStatusInput,
  type CreateBranchInput,
  type CreateBranchStatusEventInput,
  type UpdateBranchInput,
} from '../application/branch.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface CountRow extends DatabaseRow {
  readonly count: number | string;
}

interface NumberRow extends DatabaseRow {
  readonly value: number | string | null;
}

interface BranchRow extends DatabaseRow {
  readonly id: string;
  readonly name: string;
  readonly address: string;
  readonly contact_number: string;
  readonly business_hours_json: unknown;
  readonly status: 'active' | 'inactive';
  readonly lock_version: number;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly deactivated_at: Date | string | null;
  readonly reactivated_at: Date | string | null;
}

interface BranchDeactivationBlockerRow extends DatabaseRow {
  readonly blocker: BranchDeactivationBlocker;
}

@Injectable()
export class PostgresBranchRepository extends BranchStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async isActiveShopOwner(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<boolean> {
    const result = await this.database.query<BooleanRow>(
      `
        select exists (
          select 1
          from user_roles ur
          inner join roles r
            on r.tenant_id = ur.tenant_id
           and r.id = ur.role_id
           and r.status = 'active'
           and r.role_type = 'shop_owner'
          where ur.tenant_id = $1
            and ur.user_id = $2
            and ur.removed_at is null
        ) as value
      `,
      [input.tenantId, input.userId],
    );

    return result.rows[0]?.value ?? false;
  }

  async countActiveBranches(
    tenantId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<number> {
    const result = await client.query<CountRow>(
      `
        select count(*)
        from branches
        where tenant_id = $1
          and status = 'active'
      `,
      [tenantId],
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async getEffectiveMaxActiveBranches(
    tenantId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<number> {
    const result = await client.query<NumberRow>(
      `
        with subscription_limit as (
          select spl.numeric_value
          from tenant_subscriptions ts
          inner join subscription_plan_limits spl
            on spl.plan_id = ts.plan_id
           and spl.capability_code = 'max_active_branches'
          where ts.tenant_id = $1
          limit 1
        ),
        active_override as (
          select
            coalesce(
              nullif(override_value_json ->> 'numeric_value', '')::numeric,
              nullif(override_value_json ->> 'value', '')::numeric
            ) as numeric_value
          from tenant_plan_overrides
          where tenant_id = $1
            and capability_code = 'max_active_branches'
            and (expires_at is null or expires_at > now())
          order by effective_at desc, created_at desc
          limit 1
        )
        select coalesce(
          (select numeric_value from active_override),
          (select numeric_value from subscription_limit),
          0
        ) as value
      `,
      [tenantId],
    );

    return Number(result.rows[0]?.value ?? 0);
  }

  async createBranch(
    input: CreateBranchInput,
    client: DatabaseQueryClient,
  ): Promise<BranchSummaryRecord> {
    const result = await client.query<BranchRow>(
      `
        insert into branches (
          id,
          tenant_id,
          name,
          normalized_name,
          address,
          contact_number,
          business_hours_json,
          status,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, 'active', $8, $8)
        returning
          id,
          name,
          address,
          contact_number,
          business_hours_json,
          status,
          lock_version,
          created_at,
          updated_at,
          deactivated_at,
          reactivated_at
      `,
      [
        input.id,
        input.tenantId,
        input.name,
        input.normalizedName,
        input.address,
        input.contactNumber,
        JSON.stringify(input.businessHoursJson),
        input.createdAt,
      ],
    );

    const row = result.rows[0];

    if (row === undefined) {
      throw new Error('Branch create did not return a row.');
    }

    return toBranchSummaryRecord(row);
  }

  async listBranches(
    tenantId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly BranchSummaryRecord[]> {
    const result = await client.query<BranchRow>(
      `
        select
          id,
          name,
          address,
          contact_number,
          business_hours_json,
          status,
          lock_version,
          created_at,
          updated_at,
          deactivated_at,
          reactivated_at
        from branches
        where tenant_id = $1
        order by status asc, created_at desc, id asc
      `,
      [tenantId],
    );

    return result.rows.map(toBranchSummaryRecord);
  }

  async findBranchById(
    tenantId: string,
    branchId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<BranchSummaryRecord | null> {
    const result = await client.query<BranchRow>(
      `
        select
          id,
          name,
          address,
          contact_number,
          business_hours_json,
          status,
          lock_version,
          created_at,
          updated_at,
          deactivated_at,
          reactivated_at
        from branches
        where tenant_id = $1
          and id = $2
        limit 1
      `,
      [tenantId, branchId],
    );

    const row = result.rows[0];

    return row === undefined ? null : toBranchSummaryRecord(row);
  }

  async updateBranch(
    input: UpdateBranchInput,
    client: DatabaseQueryClient,
  ): Promise<BranchSummaryRecord | null> {
    const result = await client.query<BranchRow>(
      `
        update branches
        set
          name = $3,
          normalized_name = $4,
          address = $5,
          contact_number = $6,
          business_hours_json = $7::jsonb,
          updated_at = $8,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and lock_version = $9
        returning
          id,
          name,
          address,
          contact_number,
          business_hours_json,
          status,
          lock_version,
          created_at,
          updated_at,
          deactivated_at,
          reactivated_at
      `,
      [
        input.tenantId,
        input.branchId,
        input.name,
        input.normalizedName,
        input.address,
        input.contactNumber,
        JSON.stringify(input.businessHoursJson),
        input.updatedAt,
        input.expectedLockVersion,
      ],
    );

    const row = result.rows[0];

    return row === undefined ? null : toBranchSummaryRecord(row);
  }

  async changeBranchStatus(
    input: ChangeBranchStatusInput,
    client: DatabaseQueryClient,
  ): Promise<BranchSummaryRecord | null> {
    const timestampColumn =
      input.toStatus === 'active'
        ? 'reactivated_at = $6, deactivated_at = null'
        : 'deactivated_at = $6';
    const result = await client.query<BranchRow>(
      `
        update branches
        set
          status = $4,
          ${timestampColumn},
          updated_at = $6,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = $3
          and lock_version = $5
        returning
          id,
          name,
          address,
          contact_number,
          business_hours_json,
          status,
          lock_version,
          created_at,
          updated_at,
          deactivated_at,
          reactivated_at
      `,
      [
        input.tenantId,
        input.branchId,
        input.fromStatus,
        input.toStatus,
        input.expectedLockVersion,
        input.changedAt,
      ],
    );

    const row = result.rows[0];

    return row === undefined ? null : toBranchSummaryRecord(row);
  }

  async createBranchStatusEvent(
    input: CreateBranchStatusEventInput,
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        insert into branch_status_events (
          tenant_id,
          branch_id,
          from_status,
          to_status,
          reason,
          created_by_user_id,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        input.tenantId,
        input.branchId,
        input.fromStatus,
        input.toStatus,
        input.reason,
        input.createdByUserId,
        input.createdAt,
      ],
    );
  }

  async findBranchDeactivationBlockers(
    tenantId: string,
    branchId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly BranchDeactivationBlocker[]> {
    const result = await client.query<BranchDeactivationBlockerRow>(
      `
        select blocker
        from (
          select 'open_job_orders' as blocker
          where exists (
            select 1
            from job_orders
            where tenant_id = $1
              and branch_id = $2
              and status in ('pending', 'in_progress', 'waiting_for_parts', 'completed')
          )

          union all

          select 'open_purchase_orders' as blocker
          where exists (
            select 1
            from purchase_orders
            where tenant_id = $1
              and branch_id = $2
              and status in ('draft', 'ordered', 'partially_received')
          )

          union all

          select 'open_inventory_transfers' as blocker
          where exists (
            select 1
            from inventory_transfers
            where tenant_id = $1
              and (
                source_branch_id = $2
                or destination_branch_id = $2
              )
              and status in ('draft', 'pending', 'in_transit')
          )

          union all

          select 'active_inventory_reservations' as blocker
          where exists (
            select 1
            from inventory_reservations
            where tenant_id = $1
              and branch_id = $2
              and status = 'active'
          )

          union all

          select 'non_zero_stock' as blocker
          where exists (
            select 1
            from stock_balances
            where tenant_id = $1
              and branch_id = $2
              and (
                on_hand_qty <> 0
                or reserved_qty <> 0
              )
          )

          union all

          select 'unposted_inventory_adjustments' as blocker
          where exists (
            select 1
            from inventory_adjustments
            where tenant_id = $1
              and branch_id = $2
              and status in ('draft', 'pending_approval', 'approved')
          )

          union all

          select 'unposted_purchase_receivings' as blocker
          where exists (
            select 1
            from purchase_receivings
            where tenant_id = $1
              and branch_id = $2
              and posted_at is null
          )
        ) blockers
      `,
      [tenantId, branchId],
    );

    return result.rows.map((row) => row.blocker);
  }
}

function toBranchSummaryRecord(row: BranchRow): BranchSummaryRecord {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    contactNumber: row.contact_number,
    businessHoursJson: row.business_hours_json,
    status: row.status,
    lockVersion: Number(row.lock_version),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    deactivatedAt: row.deactivated_at === null ? null : toDate(row.deactivated_at),
    reactivatedAt: row.reactivated_at === null ? null : toDate(row.reactivated_at),
  };
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
