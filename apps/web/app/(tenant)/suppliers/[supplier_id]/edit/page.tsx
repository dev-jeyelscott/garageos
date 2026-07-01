import { SupplierFormScreen } from '../../../../../src/features/suppliers/supplier-form.screen';

export default async function EditSupplierPage({
  params,
}: {
  readonly params: Promise<{ readonly supplier_id: string }>;
}) {
  const { supplier_id: supplierId } = await params;

  return <SupplierFormScreen mode="edit" supplierId={supplierId} />;
}
