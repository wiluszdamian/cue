import type { Reporter } from './index.js';

/**
 * GitHub Actions workflow commands, which surface each diagnostic as an
 * annotation on the changed line in the PR diff.
 */
const escape = (value: string): string =>
  value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

export const githubReporter: Reporter = ({ result }) =>
  result.diagnostics
    .map((d) => {
      const level = d.severity === 'error' ? 'error' : 'warning';
      const props = [
        `file=${d.file}`,
        `line=${d.line}`,
        `col=${d.column}`,
        `endLine=${d.endLine}`,
        `title=${escape(`cue/${d.ruleId}`)}`,
      ].join(',');
      return `::${level} ${props}::${escape(`${d.message.replace(/\s+/g, ' ').trim()} (${d.docsUrl})`)}`;
    })
    .join('\n');
