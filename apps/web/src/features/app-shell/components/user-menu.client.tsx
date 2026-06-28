'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { logout, logoutAll } from '../../auth/actions/logout.action';
import type { AppShellSession } from '../types/app-shell-session';

export function UserMenu({ session }: { readonly session: AppShellSession }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="relative">
      <button
        aria-expanded={isOpen}
        className="min-h-11 rounded-xl border border-border bg-secondary px-3 text-left text-sm font-semibold text-secondary-foreground"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="block max-w-40 truncate">{session.user.full_name}</span>
        <span className="block max-w-40 truncate text-xs font-normal text-muted-foreground">
          {session.user.email}
        </span>
      </button>
      {isOpen ? (
        <div className="absolute right-0 z-40 mt-2 grid min-w-56 gap-1 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg">
          <Link
            className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-secondary"
            href="/auth/password/change"
            onClick={() => setIsOpen(false)}
          >
            Change password
          </Link>
          <button
            className="rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-secondary disabled:opacity-60"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await logout();
                window.location.assign('/auth/login');
              })
            }
            type="button"
          >
            Logout
          </button>
          <button
            className="rounded-lg px-3 py-2 text-left text-sm font-semibold hover:bg-secondary disabled:opacity-60"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await logoutAll();
                window.location.assign('/auth/login');
              })
            }
            type="button"
          >
            Logout all
          </button>
        </div>
      ) : null}
    </div>
  );
}
