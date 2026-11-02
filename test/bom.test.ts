import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as plugin from '../src/index.js';
import { createHost } from './host.js';

test('editing a later line retains UTF-8 BOM and refuses unrelated intervening edits', async t => {
  const root = await mkdtemp(join(tmpdir(), 'hashline-bom-'));
  const host = await createHost(root);
  t.after(async () => { await host.close(); await rm(root, { recursive: true, force: true }); });
  await host.ctx.plugin(plugin, { root });
  await writeFile(join(root, 'a'), '\ufefffirst\nsecond\n');
  const read = await host.execute('hashline_read', { path: 'a' });
  assert.ok(!read.isError && 'value' in read && read.value && typeof read.value === 'object' && !Array.isArray(read.value));
  const value = read.value;
  assert.ok(Array.isArray(value.lines) && typeof value.lines[1] === 'string');
  const args = { path: 'a', revision: value.revision, operation: 'replace', start: value.lines[1].split('|')[0], text: 'changed' };
  assert.equal((await host.execute('hashline_edit', args)).isError, false);
  assert.equal(await readFile(join(root, 'a'), 'utf8'), '\ufefffirst\nchanged\n');
  await writeFile(join(root, 'a'), '\ufeffoutside changed\nsecond\n');
  assert.equal((await host.execute('hashline_edit', args)).isError, true);
  assert.equal(await readFile(join(root, 'a'), 'utf8'), '\ufeffoutside changed\nsecond\n');
});
