import { MasterDataFormScreen } from '../../../../src/features/master-data/master-data-screens';

export default async function EditCustomerTagPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;

  return <MasterDataFormScreen kind="customer_tags" mode="edit" id={id} />;
}
