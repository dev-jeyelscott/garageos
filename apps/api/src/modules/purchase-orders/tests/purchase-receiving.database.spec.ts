import { randomUUID } from 'node:crypto';

import { Pool, type PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PurchaseOrdersController } from '../api/purchase-orders.controller';
import type { ReceivePurchaseOrderRequest } from '../api/purchase-receiving.schemas';
import {
  PURCHASE_ORDER_STATUSES,
  PURCHASE_PAYMENT_TERMS,
} from '../application/purchase-order.records';
import type { PurchaseOrderDraftService } from '../application/purchase-order-draft.service';
import type { PurchaseOrderLifecycleService } from '../application/purchase-order-lifecycle.service';
import type { PurchaseOrderQueryService } from '../application/purchase-order-query.service';
import { ReceivePurchaseOrderService } from '../application/receive-purchase-order.service';
import { PostgresPurchaseOrderRepository } from '../persistence/postgres-purchase-order.repository';
import { AuditService } from '../../../shared/audit/audit.service';
import { PostgresAuditLogRepository } from '../../../shared/audit/postgres-audit-log.repository';
import type {
  DatabaseConnection,
  DatabaseConnectionProvider,
  DatabaseQueryResult,
  DatabaseRow,
} from '../../../shared/database/database-client';
import { PostgresDatabaseTransactionRunner } from '../../../shared/database/postgres-database-transaction-runner';
import { IdempotencyService } from '../../../shared/idempotency/idempotency.service';
import { PostgresIdempotencyKeyRepository } from '../../../shared/idempotency/postgres-idempotency-key.repository';
import type {
  TenantContextAuthenticatedSession,
  TenantStatus,
} from '../../../shared/tenant-context/tenant-context';
import type { AuthService } from '../../auth/application/auth.service';
import { FifoLayerService } from '../../inventory/application/fifo-layer.service';
import { InventoryLedgerService } from '../../inventory/application/inventory-ledger.service';
import { InventoryStockBalancesService } from '../../inventory/application/inventory-stock-balances.service';
import { PostgresFifoLayerRepository } from '../../inventory/persistence/postgres-fifo-layer.repository';
import { PostgresInventoryLedgerRepository } from '../../inventory/persistence/postgres-inventory-ledger.repository';
import { PostgresStockBalanceRepository } from '../../inventory/persistence/postgres-stock-balance.repository';
import type { ProductStore } from '../../products/application/product.store';

const DATABASE_URL = process.env.DATABASE_URL;
const describeDatabase = DATABASE_URL === undefined ? describe.skip : describe;

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_BRANCH_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUPPLIER_ID = '44444444-4444-4444-8444-444444444444';
const PURCHASE_ORDER_ID = '55555555-5555-4555-8555-555555555555';
const PURCHASE_ORDER_LINE_ID = '66666666-6666-4666-8666-666666666666';
const OTHER_PURCHASE_ORDER_LINE_ID = '88888888-8888-4888-8888-888888888888';
const PRODUCT_ID = '77777777-7777-4777-8777-777777777777';

const DEFAULT_ORDERED_QUANTITY = '10.000';
const DEFAULT_RECEIVED_QUANTITY = '0.000';
const DEFAULT_UNIT_COST = '100.00';

const RECEIVE_PERMISSION = 'purchases.receive';

const SIDE_EFFECT_TABLES = {
  PURCHASE_RECEIVINGS: 'purchase_receivings',
  PURCHASE_RECEIVING_LINES: 'purchase_receiving_lines',
  FIFO_LAYERS: 'fifo_layers',
  STOCK_BALANCES: 'stock_balances',
  INVENTORY_LEDGER: 'inventory_ledger_entries',
  SUPPLIER_PAYABLES: 'supplier_payables',
  AUDIT_LOGS: 'audit_logs',
  IDEMPOTENCY_KEYS: 'idempotency_keys',
} as const;

type TestTableName =
  | typeof SIDE_EFFECT_TABLES.AUDIT_LOGS
  | typeof SIDE_EFFECT_TABLES.FIFO_LAYERS
  | typeof SIDE_EFFECT_TABLES.IDEMPOTENCY_KEYS
  | typeof SIDE_EFFECT_TABLES.INVENTORY_LEDGER
  | typeof SIDE_EFFECT_TABLES.PURCHASE_RECEIVING_LINES
  | typeof SIDE_EFFECT_TABLES.PURCHASE_RECEIVINGS
  | typeof SIDE_EFFECT_TABLES.SUPPLIER_PAYABLES;

type FailingSideEffectTableName =
  | typeof SIDE_EFFECT_TABLES.AUDIT_LOGS
  | typeof SIDE_EFFECT_TABLES.FIFO_LAYERS
  | typeof SIDE_EFFECT_TABLES.STOCK_BALANCES
  | typeof SIDE_EFFECT_TABLES.INVENTORY_LEDGER
  | typeof SIDE_EFFECT_TABLES.SUPPLIER_PAYABLES;

interface CountRow extends DatabaseRow {
  readonly count: string;
}

interface QuantityRow extends DatabaseRow {
  readonly received_quantity: string;
}

interface StatusRow extends DatabaseRow {
  readonly status: string;
}

interface StockBalanceRow extends DatabaseRow {
  readonly on_hand_qty: string;
  readonly reserved_qty: string;
  readonly available_qty: string;
}

interface ReceivingRow extends DatabaseRow {
  readonly payment_method: string | null;
  readonly payment_reference: string | null;
}

interface ReceivingLineRow extends DatabaseRow {
  readonly received_quantity: string;
  readonly received_unit_cost: string;
  readonly fifo_layer_id: string | null;
}

interface FifoLayerRow extends DatabaseRow {
  readonly quantity_received: string;
  readonly remaining_quantity: string;
  readonly unit_cost: string;
  readonly source_transaction_type: string;
  readonly source_transaction_id: string;
}

interface InventoryLedgerRow extends DatabaseRow {
  readonly transaction_type: string;
  readonly quantity_delta_on_hand: string;
  readonly quantity_delta_reserved: string;
  readonly unit_cost: string | null;
  readonly total_cost: string | null;
  readonly source_type: string;
}

interface SeedPurchaseOrderInput {
  readonly tenantId?: string;
  readonly branchId?: string;
  readonly branchStatus?: 'active' | 'inactive';
  readonly supplierStatus?: 'active' | 'inactive';
  readonly paymentTerms?: (typeof PURCHASE_PAYMENT_TERMS)[keyof typeof PURCHASE_PAYMENT_TERMS];
  readonly purchaseOrderStatus?: (typeof PURCHASE_ORDER_STATUSES)[keyof typeof PURCHASE_ORDER_STATUSES];
  readonly orderedQuantity?: string;
  readonly receivedQuantity?: string;
  readonly unitCost?: string;
}

interface BuildSessionOptions {
  readonly tenantId?: string;
  readonly userId?: string;
  readonly tenantStatus?: TenantStatus;
  readonly effectivePermissions?: TenantContextAuthenticatedSession['effective_permissions'];
  readonly branches?: TenantContextAuthenticatedSession['branches'];
  readonly tenantWideBranchAccess?: boolean;
}

class PooledSearchPathDatabase implements DatabaseConnectionProvider {
  private readonly pool: Pool;

  constructor(databaseUrl: string, schemaName: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      options: `-c search_path=${schemaName},public`,
    });
  }

  async query<Row extends DatabaseRow = DatabaseRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<DatabaseQueryResult<Row>> {
    const result = await this.pool.query<Row>(text, toPgQueryValues(values));

    return {
      rows: result.rows,
      rowCount: result.rowCount,
    };
  }

  async connect(): Promise<DatabaseConnection> {
    const client = await this.pool.connect();

    return toDatabaseConnection(client);
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}

class PurchaseReceivingDatabaseHarness {
  private constructor(
    private readonly adminPool: Pool,
    readonly database: PooledSearchPathDatabase,
    private readonly schemaName: string,
  ) {}

  static async create(databaseUrl: string): Promise<PurchaseReceivingDatabaseHarness> {
    const schemaName = `gos_pr_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
    const adminPool = new Pool({ connectionString: databaseUrl });

    await adminPool.query(`create schema ${quoteIdentifier(schemaName)}`);

    const database = new PooledSearchPathDatabase(databaseUrl, schemaName);
    const harness = new PurchaseReceivingDatabaseHarness(adminPool, database, schemaName);

    await harness.createTables();

    return harness;
  }

  async dispose(): Promise<void> {
    await this.database.end();
    await this.adminPool.query(`drop schema if exists ${quoteIdentifier(this.schemaName)} cascade`);
    await this.adminPool.end();
  }

  buildReceiveService(): ReceivePurchaseOrderService {
    const purchaseOrderRepository = new PostgresPurchaseOrderRepository(this.database);
    const stockBalanceRepository = new PostgresStockBalanceRepository(this.database);
    const fifoLayerRepository = new PostgresFifoLayerRepository(this.database);
    const inventoryLedgerRepository = new PostgresInventoryLedgerRepository(this.database);
    const auditRepository = new PostgresAuditLogRepository(this.database);
    const transactionRunner = new PostgresDatabaseTransactionRunner(this.database);

    const productStore = {
      isActiveShopOwner: async () => false,
    } as unknown as ProductStore;

    return new ReceivePurchaseOrderService(
      purchaseOrderRepository,
      productStore,
      new InventoryStockBalancesService(stockBalanceRepository),
      new FifoLayerService(fifoLayerRepository),
      new InventoryLedgerService(inventoryLedgerRepository),
      transactionRunner,
      new AuditService(auditRepository),
    );
  }

  buildController(): PurchaseOrdersController {
    const receivePurchaseOrderService = this.buildReceiveService();
    const transactionRunner = new PostgresDatabaseTransactionRunner(this.database);
    const idempotencyService = new IdempotencyService(
      new PostgresIdempotencyKeyRepository(),
      transactionRunner,
    );
    const authService = {
      getAuthenticatedRouteSession: async () => ({
        tenantContextSession: buildSession({ tenantWideBranchAccess: true }),
      }),
    } as unknown as AuthService;

    const purchaseOrderQueryService = {
      listPurchaseOrders: async () => {
        throw new Error(
          'Purchase order query service should not be used by receiving database tests.',
        );
      },
      getPurchaseOrder: async () => {
        throw new Error(
          'Purchase order query service should not be used by receiving database tests.',
        );
      },
    } as unknown as PurchaseOrderQueryService;
    const purchaseOrderDraftService = {} as unknown as PurchaseOrderDraftService;
    const purchaseOrderLifecycleService = {} as unknown as PurchaseOrderLifecycleService;

    return new PurchaseOrdersController(
      authService,
      purchaseOrderQueryService,
      purchaseOrderDraftService,
      purchaseOrderLifecycleService,
      receivePurchaseOrderService,
      idempotencyService,
    );
  }

  async seedPurchaseOrder(input: SeedPurchaseOrderInput = {}): Promise<void> {
    const tenantId = input.tenantId ?? TENANT_ID;
    const branchId = input.branchId ?? BRANCH_ID;
    const branchStatus = input.branchStatus ?? 'active';
    const supplierStatus = input.supplierStatus ?? 'active';
    const paymentTerms = input.paymentTerms ?? PURCHASE_PAYMENT_TERMS.CREDIT;
    const purchaseOrderStatus = input.purchaseOrderStatus ?? PURCHASE_ORDER_STATUSES.ORDERED;
    const orderedQuantity = input.orderedQuantity ?? DEFAULT_ORDERED_QUANTITY;
    const receivedQuantity = input.receivedQuantity ?? DEFAULT_RECEIVED_QUANTITY;
    const unitCost = input.unitCost ?? DEFAULT_UNIT_COST;
    const lineTotal = calculateTestLineTotal(orderedQuantity, unitCost);

    await this.database.query(
      `
        insert into branches (tenant_id, id, name, status)
        values ($1::uuid, $2::uuid, $3, $4)
      `,
      [tenantId, branchId, `Branch ${branchId}`, branchStatus],
    );

    await this.database.query(
      `
        insert into suppliers (tenant_id, id, name, status)
        values ($1::uuid, $2::uuid, 'GarageOS Test Supplier', $3)
      `,
      [tenantId, SUPPLIER_ID, supplierStatus],
    );

    await this.database.query(
      `
        insert into products (tenant_id, id, name, status)
        values ($1::uuid, $2::uuid, 'GarageOS Test Product', 'active')
      `,
      [tenantId, PRODUCT_ID],
    );

    await this.database.query(
      `
        insert into purchase_orders (
          id,
          tenant_id,
          branch_id,
          supplier_id,
          purchase_order_number,
          status,
          payment_terms
        )
        values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'PO-DB-000001', $5, $6)
      `,
      [PURCHASE_ORDER_ID, tenantId, branchId, SUPPLIER_ID, purchaseOrderStatus, paymentTerms],
    );

    await this.database.query(
      `
        insert into purchase_order_lines (
          id,
          tenant_id,
          purchase_order_id,
          product_id,
          ordered_quantity,
          received_quantity,
          unit_cost,
          line_total,
          notes
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::numeric(14,3),
          $6::numeric(14,3),
          $7::numeric(14,2),
          $8::numeric(14,2),
          null
        )
      `,
      [
        PURCHASE_ORDER_LINE_ID,
        tenantId,
        PURCHASE_ORDER_ID,
        PRODUCT_ID,
        orderedQuantity,
        receivedQuantity,
        unitCost,
        lineTotal,
      ],
    );
  }

  async count(tableName: TestTableName): Promise<number> {
    const result = await this.database.query<CountRow>(
      `select count(*)::text as count from ${quoteIdentifier(tableName)}`,
    );

    return Number(getRequiredTestRow(result, `count ${tableName}`).count);
  }

  async getPurchaseOrderLineReceivedQuantity(): Promise<string> {
    const result = await this.database.query<QuantityRow>(
      `
        select received_quantity::text
        from purchase_order_lines
        where tenant_id = $1::uuid
          and purchase_order_id = $2::uuid
          and id = $3::uuid
      `,
      [TENANT_ID, PURCHASE_ORDER_ID, PURCHASE_ORDER_LINE_ID],
    );

    return getRequiredTestRow(result, 'purchase order line quantity').received_quantity;
  }

  async getPurchaseOrderStatus(): Promise<string> {
    const result = await this.database.query<StatusRow>(
      `
        select status
        from purchase_orders
        where tenant_id = $1::uuid
          and id = $2::uuid
      `,
      [TENANT_ID, PURCHASE_ORDER_ID],
    );

    return getRequiredTestRow(result, 'purchase order status').status;
  }

  async getStockBalance(): Promise<StockBalanceRow | null> {
    const result = await this.database.query<StockBalanceRow>(
      `
        select
          on_hand_qty::text,
          reserved_qty::text,
          (on_hand_qty - reserved_qty)::text as available_qty
        from stock_balances
        where tenant_id = $1::uuid
          and branch_id = $2::uuid
          and product_id = $3::uuid
      `,
      [TENANT_ID, BRANCH_ID, PRODUCT_ID],
    );

    return result.rows[0] ?? null;
  }

  async getSingleReceiving(): Promise<ReceivingRow> {
    const result = await this.database.query<ReceivingRow>(
      `
        select payment_method, payment_reference
        from purchase_receivings
        where tenant_id = $1::uuid
          and purchase_order_id = $2::uuid
      `,
      [TENANT_ID, PURCHASE_ORDER_ID],
    );

    return getRequiredTestRow(result, 'purchase receiving');
  }

  async getSingleReceivingLine(): Promise<ReceivingLineRow> {
    const result = await this.database.query<ReceivingLineRow>(
      `
        select
          received_quantity::text,
          received_unit_cost::text,
          fifo_layer_id
        from purchase_receiving_lines
        where tenant_id = $1::uuid
      `,
      [TENANT_ID],
    );

    return getRequiredTestRow(result, 'purchase receiving line');
  }

  async getSingleFifoLayer(): Promise<FifoLayerRow> {
    const result = await this.database.query<FifoLayerRow>(
      `
        select
          quantity_received::text,
          remaining_quantity::text,
          unit_cost::text,
          source_transaction_type,
          source_transaction_id
        from fifo_layers
        where tenant_id = $1::uuid
      `,
      [TENANT_ID],
    );

    return getRequiredTestRow(result, 'FIFO layer');
  }

  async getSingleInventoryLedgerEntry(): Promise<InventoryLedgerRow> {
    const result = await this.database.query<InventoryLedgerRow>(
      `
        select
          transaction_type,
          quantity_delta_on_hand::text,
          quantity_delta_reserved::text,
          unit_cost::text,
          total_cost::text,
          source_type
        from inventory_ledger_entries
        where tenant_id = $1::uuid
      `,
      [TENANT_ID],
    );

    return getRequiredTestRow(result, 'inventory ledger entry');
  }

  async installFailingInsertTrigger(tableName: FailingSideEffectTableName): Promise<void> {
    const functionName = `fail_insert_${tableName}`;
    const triggerName = `trigger_fail_insert_${tableName}`;

    await this.database.query(
      `
        create or replace function ${quoteIdentifier(functionName)}()
        returns trigger as $$
        begin
          raise exception 'forced receiving side effect failure: ${tableName}';
        end;
        $$ language plpgsql;

        create trigger ${quoteIdentifier(triggerName)}
        before insert on ${quoteIdentifier(tableName)}
        for each row execute function ${quoteIdentifier(functionName)}();
      `,
    );
  }

  private async createTables(): Promise<void> {
    await this.database.query(TEST_SCHEMA_SQL);
  }
}

describeDatabase('purchase receiving database integration', () => {
  let harness: PurchaseReceivingDatabaseHarness | null = null;

  beforeEach(async () => {
    harness = await PurchaseReceivingDatabaseHarness.create(requiredDatabaseUrl());
  });

  afterEach(async () => {
    await harness?.dispose();
    harness = null;
  });

  it('persists credit receiving stock, FIFO, ledger, AP, and audit effects', async () => {
    const testHarness = currentHarness(harness);

    await testHarness.seedPurchaseOrder({ paymentTerms: PURCHASE_PAYMENT_TERMS.CREDIT });

    const response = await testHarness
      .buildReceiveService()
      .receive(
        PURCHASE_ORDER_ID,
        buildReceiveRequest('5.000'),
        buildSession({ tenantWideBranchAccess: true }),
      );

    expect(response).toMatchObject({
      purchase_order_id: PURCHASE_ORDER_ID,
      status: PURCHASE_ORDER_STATUSES.PARTIALLY_RECEIVED,
      ap_effect: {
        created: true,
        amount_delta: '500.00',
      },
    });
    expect(response.lines).toHaveLength(1);
    expect(response.lines[0]).toMatchObject({
      purchase_order_line_id: PURCHASE_ORDER_LINE_ID,
      product_id: PRODUCT_ID,
      received_quantity: '5.000',
      received_unit_cost: DEFAULT_UNIT_COST,
      line_total: '500.00',
    });
    expect(response.fifo_layer_ids).toHaveLength(1);
    expect(response.inventory_ledger_entry_ids).toHaveLength(1);

    expect(await testHarness.count(SIDE_EFFECT_TABLES.PURCHASE_RECEIVINGS)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.PURCHASE_RECEIVING_LINES)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.FIFO_LAYERS)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.INVENTORY_LEDGER)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.SUPPLIER_PAYABLES)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.AUDIT_LOGS)).toBe(1);
    expect(await testHarness.getPurchaseOrderLineReceivedQuantity()).toBe('5.000');

    expect(await testHarness.getStockBalance()).toMatchObject({
      on_hand_qty: '5.000',
      reserved_qty: '0.000',
      available_qty: '5.000',
    });
    expect(await testHarness.getSingleReceivingLine()).toMatchObject({
      received_quantity: '5.000',
      received_unit_cost: DEFAULT_UNIT_COST,
      fifo_layer_id: response.fifo_layer_ids[0],
    });
    expect(await testHarness.getSingleFifoLayer()).toMatchObject({
      quantity_received: '5.000',
      remaining_quantity: '5.000',
      unit_cost: DEFAULT_UNIT_COST,
      source_transaction_type: 'purchase_receive',
      source_transaction_id: response.lines[0]?.receiving_line_id,
    });
    expect(await testHarness.getSingleInventoryLedgerEntry()).toMatchObject({
      transaction_type: 'purchase_receive',
      quantity_delta_on_hand: '5.000',
      quantity_delta_reserved: '0.000',
      unit_cost: DEFAULT_UNIT_COST,
      total_cost: '500.00',
      source_type: 'purchase_receiving_line',
    });
  });

  it('persists cash receiving without creating AP payable effects', async () => {
    const testHarness = currentHarness(harness);

    await testHarness.seedPurchaseOrder({ paymentTerms: PURCHASE_PAYMENT_TERMS.CASH });

    const response = await testHarness.buildReceiveService().receive(
      PURCHASE_ORDER_ID,
      {
        ...buildReceiveRequest('10.000'),
        payment_method: 'cash',
        payment_reference: 'OR-DB-000001',
      },
      buildSession({ tenantWideBranchAccess: true }),
    );

    expect(response.status).toBe(PURCHASE_ORDER_STATUSES.RECEIVED);
    expect(response.ap_effect).toMatchObject({
      created: false,
      supplier_payable_id: null,
      amount_delta: '0.00',
    });
    expect(response.lines[0]).toMatchObject({
      received_quantity: '10.000',
      line_total: '1000.00',
    });
    expect(await testHarness.getSingleReceiving()).toMatchObject({
      payment_method: 'cash',
      payment_reference: 'OR-DB-000001',
    });
    expect(await testHarness.count(SIDE_EFFECT_TABLES.SUPPLIER_PAYABLES)).toBe(0);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.PURCHASE_RECEIVINGS)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.FIFO_LAYERS)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.INVENTORY_LEDGER)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.AUDIT_LOGS)).toBe(1);
  });

  it('blocks cash receiving without payment method before side effects', async () => {
    const testHarness = currentHarness(harness);

    await testHarness.seedPurchaseOrder({ paymentTerms: PURCHASE_PAYMENT_TERMS.CASH });

    await expect(
      testHarness
        .buildReceiveService()
        .receive(
          PURCHASE_ORDER_ID,
          buildReceiveRequest('1.000'),
          buildSession({ tenantWideBranchAccess: true }),
        ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
    });

    await expectNoReceivingSideEffects(testHarness);
  });

  it('blocks cross-tenant receiving before side effects', async () => {
    const testHarness = currentHarness(harness);

    await testHarness.seedPurchaseOrder({ paymentTerms: PURCHASE_PAYMENT_TERMS.CREDIT });

    await expect(
      testHarness
        .buildReceiveService()
        .receive(
          PURCHASE_ORDER_ID,
          buildReceiveRequest('1.000'),
          buildSession({ tenantId: OTHER_TENANT_ID, tenantWideBranchAccess: true }),
        ),
    ).rejects.toMatchObject({
      code: 'resource_not_found',
    });

    await expectNoReceivingSideEffects(testHarness);
  });

  it('blocks read-only tenant receiving before side effects', async () => {
    const testHarness = currentHarness(harness);

    await testHarness.seedPurchaseOrder({ paymentTerms: PURCHASE_PAYMENT_TERMS.CREDIT });

    await expect(
      testHarness
        .buildReceiveService()
        .receive(
          PURCHASE_ORDER_ID,
          buildReceiveRequest('1.000'),
          buildSession({ tenantStatus: 'read_only', tenantWideBranchAccess: true }),
        ),
    ).rejects.toMatchObject({
      code: 'subscription_access_blocked',
    });

    await expectNoReceivingSideEffects(testHarness);
  });

  it('blocks missing purchases.receive permission before side effects', async () => {
    const testHarness = currentHarness(harness);

    await testHarness.seedPurchaseOrder({ paymentTerms: PURCHASE_PAYMENT_TERMS.CREDIT });

    await expect(
      testHarness
        .buildReceiveService()
        .receive(
          PURCHASE_ORDER_ID,
          buildReceiveRequest('1.000'),
          buildSession({ effectivePermissions: [], tenantWideBranchAccess: true }),
        ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      details: [{ required_permission: RECEIVE_PERMISSION }],
    });

    await expectNoReceivingSideEffects(testHarness);
  });

  it('blocks branch access denial before side effects', async () => {
    const testHarness = currentHarness(harness);

    await testHarness.seedPurchaseOrder({ branchId: OTHER_BRANCH_ID });

    await expect(
      testHarness
        .buildReceiveService()
        .receive(
          PURCHASE_ORDER_ID,
          buildReceiveRequest('1.000'),
          buildSession({ branches: [{ id: BRANCH_ID }], tenantWideBranchAccess: false }),
        ),
    ).rejects.toMatchObject({
      code: 'branch_access_denied',
    });

    await expectNoReceivingSideEffects(testHarness);
  });

  it('blocks inactive branch receiving before side effects', async () => {
    const testHarness = currentHarness(harness);

    await testHarness.seedPurchaseOrder({ branchStatus: 'inactive' });

    await expect(
      testHarness
        .buildReceiveService()
        .receive(
          PURCHASE_ORDER_ID,
          buildReceiveRequest('1.000'),
          buildSession({ tenantWideBranchAccess: true }),
        ),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
    });

    await expectNoReceivingSideEffects(testHarness);
  });

  it('blocks inactive supplier receiving before side effects', async () => {
    const testHarness = currentHarness(harness);

    await testHarness.seedPurchaseOrder({ supplierStatus: 'inactive' });

    await expect(
      testHarness
        .buildReceiveService()
        .receive(
          PURCHASE_ORDER_ID,
          buildReceiveRequest('1.000'),
          buildSession({ tenantWideBranchAccess: true }),
        ),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
    });

    await expectNoReceivingSideEffects(testHarness);
  });

  it('blocks non-receivable purchase order statuses before side effects', async () => {
    const testHarness = currentHarness(harness);

    await testHarness.seedPurchaseOrder({
      purchaseOrderStatus: PURCHASE_ORDER_STATUSES.CANCELLED,
    });

    await expect(
      testHarness
        .buildReceiveService()
        .receive(
          PURCHASE_ORDER_ID,
          buildReceiveRequest('1.000'),
          buildSession({ tenantWideBranchAccess: true }),
        ),
    ).rejects.toMatchObject({
      code: 'workflow_transition_blocked',
    });

    await expectNoReceivingSideEffects(testHarness);
  });

  it('blocks unknown purchase order lines before side effects', async () => {
    const testHarness = currentHarness(harness);

    await testHarness.seedPurchaseOrder({ paymentTerms: PURCHASE_PAYMENT_TERMS.CREDIT });

    await expect(
      testHarness
        .buildReceiveService()
        .receive(
          PURCHASE_ORDER_ID,
          buildReceiveRequest('1.000', OTHER_PURCHASE_ORDER_LINE_ID),
          buildSession({ tenantWideBranchAccess: true }),
        ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
    });

    await expectNoReceivingSideEffects(testHarness);
  });

  it('blocks over-receiving before side effects', async () => {
    const testHarness = currentHarness(harness);

    await testHarness.seedPurchaseOrder({ paymentTerms: PURCHASE_PAYMENT_TERMS.CREDIT });

    await expect(
      testHarness
        .buildReceiveService()
        .receive(
          PURCHASE_ORDER_ID,
          buildReceiveRequest('11.000'),
          buildSession({ tenantWideBranchAccess: true }),
        ),
    ).rejects.toMatchObject({
      code: 'validation_failed',
    });

    await expectNoReceivingSideEffects(testHarness);
  });

  it('replays idempotent receiving responses without duplicate side effects', async () => {
    const testHarness = currentHarness(harness);

    await testHarness.seedPurchaseOrder({ paymentTerms: PURCHASE_PAYMENT_TERMS.CREDIT });

    const controller = testHarness.buildController();
    const request = buildReceiveRequest('5.000');

    const firstResponse = await controller.receivePurchaseOrder(
      'Bearer test-token',
      'purchase-receiving-db-replay-key',
      { purchase_order_id: PURCHASE_ORDER_ID },
      request,
    );
    const secondResponse = await controller.receivePurchaseOrder(
      'Bearer test-token',
      'purchase-receiving-db-replay-key',
      { purchase_order_id: PURCHASE_ORDER_ID },
      request,
    );

    expect(secondResponse).toEqual(firstResponse);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.IDEMPOTENCY_KEYS)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.PURCHASE_RECEIVINGS)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.PURCHASE_RECEIVING_LINES)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.FIFO_LAYERS)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.INVENTORY_LEDGER)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.SUPPLIER_PAYABLES)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.AUDIT_LOGS)).toBe(1);
    expect(await testHarness.getPurchaseOrderLineReceivedQuantity()).toBe('5.000');
  });

  it('serializes concurrent receiving attempts and prevents over-receiving', async () => {
    const testHarness = currentHarness(harness);

    await testHarness.seedPurchaseOrder({ paymentTerms: PURCHASE_PAYMENT_TERMS.CREDIT });

    const service = testHarness.buildReceiveService();
    const session = buildSession({ tenantWideBranchAccess: true });
    const firstReceive = service.receive(PURCHASE_ORDER_ID, buildReceiveRequest('7.000'), session);
    const secondReceive = service.receive(PURCHASE_ORDER_ID, buildReceiveRequest('7.000'), session);

    const results = await Promise.allSettled([firstReceive, secondReceive]);
    const fulfilled = results.filter(isFulfilled);
    const rejected = results.filter(isRejected);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(fulfilled[0]?.value.status).toBe(PURCHASE_ORDER_STATUSES.PARTIALLY_RECEIVED);
    expect(rejected[0]?.reason).toMatchObject({
      code: 'validation_failed',
    });
    expect(await testHarness.getPurchaseOrderLineReceivedQuantity()).toBe('7.000');
    expect(await testHarness.count(SIDE_EFFECT_TABLES.PURCHASE_RECEIVINGS)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.PURCHASE_RECEIVING_LINES)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.FIFO_LAYERS)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.INVENTORY_LEDGER)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.SUPPLIER_PAYABLES)).toBe(1);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.AUDIT_LOGS)).toBe(1);
    expect(await testHarness.getStockBalance()).toMatchObject({
      on_hand_qty: '7.000',
      reserved_qty: '0.000',
      available_qty: '7.000',
    });
  });

  it.each([
    { effect: 'FIFO layer creation', tableName: SIDE_EFFECT_TABLES.FIFO_LAYERS },
    { effect: 'stock balance increment', tableName: SIDE_EFFECT_TABLES.STOCK_BALANCES },
    { effect: 'inventory ledger creation', tableName: SIDE_EFFECT_TABLES.INVENTORY_LEDGER },
    { effect: 'AP payable creation', tableName: SIDE_EFFECT_TABLES.SUPPLIER_PAYABLES },
    { effect: 'audit log creation', tableName: SIDE_EFFECT_TABLES.AUDIT_LOGS },
  ])('rolls back receiving when $effect fails', async ({ tableName }) => {
    const testHarness = currentHarness(harness);

    await testHarness.seedPurchaseOrder({ paymentTerms: PURCHASE_PAYMENT_TERMS.CREDIT });
    await testHarness.installFailingInsertTrigger(tableName);

    await expect(
      testHarness
        .buildReceiveService()
        .receive(
          PURCHASE_ORDER_ID,
          buildReceiveRequest('5.000'),
          buildSession({ tenantWideBranchAccess: true }),
        ),
    ).rejects.toThrow('forced receiving side effect failure');

    expect(await testHarness.getPurchaseOrderStatus()).toBe(PURCHASE_ORDER_STATUSES.ORDERED);
    expect(await testHarness.getPurchaseOrderLineReceivedQuantity()).toBe('0.000');
    expect(await testHarness.getStockBalance()).toBeNull();
    expect(await testHarness.count(SIDE_EFFECT_TABLES.PURCHASE_RECEIVINGS)).toBe(0);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.PURCHASE_RECEIVING_LINES)).toBe(0);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.FIFO_LAYERS)).toBe(0);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.INVENTORY_LEDGER)).toBe(0);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.SUPPLIER_PAYABLES)).toBe(0);
    expect(await testHarness.count(SIDE_EFFECT_TABLES.AUDIT_LOGS)).toBe(0);
  });
});

async function expectNoReceivingSideEffects(
  testHarness: PurchaseReceivingDatabaseHarness,
): Promise<void> {
  expect(await testHarness.count(SIDE_EFFECT_TABLES.PURCHASE_RECEIVINGS)).toBe(0);
  expect(await testHarness.count(SIDE_EFFECT_TABLES.PURCHASE_RECEIVING_LINES)).toBe(0);
  expect(await testHarness.count(SIDE_EFFECT_TABLES.FIFO_LAYERS)).toBe(0);
  expect(await testHarness.count(SIDE_EFFECT_TABLES.INVENTORY_LEDGER)).toBe(0);
  expect(await testHarness.count(SIDE_EFFECT_TABLES.SUPPLIER_PAYABLES)).toBe(0);
  expect(await testHarness.count(SIDE_EFFECT_TABLES.AUDIT_LOGS)).toBe(0);
  expect(await testHarness.getPurchaseOrderLineReceivedQuantity()).toBe('0.000');
  expect(await testHarness.getStockBalance()).toBeNull();
}

function buildReceiveRequest(
  receivedQuantity: string,
  purchaseOrderLineId = PURCHASE_ORDER_LINE_ID,
): ReceivePurchaseOrderRequest {
  return {
    received_at: new Date('2026-07-01T04:00:00Z'),
    lines: [
      {
        purchase_order_line_id: purchaseOrderLineId,
        received_quantity: receivedQuantity,
        received_unit_cost: DEFAULT_UNIT_COST,
      },
    ],
  };
}

function buildSession(options: BuildSessionOptions = {}): TenantContextAuthenticatedSession {
  return {
    actor: {
      user_id: options.userId ?? USER_ID,
      user_type: 'tenant_user',
      tenant_id: options.tenantId ?? TENANT_ID,
      session_id: 'purchase-receiving-db-test-session',
      email_verified: true,
      support_access_session_id: null,
    },
    tenant: {
      id: options.tenantId ?? TENANT_ID,
      status: options.tenantStatus ?? 'active',
    },
    effective_permissions: options.effectivePermissions ?? [RECEIVE_PERMISSION],
    branches: options.branches ?? [{ id: BRANCH_ID }],
    tenant_wide_branch_access: options.tenantWideBranchAccess ?? false,
    subscription_status_source: 'system_computed',
  };
}

function currentHarness(
  harness: PurchaseReceivingDatabaseHarness | null,
): PurchaseReceivingDatabaseHarness {
  if (harness === null) {
    throw new Error('Purchase receiving database harness was not initialized.');
  }

  return harness;
}

function requiredDatabaseUrl(): string {
  if (DATABASE_URL === undefined || DATABASE_URL.trim().length === 0) {
    throw new Error('DATABASE_URL is required for purchase receiving database tests.');
  }

  return DATABASE_URL;
}

function toDatabaseConnection(client: PoolClient): DatabaseConnection {
  return {
    query: async <Row extends DatabaseRow = DatabaseRow>(
      text: string,
      values?: readonly unknown[],
    ): Promise<DatabaseQueryResult<Row>> => {
      const result = await client.query<Row>(text, toPgQueryValues(values));

      return {
        rows: result.rows,
        rowCount: result.rowCount,
      };
    },
    release: (): void => {
      client.release();
    },
  };
}

function toPgQueryValues(values: readonly unknown[] | undefined): unknown[] | undefined {
  return values === undefined ? undefined : [...values];
}

function getRequiredTestRow<Row extends DatabaseRow>(
  result: DatabaseQueryResult<Row>,
  label: string,
): Row {
  const row = result.rows[0];

  if (row === undefined) {
    throw new Error(`Expected ${label} row.`);
  }

  return row;
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe SQL identifier: ${value}`);
  }

  return `"${value}"`;
}

function isFulfilled<Result>(
  result: PromiseSettledResult<Result>,
): result is PromiseFulfilledResult<Result> {
  return result.status === 'fulfilled';
}

function isRejected<Result>(result: PromiseSettledResult<Result>): result is PromiseRejectedResult {
  return result.status === 'rejected';
}

function calculateTestLineTotal(quantity: string, unitCost: string): string {
  const quantityUnits = parseQuantityUnits(quantity);
  const unitCostCents = parseMoneyCents(unitCost);
  const totalCents = (quantityUnits * unitCostCents + 500n) / 1000n;

  return formatMoneyCents(totalCents);
}

function parseQuantityUnits(value: string): bigint {
  const [wholePart = '0', decimalPart = ''] = value.split('.');

  return BigInt(wholePart) * 1000n + BigInt(decimalPart.padEnd(3, '0'));
}

function parseMoneyCents(value: string): bigint {
  const [wholePart = '0', decimalPart = ''] = value.split('.');

  return BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, '0'));
}

function formatMoneyCents(value: bigint): string {
  const wholePart = value / 100n;
  const decimalPart = value % 100n;

  return `${wholePart.toString()}.${decimalPart.toString().padStart(2, '0')}`;
}

const TEST_SCHEMA_SQL = `
  create table branches (
    tenant_id uuid not null,
    id uuid not null,
    name text not null,
    status text not null,
    primary key (tenant_id, id)
  );

  create table suppliers (
    tenant_id uuid not null,
    id uuid not null,
    name text not null,
    status text not null,
    primary key (tenant_id, id)
  );

  create table products (
    tenant_id uuid not null,
    id uuid not null,
    name text not null,
    status text not null,
    primary key (tenant_id, id)
  );

  create table purchase_orders (
    id uuid primary key,
    tenant_id uuid not null,
    branch_id uuid not null,
    supplier_id uuid not null,
    purchase_order_number text not null,
    status text not null,
    payment_terms text not null,
    updated_at timestamptz not null default now(),
    lock_version integer not null default 0,
    constraint chk_purchase_payment_terms check (payment_terms in ('cash','credit'))
  );

  create table purchase_order_lines (
    id uuid primary key,
    tenant_id uuid not null,
    purchase_order_id uuid not null,
    product_id uuid not null,
    ordered_quantity numeric(14,3) not null,
    received_quantity numeric(14,3) not null default 0,
    unit_cost numeric(14,2) not null,
    line_total numeric(14,2) not null,
    notes text,
    constraint chk_po_line_qty check (
      ordered_quantity > 0 and received_quantity >= 0 and received_quantity <= ordered_quantity
    ),
    constraint chk_po_line_cost check (unit_cost >= 0 and line_total >= 0)
  );

  create table purchase_receivings (
    id uuid primary key,
    tenant_id uuid not null,
    branch_id uuid not null,
    purchase_order_id uuid not null,
    supplier_id uuid not null,
    received_at timestamptz not null,
    received_by_user_id uuid not null,
    payment_method text,
    payment_reference text,
    posted_at timestamptz not null
  );

  create table purchase_receiving_lines (
    id uuid primary key,
    tenant_id uuid not null,
    receiving_id uuid not null,
    purchase_order_line_id uuid not null,
    product_id uuid not null,
    received_quantity numeric(14,3) not null,
    received_unit_cost numeric(14,2) not null,
    fifo_layer_id uuid,
    constraint chk_receiving_line_qty check (received_quantity > 0 and received_unit_cost >= 0)
  );

  create table fifo_layers (
    id uuid primary key,
    tenant_id uuid not null,
    branch_id uuid not null,
    product_id uuid not null,
    quantity_received numeric(14,3) not null,
    remaining_quantity numeric(14,3) not null,
    unit_cost numeric(14,2) not null,
    source_transaction_type text not null,
    source_transaction_id uuid not null,
    received_at timestamptz not null,
    original_source_layer_id uuid,
    constraint chk_fifo_quantities check (
      quantity_received > 0 and remaining_quantity >= 0 and remaining_quantity <= quantity_received
    )
  );

  create table stock_balances (
    tenant_id uuid not null,
    branch_id uuid not null,
    product_id uuid not null,
    on_hand_qty numeric(14,3) not null default 0,
    reserved_qty numeric(14,3) not null default 0,
    updated_at timestamptz not null default now(),
    lock_version integer not null default 0,
    primary key (tenant_id, branch_id, product_id),
    constraint chk_stock_balance_non_negative check (
      on_hand_qty >= 0 and reserved_qty >= 0 and on_hand_qty >= reserved_qty
    )
  );

  create table inventory_ledger_entries (
    id uuid primary key,
    tenant_id uuid not null,
    branch_id uuid not null,
    product_id uuid not null,
    transaction_type text not null,
    quantity_delta_on_hand numeric(14,3) not null,
    quantity_delta_reserved numeric(14,3) not null,
    unit_cost numeric(14,2),
    total_cost numeric(14,2),
    source_type text not null,
    source_id uuid not null,
    occurred_at timestamptz not null,
    created_by_user_id uuid
  );

  create table supplier_payables (
    id uuid primary key,
    tenant_id uuid not null,
    supplier_id uuid not null,
    branch_id uuid,
    source_type text not null,
    source_id uuid not null,
    amount_delta numeric(14,2) not null,
    occurred_at timestamptz not null
  );

  create table audit_logs (
    id uuid primary key,
    tenant_id uuid,
    actor_user_id uuid,
    actor_type text not null,
    support_access_session_id uuid,
    action text not null,
    entity_type text not null,
    entity_id uuid,
    branch_id uuid,
    before_json jsonb,
    after_json jsonb,
    metadata_json jsonb,
    reason text,
    ip_address inet,
    user_agent text,
    retention_class text not null,
    created_at timestamptz not null
  );

  create table idempotency_keys (
    id uuid primary key,
    tenant_id uuid,
    user_id uuid,
    endpoint text not null,
    request_intent_hash text not null,
    idempotency_key_hash text not null,
    status text not null,
    response_status_code integer,
    response_body_json jsonb,
    locked_until timestamptz,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
  );
`;
