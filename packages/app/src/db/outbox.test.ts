import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { PostgresOutbox } from './outbox.js';
import type { DomainEvent } from '@ticketos/domain';

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
`;

let pool: Pool | null = null;

describe('PostgresOutbox', () => {
  let outbox: PostgresOutbox;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgresql://ticketos:ticketos@localhost:5432/ticketos',
    });
    await pool.query(MIGRATION_SQL);
  });

  beforeEach(async () => {
    outbox = new PostgresOutbox(pool!);
    await pool!.query('DELETE FROM outbox_events');
  });

  afterAll(async () => {
    await pool!.end();
  });

  it('enqueues and fetches one event', async () => {
    const event: DomainEvent = {
      aggregateId: 'test-1',
      eventType: 'ticket.created',
      data: { title: 'Test' },
    };

    await outbox.enqueue(event);
    const available = await outbox.fetchAvailable();
    expect(available).toHaveLength(1);
    expect(available[0]!.aggregateId).toBe('test-1');
  });

  it('does not return delivered events', async () => {
    const event: DomainEvent = {
      aggregateId: 'test-delivered',
      eventType: 'ticket.status-changed',
      data: {},
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
      aggregateId: 'test-retry',
      eventType: 'ticket.created',
      data: {},
    };

    await outbox.enqueue(event);
    const events = await outbox.fetchAvailable();

    await outbox.markFailed(events[0]!.id);

    const available = await outbox.fetchAvailable();
    expect(available[0]!.retryCount).toBe(1);
  });

  it('fetches events in chronological order', async () => {
    const events: DomainEvent[] = [
      { aggregateId: 'chron-a', eventType: 'e1', data: {} },
      { aggregateId: 'chron-b', eventType: 'e2', data: {} },
      { aggregateId: 'chron-c', eventType: 'e3', data: {} },
    ];

    for (const event of events) {
      await outbox.enqueue(event);
    }

    const available = await outbox.fetchAvailable();
    expect(available.length).toBe(3);
    expect(available[0]!.aggregateId).toBe('chron-a');
    expect(available[1]!.aggregateId).toBe('chron-b');
    expect(available[2]!.aggregateId).toBe('chron-c');
  });
});
