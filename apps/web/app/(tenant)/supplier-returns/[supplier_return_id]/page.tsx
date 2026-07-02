import { SupplierReturnDetailScreen } from '../../../../src/features/suppliers/supplier-return-detail.screen';

export default async function SupplierReturnDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly supplier_return_id: string }>;
}) {
  const { supplier_return_id: supplierReturnId } = await params;

  return <SupplierReturnDetailScreen supplierReturnId={supplierReturnId} />;
}
