const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const emitCompanions = require('../src/features/companions');
const { tempDir, writeFiles, listFiles, docsContent } = require('./helpers/fixtures');

const DOCS = 'docusaurus-plugin-content-docs';

// A site directory with the given sources and one docs instance, plus an
// empty outDir at `outRel` under a build root (Docusaurus builds a locale
// into build/<locale>).
async function site(t, { sources, docs, outRel = '' }) {
  const root = await tempDir(t);
  const siteDir = path.join(root, 'site');
  const outDir = path.join(root, 'build', outRel);
  await writeFiles(siteDir, sources);
  await fs.mkdir(outDir, { recursive: true });
  const loadedContentByPlugin = new Map([
    [`${DOCS}@default`, { pluginName: DOCS, pluginId: 'default', content: docsContent(docs) }],
  ]);
  return { root, siteDir, outDir, loadedContentByPlugin };
}

function emit({ siteDir, outDir, loadedContentByPlugin }, siteConfig, options = {}) {
  return emitCompanions({
    props: { outDir, siteDir, siteConfig: { url: 'https://example.com', ...siteConfig } },
    options: { format: 'plain', exclude: [], ...options },
    loadedContentByPlugin,
  });
}

const read = (dir, rel) => fs.readFile(path.join(dir, rel), 'utf8');

// What Docusaurus hands the plugin in the `de` build: permalinks under
// /de/, translated sources under i18n/de, and the default-locale source for
// a page with no translation.
const DE_SOURCES = {
  'docs/index.md': '# Home\n\nHello world.\n',
  'docs/intro.md': '# Intro\n\nGetting started.\n',
  'docs/untranslated.md': '# Reference\n\nEnglish only.\n',
  [`i18n/de/${DOCS}/current/index.md`]: '# Startseite\n\nHallo Welt.\n',
  [`i18n/de/${DOCS}/current/intro.md`]: '# Einleitung\n\nErste Schritte.\n',
};
const DE_DOCS = [
  { permalink: '/de/', source: `@site/i18n/de/${DOCS}/current/index.md`, title: 'Startseite', description: 'Die Startseite' },
  { permalink: '/de/docs/intro', source: `@site/i18n/de/${DOCS}/current/intro.md`, title: 'Einleitung', description: 'Der Einstieg' },
  { permalink: '/de/docs/untranslated', source: '@site/docs/untranslated.md', title: 'Reference', description: null },
];

test('localized build: companions go under outDir without the locale prefix, not build/de/de', async (t) => {
  const s = await site(t, { sources: DE_SOURCES, docs: DE_DOCS, outRel: 'de' });
  const emitted = await emit(s, { baseUrl: '/de/', trailingSlash: false });

  // The whole build tree: one file per page, nothing at de.md or de/de/.
  assert.deepEqual(await listFiles(path.join(s.root, 'build')), [
    'de/docs/intro.md',
    'de/docs/untranslated.md',
    'de/index.md',
  ]);

  // The emitted list keeps the full permalink (llms.txt and the alternate
  // links build URLs from it) and points at the file that was written.
  assert.deepEqual(
    emitted.map((e) => [e.permalink, path.relative(s.outDir, e.companionPath).split(path.sep).join('/')]),
    [
      ['/de/', 'index.md'],
      ['/de/docs/intro', 'docs/intro.md'],
      ['/de/docs/untranslated', 'docs/untranslated.md'],
    ],
  );
});

test('localized build: Source lines keep the locale prefix and the body is the translated source', async (t) => {
  const s = await site(t, { sources: DE_SOURCES, docs: DE_DOCS, outRel: 'de' });
  await emit(s, { baseUrl: '/de/', trailingSlash: false });

  assert.equal(
    await read(s.outDir, 'docs/intro.md'),
    '# Einleitung\n\n> Der Einstieg\n\nSource: https://example.com/de/docs/intro\n\nErste Schritte.\n',
  );
  // The localized home page is a root: its URL keeps the trailing slash.
  assert.equal(
    await read(s.outDir, 'index.md'),
    '# Startseite\n\n> Die Startseite\n\nSource: https://example.com/de/\n\nHallo Welt.\n',
  );
  // No translation: the default-locale source, still under the /de/ URL.
  assert.equal(
    await read(s.outDir, 'docs/untranslated.md'),
    '# Reference\n\nSource: https://example.com/de/docs/untranslated\n\nEnglish only.\n',
  );
});

test('localized build with trailingSlash true: /de/docs/intro -> docs/intro/index.md', async (t) => {
  const s = await site(t, { sources: DE_SOURCES, docs: DE_DOCS, outRel: 'de' });
  await emit(s, { baseUrl: '/de/', trailingSlash: true });
  assert.deepEqual(await listFiles(s.outDir), [
    'docs/intro/index.md',
    'docs/untranslated/index.md',
    'index.md',
  ]);
  assert.match(await read(s.outDir, 'docs/intro/index.md'), /^Source: https:\/\/example\.com\/de\/docs\/intro$/m);
});

test('raw format writes to the same place as plain', async (t) => {
  const s = await site(t, { sources: DE_SOURCES, docs: DE_DOCS, outRel: 'de' });
  await emit(s, { baseUrl: '/de/', trailingSlash: false }, { format: 'raw' });
  assert.deepEqual(await listFiles(s.outDir), ['docs/intro.md', 'docs/untranslated.md', 'index.md']);
  assert.equal(await read(s.outDir, 'docs/intro.md'), '# Einleitung\n\nErste Schritte.\n');
});

test('localized build: companions.exclude applies under the locale prefix', async (t) => {
  // The pattern a site writes for its default locale.
  const s = await site(t, { sources: DE_SOURCES, docs: DE_DOCS, outRel: 'de' });
  const emitted = await emit(s, { baseUrl: '/de/', trailingSlash: false }, { exclude: ['/docs/**'] });
  assert.deepEqual(await listFiles(s.outDir), ['index.md']);
  assert.deepEqual(emitted.map((e) => e.permalink), ['/de/']);
});

test('localized build: a pattern with the locale prefix excludes in that locale only', async (t) => {
  const exclude = ['/de/docs/untranslated'];
  const de = await site(t, { sources: DE_SOURCES, docs: DE_DOCS, outRel: 'de' });
  await emit(de, { baseUrl: '/de/', trailingSlash: false }, { exclude });
  assert.deepEqual(await listFiles(de.outDir), ['docs/intro.md', 'index.md']);

  const en = await site(t, {
    sources: DE_SOURCES,
    docs: [{ permalink: '/docs/untranslated', source: '@site/docs/untranslated.md', title: 'Reference' }],
  });
  await emit(en, { baseUrl: '/', trailingSlash: false }, { exclude });
  assert.deepEqual(await listFiles(en.outDir), ['docs/untranslated.md']);
});

test('non-root baseUrl: companions.exclude matches with or without the base URL', async (t) => {
  const sources = { 'docs/index.md': '# Home\n\nHello.\n', 'docs/guide/setup.md': '# Setup\n\nSteps.\n' };
  const docs = [
    { permalink: '/docs/', source: '@site/docs/index.md', title: 'Home' },
    { permalink: '/docs/guide/setup', source: '@site/docs/guide/setup.md', title: 'Setup' },
  ];
  for (const exclude of [['/docs/guide/**'], ['/guide/**']]) {
    const s = await site(t, { sources, docs });
    await emit(s, { baseUrl: '/docs/', trailingSlash: false }, { exclude });
    assert.deepEqual(await listFiles(s.outDir), ['index.md'], exclude[0]);
  }
});

test('non-root baseUrl that is not a locale: /docs/guide/setup -> guide/setup.md', async (t) => {
  const s = await site(t, {
    sources: { 'docs/index.md': '# Home\n\nHello.\n', 'docs/guide/setup.md': '# Setup\n\nSteps.\n' },
    docs: [
      { permalink: '/docs/', source: '@site/docs/index.md', title: 'Home' },
      { permalink: '/docs/guide/setup', source: '@site/docs/guide/setup.md', title: 'Setup' },
    ],
  });
  await emit(s, { baseUrl: '/docs/', trailingSlash: false });
  assert.deepEqual(await listFiles(s.outDir), ['guide/setup.md', 'index.md']);
  assert.match(await read(s.outDir, 'guide/setup.md'), /^Source: https:\/\/example\.com\/docs\/guide\/setup$/m);
  assert.match(await read(s.outDir, 'index.md'), /^Source: https:\/\/example\.com\/docs\/$/m);
});

test('root baseUrl is unchanged: /docs/intro -> docs/intro.md, / -> index.md', async (t) => {
  const docs = [
    { permalink: '/', source: '@site/docs/index.md', title: 'Home' },
    { permalink: '/docs/intro', source: '@site/docs/intro.md', title: 'Intro' },
  ];
  const sources = { 'docs/index.md': '# Home\n\nHello.\n', 'docs/intro.md': '# Intro\n\nStart.\n' };
  for (const baseUrl of ['/', undefined]) {
    const s = await site(t, { sources, docs });
    await emit(s, { baseUrl, trailingSlash: false });
    assert.deepEqual(await listFiles(s.outDir), ['docs/intro.md', 'index.md']);
    assert.match(await read(s.outDir, 'docs/intro.md'), /^Source: https:\/\/example\.com\/docs\/intro$/m);
    assert.match(await read(s.outDir, 'index.md'), /^Source: https:\/\/example\.com\/$/m);
  }
});
