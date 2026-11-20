import { test, expect } from '@playwright/test';
import {
  setupFixtures,
  teardownFixtures,
  apiGet,
  apiPost,
  apiPut,
  type TestFixtures,
} from '../src/fixtures.js';

// ── Journey slice 10 — Configured Statuses and permitted transitions (S2, S3)
//
// The seam is the HTTP API: an admin configures a Status and a Transition, then
// a user moves a Ticket through a permitted path (200) and through an unlisted
// path (4xx, Ticket unchanged).

let f: TestFixtures | undefined;

test.beforeAll(async () => { f = await setupFixtures(); });
test.afterAll(async () => { if (f) await teardownFixtures(f); });

/** Create a Status through the admin configuration surface; returns its id. */
async function createStatus(
  name: string,
  category: 'new' | 'open' | 'pending' | 'resolved' | 'closed',
): Promise<string> {
  const res = await apiPost(
    f!.api,
    '/api/admin/statuses',
    { name, category },
    f!.workspaceA.adminSession,
  );
  expect(res.status).toBe(201);
  return (res.data as { id: string }).id;
}

/** Create a permitted transition through the admin configuration surface. */
async function createTransition(fromStatusId: string, toStatusId: string): Promise<void> {
  const res = await apiPost(
    f!.api,
    '/api/admin/transitions',
    { fromStatusId, toStatusId },
    f!.workspaceA.adminSession,
  );
  expect(res.status).toBe(201);
}

/** Create a Ticket (requester) that starts in the Workspace default Status. */
async function createTicket(title: string): Promise<string> {
  const res = await apiPost(
    f!.api,
    '/api/tickets',
    {
      title,
      ticketTypeId: f!.workspaceA.ticketTypeId,
      priorityId: f!.workspaceA.priorityId,
    },
    f!.workspaceA.requesterSession,
  );
  expect(res.status).toBe(200);
  return (res.data as { id: string }).id;
}

test('A Workspace Admin can configure a Status and use it in an allowed transition', async () => {
  // 1. Admin configures a new Status and it is listed back.
  const inReviewStatusId = await createStatus('In Review', 'open');

  const statuses = await apiGet(f!.api, '/api/admin/statuses', f!.workspaceA.adminSession);
  expect(statuses.status).toBe(200);
  const configured = statuses.data as { id: string; name: string; category: string; isActive: boolean }[];
  const inReview = configured.find((s) => s.id === inReviewStatusId);
  expect(inReview).toMatchObject({ name: 'In Review', category: 'open', isActive: true });

  // 2. Admin permits New → In Review.
  await createTransition(f!.workspaceA.defaultStatusId, inReviewStatusId);

  const transitions = await apiGet(f!.api, '/api/admin/transitions', f!.workspaceA.adminSession);
  expect(transitions.status).toBe(200);
  expect(transitions.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fromStatusId: f!.workspaceA.defaultStatusId,
        toStatusId: inReviewStatusId,
      }),
    ]),
  );

  // 3. A Ticket in the permitted source Status moves along the allowed path.
  const ticketId = await createTicket('Configured status ticket');

  const allowed = await apiPut(
    f!.api,
    `/api/tickets/${ticketId}`,
    { statusId: inReviewStatusId },
    f!.workspaceA.agentSession,
  );
  expect(allowed.status).toBe(200);
  const moved = allowed.data as { statusId: string; statusName: string; statusCategory: string };
  expect(moved.statusId).toBe(inReviewStatusId);
  expect(moved.statusName).toBe('In Review');
  expect(moved.statusCategory).toBe('open');

  // 3a. The Status change is recorded on the Timeline.
  const timeline = await apiGet(
    f!.api,
    `/api/tickets/${ticketId}/timeline`,
    f!.workspaceA.requesterSession,
  );
  expect(timeline.status).toBe(200);
  const changes = (timeline.data as { kind: string; content: string }[]).filter(
    (e) => e.kind === 'status_change',
  );
  expect(changes).toHaveLength(1);
  expect(changes[0]!.content).toContain('In Review');

  // 4. An unlisted transition is refused with a clear error.
  const denied = await apiPut(
    f!.api,
    `/api/tickets/${ticketId}`,
    { statusId: f!.workspaceA.resolvedStatusId },
    f!.workspaceA.agentSession,
  );
  expect(denied.status).toBeGreaterThanOrEqual(400);
  expect(denied.status).toBeLessThan(500);
  const error = denied.data as { error: string; code: string };
  expect(error.code).toBe('transition-invalid');
  expect(error.error).toMatch(/not allowed in this Workspace/);

  // 4a. The refused change left the Ticket and its Timeline untouched.
  const reread = await apiGet(
    f!.api,
    `/api/tickets/${ticketId}`,
    f!.workspaceA.requesterSession,
  );
  expect(reread.status).toBe(200);
  const unchanged = reread.data as { statusId: string; statusName: string };
  expect(unchanged.statusId).toBe(inReviewStatusId);
  expect(unchanged.statusName).toBe('In Review');

  const timelineAfter = await apiGet(
    f!.api,
    `/api/tickets/${ticketId}/timeline`,
    f!.workspaceA.requesterSession,
  );
  const changesAfter = (timelineAfter.data as { kind: string }[]).filter(
    (e) => e.kind === 'status_change',
  );
  expect(changesAfter).toHaveLength(1);
});

test('An inactive Status stays readable on a Ticket but cannot be selected for a new transition', async () => {
  // A Workspace Status that a Ticket already sits in.
  const escalatedStatusId = await createStatus('Escalated', 'open');
  await createTransition(f!.workspaceA.defaultStatusId, escalatedStatusId);

  const ticketId = await createTicket('Inactive status ticket');
  const moved = await apiPut(
    f!.api,
    `/api/tickets/${ticketId}`,
    { statusId: escalatedStatusId },
    f!.workspaceA.agentSession,
  );
  expect(moved.status).toBe(200);

  // Admin deactivates the Status.
  const deactivated = await apiPost(
    f!.api,
    `/api/admin/statuses/${escalatedStatusId}/active`,
    { isActive: false },
    f!.workspaceA.adminSession,
  );
  expect(deactivated.status).toBe(200);
  expect((deactivated.data as { isActive: boolean }).isActive).toBe(false);

  // Historical Ticket still reads the (now inactive) Status (S3).
  const reread = await apiGet(
    f!.api,
    `/api/tickets/${ticketId}`,
    f!.workspaceA.requesterSession,
  );
  expect(reread.status).toBe(200);
  expect((reread.data as { statusName: string }).statusName).toBe('Escalated');

  // A new transition into the inactive Status is refused (S3).
  const freshTicketId = await createTicket('Cannot enter inactive status');
  const refused = await apiPut(
    f!.api,
    `/api/tickets/${freshTicketId}`,
    { statusId: escalatedStatusId },
    f!.workspaceA.agentSession,
  );
  expect(refused.status).toBeGreaterThanOrEqual(400);
  expect(refused.status).toBeLessThan(500);
  expect((refused.data as { error: string }).error).toMatch(/inactive/i);

  const freshReread = await apiGet(
    f!.api,
    `/api/tickets/${freshTicketId}`,
    f!.workspaceA.requesterSession,
  );
  expect((freshReread.data as { statusId: string }).statusId).toBe(
    f!.workspaceA.defaultStatusId,
  );
});
