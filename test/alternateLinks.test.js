const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const injectAlternateLinks = require('../src/features/alternateLinks');
const { tempDir, writeFiles, listFiles, HTML_PAGE } = require('./helpers/fixtures');

async function site(trailingSlash) {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aeo-'));
  const page = '<!doctype html><html><head><title>x</title></head><body>hi</body></html>';
  if (trailingSlash === false) {
    await fs.writeFile(path.join(outDir, 'index.html'), page);
    await fs.writeFile(path.join(outDir, 'intro.html'), page);
  } else {
    await fs.mkdir(path.join(outDir, 'intro'), { recursive: true });
    await fs.writeFile(path.join(outDir, 'index.html'), page);
    await fs.writeFile(path.join(outDir, 'intro', 'index.html'), page);
  }
  const props = { outDir, siteConfig: { url: 'https://example.com', trailingSlash } };
  const emittedCompanions = [{ permalink: '/' }, { permalink: '/intro' }, { permalink: '/missing' }];
  return { outDir, props, emittedCompanions };
}

test('inserts one alternate link per page before </head>, once, and skips pages with no HTML', async () => {
  const { outDir, props, emittedCompanions } = await site(false);
  const first = await injectAlternateLinks({ props, emittedCompanions, linkHeader: false });
  assert.deepEqual(first, { injected: 2, skipped: 1, headerRules: 0 });
  const html = await fs.readFile(path.join(outDir, 'intro.html'), 'utf8');
  assert.match(html, /<link rel="alternate" type="text\/markdown" href="https:\/\/example\.com\/intro\.md"><\/head>/);
  const home = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.match(home, /href="https:\/\/example\.com\/index\.md"/);
  const again = await injectAlternateLinks({ props, emittedCompanions, linkHeader: false });
  assert.equal(again.injected, 0);
  assert.equal((await fs.readFile(path.join(outDir, 'intro.html'), 'utf8')).match(/text\/markdown/g).length, 1);
});

test('trailingSlash true: /foo/index.html gets /foo/index.md', async () => {
  const { outDir, props, emittedCompanions } = await site(true);
  await injectAlternateLinks({ props, emittedCompanions, linkHeader: false });
  const html = await fs.readFile(path.join(outDir, 'intro', 'index.html'), 'utf8');
  assert.match(html, /href="https:\/\/example\.com\/intro\/index\.md"/);
});

test('localized build: baseUrl /de/ and outDir build/de, URLs keep the prefix and files do not', async () => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aeo-de-'));
  const page = '<!doctype html><html><head><title>x</title></head><body>hi</body></html>';
  await fs.writeFile(path.join(outDir, 'index.html'), page);
  await fs.writeFile(path.join(outDir, 'intro.html'), page);
  const props = { outDir, siteConfig: { url: 'https://example.com', baseUrl: '/de/', trailingSlash: false } };
  const emittedCompanions = [{ permalink: '/de/' }, { permalink: '/de/intro' }];
  const res = await injectAlternateLinks({ props, emittedCompanions, linkHeader: true });
  assert.deepEqual(res, { injected: 2, skipped: 0, headerRules: 2 });
  const html = await fs.readFile(path.join(outDir, 'intro.html'), 'utf8');
  assert.match(html, /href="https:\/\/example\.com\/de\/intro\.md"/);
  const home = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.match(home, /href="https:\/\/example\.com\/de\/index\.md"/);
  const headers = await fs.readFile(path.join(outDir, '_headers'), 'utf8');
  assert.match(headers, /^\/de\/intro\n  Link: <https:\/\/example\.com\/de\/intro\.md>/m);
  assert.match(headers, /^\/de\/\n  Link: <https:\/\/example\.com\/de\/index\.md>/m);
});

// A build directory holding the default locale and one sub-directory per
// other locale, each with the same two pages, as `docusaurus build` leaves
// it before postBuild.
async function localizedBuild(t, locales) {
  const build = await tempDir(t);
  const outDirs = {};
  for (const [locale, sub] of Object.entries(locales)) {
    outDirs[locale] = path.join(build, sub);
    await writeFiles(outDirs[locale], { 'index.html': HTML_PAGE, 'intro.html': HTML_PAGE });
  }
  return { build, outDirs };
}

// postBuild props for one locale of a site whose default locale is en.
function localeProps(outDir, currentLocale, baseUrl) {
  return {
    outDir,
    siteConfig: { url: 'https://example.com', baseUrl, trailingSlash: false },
    i18n: { defaultLocale: 'en', locales: ['en', 'de'], currentLocale },
  };
}

const pages = (base) => [{ permalink: base }, { permalink: `${base}intro` }];

test('several locales: every locale\'s rules go in the one _headers at the build root', async (t) => {
  const { build, outDirs } = await localizedBuild(t, { en: '', de: 'de' });
  await writeFiles(build, { _headers: '/*\n  X-Frame-Options: DENY\n' });
  // Docusaurus builds the default locale first.
  await injectAlternateLinks({ props: localeProps(outDirs.en, 'en', '/'), emittedCompanions: pages('/'), linkHeader: true });
  const res = await injectAlternateLinks({ props: localeProps(outDirs.de, 'de', '/de/'), emittedCompanions: pages('/de/'), linkHeader: true });
  assert.equal(res.headerRules, 2);

  // A host reads _headers from the root of the deployed directory only.
  assert.deepEqual((await listFiles(build)).filter((f) => f.endsWith('_headers')), ['_headers']);
  assert.equal(
    await fs.readFile(path.join(build, '_headers'), 'utf8'),
    `/*
  X-Frame-Options: DENY

# @stackql/docusaurus-plugin-aeo: .md companions as Link headers
/
  Link: <https://example.com/index.md>; rel="alternate"; type="text/markdown"
/intro
  Link: <https://example.com/intro.md>; rel="alternate"; type="text/markdown"

# @stackql/docusaurus-plugin-aeo: .md companions as Link headers
/de/
  Link: <https://example.com/de/index.md>; rel="alternate"; type="text/markdown"
/de/intro
  Link: <https://example.com/de/intro.md>; rel="alternate"; type="text/markdown"
`,
  );
});

test('several locales on a site with its own baseUrl: /docs/de/ is built into build/de', async (t) => {
  const { build, outDirs } = await localizedBuild(t, { en: '', de: 'de' });
  await injectAlternateLinks({ props: localeProps(outDirs.en, 'en', '/docs/'), emittedCompanions: pages('/docs/'), linkHeader: true });
  await injectAlternateLinks({ props: localeProps(outDirs.de, 'de', '/docs/de/'), emittedCompanions: pages('/docs/de/'), linkHeader: true });
  assert.deepEqual((await listFiles(build)).filter((f) => f.endsWith('_headers')), ['_headers']);
  const headers = await fs.readFile(path.join(build, '_headers'), 'utf8');
  assert.match(headers, /^\/docs\/intro\n  Link: <https:\/\/example\.com\/docs\/intro\.md>/m);
  assert.match(headers, /^\/docs\/de\/intro\n  Link: <https:\/\/example\.com\/docs\/de\/intro\.md>/m);
});

test('_headers stays in outDir when the build is its own root', async (t) => {
  const cases = [
    // a locale built on its own (`docusaurus build --locale de`): base URL /
    ['de', '/', 'out'],
    // a locale given a base URL that is not its name
    ['de', '/deutsch/', 'deutsch'],
    // the default locale, even when the directory is named like the base URL
    ['en', '/en/', 'en'],
    // a site built at a baseUrl named like its build directory
    ['en', '/build/', 'build'],
  ];
  for (const [locale, baseUrl, dir] of cases) {
    const root = await tempDir(t);
    const outDir = path.join(root, dir);
    await writeFiles(outDir, { 'index.html': HTML_PAGE, 'intro.html': HTML_PAGE });
    await injectAlternateLinks({ props: localeProps(outDir, locale, baseUrl), emittedCompanions: pages(baseUrl), linkHeader: true });
    assert.deepEqual((await listFiles(root)).filter((f) => f.endsWith('_headers')), [`${dir}/_headers`], `${locale} ${baseUrl}`);
  }
});

test('a rule already in _headers is not written twice', async (t) => {
  const { build, outDirs } = await localizedBuild(t, { en: '', de: 'de' });
  const run = async () => {
    await injectAlternateLinks({ props: localeProps(outDirs.en, 'en', '/'), emittedCompanions: pages('/'), linkHeader: true });
    await injectAlternateLinks({ props: localeProps(outDirs.de, 'de', '/de/'), emittedCompanions: pages('/de/'), linkHeader: true });
    return fs.readFile(path.join(build, '_headers'), 'utf8');
  };
  const first = await run();
  assert.equal(await run(), first);
  assert.equal(first.match(/^\/de\/intro$/gm).length, 1);
});

test('linkHeader writes Netlify _headers rules, appending to an existing file', async () => {
  const { outDir, props, emittedCompanions } = await site(false);
  await fs.writeFile(path.join(outDir, '_headers'), '/*\n  X-Frame-Options: DENY\n');
  const res = await injectAlternateLinks({ props, emittedCompanions, linkHeader: true });
  assert.equal(res.headerRules, 2);
  const headers = await fs.readFile(path.join(outDir, '_headers'), 'utf8');
  assert.equal(
    headers,
    `/*
  X-Frame-Options: DENY

# @stackql/docusaurus-plugin-aeo: .md companions as Link headers
/
  Link: <https://example.com/index.md>; rel="alternate"; type="text/markdown"
/intro
  Link: <https://example.com/intro.md>; rel="alternate"; type="text/markdown"
`,
  );
});
