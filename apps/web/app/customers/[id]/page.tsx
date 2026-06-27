import { MasterDataDetailScreen } from '../../../src/features/master-data/master-data-screens';

export default async function CustomerDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;

  return <MasterDataDetailScreen kind="customers" id={id} />;
}
