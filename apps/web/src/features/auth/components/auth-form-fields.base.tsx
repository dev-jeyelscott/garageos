import Link from 'next/link';
import type { ReactNode } from 'react';

import { styles } from './auth.base';

export function InputField({
  label,
  name,
  type,
  required = false,
  autoComplete,
  defaultValue,
}: {
  readonly label: string;
  readonly name: string;
  readonly type: string;
  readonly required?: boolean;
  readonly autoComplete?: string;
  readonly defaultValue?: string;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        className={styles.input}
      />
    </label>
  );
}

export function PasswordPolicy() {
  return (
    <div className={styles.helpPanel}>
      <p className={styles.helpTitle}>Password rules</p>
      <ul className={styles.helpList}>
        <li>At least 8 characters</li>
        <li>At least 1 uppercase letter</li>
        <li>At least 1 lowercase letter</li>
        <li>At least 1 number</li>
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
    <button type="submit" disabled={disabled} className={styles.primaryButton}>
      {children}
    </button>
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
    <section className={styles.infoPanel}>
      <h2 className={styles.panelTitle}>{title}</h2>
      {children}
    </section>
  );
}

export function getFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === 'string' ? value.trim() : '';
}
