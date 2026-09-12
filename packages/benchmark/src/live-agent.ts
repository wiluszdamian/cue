import Anthropic from '@anthropic-ai/sdk';
import {
  extractCode,
  type Agent,
  type AgentRequest,
  type AgentResponse,
  type GeneratedSource,
} from './agent.js';

/**
 * Producing the answers that get scored. The only paid network call in the
 * repository, and it runs only on `record`.
 */

export const DEFAULT_MODEL = 'claude-opus-5';

/**
 * Identical in both conditions, and naming no rule, tag or page object — advice
 * here would be handed to the bare run too, which is the layer's whole job.
 *
 * It does ask for a path per file, since rules are scoped by directory. A path
 * selects which rules apply, never whether they are satisfied.
 */
export const INSTRUCTIONS = [
  'Answer with the file or files you would add to the repository, and nothing else.',
  '',
  'Before each code block, write the path on its own line, exactly like this:',
  '',
  'File: tests/example.spec.ts',
  '',
  'Write each file out in full. Do not abbreviate with comments such as "rest unchanged".',
].join('\n');

/** A seam rather than a client, so a test can drive `ClaudeAgent` without a key. */
export type Completion = (input: {
  readonly system: string;
  readonly user: string;
}) => Promise<{ readonly text: string; readonly model: string }>;

export interface ClaudeAgentOptions {
  readonly model?: string;
  readonly complete?: Completion;
  readonly maxTokens?: number;
}

/**
 * Credentials are left to the SDK: checking `ANTHROPIC_API_KEY` ourselves would
 * report "no API key" to somebody authenticated by profile.
 */
export function anthropicCompletion(options: ClaudeAgentOptions = {}): Completion {
  const client = new Anthropic();
  const model = options.model ?? DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? 16000;

  return async ({ system, user }) => {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // An empty file would score clean: the best result for producing nothing.
    if (response.stop_reason === 'refusal') {
      throw new Error(
        `The model declined this prompt (${response.stop_details?.category ?? 'no category'}). ` +
          'Recording it would score as a file with no violations, which is worse than a gap.',
      );
    }

    return { text, model: response.model };
  };
}

export class ClaudeAgent implements Agent {
  readonly name = 'claude';
  private readonly complete: Completion;

  constructor(private readonly options: ClaudeAgentOptions = {}) {
    this.complete = options.complete ?? anthropicCompletion(options);
  }

  async run(request: AgentRequest): Promise<AgentResponse> {
    const { text, model } = await this.complete({
      system: systemPrompt(request),
      user: request.prompt.text,
    });

    const files = parseFiles(text, request.prompt.id);

    return {
      promptId: request.prompt.id,
      condition: request.condition,
      code: files.map((file) => file.source).join('\n\n'),
      files,
      model: model === '' ? (this.options.model ?? DEFAULT_MODEL) : model,
      recordedAt: new Date().toISOString(),
    };
  }
}

/** `understudy` adds the project's own files verbatim, so this measures what ships. */
export function systemPrompt(request: AgentRequest): string {
  return request.context.trim().length === 0
    ? INSTRUCTIONS
    : `${request.context}\n\n---\n\n${INSTRUCTIONS}`;
}

/**
 * A missing path never drops the answer — that would shrink the sample in
 * whichever condition followed instructions worse.
 */
export function parseFiles(text: string, promptId: string): GeneratedSource[] {
  const blocks = [
    ...text.matchAll(
      /^[ \t]*(?:#+[ \t]*)?(?:\*\*)?File:(?:\*\*)?[ \t]*`?([^\n`]+?)`?[ \t]*$\s*```[^\n]*\n([\s\S]*?)```/gm,
    ),
  ];

  const files = blocks
    .map((match) => ({ path: (match[1] ?? '').trim(), source: (match[2] ?? '').trim() }))
    .filter((file) => file.path.length > 0 && file.source.length > 0);

  if (files.length > 0) return files;

  const code = extractCode(text);
  return code.length === 0 ? [] : [{ path: defaultPath(promptId), source: code }];
}

export function defaultPath(promptId: string): string {
  return `tests/app/functional/${promptId}.spec.ts`;
}
