/**
 * Whether a command may go ahead and write. `--yes` is the only way to apply a
 * plan without a person answering: a prompt nobody can answer must neither hang
 * (this runs in CI) nor quietly say yes on the user's behalf.
 */

export type Confirmation = 'proceed' | 'ask' | 'refuse';

export function decideConfirmation(assumeYes: boolean, isTTY: boolean): Confirmation {
  if (assumeYes) return 'proceed';
  return isTTY ? 'ask' : 'refuse';
}

export const REFUSED_MESSAGE =
  'Not a terminal, so nothing was applied. Re-run with --yes to apply this plan.';
