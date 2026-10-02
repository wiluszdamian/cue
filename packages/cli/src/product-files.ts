import { findProductRoot, workingTreeFiles, type FileStateProvider } from '@understudy/engine';

/**
 * The product's files as they are now, if the product can be found: where `extract`
 * read it from, or `--source`. Nothing when it cannot, so a caller compares nothing
 * rather than comparing against the wrong tree.
 */
export function productFiles(projectRoot: string, source?: string): FileStateProvider | undefined {
  const root = findProductRoot(projectRoot, source);
  return root === undefined ? undefined : workingTreeFiles(root);
}
