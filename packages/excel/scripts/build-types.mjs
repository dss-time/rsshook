import { readdir, readFile, writeFile } from 'node:fs/promises';
const dist = new URL('../dist/', import.meta.url);
// Keep a top-level .d.ts fallback and format-specific modern declarations.
// Subpath typesVersions use .d.cts to avoid TS 4.8 misclassifying CJS imports.
for (const file of await readdir(dist)) {
  if (!file.endsWith('.d.ts')) continue;
  const source = await readFile(new URL(file, dist), 'utf8');
  for (const [declarationExtension, runtimeExtension] of [
    ['.d.mts', '.mjs'],
    ['.d.cts', '.cjs'],
  ]) {
    const content = source.replace(
      /(['"])(\.\.?\/[^'"]+)\1/g,
      (_match, quote, specifier) =>
        `${quote}${specifier}${runtimeExtension}${quote}`
    );
    await writeFile(
      new URL(file.replace(/\.d\.ts$/, declarationExtension), dist),
      content
    );
  }
}
