import { Pool } from 'pg';

export const pool = new Pool();

export function getPool(): Pool {
  return pool;
}
