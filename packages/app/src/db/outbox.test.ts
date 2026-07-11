import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresOutbox } from './outbox.js';
import type { OutboxEvent, DomainEvent } from '@ticketos/domain';

const MIGRATION_SQL = `
  CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    retry_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_outbox_events_not_delivered
    ON outbox_events (created_at)
    WHERE delivered_at IS NULL;
`;

function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
  });
}

describe('PostgresOutbox', () => {
  let pool: Pool;
  let outbox: PostgresOutbox;

  beforeEach(async () => {
    pool = createTestPool();
    outbox = new PostgresOutbox(pool);
    // Ensure schema exists
    await pool.query(MIGRATION_SQL);
    // Clean slate
    await pool.query('DELETE FROM outbox_events');
  });

  afterEach(async () => {
    await pool.end();
  });

  it('enqueues an event and fetches it as available', async () => {
    const event: DomainEvent = {
      aggregateId: 'test-ticket-1',
      eventType: 'ticket.created',
      data: { title: 'Test Ticket' },
    };

    await outbox.enqueue(event);

    const available = await outbox.fetchAvailable();
    expect(available).toHaveLength(1);
    expect(available[0]!.aggregateId).toBe('test-ticket-1');
    expect(available[0]!.eventType).toBe('ticket.created');
    expect(available[0]!.data).toEqual({ title: 'Test Ticket' });
    expect(available[0]!.deliveredAt).toBeNull();
    expect(available[0]!.retryCount).toBe(0);
  });

  it('does not return delivered events', async () => {
    const event: DomainEvent = {
      aggregateId: 'test-ticket-2',
      eventType: 'ticket.status-changed',
      data: { status: 'open' },
    };

    await outbox.enqueue(event);
    const events = await outbox.fetchAvailable();
    expect(events).toHaveLength(1);

    await outbox.markDelivered(events[0]!.id);

    const available = await outbox.fetchAvailable();
    expect(available).toHaveLength(0);
  });

  it('increments retry count on failure', async () => {
    const event: DomainEvent = {
      aggregateId: 'test-ticket-3',
      eventType: 'ticket.created',
      data: {},
    };

    await outbox.enqueue(event);
    const events = await outbox.fetchAvailable();
    expect(events).toHaveLength(1);

    await outbox.markFailed(events[0]!.id);

    const available = await outbox.fetchAvailable();
    expect(available).toHaveLength(1);
    expect(available[0]!.retryCount).toBe(1);
  });

  it('does not fetch events with retry_count >= 10', async () => {
    const event: DomainEvent = {
      aggregateId: 'test-ticket-4',
      eventType: 'ticket.created',
      data: {},
    };

    await outbox.enqueue(event);
    const events = await outbox.fetchAvailable();
    const eventId = events[0]!.id;

    // Simulate 10 failures
    for (let i = 0; i < 10; i++) {
      await outbox.markFailed(eventId);
    }

    const available = await outbox.fetchAvailable();
    expect(available).toHaveLength(0);
  });

  it('fetches events in chronological order', async () => {
    const events: DomainEvent[] = [
      { aggregateId: 'a', eventType: 'e1', data: {} },
      { aggregateId: 'b', eventType: 'e2', data: {} },
      { aggregateId: 'c', eventType: 'e3', data: {} },
    ];

    for (const event of events) {
      await outbox.enqueue(event);
    }

    const available = await outbox.fetchAvailable();
    expect(available.length).toBe(3);
    expect(available[0]!.aggregateId).toBe('a');
    expect(available[1]!.aggregateId).toBe('b');
    expect(available[2]!.aggregateId).toBe('c');
  });
});
