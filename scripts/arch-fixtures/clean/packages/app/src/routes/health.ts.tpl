import type { Uuid } from '@ticketos/shared';
import { describePolicy } from '../feature/module.js';
import type { PolicyView } from '../feature/types.js';

export function registerHealthRoutes(id: Uuid): PolicyView {
  return describePolicy({ id, minutes: 30 });
}
