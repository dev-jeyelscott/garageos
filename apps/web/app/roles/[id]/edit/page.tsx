import { MasterDataFormScreen } from '../../../../src/features/master-data/master-data-screens';

export default async function EditRolePage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;

  return <MasterDataFormScreen kind="roles" mode="edit" id={id} />;
}
