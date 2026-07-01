import { PurchaseOrderDetailScreen } from '../../../../src/features/purchase-orders/purchase-order-detail.screen';

export default async function PurchaseOrderDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly purchase_order_id: string }>;
}) {
  const { purchase_order_id: purchaseOrderId } = await params;

  return <PurchaseOrderDetailScreen purchaseOrderId={purchaseOrderId} />;
}
