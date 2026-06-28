import { describe, expect, it } from 'vitest';

import {
  buildNextJobOrderNumber,
  formatTenantBusinessDate,
} from '../../../shared/numbering/document-numbering';
import {
  assertDedicatedPartLineWorkflowRequired,
  assertJobOrderAttachmentsFileModuleBlocked,
  assertCanAddJobOrderServiceNote,
  assertCanAssignJobOrderMechanics,
  assertCanCompleteJobOrderLineForJobOrder,
  assertCanCompleteServiceOrLaborLine,
  assertCanEditJobOrderLines,
  assertCanTransitionJobOrderStatus,
  assertCanUpdateJobOrderBaseline,
  buildJobOrderAttachmentPlaceholderResponse,
  calculateJobOrderLineAuthorizedAmount,
  getJobOrderStatusTransitionAuditAction,
  getRequiredJobOrderStatusTransitionPermission,
  toJobOrderAuditEventResponse,
} from './job-orders.service';

describe('JobOrdersService baseline helpers', () => {
  it('generates the first tenant-scoped job order number for a business date', () => {
    expect(buildNextJobOrderNumber('20260628', null)).toBe('JO-20260628-000001');
  });

  it('increments the tenant-scoped job order number for a business date', () => {
    expect(buildNextJobOrderNumber('20260628', 'JO-20260628-000009')).toBe('JO-20260628-000010');
  });

  it('formats the job order business date in the tenant timezone', () => {
    const value = new Date('2026-06-27T16:30:00.000Z');

    expect(formatTenantBusinessDate(value, 'Asia/Manila')).toBe('20260628');
  });
});

describe('job order baseline validators', () => {
  it('allows pending job orders to be updated in the baseline slice', () => {
    expect(() =>
      assertCanUpdateJobOrderBaseline({
        status: 'pending',
      }),
    ).not.toThrow();
  });

  it('blocks non-pending job orders from baseline updates', () => {
    expect(() =>
      assertCanUpdateJobOrderBaseline({
        status: 'in_progress',
      }),
    ).toThrow('One or more fields are invalid.');
  });
});

describe('job order mechanic assignment validators', () => {
  it.each(['pending', 'in_progress', 'waiting_for_parts'] as const)(
    'allows mechanic assignment while job order is %s',
    (status) => {
      expect(() =>
        assertCanAssignJobOrderMechanics({
          status,
        }),
      ).not.toThrow();
    },
  );

  it.each(['completed', 'released', 'cancelled'] as const)(
    'blocks mechanic assignment while job order is %s',
    (status) => {
      expect(() =>
        assertCanAssignJobOrderMechanics({
          status,
        }),
      ).toThrow('One or more fields are invalid.');
    },
  );
});

describe('job order status transition validators', () => {
  const completedLine = {
    id: 'line-1',
    tenantId: 'tenant-1',
    jobOrderId: 'job-order-1',
    lineType: 'service' as const,
    serviceId: null,
    productId: null,
    description: 'Completed service',
    quantity: '1.000',
    unitPrice: '100.00',
    authorizedAmount: '100.00',
    status: 'completed' as const,
    inventoryReservationId: null,
    completedAt: new Date('2026-06-28T00:00:00.000Z'),
    lineOrder: 0,
    createdAt: new Date('2026-06-28T00:00:00.000Z'),
    updatedAt: new Date('2026-06-28T00:00:00.000Z'),
  };

  const activeLine = {
    ...completedLine,
    id: 'line-2',
    description: 'Active service',
    status: 'active' as const,
    completedAt: null,
  };

  it('requires a primary mechanic before moving pending job order to in progress', () => {
    expect(() =>
      assertCanTransitionJobOrderStatus(
        {
          status: 'pending',
          primaryMechanicUserId: null,
          lines: [],
        },
        {
          toStatus: 'in_progress',
          reason: null,
        },
      ),
    ).toThrow('A primary mechanic is required before moving a job order to in progress.');
  });

  it('allows pending job order to move to in progress when primary mechanic exists', () => {
    expect(() =>
      assertCanTransitionJobOrderStatus(
        {
          status: 'pending',
          primaryMechanicUserId: 'mechanic-1',
          lines: [],
        },
        {
          toStatus: 'in_progress',
          reason: null,
        },
      ),
    ).not.toThrow();
  });

  it('requires a reason when moving to waiting for parts', () => {
    expect(() =>
      assertCanTransitionJobOrderStatus(
        {
          status: 'in_progress',
          primaryMechanicUserId: 'mechanic-1',
          lines: [],
        },
        {
          toStatus: 'waiting_for_parts',
          reason: null,
        },
      ),
    ).toThrow('One or more fields are invalid.');
  });

  it('allows in-progress job order to move to waiting for parts with a reason', () => {
    expect(() =>
      assertCanTransitionJobOrderStatus(
        {
          status: 'in_progress',
          primaryMechanicUserId: 'mechanic-1',
          lines: [],
        },
        {
          toStatus: 'waiting_for_parts',
          reason: 'Waiting for customer-supplied part.',
        },
      ),
    ).not.toThrow();
  });

  it('blocks completion when active service or labor lines remain', () => {
    expect(() =>
      assertCanTransitionJobOrderStatus(
        {
          status: 'in_progress',
          primaryMechanicUserId: 'mechanic-1',
          lines: [activeLine],
        },
        {
          toStatus: 'completed',
          reason: null,
        },
      ),
    ).toThrow(
      'All required service and labor lines must be completed before completing the job order.',
    );
  });

  it('allows completion when service and labor lines are complete or cancelled', () => {
    expect(() =>
      assertCanTransitionJobOrderStatus(
        {
          status: 'in_progress',
          primaryMechanicUserId: 'mechanic-1',
          lines: [completedLine],
        },
        {
          toStatus: 'completed',
          reason: null,
        },
      ),
    ).not.toThrow();
  });

  it('requires a correction reason when moving completed job order back to in progress', () => {
    expect(() =>
      assertCanTransitionJobOrderStatus(
        {
          status: 'completed',
          primaryMechanicUserId: 'mechanic-1',
          lines: [completedLine],
        },
        {
          toStatus: 'in_progress',
          reason: null,
        },
      ),
    ).toThrow('One or more fields are invalid.');
  });

  it('allows completed job order correction back to in progress with a reason', () => {
    expect(() =>
      assertCanTransitionJobOrderStatus(
        {
          status: 'completed',
          primaryMechanicUserId: 'mechanic-1',
          lines: [completedLine],
        },
        {
          toStatus: 'in_progress',
          reason: 'Customer reported rework after completion inspection.',
        },
      ),
    ).not.toThrow();
  });

  it('blocks released and cancelled job orders from further transitions', () => {
    expect(() =>
      assertCanTransitionJobOrderStatus(
        {
          status: 'released',
          primaryMechanicUserId: 'mechanic-1',
          lines: [],
        },
        {
          toStatus: 'in_progress',
          reason: 'Correction attempt.',
        },
      ),
    ).toThrow('Released job orders are final.');

    expect(() =>
      assertCanTransitionJobOrderStatus(
        {
          status: 'cancelled',
          primaryMechanicUserId: 'mechanic-1',
          lines: [],
        },
        {
          toStatus: 'in_progress',
          reason: 'Correction attempt.',
        },
      ),
    ).toThrow('Cancelled job orders are final.');
  });

  it('blocks release and cancellation targets until dedicated workflows are implemented', () => {
    expect(() =>
      assertCanTransitionJobOrderStatus(
        {
          status: 'completed',
          primaryMechanicUserId: 'mechanic-1',
          lines: [completedLine],
        },
        {
          toStatus: 'released',
          reason: 'Release attempt.',
        },
      ),
    ).toThrow(
      'Release and cancellation require dedicated workflows and are not available through the generic status transition endpoint.',
    );

    expect(() =>
      assertCanTransitionJobOrderStatus(
        {
          status: 'pending',
          primaryMechanicUserId: null,
          lines: [],
        },
        {
          toStatus: 'cancelled',
          reason: 'Customer cancelled.',
        },
      ),
    ).toThrow(
      'Release and cancellation require dedicated workflows and are not available through the generic status transition endpoint.',
    );
  });

  it('uses correction permission for completed to in progress rollback', () => {
    expect(
      getRequiredJobOrderStatusTransitionPermission(
        {
          status: 'completed',
        },
        'in_progress',
      ),
    ).toBe('job_orders.correct_status');
  });

  it('uses correction audit action for completed to in progress rollback', () => {
    expect(getJobOrderStatusTransitionAuditAction('completed', 'in_progress')).toBe(
      'job_orders.status_corrected',
    );
  });

  it('uses change-status permission for normal operational status changes', () => {
    expect(
      getRequiredJobOrderStatusTransitionPermission(
        {
          status: 'pending',
        },
        'in_progress',
      ),
    ).toBe('job_orders.change_status');
  });
});

describe('job order line scaffolding validators', () => {
  it.each(['pending', 'in_progress', 'waiting_for_parts'] as const)(
    'allows service/labor line edits while job order is %s',
    (status) => {
      expect(() =>
        assertCanEditJobOrderLines({
          status,
        }),
      ).not.toThrow();
    },
  );

  it.each(['completed', 'released', 'cancelled'] as const)(
    'blocks service/labor line edits while job order is %s',
    (status) => {
      expect(() =>
        assertCanEditJobOrderLines({
          status,
        }),
      ).toThrow('One or more fields are invalid.');
    },
  );

  it('calculates authorized line amount from quantity and unit price', () => {
    expect(calculateJobOrderLineAuthorizedAmount('2.000', '125.50')).toBe('251.00');
  });

  it('blocks part lines until inventory reservation support exists', () => {
    expect(() => assertDedicatedPartLineWorkflowRequired()).toThrow(
      'One or more fields are invalid.',
    );
  });
});

describe('job order service notes validators', () => {
  it.each(['pending', 'in_progress', 'waiting_for_parts', 'completed'] as const)(
    'allows service notes while job order is %s',
    (status) => {
      expect(() =>
        assertCanAddJobOrderServiceNote({
          status,
        }),
      ).not.toThrow();
    },
  );

  it.each(['released', 'cancelled'] as const)(
    'blocks service notes while job order is %s',
    (status) => {
      expect(() =>
        assertCanAddJobOrderServiceNote({
          status,
        }),
      ).toThrow('Service notes can only be added before a job order is released or cancelled.');
    },
  );
});

describe('job order attachment placeholders', () => {
  it('returns an empty placeholder attachment list until the Files module is implemented', () => {
    expect(buildJobOrderAttachmentPlaceholderResponse('job-order-1')).toEqual({
      job_order_id: 'job-order-1',
      attachments: [],
      file_module_status: 'not_implemented',
      upload_intent_endpoint: '/api/v1/files/upload-intents',
      message:
        'Job order attachment listing is reserved for the Files module. Upload intents, signed URLs, file metadata, and file linking are implemented in Milestone 11.',
    });
  });

  it('blocks job order attachment mutation until the Files module is implemented', () => {
    expect(() => assertJobOrderAttachmentsFileModuleBlocked()).toThrow(
      'One or more fields are invalid.',
    );
  });
});

describe('job order audit history responses', () => {
  it('maps sanitized job order audit events to API response shape', () => {
    const createdAt = new Date('2026-06-28T10:00:00.000Z');

    expect(
      toJobOrderAuditEventResponse(
        {
          id: 'audit-event-1',
          tenantId: 'tenant-1',
          actorUserId: 'user-1',
          actorType: 'tenant_user',
          action: 'job_orders.status_changed',
          entityType: 'job_order',
          entityId: 'job-order-1',
          branchId: 'branch-1',
          beforeJson: {
            status: 'pending',
          },
          afterJson: {
            status: 'in_progress',
          },
          metadataJson: {
            from_status: 'pending',
            to_status: 'in_progress',
          },
          reason: 'job_order_status_changed',
          createdAt,
        },
        'job-order-1',
      ),
    ).toEqual({
      id: 'audit-event-1',
      job_order_id: 'job-order-1',
      actor_user_id: 'user-1',
      actor_type: 'tenant_user',
      action: 'job_orders.status_changed',
      entity_type: 'job_order',
      entity_id: 'job-order-1',
      branch_id: 'branch-1',
      before_json: {
        status: 'pending',
      },
      after_json: {
        status: 'in_progress',
      },
      metadata_json: {
        from_status: 'pending',
        to_status: 'in_progress',
      },
      reason: 'job_order_status_changed',
      created_at: '2026-06-28T10:00:00.000Z',
    });
  });
});

describe('job order labor task completion validators', () => {
  it.each(['in_progress', 'waiting_for_parts'] as const)(
    'allows completing service/labor lines while job order is %s',
    (status) => {
      expect(() =>
        assertCanCompleteJobOrderLineForJobOrder({
          status,
        }),
      ).not.toThrow();
    },
  );

  it.each(['pending', 'completed', 'released', 'cancelled'] as const)(
    'blocks completing service/labor lines while job order is %s',
    (status) => {
      expect(() =>
        assertCanCompleteJobOrderLineForJobOrder({
          status,
        }),
      ).toThrow(
        'Labor tasks can only be completed while a job order is in progress or waiting for parts.',
      );
    },
  );

  it.each(['service', 'labor'] as const)('allows completing active %s lines', (lineType) => {
    expect(() =>
      assertCanCompleteServiceOrLaborLine({
        status: 'active',
        lineType,
        inventoryReservationId: null,
      }),
    ).not.toThrow();
  });

  it.each(['completed', 'cancelled'] as const)('blocks completing %s lines', (status) => {
    expect(() =>
      assertCanCompleteServiceOrLaborLine({
        status,
        lineType: 'labor',
        inventoryReservationId: null,
      }),
    ).toThrow('Only active job order lines can be completed.');
  });

  it('blocks completing part lines until inventory reservation support exists', () => {
    expect(() =>
      assertCanCompleteServiceOrLaborLine({
        status: 'active',
        lineType: 'part',
        inventoryReservationId: null,
      }),
    ).toThrow('One or more fields are invalid.');
  });

  it('blocks completing inventory-reserved lines until inventory reservation support exists', () => {
    expect(() =>
      assertCanCompleteServiceOrLaborLine({
        status: 'active',
        lineType: 'service',
        inventoryReservationId: 'reservation-1',
      }),
    ).toThrow('One or more fields are invalid.');
  });
});
