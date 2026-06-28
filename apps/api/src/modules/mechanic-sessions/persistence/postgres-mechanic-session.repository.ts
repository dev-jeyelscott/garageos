import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  MechanicSessionStore,
  type CreateMechanicWorkSessionInput,
  type FinishMechanicWorkSessionInput,
  type ListMechanicWorkSessionsInput,
  type MechanicSessionJobOrderRecord,
  type MechanicSessionJobOrderStatus,
  type MechanicWorkSessionPauseRecord,
  type MechanicWorkSessionRecord,
  type MechanicWorkSessionStatus,
  type PauseMechanicWorkSessionInput,
  type ResumeMechanicWorkSessionInput,
} from '../application/mechanic-session.store';

interface MechanicWorkSessionRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly job_order_id: string;
  readonly mechanic_user_id: string;
  readonly status: MechanicWorkSessionStatus;
  readonly started_at: Date;
  readonly finished_at: Date | null;
  readonly total_active_seconds: number;
  readonly notes: string | null;
}

interface MechanicWorkSessionPauseRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly work_session_id: string;
  readonly paused_at: Date;
  readonly resumed_at: Date | null;
  readonly resumed_by_user_id: string | null;
}

interface MechanicSessionJobOrderRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly branch_id: string;
  readonly status: MechanicSessionJobOrderStatus;
}

@Injectable()
export class PostgresMechanicSessionRepository extends MechanicSessionStore {
  constructor(
    @Inject(API_DATABASE_CLIENT)
    private readonly database: DatabaseQueryClient,
  ) {
    super();
  }

  async listMechanicWorkSessions(
    input: ListMechanicWorkSessionsInput,
  ): Promise<readonly MechanicWorkSessionRecord[]> {
    const conditions = ['tenant_id = $1', 'branch_id = $2'];
    const values: unknown[] = [input.tenantId, input.branchId];
    let nextIndex = values.length + 1;

    if (input.jobOrderId !== undefined) {
      conditions.push(`job_order_id = $${nextIndex}`);
      values.push(input.jobOrderId);
      nextIndex += 1;
    }

    if (input.mechanicUserId !== undefined) {
      conditions.push(`mechanic_user_id = $${nextIndex}`);
      values.push(input.mechanicUserId);
      nextIndex += 1;
    }

    if (input.status !== undefined) {
      conditions.push(`status = $${nextIndex}`);
      values.push(input.status);
      nextIndex += 1;
    }

    values.push(input.limit);

    const result = await this.database.query<MechanicWorkSessionRow>(
      `
        select *
        from mechanic_work_sessions
        where ${conditions.join(' and ')}
        order by started_at desc, id desc
        limit $${nextIndex}
      `,
      values,
    );

    const workSessions: MechanicWorkSessionRecord[] = [];

    for (const row of result.rows) {
      const pauses = await this.findWorkSessionPauses(row.tenant_id, row.id, this.database);
      workSessions.push(toMechanicWorkSessionRecord(row, pauses));
    }

    return workSessions;
  }

  async findMechanicWorkSessionById(
    tenantId: string,
    workSessionId: string,
    client?: DatabaseQueryClient,
  ): Promise<MechanicWorkSessionRecord | null> {
    const queryClient = client ?? this.database;
    const result = await queryClient.query<MechanicWorkSessionRow>(
      `
        select *
        from mechanic_work_sessions
        where tenant_id = $1
          and id = $2
        limit 1
      `,
      [tenantId, workSessionId],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    const pauses = await this.findWorkSessionPauses(tenantId, row.id, queryClient);

    return toMechanicWorkSessionRecord(row, pauses);
  }

  async findMechanicWorkSessionByIdForUpdate(
    tenantId: string,
    workSessionId: string,
    client: DatabaseQueryClient,
  ): Promise<MechanicWorkSessionRecord | null> {
    const result = await client.query<MechanicWorkSessionRow>(
      `
        select *
        from mechanic_work_sessions
        where tenant_id = $1
          and id = $2
        for update
      `,
      [tenantId, workSessionId],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    const pauses = await this.findWorkSessionPausesForUpdate(tenantId, row.id, client);

    return toMechanicWorkSessionRecord(row, pauses);
  }

  async findJobOrderForWorkSessionStart(
    tenantId: string,
    jobOrderId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<MechanicSessionJobOrderRecord | null> {
    const result = await client.query<MechanicSessionJobOrderRow>(
      `
        select id, tenant_id, branch_id, status
        from job_orders
        where tenant_id = $1
          and id = $2
        limit 1
      `,
      [tenantId, jobOrderId],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      status: row.status,
    };
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

  async lockMechanicWorkSessionStart(
    input: {
      readonly tenantId: string;
      readonly mechanicUserId: string;
    },
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [
      `mechanic-session-start:${input.tenantId}:${input.mechanicUserId}`,
    ]);
  }

  async findUnfinishedWorkSessionForMechanic(
    input: {
      readonly tenantId: string;
      readonly mechanicUserId: string;
    },
    client: DatabaseQueryClient = this.database,
  ): Promise<MechanicWorkSessionRecord | null> {
    const result = await client.query<MechanicWorkSessionRow>(
      `
        select *
        from mechanic_work_sessions
        where tenant_id = $1
          and mechanic_user_id = $2
          and finished_at is null
        order by started_at desc
        limit 1
      `,
      [input.tenantId, input.mechanicUserId],
    );

    const row = result.rows[0];

    if (row === undefined) {
      return null;
    }

    const pauses = await this.findWorkSessionPauses(input.tenantId, row.id, client);

    return toMechanicWorkSessionRecord(row, pauses);
  }

  async createMechanicWorkSession(
    input: CreateMechanicWorkSessionInput,
    client: DatabaseQueryClient,
  ): Promise<MechanicWorkSessionRecord> {
    const result = await client.query<MechanicWorkSessionRow>(
      `
        insert into mechanic_work_sessions (
          id,
          tenant_id,
          branch_id,
          job_order_id,
          mechanic_user_id,
          status,
          started_at,
          finished_at,
          total_active_seconds,
          notes
        )
        values ($1, $2, $3, $4, $5, 'active', $6, null, 0, $7)
        returning *
      `,
      [
        input.id,
        input.tenantId,
        input.branchId,
        input.jobOrderId,
        input.mechanicUserId,
        input.startedAt,
        input.notes,
      ],
    );

    const created = result.rows[0];

    if (created === undefined) {
      throw new Error('Created mechanic work session could not be loaded.');
    }

    return toMechanicWorkSessionRecord(created, []);
  }

  async pauseMechanicWorkSession(
    input: PauseMechanicWorkSessionInput,
    client: DatabaseQueryClient,
  ): Promise<MechanicWorkSessionRecord | null> {
    const updateResult = await client.query<MechanicWorkSessionRow>(
      `
        update mechanic_work_sessions
        set status = 'paused'
        where tenant_id = $1
          and id = $2
          and status = 'active'
          and finished_at is null
        returning *
      `,
      [input.tenantId, input.workSessionId],
    );

    const updated = updateResult.rows[0];

    if (updated === undefined) {
      return null;
    }

    await client.query(
      `
        insert into mechanic_work_session_pauses (
          id,
          tenant_id,
          work_session_id,
          paused_at,
          resumed_at,
          resumed_by_user_id
        )
        values (gen_random_uuid(), $1, $2, $3, null, null)
      `,
      [input.tenantId, input.workSessionId, input.pausedAt],
    );

    const pauses = await this.findWorkSessionPauses(input.tenantId, input.workSessionId, client);

    return toMechanicWorkSessionRecord(updated, pauses);
  }

  async resumeMechanicWorkSession(
    input: ResumeMechanicWorkSessionInput,
    client: DatabaseQueryClient,
  ): Promise<MechanicWorkSessionRecord | null> {
    const pauseResult = await client.query<MechanicWorkSessionPauseRow>(
      `
        update mechanic_work_session_pauses
        set
          resumed_at = $3,
          resumed_by_user_id = $4
        where tenant_id = $1
          and work_session_id = $2
          and resumed_at is null
        returning *
      `,
      [input.tenantId, input.workSessionId, input.resumedAt, input.resumedByUserId],
    );

    if (pauseResult.rows[0] === undefined) {
      return null;
    }

    const updateResult = await client.query<MechanicWorkSessionRow>(
      `
        update mechanic_work_sessions
        set status = 'active'
        where tenant_id = $1
          and id = $2
          and status = 'paused'
          and finished_at is null
        returning *
      `,
      [input.tenantId, input.workSessionId],
    );

    const updated = updateResult.rows[0];

    if (updated === undefined) {
      return null;
    }

    const pauses = await this.findWorkSessionPauses(input.tenantId, input.workSessionId, client);

    return toMechanicWorkSessionRecord(updated, pauses);
  }

  async finishMechanicWorkSession(
    input: FinishMechanicWorkSessionInput,
    client: DatabaseQueryClient,
  ): Promise<MechanicWorkSessionRecord | null> {
    if (input.closeOpenPause) {
      await client.query(
        `
          update mechanic_work_session_pauses
          set
            resumed_at = $3,
            resumed_by_user_id = $4
          where tenant_id = $1
            and work_session_id = $2
            and resumed_at is null
        `,
        [input.tenantId, input.workSessionId, input.finishedAt, input.resumedByUserId],
      );
    }

    const result = await client.query<MechanicWorkSessionRow>(
      `
        update mechanic_work_sessions
        set
          status = 'finished',
          finished_at = $3,
          total_active_seconds = $4,
          notes = $5
        where tenant_id = $1
          and id = $2
          and status in ('active', 'paused')
          and finished_at is null
        returning *
      `,
      [
        input.tenantId,
        input.workSessionId,
        input.finishedAt,
        input.totalActiveSeconds,
        input.notes,
      ],
    );

    const updated = result.rows[0];

    if (updated === undefined) {
      return null;
    }

    const pauses = await this.findWorkSessionPauses(input.tenantId, input.workSessionId, client);

    return toMechanicWorkSessionRecord(updated, pauses);
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

  private async findWorkSessionPauses(
    tenantId: string,
    workSessionId: string,
    client: DatabaseQueryClient,
  ): Promise<readonly MechanicWorkSessionPauseRecord[]> {
    const result = await client.query<MechanicWorkSessionPauseRow>(
      `
        select *
        from mechanic_work_session_pauses
        where tenant_id = $1
          and work_session_id = $2
        order by paused_at asc, id asc
      `,
      [tenantId, workSessionId],
    );

    return result.rows.map(toMechanicWorkSessionPauseRecord);
  }

  private async findWorkSessionPausesForUpdate(
    tenantId: string,
    workSessionId: string,
    client: DatabaseQueryClient,
  ): Promise<readonly MechanicWorkSessionPauseRecord[]> {
    const result = await client.query<MechanicWorkSessionPauseRow>(
      `
        select *
        from mechanic_work_session_pauses
        where tenant_id = $1
          and work_session_id = $2
        order by paused_at asc, id asc
        for update
      `,
      [tenantId, workSessionId],
    );

    return result.rows.map(toMechanicWorkSessionPauseRecord);
  }
}

function toMechanicWorkSessionRecord(
  row: MechanicWorkSessionRow,
  pauses: readonly MechanicWorkSessionPauseRecord[],
): MechanicWorkSessionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    jobOrderId: row.job_order_id,
    mechanicUserId: row.mechanic_user_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    totalActiveSeconds: Number(row.total_active_seconds),
    notes: row.notes,
    pauses,
  };
}

function toMechanicWorkSessionPauseRecord(
  row: MechanicWorkSessionPauseRow,
): MechanicWorkSessionPauseRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workSessionId: row.work_session_id,
    pausedAt: row.paused_at,
    resumedAt: row.resumed_at,
    resumedByUserId: row.resumed_by_user_id,
  };
}
