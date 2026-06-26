import { Module } from '@nestjs/common';

import { TenantContextRouteGuard } from '../tenant-context/tenant-context-route.guard';
import { TenantStatusAccessRouteGuard } from '../tenant-context/tenant-status-access-route.guard';
import { BranchAccessRouteGuard } from './branch-access-route.guard';
import { PermissionAccessRouteGuard } from './permission-access-route.guard';

@Module({
  providers: [
    TenantContextRouteGuard,
    TenantStatusAccessRouteGuard,
    PermissionAccessRouteGuard,
    BranchAccessRouteGuard,
  ],
  exports: [
    TenantContextRouteGuard,
    TenantStatusAccessRouteGuard,
    PermissionAccessRouteGuard,
    BranchAccessRouteGuard,
  ],
})
export class AuthorizationModule {}
