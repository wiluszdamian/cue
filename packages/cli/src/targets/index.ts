import { isTargetId, type TargetId } from '../agents.js';
import {
  claudeCodeTarget,
  codexTarget,
  cursorTarget,
  geminiTarget,
  grokTarget,
  opencodeTarget,
} from './agent-targets.js';
import { baselineTarget } from './baseline.js';
import type { Target } from './types.js';

export type { Target, TargetContext } from './types.js';
export { UNDERSTUDY_BEGIN, UNDERSTUDY_END } from './baseline.js';
export { mcpJson } from './agent-targets.js';

const ALL: readonly Target[] = [
  baselineTarget,
  claudeCodeTarget,
  cursorTarget,
  codexTarget,
  opencodeTarget,
  geminiTarget,
  grokTarget,
];

export const TARGETS: ReadonlyMap<TargetId, Target> = new Map(ALL.map((t) => [t.id, t]));

export function getTarget(id: string): Target {
  const target = isTargetId(id) ? TARGETS.get(id) : undefined;
  if (!target) {
    throw new Error(`unknown target "${id}". Available: ${[...TARGETS.keys()].join(', ')}`);
  }
  return target;
}

/** The baseline is always present, so callers never have to remember to add it. */
export function resolveTargets(requested: readonly string[]): Target[] {
  const ids = new Set<TargetId>(['agents']);
  for (const id of requested) {
    if (!isTargetId(id)) {
      throw new Error(`unknown target "${id}". Available: ${[...TARGETS.keys()].join(', ')}`);
    }
    ids.add(id);
  }
  return ALL.filter((t) => ids.has(t.id));
}

export function optionalTargets(): Target[] {
  return ALL.filter((t) => t.baseline !== true);
}
