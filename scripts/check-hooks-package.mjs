import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  symlink,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url),
  root = resolve('.');
const temp = await mkdtemp(join(tmpdir(), 'rsshook-hooks-'));
function run(command, args, cwd = temp) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw Error(result.stdout + '\n' + result.stderr);
  return result.stdout;
}
try {
  const packed = JSON.parse(
    run(
      'npm',
      [
        'pack',
        '--ignore-scripts',
        '--json',
        '--cache',
        join(temp, 'cache'),
        '--pack-destination',
        temp,
      ],
      root
    )
  )[0];
  const installed = join(temp, 'node_modules/rsshook');
  await mkdir(installed, { recursive: true });
  run('tar', [
    '-xzf',
    join(temp, packed.filename),
    '--strip-components=1',
    '-C',
    installed,
  ]);
  const pkg = JSON.parse(
    await readFile(join(installed, 'package.json'), 'utf8')
  );
  const semver = require('semver');
  for (const [name, version] of [
    ['antd', '4.24.16'],
    ['antd', '6.6.3'],
    ['axios', '0.27.2'],
    ['axios', '1.20.0'],
  ])
    if (!semver.satisfies(version, pkg.peerDependencies[name]))
      throw Error(`${name}@${version} excluded`);
  // Only React is available in this consumer: importing hooks cannot resolve UI/HTTP dependencies.
  await symlink(
    join(root, 'node_modules/react'),
    join(temp, 'node_modules/react'),
    'dir'
  );
  await symlink(
    join(root, 'node_modules/@types'),
    join(temp, 'node_modules/@types'),
    'dir'
  );
  run(process.execPath, [
    '--input-type=module',
    '-e',
    `import {useAsyncTask,useBatchTask} from 'rsshook/react/hooks';import {createRequire} from 'node:module';const r=createRequire(import.meta.url);if(typeof useAsyncTask!=='function'||typeof useBatchTask!=='function'||typeof r('rsshook/react/hooks').usePolling!=='function'||typeof r('rsshook/react/useMediaQuery').useMediaQuery!=='function'||typeof r('rsshook/react/useUrlState').useUrlState!=='function')throw Error('missing export');`,
  ]);
  const consumer = `import {useAsyncTask,usePolling,useBatchTask,useRowSelection,useCheckUpdate,useMediaQuery,useUrlState} from 'rsshook/react/hooks';
import type {MediaQueryOptions} from 'rsshook/react/useMediaQuery';
import type {UrlStateAdapter} from 'rsshook/react/useUrlState';
const mediaOptions:MediaQueryOptions={defaultMatches:true};void mediaOptions;
const typedAdapter:UrlStateAdapter={getSearch:()=>'',subscribe:()=>()=>{},setSearch:()=>{}};void typedAdapter;
function Example(){
 const matches:boolean=useMediaQuery('(min-width: 800px)',{defaultMatches:false});void matches;
 interface Filters {page:number}
 const url=useUrlState<Filters>({page:{defaultValue:1,parse:v=>Number(v[0]),serialize:(n:number)=>[String(n)]}},{getSearch:()=>'',subscribe:()=>()=>{},setSearch:()=>{}});
 url.setState(s=>({page:s.page+1}));url.reset();
 // @ts-expect-error invalid URL field type
 url.setState({page:'bad'});
 const task=useAsyncTask(async (id:string,signal:AbortSignal)=>{void signal;return {id};});task.run('a');
 // @ts-expect-error invalid request argument
 task.run(3);
 const batch=useBatchTask(async (item:{vin:string},ctx)=>{ctx.signal.throwIfAborted();return item.vin;},{onResult:result=>{if(result.status==='fulfilled')result.value.toUpperCase();}});batch.run([{vin:'1'}]);
 const selection=useRowSelection({getKey:(row:{id:string})=>row.id});selection.update(['a'],[{id:'a'}]);
 usePolling(async signal=>{void signal;});useCheckUpdate({getVersion:async signal=>{void signal;return 'v1';}});
 return null;
}void Example;`;
  for (const compiler of [
    process.env.HOOK_TYPESCRIPT || require.resolve('typescript/bin/tsc'),
  ]) {
    const version = run(process.execPath, [compiler, '--version']).trim();
    for (const [extension, module, resolution] of [
      ['mts', 'NodeNext', 'NodeNext'],
      ['cts', 'NodeNext', 'NodeNext'],
      ['ts', 'ESNext', 'Node'],
    ]) {
      const file = join(temp, `consumer.${extension}`);
      await writeFile(file, consumer);
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
      if (version.includes('6.0')) args.push('--ignoreDeprecations', '6.0');
      run(process.execPath, args);
      console.log(`PASS ${version} ${extension}`);
    }
  }
  console.log('PASS packed ESM/CJS hooks with React only; host peer ranges');
} finally {
  await rm(temp, { recursive: true, force: true });
}
