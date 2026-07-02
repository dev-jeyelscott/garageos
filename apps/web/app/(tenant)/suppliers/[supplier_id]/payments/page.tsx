import { SupplierPaymentScreen } from '../../../../../src/features/suppliers/supplier-payment.screen';

export default async function SupplierPaymentsPage({
  params,
}: {
  readonly params: Promise<{ readonly supplier_id: string }>;
}) {
  const { supplier_id: supplierId } = await params;

  return <SupplierPaymentScreen supplierId={supplierId} />;
}
