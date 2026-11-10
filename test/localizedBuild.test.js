// The plugin driven the way Docusaurus drives it on a site with i18n: one
// run per locale, each with its own siteConfig.baseUrl and outDir
// (build for the default locale, build/<locale> for the others), through
// the plugin's own hooks rather than the feature functions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const pluginAeo = require('../src/index');
const { tempDir, writeFiles, listFiles, docsContent, HTML_PAGE } = require('./helpers/fixtures');

const DOCS = 'docusaurus-plugin-content-docs';

const SOURCES = {
  'docs/index.md': '# Home\n\nHello world.\n',
  'docs/intro.md': '# Intro\n\nGetting started.\n',
  [`i18n/de/${DOCS}/current/index.md`]: '# Startseite\n\nHallo Welt.\n',
  [`i18n/de/${DOCS}/current/intro.md`]: '# Einleitung\n\nErste Schritte.\n',
};

const LOCALES = {
  en: {
    baseUrl: '/',
    outRel: '',
    docs: [
      { permalink: '/', source: '@site/docs/index.md', title: 'Home', description: 'The home page' },
      { permalink: '/docs/intro', source: '@site/docs/intro.md', title: 'Intro', description: 'Start here' },
    ],
  },
  de: {
    baseUrl: '/de/',
    outRel: 'de',
    docs: [
      { permalink: '/de/', source: `@site/i18n/de/${DOCS}/current/index.md`, title: 'Startseite', description: 'Die Startseite' },
      { permalink: '/de/docs/intro', source: `@site/i18n/de/${DOCS}/current/intro.md`, title: 'Einleitung', description: 'Der Einstieg' },
    ],
  },
};

// One locale's build: Docusaurus has written the HTML, then the plugin's
// hooks run. The context is what Docusaurus passes for that locale, to the
// plugin constructor and again (with more) to postBuild. `aiDocs` adds a
// second docs instance with the id `ai`. Returns the global data the theme
// reads.
async function buildLocale(root, locale, pluginOptions, aiDocs) {
  const { baseUrl, outRel, docs } = LOCALES[locale];
  const outDir = path.join(root, 'build', outRel);
  await writeFiles(outDir, { 'index.html': HTML_PAGE, 'docs/intro.html': HTML_PAGE });
  const context = {
    siteDir: path.join(root, 'site'),
    outDir,
    baseUrl,
    siteConfig: { title: 'Site', tagline: 'A tagline', url: 'https://example.com', baseUrl, trailingSlash: false },
    i18n: { defaultLocale: 'en', locales: Object.keys(LOCALES), currentLocale: locale },
  };

  const plugin = pluginAeo(context, pluginOptions);
  const globalData = {};
  const actions = { setGlobalData: async (data) => Object.assign(globalData, data) };
  const instances = { default: docsContent(docs) };
  if (aiDocs) instances.ai = docsContent(aiDocs[locale]);
  await plugin.contentLoaded({ actions });
  await plugin.allContentLoaded({ allContent: { [DOCS]: instances }, actions });
  await plugin.postBuild(context);
  return globalData;
}

// The default locale first, as Docusaurus builds them.
async function buildSite(t, pluginOptions, aiDocs) {
  const root = await tempDir(t);
  await writeFiles(path.join(root, 'site'), SOURCES);
  const globalData = {};
  for (const locale of Object.keys(LOCALES)) {
    globalData[locale] = await buildLocale(root, locale, pluginOptions, aiDocs);
  }
  const build = path.join(root, 'build');
  return { build, globalData, read: (rel) => fs.readFile(path.join(build, rel), 'utf8') };
}

test('en + de site, no plugin options: each locale gets its own companions, llms.txt and llms-full.txt', async (t) => {
  const { build } = await buildSite(t, undefined);
  assert.deepEqual(await listFiles(build), [
    'de/docs/intro.html',
    'de/docs/intro.md',
    'de/index.html',
    'de/index.md',
    'de/llms-full.txt',
    'de/llms.txt',
    'docs/intro.html',
    'docs/intro.md',
    'index.html',
    'index.md',
    'llms-full.txt',
    'llms.txt',
  ]);
});

test('en + de site: /de/llms.txt and /de/llms-full.txt come from the translated sources with /de/ URLs', async (t) => {
  const { read } = await buildSite(t, undefined);
  assert.equal(
    await read('de/llms.txt'),
    `# Site

> A tagline

## Documentation

- [Startseite](https://example.com/de/index.md): Die Startseite
- [Einleitung](https://example.com/de/docs/intro.md): Der Einstieg

## Optional

- [Full text of every page](https://example.com/de/llms-full.txt): one file with the content of every page listed above
`,
  );
  assert.equal(
    await read('de/llms-full.txt'),
    `## Documentation

# Startseite

> Die Startseite

Source: https://example.com/de/

Hallo Welt.

---

# Einleitung

> Der Einstieg

Source: https://example.com/de/docs/intro

Erste Schritte.
`,
  );
});

test('en + de site with raw companions: llms-full.txt adds the Source lines, with the locale prefix', async (t) => {
  // A raw companion has no Source line of its own, so llms-full.txt writes
  // one; the localized home page keeps its trailing slash there too.
  const { read } = await buildSite(t, { companions: { format: 'raw' } });
  assert.equal(await read('de/index.md'), '# Startseite\n\nHallo Welt.\n');
  assert.equal(
    await read('de/llms-full.txt'),
    `## Documentation

Source: https://example.com/de/

# Startseite

Hallo Welt.

---

Source: https://example.com/de/docs/intro

# Einleitung

Erste Schritte.
`,
  );
});

test('en + de site: the default locale is untouched by the de build', async (t) => {
  const { read } = await buildSite(t, undefined);
  const llms = await read('llms.txt');
  assert.match(llms, /\[Intro\]\(https:\/\/example\.com\/docs\/intro\.md\): Start here/);
  assert.match(llms, /\(https:\/\/example\.com\/llms-full\.txt\)/);
  assert.doesNotMatch(llms, /\/de\//);
  assert.doesNotMatch(await read('llms-full.txt'), /\/de\/|Hallo|Erste Schritte/);
  assert.equal(
    await read('docs/intro.md'),
    '# Intro\n\n> Start here\n\nSource: https://example.com/docs/intro\n\nGetting started.\n',
  );
});

test('en + de site: every page links its own locale\'s companion', async (t) => {
  const { read } = await buildSite(t, undefined);
  const link = (href) => `<link rel="alternate" type="text/markdown" href="${href}"></head>`;
  assert.ok((await read('index.html')).includes(link('https://example.com/index.md')));
  assert.ok((await read('docs/intro.html')).includes(link('https://example.com/docs/intro.md')));
  assert.ok((await read('de/index.html')).includes(link('https://example.com/de/index.md')));
  assert.ok((await read('de/docs/intro.html')).includes(link('https://example.com/de/docs/intro.md')));
});

test('en + de site with linkHeader: one _headers at the build root carries both locales', async (t) => {
  const { build, read } = await buildSite(t, { companions: { linkHeader: true } });
  assert.deepEqual((await listFiles(build)).filter((f) => f.endsWith('_headers')), ['_headers']);
  assert.equal(
    await read('_headers'),
    `# @stackql/docusaurus-plugin-aeo: .md companions as Link headers
/
  Link: <https://example.com/index.md>; rel="alternate"; type="text/markdown"
/docs/intro
  Link: <https://example.com/docs/intro.md>; rel="alternate"; type="text/markdown"

# @stackql/docusaurus-plugin-aeo: .md companions as Link headers
/de/
  Link: <https://example.com/de/index.md>; rel="alternate"; type="text/markdown"
/de/docs/intro
  Link: <https://example.com/de/docs/intro.md>; rel="alternate"; type="text/markdown"
`,
  );
});

test('en + de site: the Ask AI button is told which routes have a companion, per locale', async (t) => {
  const { globalData } = await buildSite(t, undefined);
  assert.deepEqual(globalData.en.companionRoutes, ['/', '/docs/intro']);
  assert.deepEqual(globalData.de.companionRoutes, ['/de/', '/de/docs/intro']);
});

// The same plugin options are used for every locale's build, so a route
// pattern has to mean the same page in each of them.

test('en + de site: companions.exclude written for the default locale applies to every locale', async (t) => {
  const { build, globalData, read } = await buildSite(t, { companions: { exclude: ['/docs/**'] } });
  assert.deepEqual((await listFiles(build)).filter((f) => f.endsWith('.md')), ['de/index.md', 'index.md']);
  // No companion: not in llms.txt, no alternate link, no Ask AI button.
  assert.doesNotMatch(await read('llms.txt'), /Intro/);
  assert.doesNotMatch(await read('de/llms.txt'), /Einleitung/);
  assert.equal(await read('de/docs/intro.html'), HTML_PAGE);
  assert.equal(await read('docs/intro.html'), HTML_PAGE);
  assert.deepEqual(globalData.en.companionRoutes, ['/']);
  assert.deepEqual(globalData.de.companionRoutes, ['/de/']);
});

test('en + de site: a pattern with the locale prefix applies to that locale only', async (t) => {
  const { build, globalData } = await buildSite(t, { companions: { exclude: ['/de/docs/**'] } });
  assert.deepEqual((await listFiles(build)).filter((f) => f.endsWith('.md')), ['de/index.md', 'docs/intro.md', 'index.md']);
  assert.deepEqual(globalData.en.companionRoutes, ['/', '/docs/intro']);
  assert.deepEqual(globalData.de.companionRoutes, ['/de/']);
});

test('en + de site: llmsTxt.exclude and llmsTxt.include apply to every locale', async (t) => {
  const excluded = await buildSite(t, { llmsTxt: { exclude: ['/docs/intro'] } });
  // The companion is still written; only the llms files leave the page out.
  assert.equal((await listFiles(excluded.build)).filter((f) => f.endsWith('intro.md')).length, 2);
  for (const [file, home, intro] of [['llms.txt', 'Home', 'Intro'], ['de/llms.txt', 'Startseite', 'Einleitung']]) {
    const txt = await excluded.read(file);
    assert.match(txt, new RegExp(`\\[${home}\\]`), file);
    assert.doesNotMatch(txt, new RegExp(`\\[${intro}\\]`), file);
  }
  assert.doesNotMatch(await excluded.read('de/llms-full.txt'), /Einleitung/);

  const included = await buildSite(t, { llmsTxt: { include: ['/docs/**'] } });
  for (const [file, home, intro] of [['llms.txt', 'Home', 'Intro'], ['de/llms.txt', 'Startseite', 'Einleitung']]) {
    const txt = await included.read(file);
    assert.doesNotMatch(txt, new RegExp(`\\[${home}\\]`), file);
    assert.match(txt, new RegExp(`\\[${intro}\\]`), file);
  }
});

test('en + de site: aiRoutes.validate checks /ai/* in every locale', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'log', () => {});
  await buildSite(t, { aiRoutes: { validate: true }, verbose: true }, {
    en: [{ permalink: '/ai/faqs/install', source: '@site/ai/faqs/install.md' }],
    de: [{ permalink: '/de/ai/faqs/install', source: '@site/i18n/de/ai/faqs/install.md' }],
  });
  const reported = warn.mock.calls
    .map((call) => String(call.arguments[0]))
    .filter((line) => line.includes('aiRoutes'))
    .map((line) => line.match(/aiRoutes: (\S+) is missing required frontmatter "faq"/)?.[1]);
  assert.deepEqual(reported, ['/ai/faqs/install', '/de/ai/faqs/install']);
});
