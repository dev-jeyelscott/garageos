'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { Button, cn } from '../../../components/ui';
import { tenantNavigationItems } from '../constants/navigation.constants';
import type { NavigationItem } from '../types/navigation-item';

export function PermissionAwareNavigation({
  permissions,
  variant = 'responsive',
}: {
  readonly permissions: readonly string[];
  readonly variant?: 'responsive' | 'static';
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const visibleItems = tenantNavigationItems.filter((item) => canViewItem(item, permissions));
  const isStatic = variant === 'static';

  return (
    <nav aria-label="Tenant navigation" className={cn(!isStatic && 'md:sticky md:top-24')}>
      {!isStatic ? (
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
      ) : null}

      <div
        id="tenant-mobile-navigation"
        className={cn(
          'grid gap-2',
          !isStatic && 'mt-2 md:mt-0',
          !isStatic && !isOpen && 'hidden md:grid',
        )}
      >
        {visibleItems.map((item) => {
          const isCurrent = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const isDisabled = item.status === 'disabled' || item.status === 'placeholder';

          if (isDisabled) {
            return (
              <span
                key={item.href}
                aria-disabled="true"
                className="flex min-h-11 cursor-not-allowed items-center rounded-2xl border border-border bg-muted px-4 text-sm font-semibold text-muted-foreground opacity-75"
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
                'flex min-h-11 items-center rounded-2xl border px-4 text-sm font-semibold no-underline transition',
                isCurrent
                  ? 'border-primary/30 bg-primary text-primary-foreground shadow-sm'
                  : 'border-transparent text-muted-foreground hover:border-primary/20 hover:bg-accent hover:text-accent-foreground',
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
