import { InvoiceDetailScreen } from '../../../../src/features/invoices/invoice-detail.screen';

export default async function InvoiceDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly invoice_id: string }>;
}) {
  const { invoice_id: invoiceId } = await params;

  return <InvoiceDetailScreen invoiceId={invoiceId} />;
}
