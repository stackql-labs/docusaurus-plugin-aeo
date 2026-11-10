// The config-time helpers exported as "@stackql/docusaurus-plugin-aeo/helpers".
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AI_ROUTE_PATTERNS,
  aiRoutePatterns,
  sitemapExclude,
  isAiRoute,
  buildStructuredDataAiExcludes,
} = require('../src/helpers');
const { matchAny } = require('../src/routeGlob');

test('without a base URL the helpers describe /ai/* at the site root', () => {
  assert.deepEqual(AI_ROUTE_PATTERNS, ['/ai', '/ai/**']);
  assert.deepEqual(aiRoutePatterns(), ['/ai', '/ai/**']);
  assert.deepEqual(aiRoutePatterns('/'), ['/ai', '/ai/**']);
  assert.deepEqual(sitemapExclude, { ignorePatterns: ['/ai', '/ai/**'] });
  assert.equal(isAiRoute('/ai/faqs/x'), true);
  assert.equal(isAiRoute('/ai/'), true);
  assert.equal(isAiRoute('/ai'), false);
  assert.equal(isAiRoute('/docs/ai/x'), false);
  assert.equal(isAiRoute(undefined), false);
  assert.deepEqual(buildStructuredDataAiExcludes(['/', '/ai/faqs/x', '/docs/intro']), ['/ai/faqs/x', '/ai']);
  assert.deepEqual(buildStructuredDataAiExcludes(null), []);
});

test('aiRoutePatterns puts the convention under a base URL', () => {
  assert.deepEqual(aiRoutePatterns('/de/'), ['/de/ai', '/de/ai/**']);
  assert.deepEqual(aiRoutePatterns('/de'), ['/de/ai', '/de/ai/**']);
  assert.deepEqual(aiRoutePatterns('/docs/de/'), ['/docs/de/ai', '/docs/de/ai/**']);
});

test('one pattern list can cover every locale of a site', () => {
  const patterns = ['/', '/de/'].flatMap(aiRoutePatterns);
  assert.deepEqual(patterns, ['/ai', '/ai/**', '/de/ai', '/de/ai/**']);
  for (const route of ['/ai', '/ai/faqs/x', '/de/ai', '/de/ai/faqs/x']) {
    assert.equal(matchAny(route, patterns), true, route);
  }
  for (const route of ['/', '/de/', '/docs/ai/x', '/de/docs/intro', '/fr/ai/faqs/x']) {
    assert.equal(matchAny(route, patterns), false, route);
  }
});

test('isAiRoute and buildStructuredDataAiExcludes take the base URL', () => {
  assert.equal(isAiRoute('/de/ai/faqs/x', '/de/'), true);
  assert.equal(isAiRoute('/de/ai', '/de/'), false);
  assert.equal(isAiRoute('/de/docs/intro', '/de/'), false);
  assert.equal(isAiRoute('/docs/ai/faqs/x', '/docs/'), true);
  // a route outside the base URL is read as it stands
  assert.equal(isAiRoute('/ai/faqs/x', '/de/'), true);
  assert.equal(isAiRoute('/fr/ai/faqs/x', '/de/'), false);
  assert.deepEqual(
    buildStructuredDataAiExcludes(['/de/', '/de/ai/faqs/x', '/de/docs/intro'], '/de/'),
    ['/de/ai/faqs/x', '/de/ai'],
  );
});
