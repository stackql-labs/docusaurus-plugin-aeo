const test = require('node:test');
const assert = require('node:assert/strict');
const { matchAny, matchesRoute } = require('../src/routeGlob');
const { stripBase } = require('../src/companionPath');

test('globs: ** crosses segments, * and ? stay within one', () => {
  assert.equal(matchAny('/blog/tags/a/b', ['/blog/tags/**']), true);
  assert.equal(matchAny('/blog/tags', ['/blog/tags/**']), false);
  assert.equal(matchAny('/blog/a', ['/blog/*']), true);
  assert.equal(matchAny('/blog/a/b', ['/blog/*']), false);
  assert.equal(matchAny('/v1', ['/v?']), true);
  assert.equal(matchAny('/v12', ['/v?']), false);
  assert.equal(matchAny('/search', ['/404', '/search']), true);
  assert.equal(matchAny('/a.b', ['/a.b']), true);
  assert.equal(matchAny('/axb', ['/a.b']), false);
  assert.equal(matchAny('/search', []), false);
  assert.equal(matchAny('/search', null), false);
});

test('stripBase removes the base URL and leaves the rest of the route alone', () => {
  assert.equal(stripBase('/de/blog/post', '/de/'), '/blog/post');
  assert.equal(stripBase('/de/blog/post/', '/de/'), '/blog/post/');
  assert.equal(stripBase('/de/', '/de/'), '/');
  assert.equal(stripBase('/de', '/de/'), '/');
  assert.equal(stripBase('/docs/de/intro', '/docs/de/'), '/intro');
  // not under the base
  assert.equal(stripBase('/de-fr/intro', '/de/'), '/de-fr/intro');
  assert.equal(stripBase('/intro', '/de/'), '/intro');
  // the root base changes nothing
  assert.equal(stripBase('/blog/post/', '/'), '/blog/post/');
  assert.equal(stripBase('/blog/post', undefined), '/blog/post');
});

test('at the root base URL a pattern matches the permalink, as before', () => {
  for (const baseUrl of ['/', undefined]) {
    assert.equal(matchesRoute('/blog/tags/x', ['/blog/tags/**'], baseUrl), true);
    assert.equal(matchesRoute('/docs/intro', ['/blog/tags/**'], baseUrl), false);
  }
});

test('in a localized build the same pattern matches the route under the locale prefix', () => {
  assert.equal(matchesRoute('/de/blog/tags/x', ['/blog/tags/**'], '/de/'), true);
  assert.equal(matchesRoute('/de/search', ['/search'], '/de/'), true);
  assert.equal(matchesRoute('/de/', ['/'], '/de/'), true);
  assert.equal(matchesRoute('/de/docs/intro', ['/blog/tags/**'], '/de/'), false);
  // only the base is removed: /de-fr is another route, not the de locale
  assert.equal(matchesRoute('/de-fr/search', ['/search'], '/de/'), false);
});

test('a pattern that spells the base URL out still matches, and can single out one locale', () => {
  assert.equal(matchesRoute('/de/blog/post', ['/de/blog/**'], '/de/'), true);
  assert.equal(matchesRoute('/blog/post', ['/de/blog/**'], '/'), false);
  assert.equal(matchesRoute('/fr/blog/post', ['/de/blog/**'], '/fr/'), false);
});

test('a site built at a non-root baseUrl: patterns work with or without it', () => {
  assert.equal(matchesRoute('/docs/guide/setup', ['/docs/guide/**'], '/docs/'), true);
  assert.equal(matchesRoute('/docs/guide/setup', ['/guide/**'], '/docs/'), true);
  assert.equal(matchesRoute('/docs/de/guide/setup', ['/guide/**'], '/docs/de/'), true);
  assert.equal(matchesRoute('/docs/guide/setup', ['/other/**'], '/docs/'), false);
});

test('a trailing slash on the route is kept, so a pattern can tell /foo from /foo/', () => {
  assert.equal(matchesRoute('/de/blog/post/', ['/blog/post/'], '/de/'), true);
  assert.equal(matchesRoute('/de/blog/post/', ['/blog/post'], '/de/'), false);
});
