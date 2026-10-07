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

test('fullTxtOptions normalises the boolean and object forms', () => {
  assert.equal(fullTxtOptions(false), null);
  assert.deepEqual(fullTxtOptions(true), { include: null, maxBytes: null });
  assert.deepEqual(fullTxtOptions({ include: ['docusaurus-plugin-content-docs@ai'], maxBytes: 65536 }), {
    include: ['docusaurus-plugin-content-docs@ai'],
    maxBytes: 65536,
  });
  assert.deepEqual(fullTxtOptions({}), { include: null, maxBytes: null });
});
