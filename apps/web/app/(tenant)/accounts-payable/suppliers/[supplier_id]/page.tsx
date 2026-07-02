import { SupplierAccountsPayableDetailScreen } from '../../../../../src/features/accounts-payable/accounts-payable.screen';

export default async function SupplierAccountsPayablePage({
  params,
}: {
  readonly params: Promise<{ readonly supplier_id: string }>;
}) {
  const { supplier_id: supplierId } = await params;

  return <SupplierAccountsPayableDetailScreen supplierId={supplierId} />;
}
