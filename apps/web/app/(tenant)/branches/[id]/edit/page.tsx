import { MasterDataFormScreen } from '../../../../../src/features/master-data/master-data-screens';

export default async function EditBranchPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;

  return <MasterDataFormScreen kind="branches" mode="edit" id={id} />;
}
