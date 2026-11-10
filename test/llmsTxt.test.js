const test = require('node:test');
const assert = require('node:assert/strict');
const { renderLlmsTxt, fullTxtBlock, fullTxtOptions, buildSections } = require('../src/features/llmsTxt');

const siteConfig = { title: 'Site', tagline: 'A tagline', url: 'https://example.com' };
const items = [
  { permalink: '/', title: 'Home', description: 'The home page', kind: 'docs', pluginName: 'docusaurus-plugin-content-docs', pluginId: 'default' },
  { permalink: '/docs/intro', title: 'Intro', description: 'Start here', kind: 'docs', pluginName: 'docusaurus-plugin-content-docs', pluginId: 'default' },
  { permalink: '/blog/post/', title: 'Post', description: null, kind: 'blog', pluginName: 'docusaurus-plugin-content-blog', pluginId: 'default' },
];
const options = { sections: { docs: 'Documentation', blog: 'Blog', pages: 'Pages' }, instanceSections: null, header: null, fullTxt: true, linkFullTxt: true };

test('llms.txt has absolute companion links, sections, and an Optional section for llms-full.txt', () => {
  const sections = buildSections(items, options, false);
  const txt = renderLlmsTxt({ siteConfig, siteUrl: siteConfig.url, trailingSlash: false, sections, options, companionsEnabled: true });
  assert.equal(
    txt,
    `# Site

> A tagline

## Documentation

- [Home](https://example.com/index.md): The home page
- [Intro](https://example.com/docs/intro.md): Start here

## Blog

- [Post](https://example.com/blog/post.md): A tagline

## Optional

- [Full text of every page](https://example.com/llms-full.txt): one file with the content of every page listed above
`,
  );
});

test('the Optional section is omitted when fullTxt is off, linkFullTxt is false, or companions are disabled', () => {
  const sections = buildSections(items, options, false);
  for (const o of [{ ...options, fullTxt: false }, { ...options, linkFullTxt: false }]) {
    const txt = renderLlmsTxt({ siteConfig, siteUrl: siteConfig.url, trailingSlash: false, sections, options: o, companionsEnabled: true });
    assert.doesNotMatch(txt, /Optional/);
  }
  const txt = renderLlmsTxt({ siteConfig, siteUrl: siteConfig.url, trailingSlash: false, sections, options, companionsEnabled: false });
  assert.doesNotMatch(txt, /Optional/);
  assert.match(txt, /\(https:\/\/example\.com\/docs\/intro\)/); // page links when there are no companions
});

test('fullTxtBlock adds title and Source only when the body lacks them', () => {
  const item = { permalink: '/docs/intro/', title: 'Intro' };
  assert.equal(
    fullTxtBlock({ body: 'Raw body.\n', item, siteUrl: 'https://example.com' }),
    '# Intro\n\nSource: https://example.com/docs/intro\n\nRaw body.\n',
  );
  const plain = '# Intro\n\n> Start here\n\nSource: https://example.com/docs/intro\n\nBody.\n';
  assert.equal(fullTxtBlock({ body: plain, item, siteUrl: 'https://example.com' }), plain);
});

// A localized build: siteConfig.baseUrl is /de/ and every permalink is
// under it.
const deSiteConfig = { ...siteConfig, baseUrl: '/de/' };
const deItems = items.map((item) => ({ ...item, permalink: `/de${item.permalink}` }));

test('localized build: llms.txt links carry the locale prefix and point at /de/llms-full.txt', () => {
  const sections = buildSections(deItems, options, false);
  const txt = renderLlmsTxt({ siteConfig: deSiteConfig, siteUrl: deSiteConfig.url, trailingSlash: false, sections, options, companionsEnabled: true });
  assert.equal(
    txt,
    `# Site

> A tagline

## Documentation

- [Home](https://example.com/de/index.md): The home page
- [Intro](https://example.com/de/docs/intro.md): Start here

## Blog

- [Post](https://example.com/de/blog/post.md): A tagline

## Optional

- [Full text of every page](https://example.com/de/llms-full.txt): one file with the content of every page listed above
`,
  );
});

test('localized build with trailingSlash true: the localized home is /de/index.md, pages are /de/foo/index.md', () => {
  const sections = buildSections(deItems, options, false);
  const txt = renderLlmsTxt({ siteConfig: deSiteConfig, siteUrl: deSiteConfig.url, trailingSlash: true, sections, options, companionsEnabled: true });
  assert.match(txt, /\[Home\]\(https:\/\/example\.com\/de\/index\.md\)/);
  assert.match(txt, /\[Intro\]\(https:\/\/example\.com\/de\/docs\/intro\/index\.md\)/);
  assert.match(txt, /\[Post\]\(https:\/\/example\.com\/de\/blog\/post\/index\.md\)/);
});

test('localized build with companions disabled: page links carry the locale prefix', () => {
  const sections = buildSections(deItems, options, false);
  const txt = renderLlmsTxt({ siteConfig: deSiteConfig, siteUrl: deSiteConfig.url, trailingSlash: false, sections, options, companionsEnabled: false });
  assert.match(txt, /\[Home\]\(https:\/\/example\.com\/de\/\)/);
  assert.match(txt, /\[Intro\]\(https:\/\/example\.com\/de\/docs\/intro\)/);
  assert.doesNotMatch(txt, /Optional/);
});

test('fullTxtBlock with a base URL: Source keeps the prefix, the localized home keeps its slash', () => {
  const siteUrl = 'https://example.com';
  assert.equal(
    fullTxtBlock({ body: 'Raw body.\n', item: { permalink: '/de/docs/intro/', title: 'Intro' }, siteUrl, baseUrl: '/de/' }),
    '# Intro\n\nSource: https://example.com/de/docs/intro\n\nRaw body.\n',
  );
  assert.equal(
    fullTxtBlock({ body: 'Raw body.\n', item: { permalink: '/de/', title: 'Home' }, siteUrl, baseUrl: '/de/' }),
    '# Home\n\nSource: https://example.com/de/\n\nRaw body.\n',
  );
});

test('fullTxtOptions normalises the boolean and object forms', () => {
  assert.equal(fullTxtOptions(false), null);
  assert.deepEqual(fullTxtOptions(true), { include: null, maxBytes: null });
  assert.deepEqual(fullTxtOptions({ include: ['docusaurus-plugin-content-docs@ai'], maxBytes: 65536 }), {
    include: ['docusaurus-plugin-content-docs@ai'],
    maxBytes: 65536,
  });
  assert.deepEqual(fullTxtOptions({}), { include: null, maxBytes: null });
});
