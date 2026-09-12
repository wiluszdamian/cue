import { isEnforceable, type Rule } from '../schema/constitution.js';
import type { Reporter } from './index.js';

/**
 * SARIF 2.1.0, for GitHub Code Scanning.
 *
 * The value here is that every rule ships its full rationale and both examples
 * in `rules[]`, so a violation in the Security tab reads as the constitution
 * intends rather than as a bare rule id.
 */

const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json';

function ruleDescriptor(rule: Rule): unknown {
  return {
    id: rule.id,
    name: rule.id.replace(/(^|-)([a-z])/g, (_, __, c: string) => c.toUpperCase()),
    shortDescription: { text: rule.title },
    fullDescription: { text: rule.rationale.replace(/\s+/g, ' ').trim() },
    help: {
      text: rule.message.replace(/\s+/g, ' ').trim(),
      markdown: [
        `**${rule.title}** (\`${rule.tier}\`)`,
        '',
        rule.message.replace(/\s+/g, ' ').trim(),
        '',
        '```ts',
        `// ✗ ${rule.id}`,
        rule.examples.bad.trimEnd(),
        '',
        '// ✓',
        rule.examples.good.trimEnd(),
        '```',
      ].join('\n'),
    },
    defaultConfiguration: { level: rule.severity === 'error' ? 'error' : 'warning' },
    properties: {
      tier: rule.tier,
      skill: rule.skill,
      since: rule.since,
      tags: ['understudy', rule.skill],
    },
    helpUri: `https://github.com/understudy-dev/understudy/blob/main/docs/constitution.md#${rule.docsAnchor}`,
  };
}

export const sarifReporter: Reporter = ({ result, constitution }) => {
  const enforceable = constitution.rules.filter(isEnforceable);
  const index = new Map(enforceable.map((rule, i) => [rule.id, i]));

  return JSON.stringify(
    {
      $schema: SARIF_SCHEMA,
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'Understudy',
              informationUri: 'https://github.com/understudy-dev/understudy',
              rules: enforceable.map(ruleDescriptor),
            },
          },
          results: result.diagnostics.map((d) => ({
            ruleId: d.ruleId,
            ruleIndex: index.get(d.ruleId) ?? 0,
            level: d.severity === 'error' ? 'error' : 'warning',
            message: { text: d.message.replace(/\s+/g, ' ').trim() },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: d.file, uriBaseId: '%SRCROOT%' },
                  region: {
                    startLine: d.line,
                    startColumn: d.column,
                    endLine: d.endLine,
                    endColumn: d.endColumn,
                  },
                },
              },
            ],
          })),
          // Parse failures are reported rather than dropped: a file the engine
          // could not read is not a file the engine found clean.
          invocations: [
            {
              executionSuccessful: true,
              toolExecutionNotifications: result.skipped.map((skip) => ({
                level: 'warning',
                message: { text: `could not parse: ${skip.reason}` },
                locations: [{ physicalLocation: { artifactLocation: { uri: skip.file } } }],
              })),
            },
          ],
        },
      ],
    },
    null,
    2,
  );
};
