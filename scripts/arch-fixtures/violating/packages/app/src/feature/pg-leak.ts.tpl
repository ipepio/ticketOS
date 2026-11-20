import type { Pool } from 'pg';

export interface PgOutsideAdapter { readonly pool: Pool }
