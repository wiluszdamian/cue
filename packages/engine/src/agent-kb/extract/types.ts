import type { SurfaceEntry, Term, TestIdEntry } from '../../schema/agent-kb.js';

export type { SurfaceEntry, TestIdEntry };

/** A term before it is written; the schema adds nothing, but the name is clearer. */
export type TermEntryLike = Term;
