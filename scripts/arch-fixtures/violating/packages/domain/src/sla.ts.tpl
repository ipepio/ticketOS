import type { Uuid } from '@ticketos/shared';

export interface SlaPolicy {
  readonly id: Uuid;
  readonly minutes: number;
}
