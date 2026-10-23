import { build } from 'vite';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
const temp = await mkdtemp(join(tmpdir(), 'rsshook-size-'));
try {
  const sources = [['current', resolve('dist/reactHooks.mjs')]];
  if (process.env.BASELINE_DIST)
    sources.unshift([
      'baseline',
      resolve(process.env.BASELINE_DIST, 'reactHooks.mjs'),
    ]);
  for (const [label, source] of sources) {
    for (const hook of [
      'useAsyncTask',
      'usePolling',
      'useRowSelection',
      ...(label === 'current' ? ['useMediaQuery', 'useUrlState'] : []),
    ]) {
      const entry = join(temp, 'entry.mjs');
      await writeFile(
        entry,
        `export { ${hook} } from ${JSON.stringify(source)};`
      );
      const result = await build({
        configFile: false,
        logLevel: 'silent',
        build: {
          write: false,
          minify: true,
          target: 'es2020',
          lib: { entry, formats: ['es'] },
          rollupOptions: { external: ['react'] },
        },
      });
      const chunks = (Array.isArray(result) ? result : [result])
        .flatMap(result => result.output)
        .filter(item => item.type === 'chunk');
      if (chunks.some(chunk => chunk.imports.some(name => name !== 'react')))
        throw Error('Unexpected runtime dependency');
      const code = chunks.map(chunk => chunk.code).join('\n');
      console.log(
        JSON.stringify({
          label,
          hook,
          bytes: Buffer.byteLength(code),
          gzipBytes: gzipSync(code).length,
        })
      );
    }
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
