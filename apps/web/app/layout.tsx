import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'GarageOS | Motorcycle Shop Management SaaS',
  description:
    'GarageOS is a mobile-first motorcycle shop management SaaS for service work, inventory, invoicing, reports, and shop operations.',
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
