import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, rm, symlink, link, stat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import * as plugin from '../src/index.js';
import { createHost, textResponse, toolResponse } from './host.js';

function value(result: Awaited<ReturnType<Awaited<ReturnType<typeof createHost>>['execute']>>) {
  assert.equal(result.isError, false, JSON.stringify(result));
  assert.ok('value' in result && result.value !== null && typeof result.value === 'object' && !Array.isArray(result.value));
  return result.value;
}

test('real ToolRuntime reads anchors, edits CRLF atomically, preserves mode, and refuses stale revisions', async t => {
  const root = await mkdtemp(join(tmpdir(), 'hashline-test-'));
  const host = await createHost(root);
  t.after(async () => { await host.close(); await rm(root, { recursive: true, force: true }); });
  await writeFile(join(root, 'a.txt'), 'first\r\n中文😀\r\nlast\r\n');
  await chmod(join(root, 'a.txt'), 0o640);
  await host.ctx.plugin(plugin, { root });
  const read = value(await host.execute('hashline_read', { path: 'a.txt', offset: 2, limit: 1 }));
  assert.ok(Array.isArray(read.lines) && typeof read.lines[0] === 'string');
  const start = read.lines[0].split('|')[0];
  const args = { path: 'a.txt', revision: read.revision, start, operation: 'replace', text: 'updated' };
  const edited = value(await host.execute('hashline_edit', args));
  assert.equal(edited.changed, true);
  assert.equal(await readFile(join(root, 'a.txt'), 'utf8'), 'first\r\nupdated\r\nlast\r\n');
  assert.equal((await stat(join(root, 'a.txt'))).mode & 0o777, 0o640);
  assert.equal((await host.execute('hashline_edit', args)).isError, true);
  assert.equal((await host.execute('hashline_read', { path: 'a.txt', limit: -1 })).isError, true);
  const controller = new AbortController(); controller.abort();
  assert.equal((await host.execute('hashline_edit', args, controller.signal)).isError, true);
});

test('rejects traversal, symlink files/parents, hard links, binary files and Git metadata', async t => {
  const root = await mkdtemp(join(tmpdir(), 'hashline-boundary-'));
  const outside = await mkdtemp(join(tmpdir(), 'hashline-outside-'));
  const host = await createHost(root);
  t.after(async () => { await host.close(); await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
  await host.ctx.plugin(plugin, { root });
  await writeFile(join(outside, 'secret'), 'private');
  await symlink(outside, join(root, 'escape'));
  await symlink(join(outside, 'secret'), join(root, 'link'));
  await link(join(outside, 'secret'), join(root, 'hard'));
  await writeFile(join(root, 'binary'), Buffer.from([0, 255]));
  for (const path of [join(outside, 'secret'), '../outside', 'escape/secret', 'link', 'hard', 'binary', '.git/config']) {
    assert.equal((await host.execute('hashline_read', { path })).isError, true, path);
  }
  assert.equal(await readFile(join(outside, 'secret'), 'utf8'), 'private');
});

test('offline model loop exposes actual registered schema and sees anchored tool output', async t => {
  const root = await mkdtemp(join(tmpdir(), 'hashline-model-'));
  const host = await createHost(root);
  t.after(async () => { await host.close(); await rm(root, { recursive: true, force: true }); });
  await writeFile(join(root, 'a'), 'hello\n');
  await host.ctx.plugin(plugin, {});
  const { agent } = await host.create();
  host.model.responses.push(toolResponse('hashline_read', { path: 'a' }), textResponse());
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Read a with anchors' }], source: { kind: 'user' } }));
  await agent.whenIdle();
  assert.deepEqual(host.errors, []);
  assert.equal(host.model.requests.length, 2);
  assert.ok(host.model.requests[0]?.tools?.some(tool => tool.name === 'hashline_read'));
  assert.match(JSON.stringify(host.model.requests[1]?.messages), /hello/);
});
