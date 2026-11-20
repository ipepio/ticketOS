import type { Pool } from 'pg';

export class PostgresBilling {
  constructor(private readonly pool: Pool) {}
}
