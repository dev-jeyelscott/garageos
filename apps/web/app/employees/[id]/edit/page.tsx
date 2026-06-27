import { MasterDataFormScreen } from '../../../../src/features/master-data/master-data-screens';

export default async function EditEmployeePage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;

  return <MasterDataFormScreen kind="employees" mode="edit" id={id} />;
}
