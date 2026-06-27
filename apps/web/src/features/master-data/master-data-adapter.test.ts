import { describe, expect, it } from 'vitest';

import { listMasterData, masterDataModules } from './master-data-adapter';

describe('master data adapter', () => {
  it('keeps allowed frontend modules mapped to documented API route families', () => {
    expect(masterDataModules.branches.apiRoute).toBe('/api/v1/branches');
    expect(masterDataModules.employees.apiRoute).toBe('/api/v1/employees');
    expect(masterDataModules.roles.apiRoute).toBe('/api/v1/roles');
    expect(masterDataModules.customers.apiRoute).toBe('/api/v1/customers');
    expect(masterDataModules.customer_tags.apiRoute).toBe('/api/v1/customers');
  });

  it('uses documented permissions for navigation and create actions', () => {
    expect(masterDataModules.branches.readPermission).toBe('branches.read');
    expect(masterDataModules.employees.readPermission).toBe('users.read');
    expect(masterDataModules.roles.readPermission).toBe('roles.read');
    expect(masterDataModules.customers.createPermission).toBe('customers.create');
  });

  it('returns isolated local records until API clients are ready', async () => {
    await expect(listMasterData('customers')).resolves.toEqual([]);
    await expect(listMasterData('customer_tags')).resolves.toEqual([]);
  });
});
