import { createHash, randomUUID } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const digest = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');

export function target(root: string, path: string): string {
  const base = realpathSync(root);
  const file = resolve(base, path);
  const rel = relative(base, file);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) || rel.split(sep).includes('.git')) throw new Error('Path escapes workspace or names Git metadata');
  let current = base;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error('Symbolic links are not supported');
  }
  return file;
}

export function load(root: string, path: string) {
  const file = target(root, path);
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1024 * 1024) throw new Error('Expected a regular single-link file of at most 1 MiB');
    const bytes = readFileSync(fd);
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.includes('\0') || /\r(?!\n)/.test(text) || (text.includes('\r\n') && /(?<!\r)\n/.test(text))) throw new Error('Binary or mixed line endings are unsupported');
    return { file, stat, text, revision: digest(bytes) };
  } finally { closeSync(fd); }
}

export function save(root: string, path: string, expected: string, text: string): string {
  const old = load(root, path);
  if (old.revision !== expected) throw new Error('Stale revision; read the file again');
  const temp = join(dirname(old.file), `.dsh-hashline-${randomUUID()}`);
  try {
    writeFileSync(temp, text, { flag: 'wx', mode: 0o600 });
    chmodSync(temp, old.stat.mode & 0o777);
    const current = load(root, path);
    if (current.revision !== expected || current.stat.ino !== old.stat.ino || current.stat.dev !== old.stat.dev) throw new Error('File changed before write');
    renameSync(temp, old.file);
  } finally {
    try { unlinkSync(temp); } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
  return digest(text);
}
