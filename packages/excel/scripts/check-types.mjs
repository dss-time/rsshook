import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const compiler =
  process.env.EXCEL_TYPESCRIPT || require.resolve('typescript/bin/tsc');
const version = spawnSync(process.execPath, [compiler, '--version'], {
  encoding: 'utf8',
}).stdout;
const directory = await mkdtemp(join(tmpdir(), 'rsshook-excel-types-'));
try {
  await mkdir(join(directory, 'node_modules'), { recursive: true });
  await symlink(root, join(directory, 'node_modules/rsshook-excel'), 'dir');
  const source = await readFile(
    new URL('../tests/types/consumer.ts', import.meta.url),
    'utf8'
  );
  for (const [extension, module, resolution] of [
    ['mts', 'NodeNext', 'NodeNext'],
    ['cts', 'NodeNext', 'NodeNext'],
    ['ts', 'ESNext', 'Node'],
  ]) {
    const file = join(directory, `consumer.${extension}`);
    await writeFile(file, source);
    const args = [
      compiler,
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'ES2020',
      '--lib',
      'ES2020,DOM',
      '--module',
      module,
      '--moduleResolution',
      resolution,
      file,
    ];
    if (/Version [6-9]\./.test(version))
      args.push('--ignoreDeprecations', '6.0');
    const result = spawnSync(process.execPath, args, {
      encoding: 'utf8',
      cwd: directory,
    });
    if (result.status !== 0)
      throw new Error(
        `${version.trim()} ${extension}\n${result.stdout}\n${result.stderr}`
      );
    console.log(`PASS ${version.trim()} ${extension} declarations`);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
