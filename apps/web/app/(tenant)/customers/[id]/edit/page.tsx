import { MasterDataFormScreen } from '../../../../../src/features/master-data/master-data-screens';

export default async function EditCustomerPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;

  return <MasterDataFormScreen kind="customers" mode="edit" id={id} />;
}
