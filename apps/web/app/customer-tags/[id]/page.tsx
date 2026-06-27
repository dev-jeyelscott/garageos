import { MasterDataDetailScreen } from '../../../src/features/master-data/master-data-screens';

export default async function CustomerTagDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;

  return <MasterDataDetailScreen kind="customer_tags" id={id} />;
}
