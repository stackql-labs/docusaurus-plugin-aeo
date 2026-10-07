const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const injectAlternateLinks = require('../src/features/alternateLinks');

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
