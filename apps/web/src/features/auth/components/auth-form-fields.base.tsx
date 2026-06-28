import Link from 'next/link';
import type { InputHTMLAttributes, ReactNode } from 'react';

import { Alert, Button, Input } from '../../../components/ui';
import { styles } from './auth.base';

export function InputField({
  label,
  name,
  type,
  required = false,
  autoComplete,
  defaultValue,
  placeholder,
  inputMode,
}: {
  readonly label: string;
  readonly name: string;
  readonly type: string;
  readonly required?: boolean;
  readonly autoComplete?: string;
  readonly defaultValue?: string;
  readonly placeholder?: string;
  readonly inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-primary">
            {' '}
            *
          </span>
        ) : null}
      </span>
      <Input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
        className="bg-card/80"
      />
    </label>
  );
}

export function PasswordPolicy() {
  return (
    <div className={styles.helpPanel} aria-label="Password rules">
      <p className={styles.helpTitle}>Password rules</p>
      <ul className={styles.helpList}>
        <PasswordPolicyItem>At least 8 characters</PasswordPolicyItem>
        <PasswordPolicyItem>At least 1 uppercase letter</PasswordPolicyItem>
        <PasswordPolicyItem>At least 1 lowercase letter</PasswordPolicyItem>
        <PasswordPolicyItem>At least 1 number</PasswordPolicyItem>
      </ul>
    </div>
  );
}

export function PrimaryButton({
  disabled,
  children,
}: {
  readonly disabled: boolean;
  readonly children: ReactNode;
}) {
  return (
    <Button
      type="submit"
      disabled={disabled}
      size="lg"
      className="w-full shadow-[0_16px_34px_rgb(249_115_0_/_0.24)]"
    >
      {children}
    </Button>
  );
}

export function AuthLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}) {
  return (
    <Link href={href} className={styles.link}>
      {children}
    </Link>
  );
}

export function InfoPanel({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <Alert role="status" className={styles.infoPanel}>
      <h2 className={styles.panelTitle}>{title}</h2>
      {children}
    </Alert>
  );
}

export function getFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === 'string' ? value.trim() : '';
}

function PasswordPolicyItem({ children }: { readonly children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary"
      >
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}
