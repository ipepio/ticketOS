import type { SlaPolicy } from '@ticketos/domain';
import type { PolicyView } from '@/feature/types.js';

export function describePolicy(policy: SlaPolicy): PolicyView {
  return { summary: `${policy.id}:${policy.minutes}` };
}
