import { PostgresSlaPolicy } from './postgres.js';

type PoolLike = ConstructorParameters<typeof PostgresSlaPolicy>[0];

export function createFeatureModule(pool: PoolLike): PostgresSlaPolicy {
  return new PostgresSlaPolicy(pool);
}
