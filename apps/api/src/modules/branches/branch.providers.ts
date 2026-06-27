import { BranchStore } from './application/branch.store';
import { PostgresBranchRepository } from './persistence/postgres-branch.repository';

export const BRANCH_PROVIDERS = [
  {
    provide: BranchStore,
    useClass: PostgresBranchRepository,
  },
] as const;
