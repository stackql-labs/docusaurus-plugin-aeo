const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, validateAiRoutes } = require('../src/features/aiRoutes');
const { docsContent } = require('./helpers/fixtures');

test('classify maps every how-to directory spelling to howTo', () => {
  for (const dir of ['howto', 'howtos', 'how-to', 'how-tos']) {
    assert.equal(classify(`/ai/${dir}/authenticate`), 'howTo', dir);
  }
  assert.equal(classify('/ai/faqs/x'), 'faq');
  assert.equal(classify('/ai/concepts/x'), null);
  assert.equal(classify('/docs/x'), null);
});

test('classify is relative to the base URL: a locale prefix or a non-root baseUrl', () => {
  assert.equal(classify('/de/ai/faqs/x', '/de/'), 'faq');
  assert.equal(classify('/de/ai/how-tos/x', '/de/'), 'howTo');
  assert.equal(classify('/docs/ai/apps/x', '/docs/'), 'softwareApplication');
  assert.equal(classify('/docs/de/ai/faqs/x', '/docs/de/'), 'faq');
  // /ai/ has to follow the base directly
  assert.equal(classify('/de/docs/ai/faqs/x', '/de/'), null);
  assert.equal(classify('/de/ai/concepts/x', '/de/'), null);
  // without the base URL the route is not under /ai/
  assert.equal(classify('/de/ai/faqs/x'), null);
  // the root base changes nothing
  assert.equal(classify('/ai/faqs/x', '/'), 'faq');
  assert.equal(classify('/ai/', '/'), null);
  assert.equal(classify('/ai', '/'), null);
});

// The warnings validateAiRoutes logs for one docs instance.
function warnings(t, { docs, baseUrl }) {
  const DOCS = 'docusaurus-plugin-content-docs';
  const warn = t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'log', () => {});
  validateAiRoutes({
    loadedContentByPlugin: new Map([[`${DOCS}@ai`, { pluginName: DOCS, pluginId: 'ai', content: docsContent(docs) }]]),
    baseUrl,
    verbose: true,
  });
  return warn.mock.calls.flatMap((call) => String(call.arguments[0]).split('\n'));
}

test('validation reports a page under /ai/ that lacks its payload, at the root base URL', (t) => {
  const out = warnings(t, {
    baseUrl: '/',
    docs: [
      { permalink: '/ai/faqs/install', source: '@site/ai/faqs/install.md' },
      { permalink: '/ai/faqs/pricing', source: '@site/ai/faqs/pricing.md', frontMatter: { faq: { q: 'x' } } },
      { permalink: '/ai/concepts/sql', source: '@site/ai/concepts/sql.md' },
    ],
  });
  assert.deepEqual(out, [
    '[plugin-aeo] aiRoutes: /ai/faqs/install is missing required frontmatter "faq" (source: @site/ai/faqs/install.md)',
  ]);
});

test('validation covers a localized build and a non-root baseUrl', (t) => {
  const de = warnings(t, {
    baseUrl: '/de/',
    docs: [
      { permalink: '/de/ai/faqs/install', source: '@site/i18n/de/ai/faqs/install.md' },
      { permalink: '/de/ai/howto/connect', source: '@site/i18n/de/ai/howto/connect.md', frontMatter: { howTo: { name: 'x' } } },
    ],
  });
  assert.equal(de.length, 1);
  assert.match(de[0], /\/de\/ai\/faqs\/install is missing required frontmatter "faq"/);

  t.mock.restoreAll();
  const docs = warnings(t, {
    baseUrl: '/docs/',
    docs: [{ permalink: '/docs/ai/apps/cli', source: '@site/ai/apps/cli.md' }],
  });
  assert.equal(docs.length, 1);
  assert.match(docs[0], /\/docs\/ai\/apps\/cli is missing required frontmatter "softwareApplication"/);
});
