import { getPool } from './db/connection.js';
import { registerHealthRoutes } from './routes/health.js';
import { createFeatureModule } from './feature/index.js';

export function buildApp() {
  return { pool: getPool(), routes: registerHealthRoutes, feature: createFeatureModule() };
}
