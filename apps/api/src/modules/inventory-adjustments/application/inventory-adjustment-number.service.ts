import { Inject, Injectable } from '@nestjs/common';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import { InventoryAdjustmentStore } from './inventory-adjustment.store';

@Injectable()
export class InventoryAdjustmentNumberService {
  constructor(
    @Inject(InventoryAdjustmentStore)
    private readonly inventoryAdjustmentStore: InventoryAdjustmentStore,
  ) {}

  async allocateNumber(tenantId: string, now: Date, client?: DatabaseQueryClient): Promise<string> {
    const datePart = now.toISOString().slice(0, 10).replaceAll('-', '');
    const prefix = `IA-${datePart}`;
    const latest = await this.inventoryAdjustmentStore.findLatestAdjustmentNumberForDate(
      {
        tenantId,
        datePrefix: prefix,
      },
      client,
    );
    const latestSequence = latest === null ? 0 : Number(latest.slice(prefix.length + 1));
    const nextSequence = latestSequence + 1;

    return `${prefix}-${nextSequence.toString().padStart(6, '0')}`;
  }
}
