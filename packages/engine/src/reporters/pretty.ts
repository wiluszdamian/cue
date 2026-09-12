import { countBySeverity } from '../diagnostic.js';
import type { Reporter } from './index.js';

/** ANSI, disabled when the stream is not a TTY or NO_COLOR is set. */
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const paint = (code: string, text: string): string =>
  useColor ? `\u001b[${code}m${text}\u001b[0m` : text;
const dim = (t: string) => paint('2', t);
const bold = (t: string) => paint('1', t);
const red = (t: string) => paint('31', t);
const yellow = (t: string) => paint('33', t);
const green = (t: string) => paint('32', t);

/** Wraps a message body under a hanging indent so long guidance stays readable. */
function wrap(text: string, width: number, indent: string): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > width) {
      lines.push(current);
      current = word;
    } else {
      current = current.length === 0 ? word : `${current} ${word}`;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.map((l) => indent + l).join('\n');
}

export const prettyReporter: Reporter = ({ result }) => {
  const out: string[] = [];
  let currentFile = '';

  for (const d of result.diagnostics) {
    if (d.file !== currentFile) {
      currentFile = d.file;
      out.push('', bold(currentFile));
    }
    const marker = d.severity === 'error' ? red('error') : yellow('warn ');
    out.push(`  ${dim(`${d.line}:${d.column}`)}  ${marker}  ${d.ruleId}`);
    out.push(wrap(d.message, 88, '         '));
    out.push(dim(`         ${d.docsUrl}`));
  }

  for (const skip of result.skipped) {
    out.push('', yellow(`could not parse ${skip.file}`), `  ${skip.reason}`);
  }

  const { errors, warnings } = countBySeverity(result.diagnostics);
  out.push('');
  if (errors === 0 && warnings === 0) {
    out.push(green(`No constitution violations in ${result.filesAnalyzed} files.`));
  } else {
    const parts = [
      `${errors} error${errors === 1 ? '' : 's'}`,
      `${warnings} warning${warnings === 1 ? '' : 's'}`,
    ];
    out.push(
      bold(`${parts.join(', ')} in ${result.filesAnalyzed} files`) +
        dim(` (${result.durationMs}ms)`),
    );
  }

  return out.join('\n');
};
