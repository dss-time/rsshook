import { build } from 'vite';
import {
  mkdtemp,
  mkdir,
  cp,
  readFile,
  symlink,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), 'rsshook-excel-package-'));
function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`
    );
  return result.stdout;
}
try {
  const output = run(
    'npm',
    [
      'pack',
      '--json',
      '--ignore-scripts',
      '--cache',
      join(directory, 'cache'),
      '--pack-destination',
      directory,
    ],
    root
  );
  const packed = JSON.parse(output)[0];
  for (const entry of ['index', 'browser', 'react'])
    for (const extension of ['mjs', 'cjs', 'd.mts', 'd.cts', 'd.ts']) {
      if (
        !packed.files.some(file => file.path === `dist/${entry}.${extension}`)
      )
        throw new Error(`Missing artifact: ${entry}.${extension}`);
    }
  if (!packed.files.some(file => file.path === 'dist/worker.mjs'))
    throw new Error('Missing standalone Worker artifact');
  if (packed.files.some(file => /^(src|tests|node_modules)\//.test(file.path)))
    throw new Error('Unexpected source/test/dependency files in archive');
  await mkdir(join(directory, 'node_modules/rsshook-excel'), {
    recursive: true,
  });
  run(
    'tar',
    [
      '-xzf',
      join(directory, packed.filename),
      '--strip-components=1',
      '-C',
      join(directory, 'node_modules/rsshook-excel'),
    ],
    root
  );
  const installed = join(directory, 'node_modules/rsshook-excel');
  const pkg = JSON.parse(
    await readFile(join(installed, 'package.json'), 'utf8')
  );
  if (Object.keys(pkg.dependencies).join(',') !== 'xlsx')
    throw new Error('Excel package must not require UI or HTTP libraries');
  const runtimeRoot = process.env.EXCEL_REACT_ROOT;
  const dependencyRequire = runtimeRoot
    ? createRequire(join(resolve(runtimeRoot), 'package.json'))
    : require;
  for (const name of ['react', 'react-dom', 'jsdom', 'xlsx']) {
    const packagePath =
      name === 'xlsx' && process.env.EXCEL_XLSX_PATH
        ? resolve(process.env.EXCEL_XLSX_PATH)
        : dirname(
            name === 'xlsx'
              ? require.resolve('xlsx')
              : dependencyRequire.resolve(`${name}/package.json`)
          );
    await symlink(packagePath, join(directory, 'node_modules', name), 'dir');
  }
  console.log(
    run(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "const p=await import('rsshook-excel'); if(typeof p.parseExcel!=='function')process.exit(1); const {createRequire}=await import('node:module'); const r=createRequire(import.meta.url); if(typeof r('rsshook-excel').serializeExcel!=='function')process.exit(1); console.log('PASS installed ESM/CJS exports')",
      ],
      directory
    ).trim()
  );
  await cp(join(root, 'tests'), join(installed, 'tests'), { recursive: true });
  console.log(
    run(
      process.execPath,
      [
        '--test',
        'tests/core.test.mjs',
        'tests/react.test.cjs',
        'tests/stream.test.mjs',
        'tests/worker.test.mjs',
      ],
      installed
    ).trim()
  );
  await cp(join(root, 'examples'), join(installed, 'examples'), {
    recursive: true,
  });
  await writeFile(
    join(directory, 'index.html'),
    '<div id="root"></div><script type="module" src="/main.tsx"></script>'
  );
  await writeFile(
    join(directory, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } })
  );
  await writeFile(
    join(directory, 'main.tsx'),
    `import ExcelWorker from 'rsshook-excel/worker?worker'; const w=new ExcelWorker(); w.terminate(); import {createRoot} from 'react-dom/client'; import {ReactExcelExample} from './node_modules/rsshook-excel/examples/ReactExample.tsx'; createRoot(document.getElementById('root')!).render(<ReactExcelExample />);`
  );
  await build({
    root: directory,
    configFile: false,
    logLevel: 'error',
    build: { outDir: join(directory, 'browser-build') },
  });
  console.log('PASS packed package browser consumer build');
  console.log(`PASS packed artifact: ${packed.filename}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
