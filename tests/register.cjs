const Module = require('node:module');
const path = require('node:path');
if (process.env.HOOK_REACT_ROOT) {
  const original = Module._resolveFilename;
  const from = Module.createRequire(
    path.join(process.env.HOOK_REACT_ROOT, 'package.json')
  );
  const resolved = new Map(
    [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
      'react-dom/client',
      'react-dom/test-utils',
    ].map(name => [name, from.resolve(name)])
  );
  Module._resolveFilename = function (request, parent, ...rest) {
    return (
      resolved.get(request) || original.call(this, request, parent, ...rest)
    );
  };
}
const fs = require('node:fs');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    module._compile(
      ts.transpileModule(source, {
        fileName: filename,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      }).outputText,
      filename
    );
  };
}
