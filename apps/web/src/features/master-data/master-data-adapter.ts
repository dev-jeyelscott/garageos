export type MasterDataKind = 'branches' | 'employees' | 'roles' | 'customers' | 'customer_tags';

export interface MasterDataField {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly required?: boolean;
}

export interface MasterDataRecord {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: 'active' | 'inactive' | 'pending' | 'soft_deleted';
  readonly branch?: string;
  readonly fields: readonly MasterDataField[];
}

export interface MasterDataModuleConfig {
  readonly kind: MasterDataKind;
  readonly title: string;
  readonly description: string;
  readonly route: string;
  readonly apiRoute: string;
  readonly readPermission: string;
  readonly createPermission: string;
  readonly records: readonly MasterDataRecord[];
}

export const masterDataModules: Record<MasterDataKind, MasterDataModuleConfig> = {
  branches: {
    kind: 'branches',
    title: 'Branches',
    description: 'Branch management shell for branch list, detail, create, and edit layouts.',
    route: '/branches',
    apiRoute: '/api/v1/branches',
    readPermission: 'branches.read',
    createPermission: 'branches.create',
    records: [
      {
        id: 'branch-main',
        title: 'Main Branch',
        subtitle: 'Primary operating branch',
        status: 'active',
        fields: [
          { name: 'name', label: 'Branch name', value: 'Main Branch', required: true },
          { name: 'status', label: 'Status', value: 'active' },
        ],
      },
    ],
  },
  employees: {
    kind: 'employees',
    title: 'Employees',
    description: 'Employee and invitation shell for role assignment and branch access workflows.',
    route: '/employees',
    apiRoute: '/api/v1/employees',
    readPermission: 'users.read',
    createPermission: 'users.create',
    records: [
      {
        id: 'employee-owner',
        title: 'Demo Owner',
        subtitle: 'Shop Owner',
        status: 'active',
        branch: 'All branches',
        fields: [
          { name: 'full_name', label: 'Full name', value: 'Demo Owner', required: true },
          { name: 'email', label: 'Email', value: 'owner@example.test', required: true },
          { name: 'branch_access', label: 'Branch access', value: 'All branches' },
        ],
      },
    ],
  },
  roles: {
    kind: 'roles',
    title: 'Roles',
    description: 'Role and permission shell for tenant-scoped custom permissions.',
    route: '/roles',
    apiRoute: '/api/v1/roles',
    readPermission: 'roles.read',
    createPermission: 'roles.create',
    records: [
      {
        id: 'role-owner',
        title: 'Shop Owner',
        subtitle: 'Protected owner role',
        status: 'active',
        fields: [
          { name: 'name', label: 'Role name', value: 'Shop Owner', required: true },
          {
            name: 'permission_summary',
            label: 'Permission summary',
            value: 'All tenant permissions',
          },
        ],
      },
    ],
  },
  customers: {
    kind: 'customers',
    title: 'Customers',
    description: 'Customer master-data shell for tenant-wide customer records.',
    route: '/customers',
    apiRoute: '/api/v1/customers',
    readPermission: 'customers.read',
    createPermission: 'customers.create',
    records: [],
  },
  customer_tags: {
    kind: 'customer_tags',
    title: 'Customer Tags',
    description: 'Customer tag shell for organizing customer records without adding workflows.',
    route: '/customer-tags',
    apiRoute: '/api/v1/customers',
    readPermission: 'customers.read',
    createPermission: 'customers.update',
    records: [],
  },
};

export async function listMasterData(kind: MasterDataKind): Promise<readonly MasterDataRecord[]> {
  return masterDataModules[kind].records;
}

export async function getMasterDataRecord(
  kind: MasterDataKind,
  id: string,
): Promise<MasterDataRecord | null> {
  return masterDataModules[kind].records.find((record) => record.id === id) ?? null;
}
