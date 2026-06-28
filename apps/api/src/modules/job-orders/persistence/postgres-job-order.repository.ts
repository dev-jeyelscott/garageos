import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  type AppendJobOrderInternalNoteInput,
  type AssignableMechanicRecord,
  JobOrderStore,
  type CancelJobOrderLineInput,
  type CompleteJobOrderLineInput,
  type CreateJobOrderInput,
  type CreateJobOrderLineInput,
  type JobOrderAuditActorType,
  type JobOrderAuditEventRecord,
  type JobOrderLineRecord,
  type JobOrderLineStatus,
  type JobOrderLineType,
  type JobOrderMechanicAssignmentRecord,
  type JobOrderMechanicAssignmentType,
  type JobOrderRecord,
  type JobOrderStatus,
  type JobOrderStatusEventRecord,
  type ListJobOrdersInput,
  type ReplaceJobOrderMechanicsInput,
  type ServiceSnapshotRecord,
  type TransitionJobOrderStatusInput,
  type TransitionJobOrderStatusResult,
  type UpdateJobOrderLineInput,
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

interface JobOrderMechanicAssignmentRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly job_order_id: string;
  readonly user_id: string;
  readonly assignment_type: JobOrderMechanicAssignmentType;
  readonly assigned_at: Date;
  readonly removed_at: Date | null;
}

interface JobOrderStatusEventRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly job_order_id: string;
  readonly from_status: JobOrderStatus | null;
  readonly to_status: JobOrderStatus;
  readonly reason: string | null;
  readonly created_by_user_id: string | null;
  readonly created_at: Date;
}

interface JobOrderAuditEventRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string | null;
  readonly actor_user_id: string | null;
  readonly actor_type: string;
  readonly action: string;
  readonly entity_type: string;
  readonly entity_id: string | null;
  readonly branch_id: string | null;
  readonly before_json: unknown | null;
  readonly after_json: unknown | null;
  readonly metadata_json: unknown | null;
  readonly reason: string | null;
  readonly created_at: Date | string;
}

interface AssignableMechanicRow extends DatabaseRow {
  readonly user_id: string;
  readonly employee_id: string;
  readonly tenant_wide_branch_access: boolean;
  readonly branch_access_allowed: boolean;
}

interface ServiceSnapshotRow extends DatabaseRow {
  readonly name: string;
  readonly starting_price: string;
  readonly price_disclaimer: string | null;
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

    return this.attachLinesAndMechanics(result.rows);
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
    const mechanics = await this.findJobOrderMechanics(tenantId, jobOrder.id, queryClient);

    return toJobOrderRecord(jobOrder, lines, mechanics);
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
    const mechanics = await this.findJobOrderMechanics(tenantId, jobOrder.id, client);

    return toJobOrderRecord(jobOrder, lines, mechanics);
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
    const mechanics = await this.findJobOrderMechanics(input.tenantId, input.jobOrderId, client);

    return toJobOrderRecord(updated, lines, mechanics);
  }

  async findJobOrderLineByIdForUpdate(
    tenantId: string,
    jobOrderId: string,
    lineId: string,
    client: DatabaseQueryClient,
  ): Promise<JobOrderLineRecord | null> {
    const result = await client.query<JobOrderLineRow>(
      `
        select *
        from job_order_lines
        where tenant_id = $1
          and job_order_id = $2
          and id = $3
        for update
      `,
      [tenantId, jobOrderId, lineId],
    );

    const line = result.rows[0];

    return line === undefined ? null : toJobOrderLineRecord(line);
  }

  async createJobOrderLine(
    input: CreateJobOrderLineInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderLineRecord> {
    const result = await client.query<JobOrderLineRow>(
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
        values (
          $1,
          $2,
          $3,
          $4,
          $5,
          null,
          $6,
          $7,
          $8,
          $9,
          'active',
          coalesce(
            $10::integer,
            (
              select coalesce(max(line_order) + 1, 0)
              from job_order_lines
              where tenant_id = $2
                and job_order_id = $3
            )
          ),
          $11,
          $11
        )
        returning *
      `,
      [
        input.id,
        input.tenantId,
        input.jobOrderId,
        input.lineType,
        input.serviceId,
        input.description,
        input.quantity,
        input.unitPrice,
        input.authorizedAmount,
        input.lineOrder,
        input.createdAt,
      ],
    );

    const created = result.rows[0];

    if (created === undefined) {
      throw new Error('Created job order line could not be loaded.');
    }

    await this.upsertJobOrderLineSnapshot(
      {
        tenantId: input.tenantId,
        lineId: input.id,
        sourceName: input.sourceName,
        sourcePrice: input.sourcePrice,
        sourceDisclaimer: input.sourceDisclaimer,
        capturedAt: input.createdAt,
      },
      client,
    );

    await this.touchJobOrder(input.tenantId, input.jobOrderId, input.createdAt, client);

    return toJobOrderLineRecord(created);
  }

  async updateJobOrderLine(
    input: UpdateJobOrderLineInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderLineRecord | null> {
    const result = await client.query<JobOrderLineRow>(
      `
        update job_order_lines
        set
          line_type = $4,
          service_id = $5,
          product_id = null,
          description = $6,
          quantity = $7,
          unit_price = $8,
          authorized_amount = $9,
          line_order = coalesce($10::integer, line_order),
          updated_at = $11
        where tenant_id = $1
          and job_order_id = $2
          and id = $3
          and status = 'active'
          and line_type in ('service', 'labor')
        returning *
      `,
      [
        input.tenantId,
        input.jobOrderId,
        input.lineId,
        input.lineType,
        input.serviceId,
        input.description,
        input.quantity,
        input.unitPrice,
        input.authorizedAmount,
        input.lineOrder,
        input.updatedAt,
      ],
    );

    const updated = result.rows[0];

    if (updated === undefined) {
      return null;
    }

    await this.upsertJobOrderLineSnapshot(
      {
        tenantId: input.tenantId,
        lineId: input.lineId,
        sourceName: input.sourceName,
        sourcePrice: input.sourcePrice,
        sourceDisclaimer: input.sourceDisclaimer,
        capturedAt: input.updatedAt,
      },
      client,
    );

    await this.touchJobOrder(input.tenantId, input.jobOrderId, input.updatedAt, client);

    return toJobOrderLineRecord(updated);
  }

  async cancelJobOrderLine(
    input: CancelJobOrderLineInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderLineRecord | null> {
    const result = await client.query<JobOrderLineRow>(
      `
        update job_order_lines
        set
          status = 'cancelled',
          updated_at = $4
        where tenant_id = $1
          and job_order_id = $2
          and id = $3
          and status = 'active'
          and line_type in ('service', 'labor')
        returning *
      `,
      [input.tenantId, input.jobOrderId, input.lineId, input.updatedAt],
    );

    const updated = result.rows[0];

    if (updated === undefined) {
      return null;
    }

    await this.touchJobOrder(input.tenantId, input.jobOrderId, input.updatedAt, client);

    return toJobOrderLineRecord(updated);
  }

  async appendJobOrderInternalNote(
    input: AppendJobOrderInternalNoteInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderRecord | null> {
    const result = await client.query<JobOrderRow>(
      `
        update job_orders
        set
          internal_notes = case
            when internal_notes is null or btrim(internal_notes) = '' then $3
            else internal_notes || E'\n' || $3
          end,
          updated_at = $4,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status in ('pending', 'in_progress', 'waiting_for_parts', 'completed')
        returning *
      `,
      [input.tenantId, input.jobOrderId, input.note, input.updatedAt],
    );

    if (result.rows[0] === undefined) {
      return null;
    }

    return this.findJobOrderById(input.tenantId, input.jobOrderId, client);
  }

  async completeJobOrderLine(
    input: CompleteJobOrderLineInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderLineRecord | null> {
    const result = await client.query<JobOrderLineRow>(
      `
        update job_order_lines
        set
          status = 'completed',
          completed_at = $4,
          updated_at = $4
        where tenant_id = $1
          and job_order_id = $2
          and id = $3
          and status = 'active'
          and line_type in ('service', 'labor')
          and inventory_reservation_id is null
        returning *
      `,
      [input.tenantId, input.jobOrderId, input.lineId, input.completedAt],
    );

    const updated = result.rows[0];

    if (updated === undefined) {
      return null;
    }

    await this.touchJobOrder(input.tenantId, input.jobOrderId, input.completedAt, client);

    return toJobOrderLineRecord(updated);
  }

  async isMechanicAssignedToJobOrder(
    input: {
      readonly tenantId: string;
      readonly jobOrderId: string;
      readonly mechanicUserId: string;
    },
    client: DatabaseQueryClient = this.database,
  ): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>(
      `
        select exists (
          select 1
          from job_order_mechanics
          where tenant_id = $1
            and job_order_id = $2
            and user_id = $3
            and removed_at is null
        ) as exists
      `,
      [input.tenantId, input.jobOrderId, input.mechanicUserId],
    );

    return result.rows[0]?.exists ?? false;
  }

  async findAssignableMechanics(
    input: {
      readonly tenantId: string;
      readonly branchId: string;
      readonly userIds: readonly string[];
    },
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly AssignableMechanicRecord[]> {
    if (input.userIds.length === 0) {
      return [];
    }

    const result = await client.query<AssignableMechanicRow>(
      `
        select
          u.id as user_id,
          ep.id as employee_id,
          ep.tenant_wide_branch_access,
          (
            ep.tenant_wide_branch_access
            or exists (
              select 1
              from user_branch_assignments uba
              inner join branches b
                on b.tenant_id = uba.tenant_id
               and b.id = uba.branch_id
               and b.status = 'active'
              where uba.tenant_id = ep.tenant_id
                and uba.user_id = ep.user_id
                and uba.branch_id = $3
                and uba.removed_at is null
            )
          ) as branch_access_allowed
        from users u
        inner join employee_profiles ep
          on ep.tenant_id = u.tenant_id
         and ep.user_id = u.id
         and ep.status = 'active'
        where u.tenant_id = $1
          and u.id = any($2::uuid[])
          and u.user_type = 'tenant_user'
          and u.status = 'active'
        order by u.id asc
      `,
      [input.tenantId, input.userIds, input.branchId],
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      employeeId: row.employee_id,
      tenantWideBranchAccess: row.tenant_wide_branch_access,
      branchAccessAllowed: row.branch_access_allowed,
    }));
  }

  async replaceJobOrderMechanics(
    input: ReplaceJobOrderMechanicsInput,
    client: DatabaseQueryClient,
  ): Promise<JobOrderRecord> {
    const additionalMechanicUserIds = [...new Set(input.additionalMechanicUserIds)];

    await client.query(
      `
        update job_order_mechanics
        set removed_at = $4
        where tenant_id = $1
          and job_order_id = $2
          and removed_at is null
          and (
            (assignment_type = 'primary' and user_id <> $3::uuid)
            or (
              assignment_type = 'additional'
              and (
                user_id = $3::uuid
                or not (user_id = any($5::uuid[]))
              )
            )
          )
      `,
      [
        input.tenantId,
        input.jobOrderId,
        input.primaryMechanicUserId,
        input.assignedAt,
        additionalMechanicUserIds,
      ],
    );

    await client.query(
      `
        insert into job_order_mechanics (
          id,
          tenant_id,
          job_order_id,
          user_id,
          assignment_type,
          assigned_at,
          removed_at
        )
        select gen_random_uuid(), $1, $2, $3, 'primary', $4, null
        where not exists (
          select 1
          from job_order_mechanics
          where tenant_id = $1
            and job_order_id = $2
            and user_id = $3
            and assignment_type = 'primary'
            and removed_at is null
        )
      `,
      [input.tenantId, input.jobOrderId, input.primaryMechanicUserId, input.assignedAt],
    );

    await client.query(
      `
        insert into job_order_mechanics (
          id,
          tenant_id,
          job_order_id,
          user_id,
          assignment_type,
          assigned_at,
          removed_at
        )
        select gen_random_uuid(), $1, $2, mechanic_user_id, 'additional', $4, null
        from unnest($3::uuid[]) as mechanic_user_id
        where not exists (
          select 1
          from job_order_mechanics existing
          where existing.tenant_id = $1
            and existing.job_order_id = $2
            and existing.user_id = mechanic_user_id
            and existing.assignment_type = 'additional'
            and existing.removed_at is null
        )
      `,
      [input.tenantId, input.jobOrderId, additionalMechanicUserIds, input.assignedAt],
    );

    await client.query(
      `
        update job_orders
        set
          primary_mechanic_user_id = $3,
          updated_at = $4,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
      `,
      [input.tenantId, input.jobOrderId, input.primaryMechanicUserId, input.assignedAt],
    );

    const updated = await this.findJobOrderById(input.tenantId, input.jobOrderId, client);

    if (updated === null) {
      throw new Error('Updated job order mechanic assignments could not be loaded.');
    }

    return updated;
  }

  async transitionJobOrderStatus(
    input: TransitionJobOrderStatusInput,
    client: DatabaseQueryClient,
  ): Promise<TransitionJobOrderStatusResult | null> {
    const result = await client.query<JobOrderRow>(
      `
        update job_orders
        set
          status = $3,
          completed_at = case
            when $3::text = 'completed' then $6
            when status = 'completed' and $3::text <> 'completed' then null
            else completed_at
          end,
          updated_at = $6,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = $4
          and lock_version = $5
        returning *
      `,
      [
        input.tenantId,
        input.jobOrderId,
        input.toStatus,
        input.fromStatus,
        input.expectedLockVersion,
        input.transitionedAt,
      ],
    );

    const updated = result.rows[0];

    if (updated === undefined) {
      return null;
    }

    const statusEventResult = await client.query<JobOrderStatusEventRow>(
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
        values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
        returning *
      `,
      [
        input.tenantId,
        input.jobOrderId,
        input.fromStatus,
        input.toStatus,
        input.reason,
        input.transitionedByUserId,
        input.transitionedAt,
      ],
    );

    const statusEvent = statusEventResult.rows[0];

    if (statusEvent === undefined) {
      throw new Error('Job order status event could not be created.');
    }

    const reloaded = await this.findJobOrderById(input.tenantId, input.jobOrderId, client);

    if (reloaded === null) {
      throw new Error('Updated job order status could not be loaded.');
    }

    return {
      jobOrder: reloaded,
      statusEvent: toJobOrderStatusEventRecord(statusEvent),
    };
  }

  async listJobOrderStatusEvents(
    tenantId: string,
    jobOrderId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly JobOrderStatusEventRecord[]> {
    const queryClient = client ?? this.database;
    const result = await queryClient.query<JobOrderStatusEventRow>(
      `
        select *
        from job_order_status_events
        where tenant_id = $1
          and job_order_id = $2
        order by created_at asc, id asc
      `,
      [tenantId, jobOrderId],
    );

    return result.rows.map(toJobOrderStatusEventRecord);
  }

  async listJobOrderAuditEvents(
    tenantId: string,
    jobOrderId: string,
    client?: DatabaseQueryClient,
  ): Promise<readonly JobOrderAuditEventRecord[]> {
    const queryClient = client ?? this.database;
    const result = await queryClient.query<JobOrderAuditEventRow>(
      `
        select
          id,
          tenant_id,
          actor_user_id,
          actor_type,
          action,
          entity_type,
          entity_id,
          branch_id,
          before_json,
          after_json,
          metadata_json,
          reason,
          created_at
        from audit_logs
        where tenant_id = $1
          and (
            (
              entity_type = 'job_order'
              and entity_id = $2::uuid
            )
            or (
              entity_type = 'job_order_line'
              and entity_id in (
                select id
                from job_order_lines
                where tenant_id = $1
                  and job_order_id = $2::uuid
              )
            )
          )
        order by created_at asc, id asc
      `,
      [tenantId, jobOrderId],
    );

    return result.rows.map(toJobOrderAuditEventRecord);
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

  async findActiveServiceSnapshot(
    tenantId: string,
    serviceId: string,
    client?: DatabaseQueryClient,
  ): Promise<ServiceSnapshotRecord | null> {
    const queryClient = client ?? this.database;
    const result = await queryClient.query<ServiceSnapshotRow>(
      `
        select name, starting_price, price_disclaimer
        from services
        where tenant_id = $1
          and id = $2
          and status = 'active'
        limit 1
      `,
      [tenantId, serviceId],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return {
      name: row.name,
      startingPrice: normalizeDecimalString(row.starting_price),
      priceDisclaimer: row.price_disclaimer,
    };
  }

  private async attachLinesAndMechanics(
    rows: readonly JobOrderRow[],
  ): Promise<readonly JobOrderRecord[]> {
    const jobOrders: JobOrderRecord[] = [];

    for (const row of rows) {
      const lines = await this.findJobOrderLines(row.tenant_id, row.id, this.database);
      const mechanics = await this.findJobOrderMechanics(row.tenant_id, row.id, this.database);

      jobOrders.push(toJobOrderRecord(row, lines, mechanics));
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

  private async findJobOrderMechanics(
    tenantId: string,
    jobOrderId: string,
    client: DatabaseQueryClient,
  ): Promise<readonly JobOrderMechanicAssignmentRecord[]> {
    const result = await client.query<JobOrderMechanicAssignmentRow>(
      `
        select *
        from job_order_mechanics
        where tenant_id = $1
          and job_order_id = $2
          and removed_at is null
        order by
          case assignment_type
            when 'primary' then 0
            else 1
          end,
          assigned_at asc,
          user_id asc
      `,
      [tenantId, jobOrderId],
    );

    return result.rows.map(toJobOrderMechanicAssignmentRecord);
  }

  private async upsertJobOrderLineSnapshot(
    input: {
      readonly tenantId: string;
      readonly lineId: string;
      readonly sourceName: string;
      readonly sourcePrice: string;
      readonly sourceDisclaimer: string | null;
      readonly capturedAt: Date;
    },
    client: DatabaseQueryClient,
  ): Promise<void> {
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
        values (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
        on conflict (tenant_id, job_order_line_id)
        do update set
          source_name = excluded.source_name,
          source_price = excluded.source_price,
          source_disclaimer = excluded.source_disclaimer,
          captured_at = excluded.captured_at
      `,
      [
        input.tenantId,
        input.lineId,
        input.sourceName,
        input.sourcePrice,
        input.sourceDisclaimer,
        input.capturedAt,
      ],
    );
  }

  private async touchJobOrder(
    tenantId: string,
    jobOrderId: string,
    updatedAt: Date,
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        update job_orders
        set
          updated_at = $3,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
      `,
      [tenantId, jobOrderId, updatedAt],
    );
  }
}

function toJobOrderRecord(
  row: JobOrderRow,
  lines: readonly JobOrderLineRecord[],
  mechanics: readonly JobOrderMechanicAssignmentRecord[],
): JobOrderRecord {
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
    mechanics,
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

function toJobOrderMechanicAssignmentRecord(
  row: JobOrderMechanicAssignmentRow,
): JobOrderMechanicAssignmentRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    jobOrderId: row.job_order_id,
    userId: row.user_id,
    assignmentType: row.assignment_type,
    assignedAt: row.assigned_at,
    removedAt: row.removed_at,
  };
}

function toJobOrderStatusEventRecord(row: JobOrderStatusEventRow): JobOrderStatusEventRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    jobOrderId: row.job_order_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    reason: row.reason,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}

function toJobOrderAuditEventRecord(row: JobOrderAuditEventRow): JobOrderAuditEventRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    actorType: toJobOrderAuditActorType(row.actor_type),
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    branchId: row.branch_id,
    beforeJson: row.before_json,
    afterJson: row.after_json,
    metadataJson: row.metadata_json,
    reason: row.reason,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

function toJobOrderAuditActorType(actorType: string): JobOrderAuditActorType {
  if (actorType === 'tenant_user' || actorType === 'platform_admin' || actorType === 'system') {
    return actorType;
  }

  throw new Error(`Unknown job order audit actor type: ${actorType}.`);
}

function normalizeDecimalString(value: string | number): string {
  return String(value);
}
