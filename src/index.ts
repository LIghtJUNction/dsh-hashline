import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { digest, load, save } from './files.js';
import { workspace } from './support.js';
import Schema from '@deepseek-ai/schemastery';

export const name = 'dsh-hashline';
export const inject = ['tools'];
export interface Config { root?: string }
export const Config = Schema.object({ root: Schema.string() });

function linesOf(text: string): string[] {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines;
}
const anchor = (line: number, text: string): string => `${line}:${digest(text).slice(0, 16)}`;
function position(ref: string, lines: string[]): number {
  const match = /^(\d+):([a-f0-9]{16})$/.exec(ref);
  if (!match) throw new Error('Expected a LINE:HASH anchor from hashline_read');
  const index = Number(match[1]) - 1;
  const line = lines[index];
  if (line === undefined || anchor(index + 1, line) !== ref) throw new Error('Stale or invalid anchor');
  return index;
}

export function apply(ctx: Context, config: Config = {}): void {
  ctx.tools.register(defineTool({
    name: 'hashline_read', description: 'Read a workspace text file with SHA-256 revision and line anchors for stale-safe editing. Rejects symlinks and Git metadata.',
    parameters: { path: { type: 'string', required: true }, offset: { type: 'integer' }, limit: { type: 'integer' } },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      path: { type: 'string', required: true }, revision: { type: 'string', required: true }, totalLines: { type: 'integer', required: true },
      lines: { type: 'array', items: { type: 'string' }, required: true }, nextOffset: { type: 'integer', required: true },
    } }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const data = load(workspace(ctx, exec, config.root), args.path);
      const lines = linesOf(data.text);
      const offset = args.offset ?? 1;
      const limit = args.limit ?? 200;
      if (offset < 1 || offset > lines.length || limit < 1 || limit > 1000) throw new Error('Invalid offset or limit (1..1000)');
      const selected = lines.slice(offset - 1, offset - 1 + limit).map((line, i) => `${anchor(offset + i, line)}|${line}`);
      return { path: args.path, revision: data.revision, totalLines: lines.length, lines: selected, nextOffset: offset - 1 + selected.length < lines.length ? offset + selected.length : 0 };
    },
  }));
  ctx.tools.register(defineTool({
    name: 'hashline_edit', description: 'Replace an anchored inclusive line range or insert after an anchor. Requires the full-file revision from hashline_read. Does not overwrite intervening changes.',
    parameters: { path: { type: 'string', required: true }, revision: { type: 'string', required: true }, operation: { type: 'string', enum: ['replace', 'insert_after'], required: true }, start: { type: 'string', required: true }, end: { type: 'string' }, text: { type: 'string', required: true } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { path: { type: 'string', required: true }, revision: { type: 'string', required: true }, changed: { type: 'boolean', required: true } } }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const root = workspace(ctx, exec, config.root);
      const old = load(root, args.path);
      if (old.revision !== args.revision) throw new Error('Stale revision; read again');
      if (Buffer.byteLength(args.text) > 1024 * 1024 || args.text.includes('\0') || /\r(?!\n)/.test(args.text)) throw new Error('Invalid replacement text');
      const lines = linesOf(old.text);
      const start = position(args.start, lines);
      const end = args.end === undefined ? start : position(args.end, lines);
      if (end < start || (args.operation === 'insert_after' && args.end !== undefined)) throw new Error('Invalid edit range');
      const inserted = args.text === '' ? [] : linesOf(args.text);
      lines.splice(args.operation === 'insert_after' ? start + 1 : start, args.operation === 'insert_after' ? 0 : end - start + 1, ...inserted);
      const eol = old.text.includes('\r\n') ? '\r\n' : '\n';
      const text = lines.join(eol) + (old.text.endsWith('\n') && lines.length ? eol : '');
      if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('Result exceeds 1 MiB');
      exec.signal.throwIfAborted();
      const revision = text === old.text ? old.revision : save(root, args.path, args.revision, text);
      return { path: args.path, revision, changed: text !== old.text };
    },
  }));
}
