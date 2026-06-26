'use client';

import type { CSSProperties, ReactNode } from 'react';

export function AuthPageShell({
  title,
  description,
  secondaryActions,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly secondaryActions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.header}>
          <p style={styles.kicker}>GarageOS</p>
          <h1 style={styles.title}>{title}</h1>
          <p style={styles.description}>{description}</p>
        </div>

        {children}

        {secondaryActions === undefined ? null : (
          <nav aria-label="Related auth actions" style={styles.linkRow}>
            {secondaryActions}
          </nav>
        )}
      </section>
    </main>
  );
}

export const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    padding: '32px 16px',
    background: '#f8fafc',
    color: '#0f172a',
    boxSizing: 'border-box',
  },
  card: {
    width: '100%',
    maxWidth: '760px',
    margin: '0 auto',
    padding: '28px',
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '18px',
    boxShadow: '0 20px 60px rgba(15, 23, 42, 0.08)',
    boxSizing: 'border-box',
  },
  header: {
    marginBottom: '24px',
  },
  kicker: {
    margin: '0 0 8px',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#475569',
  },
  title: {
    margin: 0,
    fontSize: '32px',
    lineHeight: 1.1,
  },
  description: {
    margin: '12px 0 0',
    color: '#475569',
    lineHeight: 1.6,
  },
  form: {
    display: 'grid',
    gap: '16px',
  },
  field: {
    display: 'grid',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 700,
  },
  input: {
    minHeight: '44px',
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '10px',
    fontSize: '16px',
  },
  checkboxLabel: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    color: '#334155',
  },
  primaryButton: {
    minHeight: '44px',
    padding: '10px 16px',
    border: '1px solid #0f172a',
    borderRadius: '10px',
    background: '#0f172a',
    color: '#ffffff',
    fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'none',
  },
  secondaryButton: {
    minHeight: '44px',
    padding: '10px 16px',
    border: '1px solid #cbd5e1',
    borderRadius: '10px',
    background: '#ffffff',
    color: '#0f172a',
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondaryButtonLink: {
    minHeight: '22px',
    padding: '10px 16px',
    border: '1px solid #cbd5e1',
    borderRadius: '10px',
    background: '#ffffff',
    color: '#0f172a',
    fontWeight: 700,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    marginTop: '16px',
  },
  linkRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    marginTop: '24px',
    paddingTop: '18px',
    borderTop: '1px solid #e2e8f0',
  },
  link: {
    color: '#0f172a',
    fontWeight: 700,
  },
  infoPanel: {
    padding: '16px',
    border: '1px solid #cbd5e1',
    borderRadius: '14px',
    background: '#f8fafc',
    marginTop: '16px',
  },
  successPanel: {
    padding: '16px',
    border: '1px solid #86efac',
    borderRadius: '14px',
    background: '#f0fdf4',
    marginTop: '16px',
  },
  errorPanel: {
    padding: '16px',
    border: '1px solid #fecaca',
    borderRadius: '14px',
    background: '#fef2f2',
    marginTop: '16px',
  },
  panelTitle: {
    margin: '0 0 8px',
    fontSize: '16px',
  },
  paragraph: {
    margin: '0 0 8px',
    color: '#334155',
    lineHeight: 1.6,
  },
  helpPanel: {
    padding: '12px',
    border: '1px dashed #cbd5e1',
    borderRadius: '12px',
    background: '#f8fafc',
  },
  helpTitle: {
    margin: '0 0 6px',
    fontWeight: 700,
  },
  helpList: {
    margin: 0,
    paddingLeft: '20px',
    color: '#334155',
  },
  detailList: {
    margin: '8px 0 0',
    paddingLeft: '20px',
    color: '#334155',
  },
  metadataList: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: '4px 10px',
    margin: '12px 0 0',
    fontSize: '12px',
    color: '#475569',
  },
  sessionGrid: {
    display: 'grid',
    gap: '16px',
  },
  keyValue: {
    display: 'grid',
    gridTemplateColumns: '180px 1fr',
    gap: '8px',
    padding: '6px 0',
    borderBottom: '1px solid #e2e8f0',
  },
  key: {
    color: '#475569',
    fontWeight: 700,
  },
  value: {
    color: '#0f172a',
    overflowWrap: 'anywhere',
  },
  permissionList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    margin: '8px 0 0',
    padding: 0,
    listStyle: 'none',
  },
  permissionBadge: {
    padding: '6px 8px',
    border: '1px solid #cbd5e1',
    borderRadius: '999px',
    background: '#ffffff',
    fontSize: '12px',
  },
};
