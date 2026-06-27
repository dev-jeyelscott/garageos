import { Inject, Injectable } from '@nestjs/common';

import {
  API_DATABASE_CLIENT,
  type DatabaseQueryClient,
  type DatabaseRow,
} from '../../../shared/database/database-client';
import {
  MotorcycleStore,
  type ActiveCustomerRecord,
  type CreateMotorcycleInput,
  type CreateMotorcycleMileageEventInput,
  type FindMotorcycleDuplicateWarningsInput,
  type FindMotorcycleIdentifierConflictsInput,
  type ListMotorcyclesInput,
  type MotorcycleDuplicateWarningRecord,
  type MotorcycleDuplicateWarningType,
  type MotorcycleIdentifierConflictRecord,
  type MotorcycleIdentifierType,
  type MotorcycleRecord,
  type UpdateMotorcycleInput,
} from '../application/motorcycle.store';

interface BooleanRow extends DatabaseRow {
  readonly value: boolean;
}

interface ActiveCustomerRow extends DatabaseRow {
  readonly id: string;
  readonly name: string;
}

interface MotorcycleRow extends DatabaseRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly customer_id: string;
  readonly brand: string;
  readonly model: string;
  readonly year: number | null;
  readonly color: string | null;
  readonly plate_number: string | null;
  readonly normalized_plate_number: string | null;
  readonly engine_number: string | null;
  readonly normalized_engine_number: string | null;
  readonly chassis_number: string | null;
  readonly normalized_chassis_number: string | null;
  readonly mileage: number;
  readonly status: 'active' | 'soft_deleted';
  readonly deleted_at: Date | string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly lock_version: number;
}

interface IdentifierConflictRow extends DatabaseRow {
  readonly type: MotorcycleIdentifierType;
  readonly motorcycle_id: string;
  readonly brand: string;
  readonly model: string;
  readonly plate_number: string | null;
  readonly engine_number: string | null;
  readonly chassis_number: string | null;
}

interface DuplicateWarningRow extends DatabaseRow {
  readonly type: MotorcycleDuplicateWarningType;
  readonly motorcycle_id: string;
  readonly brand: string;
  readonly model: string;
  readonly plate_number: string | null;
  readonly engine_number: string | null;
  readonly chassis_number: string | null;
}

@Injectable()
export class PostgresMotorcycleRepository extends MotorcycleStore {
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

  async findActiveCustomerById(
    tenantId: string,
    customerId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<ActiveCustomerRecord | null> {
    const result = await client.query<ActiveCustomerRow>(
      `
        select id, name
        from customers
        where tenant_id = $1
          and id = $2
          and status = 'active'
        limit 1
      `,
      [tenantId, customerId],
    );

    const row = result.rows[0];

    return row === undefined ? null : { id: row.id, name: row.name };
  }

  async listMotorcycles(
    input: ListMotorcyclesInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly MotorcycleRecord[]> {
    const result = await client.query<MotorcycleRow>(
      `
        select
          id,
          tenant_id,
          customer_id,
          brand,
          model,
          year,
          color,
          plate_number,
          normalized_plate_number,
          engine_number,
          normalized_engine_number,
          chassis_number,
          normalized_chassis_number,
          mileage,
          status,
          deleted_at,
          created_at,
          updated_at,
          lock_version
        from motorcycles
        where tenant_id = $1
          and status = 'active'
          and ($2::uuid is null or customer_id = $2::uuid)
          and (
            $3::text is null
            or lower(brand) like '%' || $3::text || '%'
            or lower(model) like '%' || $3::text || '%'
            or (
              $4::text is not null
              and (
                normalized_plate_number like '%' || $4::text || '%'
                or normalized_engine_number like '%' || $4::text || '%'
                or normalized_chassis_number like '%' || $4::text || '%'
              )
            )
          )
        order by updated_at desc, created_at desc, id asc
        limit $5
      `,
      [
        input.tenantId,
        input.customerId,
        input.normalizedSearch,
        input.normalizedIdentifierSearch,
        input.limit,
      ],
    );

    return result.rows.map(toMotorcycleRecord);
  }

  async findMotorcycleById(
    tenantId: string,
    motorcycleId: string,
    client: DatabaseQueryClient = this.database,
  ): Promise<MotorcycleRecord | null> {
    const result = await client.query<MotorcycleRow>(
      `
        select
          id,
          tenant_id,
          customer_id,
          brand,
          model,
          year,
          color,
          plate_number,
          normalized_plate_number,
          engine_number,
          normalized_engine_number,
          chassis_number,
          normalized_chassis_number,
          mileage,
          status,
          deleted_at,
          created_at,
          updated_at,
          lock_version
        from motorcycles
        where tenant_id = $1
          and id = $2
        limit 1
      `,
      [tenantId, motorcycleId],
    );

    const row = result.rows[0];

    return row === undefined ? null : toMotorcycleRecord(row);
  }

  async createMotorcycle(
    input: CreateMotorcycleInput,
    client: DatabaseQueryClient,
  ): Promise<MotorcycleRecord> {
    const result = await client.query<MotorcycleRow>(
      `
        insert into motorcycles (
          id,
          tenant_id,
          customer_id,
          brand,
          model,
          year,
          color,
          plate_number,
          normalized_plate_number,
          engine_number,
          normalized_engine_number,
          chassis_number,
          normalized_chassis_number,
          mileage,
          status,
          created_at,
          updated_at
        )
        values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          'active',
          $15,
          $15
        )
        returning
          id,
          tenant_id,
          customer_id,
          brand,
          model,
          year,
          color,
          plate_number,
          normalized_plate_number,
          engine_number,
          normalized_engine_number,
          chassis_number,
          normalized_chassis_number,
          mileage,
          status,
          deleted_at,
          created_at,
          updated_at,
          lock_version
      `,
      [
        input.id,
        input.tenantId,
        input.customerId,
        input.brand,
        input.model,
        input.year,
        input.color,
        input.plateNumber,
        input.normalizedPlateNumber,
        input.engineNumber,
        input.normalizedEngineNumber,
        input.chassisNumber,
        input.normalizedChassisNumber,
        input.latestMileage,
        input.createdAt,
      ],
    );

    const row = result.rows[0];

    if (row === undefined) {
      throw new Error('Motorcycle create did not return a row.');
    }

    return toMotorcycleRecord(row);
  }

  async updateMotorcycle(
    input: UpdateMotorcycleInput,
    client: DatabaseQueryClient,
  ): Promise<MotorcycleRecord | null> {
    const result = await client.query<MotorcycleRow>(
      `
        update motorcycles
        set
          customer_id = $3,
          brand = $4,
          model = $5,
          year = $6,
          color = $7,
          plate_number = $8,
          normalized_plate_number = $9,
          engine_number = $10,
          normalized_engine_number = $11,
          chassis_number = $12,
          normalized_chassis_number = $13,
          mileage = $14,
          updated_at = $15,
          lock_version = lock_version + 1
        where tenant_id = $1
          and id = $2
          and status = 'active'
          and lock_version = $16
        returning
          id,
          tenant_id,
          customer_id,
          brand,
          model,
          year,
          color,
          plate_number,
          normalized_plate_number,
          engine_number,
          normalized_engine_number,
          chassis_number,
          normalized_chassis_number,
          mileage,
          status,
          deleted_at,
          created_at,
          updated_at,
          lock_version
      `,
      [
        input.tenantId,
        input.motorcycleId,
        input.customerId,
        input.brand,
        input.model,
        input.year,
        input.color,
        input.plateNumber,
        input.normalizedPlateNumber,
        input.engineNumber,
        input.normalizedEngineNumber,
        input.chassisNumber,
        input.normalizedChassisNumber,
        input.latestMileage,
        input.updatedAt,
        input.expectedLockVersion,
      ],
    );

    const row = result.rows[0];

    return row === undefined ? null : toMotorcycleRecord(row);
  }

  async createMotorcycleMileageEvent(
    input: CreateMotorcycleMileageEventInput,
    client: DatabaseQueryClient,
  ): Promise<void> {
    await client.query(
      `
        insert into motorcycle_mileage_events (
          id,
          tenant_id,
          motorcycle_id,
          source_type,
          source_id,
          previous_mileage,
          new_mileage,
          reason,
          created_by_user_id,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        input.id,
        input.tenantId,
        input.motorcycleId,
        input.sourceType,
        input.sourceId,
        input.previousMileage,
        input.newMileage,
        input.reason,
        input.createdByUserId,
        input.createdAt,
      ],
    );
  }

  async findIdentifierConflicts(
    input: FindMotorcycleIdentifierConflictsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly MotorcycleIdentifierConflictRecord[]> {
    const result = await client.query<IdentifierConflictRow>(
      `
        select distinct on (identifier_type, motorcycle_id)
          identifier_type as type,
          motorcycle_id,
          brand,
          model,
          plate_number,
          engine_number,
          chassis_number
        from (
          select
            'plate_number'::text as identifier_type,
            m.id as motorcycle_id,
            m.brand,
            m.model,
            m.plate_number,
            m.engine_number,
            m.chassis_number
          from motorcycles m
          where m.tenant_id = $1
            and m.status = 'active'
            and ($5::uuid is null or m.id <> $5::uuid)
            and $2::text is not null
            and m.normalized_plate_number = $2::text

          union all

          select
            'engine_number'::text as identifier_type,
            m.id as motorcycle_id,
            m.brand,
            m.model,
            m.plate_number,
            m.engine_number,
            m.chassis_number
          from motorcycles m
          where m.tenant_id = $1
            and m.status = 'active'
            and ($5::uuid is null or m.id <> $5::uuid)
            and $3::text is not null
            and m.normalized_engine_number = $3::text

          union all

          select
            'chassis_number'::text as identifier_type,
            m.id as motorcycle_id,
            m.brand,
            m.model,
            m.plate_number,
            m.engine_number,
            m.chassis_number
          from motorcycles m
          where m.tenant_id = $1
            and m.status = 'active'
            and ($5::uuid is null or m.id <> $5::uuid)
            and $4::text is not null
            and m.normalized_chassis_number = $4::text
        ) conflicts
        order by identifier_type, motorcycle_id, brand, model
        limit 10
      `,
      [
        input.tenantId,
        input.normalizedPlateNumber,
        input.normalizedEngineNumber,
        input.normalizedChassisNumber,
        input.excludeMotorcycleId,
      ],
    );

    return result.rows.map((row) => ({
      type: row.type,
      motorcycleId: row.motorcycle_id,
      brand: row.brand,
      model: row.model,
      plateNumber: row.plate_number,
      engineNumber: row.engine_number,
      chassisNumber: row.chassis_number,
    }));
  }

  async findDuplicateWarnings(
    input: FindMotorcycleDuplicateWarningsInput,
    client: DatabaseQueryClient = this.database,
  ): Promise<readonly MotorcycleDuplicateWarningRecord[]> {
    const result = await client.query<DuplicateWarningRow>(
      `
        select distinct on (warning_type, motorcycle_id)
          warning_type as type,
          motorcycle_id,
          brand,
          model,
          plate_number,
          engine_number,
          chassis_number
        from (
          select
            'similar_plate_number'::text as warning_type,
            m.id as motorcycle_id,
            m.brand,
            m.model,
            m.plate_number,
            m.engine_number,
            m.chassis_number
          from motorcycles m
          where m.tenant_id = $1
            and m.status = 'active'
            and ($6::uuid is null or m.id <> $6::uuid)
            and $2::text is not null
            and m.normalized_plate_number is not null
            and m.normalized_plate_number <> $2::text
            and similarity(m.normalized_plate_number, $2::text) >= 0.8

          union all

          select
            'similar_engine_number'::text as warning_type,
            m.id as motorcycle_id,
            m.brand,
            m.model,
            m.plate_number,
            m.engine_number,
            m.chassis_number
          from motorcycles m
          where m.tenant_id = $1
            and m.status = 'active'
            and ($6::uuid is null or m.id <> $6::uuid)
            and $3::text is not null
            and m.normalized_engine_number is not null
            and m.normalized_engine_number <> $3::text
            and similarity(m.normalized_engine_number, $3::text) >= 0.8

          union all

          select
            'similar_chassis_number'::text as warning_type,
            m.id as motorcycle_id,
            m.brand,
            m.model,
            m.plate_number,
            m.engine_number,
            m.chassis_number
          from motorcycles m
          where m.tenant_id = $1
            and m.status = 'active'
            and ($6::uuid is null or m.id <> $6::uuid)
            and $4::text is not null
            and m.normalized_chassis_number is not null
            and m.normalized_chassis_number <> $4::text
            and similarity(m.normalized_chassis_number, $4::text) >= 0.8

          union all

          select
            'similar_model'::text as warning_type,
            m.id as motorcycle_id,
            m.brand,
            m.model,
            m.plate_number,
            m.engine_number,
            m.chassis_number
          from motorcycles m
          where m.tenant_id = $1
            and m.status = 'active'
            and ($6::uuid is null or m.id <> $6::uuid)
            and similarity(lower(m.brand || ' ' || m.model), $5::text) >= 0.55
        ) warnings
        order by warning_type, motorcycle_id, brand, model
        limit 10
      `,
      [
        input.tenantId,
        input.normalizedPlateNumber,
        input.normalizedEngineNumber,
        input.normalizedChassisNumber,
        input.normalizedBrandModel,
        input.excludeMotorcycleId,
      ],
    );

    return result.rows.map((row) => ({
      type: row.type,
      motorcycleId: row.motorcycle_id,
      brand: row.brand,
      model: row.model,
      plateNumber: row.plate_number,
      engineNumber: row.engine_number,
      chassisNumber: row.chassis_number,
    }));
  }
}

function toMotorcycleRecord(row: MotorcycleRow): MotorcycleRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    brand: row.brand,
    model: row.model,
    year: row.year,
    color: row.color,
    plateNumber: row.plate_number,
    normalizedPlateNumber: row.normalized_plate_number,
    engineNumber: row.engine_number,
    normalizedEngineNumber: row.normalized_engine_number,
    chassisNumber: row.chassis_number,
    normalizedChassisNumber: row.normalized_chassis_number,
    latestMileage: row.mileage,
    status: row.status,
    deletedAt: toNullableDate(row.deleted_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    lockVersion: row.lock_version,
  };
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }

  return toDate(value);
}
