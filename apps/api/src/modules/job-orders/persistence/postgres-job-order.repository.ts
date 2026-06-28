import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  JobOrderStore,
  type CreateJobOrderInput,
  type JobOrderLineRecord,
  type JobOrderLineStatus,
  type JobOrderLineType,
  type JobOrderRecord,
  type JobOrderStatus,
  type ListJobOrdersInput,
  type UpdatePendingJobOrderInput,
} from '../application/job-order.store';

interface JobOrderRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly customer_id: string;
  readonly motorcycle_id: string;
  readonly job_order_number: string;
  readonly status: JobOrderStatus;
  readonly service_advisor_user_id: string;
  readonly primary_mechanic_user_id: string | null;
  readonly mileage_at_intake: number;
  readonly customer_concern: string;
  readonly internal_notes: string | null;
  readonly completed_at: Date | null;
  readonly released_at: Date | null;
  readonly no_charge_reason: string | null;
  readonly release_with_balance_reason: string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly lock_version: number;
}

interface JobOrderLineRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly job_order_id: string;
  readonly line_type: JobOrderLineType;
  readonly service_id: string | null;
  readonly product_id: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unit_price: string;
  readonly authorized_amount: string;
  readonly status: JobOrderLineStatus;
  readonly inventory_reservation_id: string | null;
  readonly completed_at: Date | null;
  readonly line_order: number;
  readonly created_at: Date;
  readonly updated_at: Date;
}

@Injectable()
export class PostgresJobOrderRepository extends JobOrderStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async getTenantTimezone(tenantId: string, client?: DatabaseQueryClient): Promise<string | null> {
    const queryClient = client ?? this.database;
    const result = await queryClient.query<{ timezone: string }>(
      `
        select timezone
        from tenants
        where id = $1
        limit 1
      `,
      [tenantId],
    );

    return result.rows[0]?.timezone ?? null;
  }

  async lockJobOrderNumberSequence(
    input: {
      readonly tenantId: string;
      readonly datePart: string;
    },
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [
      `job-order-number:${input.tenantId}:${input.datePart}`,
    ]);
  }

  async findLatestJobOrderNumberForDate(
    input: {
      readonly tenantId: string;
      readonly datePart: string;
    },
    client: DatabaseQueryClient,
  ): Promise<string | null> {
    const result = await client.query<{ job_order_number: string }>(
      `
        select job_order_number
        from job_orders
        where tenant_id = $1
          and job_order_number like $2
        order by job_order_number desc
        limit 1
      `,
      [input.tenantId, `JO-${input.datePart}-%`],
    );

    return result.rows[0]?.job_order_number ?? null;
  }

  async listJobOrders(input: ListJobOrdersInput): Promise<readonly JobOrderRecord[]> {
    const conditions = ['tenant_id = $1', 'branch_id = $2'];
    const values: unknown[] = [input.tenantId, input.branchId];
    let nextIndex = values.length + 1;

    if (input.status !== undefined) {
      conditions.push(`status = $${nextIndex}`);
      values.push(input.status);
      nextIndex += 1;
    }

    if (input.customerId !== undefined) {
      conditions.push(`customer_id = $${nextIndex}`);
      values.push(input.customerId);
      nextIndex += 1;
    }

    if (input.motorcycleId !== undefined) {
      conditions.push(`motorcycle_id = $${nextIndex}`);
      values.push(input.motorcycleId);
      nextIndex += 1;
    }

    if (input.normalizedSearch !== null) {
      conditions.push(
        `(lower(job_order_number) like $${nextIndex} or lower(customer_concern) like $${nextIndex})`,
      );
      values.push(`%${input.normalizedSearch}%`);
      nextIndex += 1;
    }

    values.push(input.limit);

    const result = await this.database.query<JobOrderRow>(
      `
        select *
        from job_orders
        where ${conditions.join(' and ')}
        order by created_at desc, id desc
        limit $${nextIndex}
      `,
      values,
    );

    return this.attachLines(result.rows);
  }

  async findJobOrderById(
    tenantId: string,
    jobOrderId: string,
    client?: DatabaseQueryClient,
  ): Promise<JobOrderRecord | null> {
    const queryClient = client ?? this.database;
    const result = await queryClient.query<JobOrderRow>(
      `
        select *
        from job_orders
        where tenant_id = $1
          and id = $2
        limit 1
      `,
      [tenantId, jobOrderId],
    );

    const jobOrder = result.rows[0];

    if (jobOrder === undefined) {
      return null;
    }

    const lines = await this.findJobOrderLines(tenantId, jobOrder.id, queryClient);

    return toJobOrderRecord(jobOrder, lines);
  }

  async findJobOrderByIdForUpdate(
    tenantId: string,
    jobOrderId: string,
    client: DatabaseQueryClient,
  ): Promise<JobOrderRecord | null> {
    const result = await client.query<JobOrderRow>(
      `
        select *
        from job_orders
        where tenant_id = $1
          and id = $2
        for update
      `,
      [tenantId, jobOrderId],
    );

    const jobOrder = result.rows[0];

    if (jobOrder === undefined) {
      return null;
    }

    const lines = await this.findJobOrderLines(tenantId, jobOrder.id, client);

    return toJobOrderRecord(jobOrder, lines);
  }

  async createJobOrder(
    input: CreateJobOrderInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderRecord> {
    await client.query(
      `
        insert into job_orders (
          id,
          tenant_id,
          branch_id,
          customer_id,
          motorcycle_id,
          job_order_number,
          status,
          service_advisor_user_id,
          mileage_at_intake,
          customer_concern,
          internal_notes,
          created_by_user_id,
          created_at,
          updated_at,
          lock_version
        )
        values ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, $11, $12, $12, 0)
      `,
      [
        input.id,
        input.tenantId,
        input.branchId,
        input.customerId,
        input.motorcycleId,
        input.jobOrderNumber,
        input.serviceAdvisorUserId,
        input.mileageAtIntake,
        input.customerConcern,
        input.internalNotes,
        input.createdByUserId,
        input.createdAt,
      ],
    );

    await client.query(
      `
        insert into job_order_status_events (
          id,
          tenant_id,
          job_order_id,
          from_status,
          to_status,
          reason,
          created_by_user_id,
          created_at
        )
        values (gen_random_uuid(), $1, $2, null, 'pending', 'job_order_created', $3, $4)
      `,
      [input.tenantId, input.id, input.createdByUserId, input.createdAt],
    );

    const created = await this.findJobOrderById(input.tenantId, input.id, client);

    if (created === null) {
      throw new Error('Created job order could not be loaded.');
    }

    return created;
  }

  async updatePendingJobOrder(
    input: UpdatePendingJobOrderInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderRecord | null> {
    const result = await client.query<JobOrderRow>(
      `
        update job_orders
        set
          mileage_at_intake = $3,
          customer_concern = $4,
          internal_notes = $5,
          updated_at = $6,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = 'pending'
          and lock_version = $7
        returning *
      `,
      [
        input.tenantId,
        input.jobOrderId,
        input.mileageAtIntake,
        input.customerConcern,
        input.internalNotes,
        input.updatedAt,
        input.expectedLockVersion,
      ],
    );

    const updated = result.rows[0];

    if (updated === undefined) {
      return null;
    }

    const lines = await this.findJobOrderLines(input.tenantId, input.jobOrderId, client);

    return toJobOrderRecord(updated, lines);
  }

  async isActiveShopOwner(input: {
    readonly tenantId: string;
    readonly userId: string;
  }): Promise<boolean> {
    const result = await this.database.query<{ exists: boolean }>(
      `
        select exists (
          select 1
          from user_roles user_role
          join roles role
            on role.id = user_role.role_id
           and role.tenant_id = user_role.tenant_id
          where user_role.tenant_id = $1
            and user_role.user_id = $2
            and role.role_type = 'shop_owner'
            and role.status = 'active'
        ) as exists
      `,
      [input.tenantId, input.userId],
    );

    return result.rows[0]?.exists ?? false;
  }

  async activeBranchExists(
    tenantId: string,
    branchId: string,
    client?: DatabaseQueryClient,
  ): Promise<boolean> {
    const queryClient = client ?? this.database;
    const result = await queryClient.query<{ exists: boolean }>(
      `
        select exists (
          select 1
          from branches
          where tenant_id = $1
            and id = $2
            and status = 'active'
        ) as exists
      `,
      [tenantId, branchId],
    );

    return result.rows[0]?.exists ?? false;
  }

  async activeCustomerExists(
    tenantId: string,
    customerId: string,
    client?: DatabaseQueryClient,
  ): Promise<boolean> {
    const queryClient = client ?? this.database;
    const result = await queryClient.query<{ exists: boolean }>(
      `
        select exists (
          select 1
          from customers
          where tenant_id = $1
            and id = $2
            and status = 'active'
        ) as exists
      `,
      [tenantId, customerId],
    );

    return result.rows[0]?.exists ?? false;
  }

  async activeMotorcycleBelongsToCustomer(
    input: {
      readonly tenantId: string;
      readonly motorcycleId: string;
      readonly customerId: string;
    },
    client?: DatabaseQueryClient,
  ): Promise<boolean> {
    const queryClient = client ?? this.database;
    const result = await queryClient.query<{ exists: boolean }>(
      `
        select exists (
          select 1
          from motorcycles
          where tenant_id = $1
            and id = $2
            and customer_id = $3
            and status = 'active'
        ) as exists
      `,
      [input.tenantId, input.motorcycleId, input.customerId],
    );

    return result.rows[0]?.exists ?? false;
  }

  private async attachLines(rows: readonly JobOrderRow[]): Promise<readonly JobOrderRecord[]> {
    const jobOrders: JobOrderRecord[] = [];

    for (const row of rows) {
      const lines = await this.findJobOrderLines(row.tenant_id, row.id, this.database);
      jobOrders.push(toJobOrderRecord(row, lines));
    }

    return jobOrders;
  }

  private async findJobOrderLines(
    tenantId: string,
    jobOrderId: string,
    client: DatabaseQueryClient,
  ): Promise<readonly JobOrderLineRecord[]> {
    const result = await client.query<JobOrderLineRow>(
      `
        select *
        from job_order_lines
        where tenant_id = $1
          and job_order_id = $2
        order by line_order asc, id asc
      `,
      [tenantId, jobOrderId],
    );

    return result.rows.map(toJobOrderLineRecord);
  }
}

function toJobOrderRecord(row: JobOrderRow, lines: readonly JobOrderLineRecord[]): JobOrderRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    customerId: row.customer_id,
    motorcycleId: row.motorcycle_id,
    jobOrderNumber: row.job_order_number,
    status: row.status,
    serviceAdvisorUserId: row.service_advisor_user_id,
    primaryMechanicUserId: row.primary_mechanic_user_id,
    mileageAtIntake: row.mileage_at_intake,
    customerConcern: row.customer_concern,
    internalNotes: row.internal_notes,
    completedAt: row.completed_at,
    releasedAt: row.released_at,
    noChargeReason: row.no_charge_reason,
    releaseWithBalanceReason: row.release_with_balance_reason,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lockVersion: row.lock_version,
    lines,
  };
}

function toJobOrderLineRecord(row: JobOrderLineRow): JobOrderLineRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    jobOrderId: row.job_order_id,
    lineType: row.line_type,
    serviceId: row.service_id,
    productId: row.product_id,
    description: row.description,
    quantity: normalizeDecimalString(row.quantity),
    unitPrice: normalizeDecimalString(row.unit_price),
    authorizedAmount: normalizeDecimalString(row.authorized_amount),
    status: row.status,
    inventoryReservationId: row.inventory_reservation_id,
    completedAt: row.completed_at,
    lineOrder: row.line_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeDecimalString(value: string | number): string {
  return String(value);
}
