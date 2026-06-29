import { Inject, Injectable } from '@nestjs/common';

import type { DatabaseQueryClient } from '../../../shared/database/database-client';
import { InventoryAdjustmentStore } from './inventory-adjustment.store';

const DEFAULT_APPROVAL_THRESHOLD = '5000.00';

@Injectable()
export class InventoryAdjustmentApprovalPolicy {
  constructor(
    @Inject(InventoryAdjustmentStore)
    private readonly inventoryAdjustmentStore: InventoryAdjustmentStore,
  ) {}

  async isApprovalRequired(
    tenantId: string,
    signedValueImpact: string,
    client?: DatabaseQueryClient,
  ): Promise<boolean> {
    const threshold =
      (await this.inventoryAdjustmentStore.findTenantAdjustmentApprovalThreshold(
        { tenantId },
        client,
      )) ?? DEFAULT_APPROVAL_THRESHOLD;

    return moneyToCents(signedValueImpact.replace(/^-/, '')) >= moneyToCents(threshold);
  }
}

function moneyToCents(value: string): bigint {
  const [wholePart = '0', decimalPart = ''] = value.split('.');

  return BigInt(wholePart) * 100n + BigInt(decimalPart.padEnd(2, '0'));
}
