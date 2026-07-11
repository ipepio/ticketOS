import type { Pool } from 'pg';
import type { OutboxModule, OutboxEvent, DomainEvent } from '@ticketos/domain';

export class PostgresOutbox implements OutboxModule {
  constructor(private pool: Pool) {}

  async enqueue(event: DomainEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO outbox_events (id, aggregate_id, event_type, data, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        crypto.randomUUID(),
        event.aggregateId,
        event.eventType,
        JSON.stringify(event.data),
      ],
    );
  }

  async fetchAvailable(limit = 100): Promise<OutboxEvent[]> {
    const { rows } = await this.pool.query(
      `SELECT id, aggregate_id, event_type, data, created_at, delivered_at, retry_count
       FROM outbox_events
       WHERE delivered_at IS NULL
         AND retry_count < 10
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit],
    );

    return rows.map(
      (r) =>
        ({
          id: r.id,
          aggregateId: r.aggregate_id,
          eventType: r.event_type,
          data: r.data,
          createdAt: r.created_at,
          deliveredAt: r.delivered_at,
          retryCount: r.retry_count,
        }) as OutboxEvent,
    );
  }

  async markDelivered(eventId: string): Promise<void> {
    await this.pool.query(
      'UPDATE outbox_events SET delivered_at = NOW() WHERE id = $1',
      [eventId],
    );
  }

  async markFailed(eventId: string): Promise<void> {
    await this.pool.query(
      'UPDATE outbox_events SET retry_count = retry_count + 1 WHERE id = $1',
      [eventId],
    );
  }
}
