'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { Button, cn } from '../../../components/ui';
import { tenantNavigationItems } from '../constants/navigation.constants';
import type { NavigationItem } from '../types/navigation-item';

export function PermissionAwareNavigation({
  permissions,
}: {
  readonly permissions: readonly string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const visibleItems = tenantNavigationItems.filter((item) => canViewItem(item, permissions));

  return (
    <nav aria-label="Tenant navigation" className="md:sticky md:top-24">
      <div className="md:hidden">
        <Button
          aria-controls="tenant-mobile-navigation"
          aria-expanded={isOpen}
          className="w-full justify-between"
          onClick={() => setIsOpen((current) => !current)}
          variant="secondary"
        >
          Menu
        </Button>
      </div>
      <div
        id="tenant-mobile-navigation"
        className={cn('mt-2 grid gap-1 md:mt-0 md:grid', !isOpen && 'hidden md:grid')}
      >
        {visibleItems.map((item) => {
          const isCurrent = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const isDisabled = item.status === 'disabled' || item.status === 'placeholder';

          if (isDisabled) {
            return (
              <span
                key={item.href}
                aria-disabled="true"
                className="rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground opacity-60"
              >
                {item.label}
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              aria-current={isCurrent ? 'page' : undefined}
              className={cn(
                'rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground',
                isCurrent && 'bg-accent text-accent-foreground',
              )}
              href={item.href}
              onClick={() => setIsOpen(false)}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function canViewItem(item: NavigationItem, permissions: readonly string[]): boolean {
  const hasRequiredPermissions =
    item.requiredPermissions === undefined ||
    item.requiredPermissions.length === 0 ||
    item.requiredPermissions.every((permission) => permissions.includes(permission));

  const hasAnyRequiredPermission =
    item.anyRequiredPermissions === undefined ||
    item.anyRequiredPermissions.length === 0 ||
    item.anyRequiredPermissions.some((permission) => permissions.includes(permission));

  return hasRequiredPermissions && hasAnyRequiredPermission;
}
