import { loadConfig } from '@ticketos/app/config';
import { getPool, initDb, closeDb } from '@ticketos/app/db/connection';
import { PostgresOutbox } from '@ticketos/app/db/outbox';
import type { OutboxEvent } from '@ticketos/domain';

const POLL_INTERVAL_MS = 2000;
const BATCH_SIZE = 50;

/**
 * Worker that consumes the PostgreSQL transactional outbox.
 * Processes events with at-least-once delivery semantics.
 */
class OutboxWorker {
  private running = false;
  private outbox = new PostgresOutbox(getPool());

  async start(): Promise<void> {
    this.running = true;
    console.log('Worker started — polling outbox...');
    while (this.running) {
      try {
        await this.processBatch();
      } catch (err) {
        console.error('Worker batch error:', err);
      }
      await this.sleep(POLL_INTERVAL_MS);
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    console.log('Worker stopping...');
  }

  private async processBatch(): Promise<void> {
    const events = await this.outbox.fetchAvailable(BATCH_SIZE);

    for (const event of events) {
      try {
        await this.handleEvent(event);
        await this.outbox.markDelivered(event.id);
      } catch (err) {
        console.error(`Failed to process event ${event.id}:`, err);
        await this.outbox.markFailed(event.id);
      }
    }
  }

  /**
   * Dispatch event to the appropriate handler.
   * In P0, we only log events. P0-07+ will add email, scanning, etc.
   */
  private async handleEvent(event: OutboxEvent): Promise<void> {
    console.log(`Processing event: ${event.eventType} for ${event.aggregateId}`);
    // Future: route to specific handlers by eventType
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  await initDb(config);

  const worker = new OutboxWorker();

  const shutdown = async (): Promise<void> => {
    await worker.stop();
    await closeDb();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await worker.start();
}

main().catch((err) => {
  console.error('Fatal worker error:', err);
  process.exit(1);
});
