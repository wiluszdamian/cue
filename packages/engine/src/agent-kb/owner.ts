import { chownSync, lstatSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

/**
 * Cue run as root (`sudo`, a container) writes `.cue/` and `.agent-kb/` as root,
 * and the next run as the person who owns the checkout cannot update them. So
 * whatever Cue writes, it hands to the owner of the project directory — and only
 * when it is root and that owner is not, and only what is root's to begin with.
 */
export function adoptOwner(path: string, projectRoot: string): void {
  if (typeof process.geteuid !== 'function' || process.geteuid() !== 0) return;

  try {
    const root = resolve(projectRoot);
    const owner = lstatSync(root);
    if (owner.uid === 0) return;

    // The file and each directory above it, up to but not including the project root.
    let current = resolve(path);
    while (current !== root && !relative(root, current).startsWith('..') && current.includes(sep)) {
      if (lstatSync(current).uid === 0) chownSync(current, owner.uid, owner.gid);
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  } catch {
    // Ownership is a courtesy: never fail a write because it could not be handed over.
  }
}
