import { PlatformTenantDetailScreen } from '../../../../src/features/app-shell/components/authenticated-shell.client';

interface PlatformTenantDetailPageProps {
  readonly params: Promise<{
    readonly tenant_id: string;
  }>;
}

export default async function PlatformTenantDetailPage({ params }: PlatformTenantDetailPageProps) {
  const { tenant_id: tenantId } = await params;

  return <PlatformTenantDetailScreen tenantId={tenantId} />;
}
