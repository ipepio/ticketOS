import type { Pool } from 'pg';
import type { SlaPolicy } from '@ticketos/domain';

export class PostgresSlaPolicy {
  constructor(private readonly pool: Pool) {}

  async load(id: string): Promise<SlaPolicy | null> {
    const rows = await this.pool.query('select id, minutes from sla_policy where id = $1', [id]);
    return (rows.rows[0] as SlaPolicy | undefined) ?? null;
  }
}
