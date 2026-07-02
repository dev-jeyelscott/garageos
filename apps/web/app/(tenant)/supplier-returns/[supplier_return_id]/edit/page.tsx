import { SupplierReturnFormScreen } from '../../../../../src/features/suppliers/supplier-return-form.screen';

export default async function EditSupplierReturnPage({
  params,
}: {
  readonly params: Promise<{ readonly supplier_return_id: string }>;
}) {
  const { supplier_return_id: supplierReturnId } = await params;

  return <SupplierReturnFormScreen supplierReturnId={supplierReturnId} />;
}
