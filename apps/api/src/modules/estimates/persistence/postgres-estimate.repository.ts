import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  EstimateStore,
  type ApproveEstimateInput,
  type ConvertApprovedEstimateToJobOrderInput,
  type ConvertApprovedEstimateToJobOrderResult,
  type CreateEstimateInput,
  type EstimateApprovalMethod,
  type EstimateLineInput,
  type EstimateLineRecord,
  type EstimateRecord,
  type EstimateStatus,
  type JobOrderStatus,
  type JobOrderSummaryRecord,
  type ListEstimatesInput,
  type PresentEstimateInput,
  type UpdateEstimateInput,
} from '../application/estimate.store';

interface EstimateRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly customer_id: string;
  readonly motorcycle_id: string | null;
  readonly estimate_number: string;
  readonly status: EstimateStatus;
  readonly valid_until_date: string | Date | null;
  readonly approval_method: EstimateApprovalMethod | null;
  readonly approved_by_customer_name: string | null;
  readonly approved_at: Date | null;
  readonly converted_job_order_id: string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly updated_by_user_id: string | null;
  readonly lock_version: number;
}

interface EstimateLineRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly estimate_id: string;
  readonly line_type: 'service' | 'labor' | 'part';
  readonly service_id: string | null;
  readonly product_id: string | null;
  readonly description: string;
  readonly quantity: string;
  readonly unit_price: string;
  readonly line_total: string;
  readonly line_order: number;
}

interface JobOrderRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly customer_id: string;
  readonly motorcycle_id: string;
  readonly job_order_number: string;
  readonly status: JobOrderStatus;
  readonly service_advisor_user_id: string;
  readonly mileage_at_intake: number;
  readonly customer_concern: string;
  readonly internal_notes: string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly lock_version: number;
}

@Injectable()
export class PostgresEstimateRepository extends EstimateStore {
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

  async lockEstimateNumberSequence(
    input: {
      readonly tenantId: string;
      readonly datePart: string;
    },
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [
      `estimate-number:${input.tenantId}:${input.datePart}`,
    ]);
  }

  async findLatestEstimateNumberForDate(
    input: {
      readonly tenantId: string;
      readonly datePart: string;
    },
    client: DatabaseQueryClient,
  ): Promise<string | null> {
    const result = await client.query<{ estimate_number: string }>(
      `
        select estimate_number
        from estimates
        where tenant_id = $1
          and estimate_number like $2
        order by estimate_number desc
        limit 1
      `,
      [input.tenantId, `EST-${input.datePart}-%`],
    );

    return result.rows[0]?.estimate_number ?? null;
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

  async listEstimates(input: ListEstimatesInput): Promise<readonly EstimateRecord[]> {
    const conditions = [
      'tenant_id = $1',
      'branch_id = $2',
      input.status === undefined ? null : `status = $${conditionsIndex(3)}`,
    ].filter((condition): condition is string => condition !== null);

    const values: unknown[] = [input.tenantId, input.branchId];
    let nextIndex = values.length + 1;

    if (input.status !== undefined) {
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
      conditions.push(`lower(estimate_number) like $${nextIndex}`);
      values.push(`%${input.normalizedSearch}%`);
      nextIndex += 1;
    }

    values.push(input.limit);

    const result = await this.database.query<EstimateRow>(
      `
        select *
        from estimates
        where ${conditions.join(' and ')}
        order by created_at desc, id desc
        limit $${nextIndex}
      `,
      values,
    );

    return this.attachLines(result.rows);
  }

  async findEstimateById(
    tenantId: string,
    estimateId: string,
    client?: DatabaseQueryClient,
  ): Promise<EstimateRecord | null> {
    const queryClient = client ?? this.database;
    const result = await queryClient.query<EstimateRow>(
      `
        select *
        from estimates
        where tenant_id = $1
          and id = $2
        limit 1
      `,
      [tenantId, estimateId],
    );

    const estimate = result.rows[0];

    if (estimate === undefined) {
      return null;
    }

    const lines = await this.findEstimateLines(tenantId, estimate.id, queryClient);

    return toEstimateRecord(estimate, lines);
  }

  async findEstimateByIdForUpdate(
    tenantId: string,
    estimateId: string,
    client: DatabaseQueryClient,
  ): Promise<EstimateRecord | null> {
    const result = await client.query<EstimateRow>(
      `
        select *
        from estimates
        where tenant_id = $1
          and id = $2
        for update
      `,
      [tenantId, estimateId],
    );

    const estimate = result.rows[0];

    if (estimate === undefined) {
      return null;
    }

    const lines = await this.findEstimateLines(tenantId, estimate.id, client);

    return toEstimateRecord(estimate, lines);
  }

  async createEstimate(
    input: CreateEstimateInput,
    client: DatabaseQueryClient,
  ): Promise<EstimateRecord> {
    await client.query(
      `
        insert into estimates (
          id,
          tenant_id,
          branch_id,
          customer_id,
          motorcycle_id,
          estimate_number,
          status,
          valid_until_date,
          created_by_user_id,
          created_at,
          updated_at,
          lock_version
        )
        values ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $9, 0)
      `,
      [
        input.id,
        input.tenantId,
        input.branchId,
        input.customerId,
        input.motorcycleId,
        input.estimateNumber,
        input.validUntilDate,
        input.createdByUserId,
        input.createdAt,
      ],
    );

    await this.insertEstimateLines(
      input.tenantId,
      input.id,
      input.lines.map((line) => ({
        ...line,
        tenantId: input.tenantId,
        estimateId: input.id,
      })),
      client,
    );

    await client.query(
      `
        insert into estimate_status_events (
          id,
          tenant_id,
          estimate_id,
          from_status,
          to_status,
          reason,
          created_by_user_id,
          created_at
        )
        values (gen_random_uuid(), $1, $2, null, 'draft', 'estimate_created', $3, $4)
      `,
      [input.tenantId, input.id, input.createdByUserId, input.createdAt],
    );

    const created = await this.findEstimateById(input.tenantId, input.id, client);

    if (created === null) {
      throw new Error('Created estimate could not be loaded.');
    }

    return created;
  }

  async updateDraftEstimate(
    input: UpdateEstimateInput,
    client: DatabaseQueryClient,
  ): Promise<EstimateRecord | null> {
    const result = await client.query<EstimateRow>(
      `
        update estimates
        set
          valid_until_date = $3,
          updated_by_user_id = $4,
          updated_at = $5,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = 'draft'
          and lock_version = $6
        returning *
      `,
      [
        input.tenantId,
        input.estimateId,
        input.validUntilDate,
        input.updatedByUserId,
        input.updatedAt,
        input.expectedLockVersion,
      ],
    );

    const updated = result.rows[0];

    if (updated === undefined) {
      return null;
    }

    await client.query(
      `
        delete from estimate_lines
        where tenant_id = $1
          and estimate_id = $2
      `,
      [input.tenantId, input.estimateId],
    );

    await this.insertEstimateLines(
      input.tenantId,
      input.estimateId,
      input.lines.map((line) => ({
        ...line,
        tenantId: input.tenantId,
        estimateId: input.estimateId,
      })),
      client,
    );

    const lines = await this.findEstimateLines(input.tenantId, input.estimateId, client);

    return toEstimateRecord(updated, lines);
  }

  async presentEstimate(
    input: PresentEstimateInput,
    client: DatabaseQueryClient,
  ): Promise<EstimateRecord | null> {
    const result = await client.query<EstimateRow>(
      `
        update estimates
        set
          status = 'presented',
          updated_by_user_id = $4,
          updated_at = $5,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = 'draft'
          and lock_version = $3
        returning *
      `,
      [
        input.tenantId,
        input.estimateId,
        input.expectedLockVersion,
        input.updatedByUserId,
        input.updatedAt,
      ],
    );

    const updated = result.rows[0];

    if (updated === undefined) {
      return null;
    }

    await client.query(
      `
        insert into estimate_status_events (
          id,
          tenant_id,
          estimate_id,
          from_status,
          to_status,
          reason,
          created_by_user_id,
          created_at
        )
        values (gen_random_uuid(), $1, $2, 'draft', 'presented', 'estimate_presented', $3, $4)
      `,
      [input.tenantId, input.estimateId, input.updatedByUserId, input.updatedAt],
    );

    const lines = await this.findEstimateLines(input.tenantId, input.estimateId, client);

    return toEstimateRecord(updated, lines);
  }

  async approveEstimate(
    input: ApproveEstimateInput,
    client: DatabaseQueryClient,
  ): Promise<EstimateRecord | null> {
    const result = await client.query<EstimateRow>(
      `
        update estimates
        set
          status = 'approved',
          approval_method = $4,
          approved_by_customer_name = $5,
          approved_at = $6,
          updated_by_user_id = $7,
          updated_at = $8,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = 'presented'
          and lock_version = $3
        returning *
      `,
      [
        input.tenantId,
        input.estimateId,
        input.expectedLockVersion,
        input.approvalMethod,
        input.approvedByCustomerName,
        input.approvedAt,
        input.updatedByUserId,
        input.updatedAt,
      ],
    );

    const updated = result.rows[0];

    if (updated === undefined) {
      return null;
    }

    await client.query(
      `
        insert into estimate_status_events (
          id,
          tenant_id,
          estimate_id,
          from_status,
          to_status,
          reason,
          created_by_user_id,
          created_at
        )
        values (gen_random_uuid(), $1, $2, 'presented', 'approved', 'estimate_approved', $3, $4)
      `,
      [input.tenantId, input.estimateId, input.updatedByUserId, input.approvedAt],
    );

    const lines = await this.findEstimateLines(input.tenantId, input.estimateId, client);

    return toEstimateRecord(updated, lines);
  }

  async convertApprovedEstimateToJobOrder(
    input: ConvertApprovedEstimateToJobOrderInput,
    client: DatabaseQueryClient,
  ): Promise<ConvertApprovedEstimateToJobOrderResult | null> {
    const estimate = await this.findEstimateById(input.tenantId, input.estimateId, client);

    if (estimate === null) {
      return null;
    }

    if (estimate.motorcycleId === null) {
      throw new Error('Approved estimate cannot be converted without a motorcycle.');
    }

    const jobOrderResult = await client.query<JobOrderRow>(
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
        returning *
      `,
      [
        input.jobOrderId,
        input.tenantId,
        estimate.branchId,
        estimate.customerId,
        estimate.motorcycleId,
        input.jobOrderNumber,
        input.serviceAdvisorUserId,
        input.mileageAtIntake,
        input.customerConcern,
        input.internalNotes,
        input.createdByUserId,
        input.convertedAt,
      ],
    );

    const jobOrder = jobOrderResult.rows[0];

    if (jobOrder === undefined) {
      throw new Error('Converted job order could not be created.');
    }

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
        values (gen_random_uuid(), $1, $2, null, 'pending', 'estimate_converted', $3, $4)
      `,
      [input.tenantId, jobOrder.id, input.createdByUserId, input.convertedAt],
    );

    for (const line of input.lines) {
      await client.query(
        `
          insert into job_order_lines (
            id,
            tenant_id,
            job_order_id,
            line_type,
            service_id,
            product_id,
            description,
            quantity,
            unit_price,
            authorized_amount,
            status,
            line_order,
            created_at,
            updated_at
          )
          values ($1, $2, $3, $4, $5, null, $6, $7, $8, $9, 'active', $10, $11, $11)
        `,
        [
          line.id,
          input.tenantId,
          jobOrder.id,
          line.lineType,
          line.serviceId,
          line.description,
          line.quantity,
          line.unitPrice,
          line.authorizedAmount,
          line.lineOrder,
          input.convertedAt,
        ],
      );

      await client.query(
        `
          insert into job_order_line_snapshots (
            id,
            tenant_id,
            job_order_line_id,
            source_name,
            source_price,
            source_disclaimer,
            captured_at
          )
          values (gen_random_uuid(), $1, $2, $3, $4, null, $5)
        `,
        [input.tenantId, line.id, line.description, line.unitPrice, input.convertedAt],
      );
    }

    const updateResult = await client.query<EstimateRow>(
      `
        update estimates
        set
          status = 'converted',
          converted_job_order_id = $4,
          updated_by_user_id = $5,
          updated_at = $6,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = 'approved'
          and lock_version = $3
        returning *
      `,
      [
        input.tenantId,
        input.estimateId,
        input.expectedLockVersion,
        jobOrder.id,
        input.createdByUserId,
        input.convertedAt,
      ],
    );

    const convertedEstimate = updateResult.rows[0];

    if (convertedEstimate === undefined) {
      return null;
    }

    await client.query(
      `
        insert into estimate_status_events (
          id,
          tenant_id,
          estimate_id,
          from_status,
          to_status,
          reason,
          created_by_user_id,
          created_at
        )
        values (gen_random_uuid(), $1, $2, 'approved', 'converted', 'estimate_converted', $3, $4)
      `,
      [input.tenantId, input.estimateId, input.createdByUserId, input.convertedAt],
    );

    const estimateLines = await this.findEstimateLines(input.tenantId, input.estimateId, client);

    return {
      estimate: toEstimateRecord(convertedEstimate, estimateLines),
      jobOrder: toJobOrderSummaryRecord(jobOrder),
    };
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

  async activeServiceExists(
    tenantId: string,
    serviceId: string,
    client?: DatabaseQueryClient,
  ): Promise<boolean> {
    const queryClient = client ?? this.database;
    const result = await queryClient.query<{ exists: boolean }>(
      `
        select exists (
          select 1
          from services
          where tenant_id = $1
            and id = $2
            and status = 'active'
        ) as exists
      `,
      [tenantId, serviceId],
    );

    return result.rows[0]?.exists ?? false;
  }

  private async attachLines(rows: readonly EstimateRow[]): Promise<readonly EstimateRecord[]> {
    const estimates: EstimateRecord[] = [];

    for (const row of rows) {
      const lines = await this.findEstimateLines(row.tenant_id, row.id, this.database);
      estimates.push(toEstimateRecord(row, lines));
    }

    return estimates;
  }

  private async findEstimateLines(
    tenantId: string,
    estimateId: string,
    client: DatabaseQueryClient,
  ): Promise<readonly EstimateLineRecord[]> {
    const result = await client.query<EstimateLineRow>(
      `
        select *
        from estimate_lines
        where tenant_id = $1
          and estimate_id = $2
        order by line_order asc, id asc
      `,
      [tenantId, estimateId],
    );

    return result.rows.map(toEstimateLineRecord);
  }

  private async insertEstimateLines(
    tenantId: string,
    estimateId: string,
    lines: readonly EstimateLineInput[],
    client: DatabaseQueryClient,
  ): Promise<void> {
    for (const line of lines) {
      await client.query(
        `
          insert into estimate_lines (
            id,
            tenant_id,
            estimate_id,
            line_type,
            service_id,
            product_id,
            description,
            quantity,
            unit_price,
            line_total,
            line_order
          )
          values ($1, $2, $3, $4, $5, null, $6, $7, $8, $9, $10)
        `,
        [
          line.id,
          tenantId,
          estimateId,
          line.lineType,
          line.serviceId,
          line.description,
          line.quantity,
          line.unitPrice,
          line.lineTotal,
          line.lineOrder,
        ],
      );
    }
  }
}

function toEstimateRecord(row: EstimateRow, lines: readonly EstimateLineRecord[]): EstimateRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    customerId: row.customer_id,
    motorcycleId: row.motorcycle_id,
    estimateNumber: row.estimate_number,
    status: row.status,
    validUntilDate: normalizeDateOnly(row.valid_until_date),
    approvalMethod: row.approval_method,
    approvedByCustomerName: row.approved_by_customer_name,
    approvedAt: row.approved_at,
    convertedJobOrderId: row.converted_job_order_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id,
    lockVersion: row.lock_version,
    lines,
  };
}

function toJobOrderSummaryRecord(row: JobOrderRow): JobOrderSummaryRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    customerId: row.customer_id,
    motorcycleId: row.motorcycle_id,
    jobOrderNumber: row.job_order_number,
    status: row.status,
    serviceAdvisorUserId: row.service_advisor_user_id,
    mileageAtIntake: row.mileage_at_intake,
    customerConcern: row.customer_concern,
    internalNotes: row.internal_notes,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lockVersion: row.lock_version,
  };
}

function toEstimateLineRecord(row: EstimateLineRow): EstimateLineRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    estimateId: row.estimate_id,
    lineType: row.line_type,
    serviceId: row.service_id,
    productId: row.product_id,
    description: row.description,
    quantity: normalizeDecimalString(row.quantity),
    unitPrice: normalizeDecimalString(row.unit_price),
    lineTotal: normalizeDecimalString(row.line_total),
    lineOrder: row.line_order,
  };
}

function normalizeDateOnly(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
}

function normalizeDecimalString(value: string | number): string {
  return String(value);
}

function conditionsIndex(value: number): number {
  return value;
}
