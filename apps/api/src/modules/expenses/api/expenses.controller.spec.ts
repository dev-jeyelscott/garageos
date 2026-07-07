import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

import { ExpensesController } from './expenses.controller';

describe('ExpensesController', () => {
  it('uses HTTP 200 for the void workflow action', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, ExpensesController.prototype.voidExpense)).toBe(
      200,
    );
  });
});
