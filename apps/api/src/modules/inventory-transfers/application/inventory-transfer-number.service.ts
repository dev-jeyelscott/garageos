import { Inject, Injectable } from '@nestjs/common';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import { InventoryTransferStore } from './inventory-transfer.store';

@Injectable()
export class InventoryTransferNumberService {
  constructor(
    @Inject(InventoryTransferStore)
    private readonly inventoryTransferStore: InventoryTransferStore,
  ) {}

  async allocateNumber(tenantId: string, now: Date, client?: DatabaseQueryClient): Promise<string> {
    const datePart = now.toISOString().slice(0, 10).replaceAll('-', '');
    const prefix = `TR-${datePart}`;
    const allocated = await this.inventoryTransferStore.findLatestTransferNumberForDate(
      {
        tenantId,
        datePrefix: prefix,
      },
      client,
    );

    if (allocated === null) {
      throw new Error('Inventory transfer number allocation failed.');
    }

    return allocated;
  }
}
