const test = require('node:test');
const assert = require('node:assert/strict');
const { companionPath, companionUrl, normalizeRoute } = require('../src/companionPath');

test('normalizeRoute strips trailing slashes and keeps the root', () => {
  assert.equal(normalizeRoute('/'), '/');
  assert.equal(normalizeRoute(''), '/');
  assert.equal(normalizeRoute('/foo/'), '/foo');
  assert.equal(normalizeRoute('/foo//'), '/foo');
  assert.equal(normalizeRoute('/foo/bar'), '/foo/bar');
});

test('companionPath mirrors the HTML layout for trailingSlash: false', () => {
  assert.equal(companionPath('/', false), '/index.md');
  assert.equal(companionPath('/foo', false), '/foo.md');
  assert.equal(companionPath('/foo/', false), '/foo.md');
  assert.equal(companionPath('/docs/intro', false), '/docs/intro.md');
});

test('companionPath mirrors the HTML layout for trailingSlash: true / undefined', () => {
  for (const ts of [true, undefined]) {
    assert.equal(companionPath('/', ts), '/index.md');
    assert.equal(companionPath('/foo', ts), '/foo/index.md');
    assert.equal(companionPath('/foo/', ts), '/foo/index.md');
  }
});

test('companionUrl is absolute and never produces https://site.md', () => {
  assert.equal(companionUrl('https://stackql.io', '/', false), 'https://stackql.io/index.md');
  assert.equal(companionUrl('https://stackql.io/', '/', false), 'https://stackql.io/index.md');
  assert.equal(companionUrl('https://stackql.io', '/mcp', false), 'https://stackql.io/mcp.md');
  assert.equal(companionUrl('https://stackql.io', '/mcp/', undefined), 'https://stackql.io/mcp/index.md');
});

const { htmlPath, pageUrl } = require('../src/companionPath');

test('htmlPath mirrors Docusaurus output naming', () => {
  assert.equal(htmlPath('/', false), '/index.html');
  assert.equal(htmlPath('/foo', false), '/foo.html');
  assert.equal(htmlPath('/ai/', false), '/ai.html');
  assert.equal(htmlPath('/foo', true), '/foo/index.html');
  assert.equal(htmlPath('/foo/', undefined), '/foo/index.html');
});

test('pageUrl is canonical: no trailing slash except on the root', () => {
  assert.equal(pageUrl('https://stackql.io/', '/'), 'https://stackql.io/');
  assert.equal(pageUrl('https://stackql.io', '/ai/'), 'https://stackql.io/ai');
  assert.equal(pageUrl('https://stackql.io', '/docs/intro'), 'https://stackql.io/docs/intro');
});

test('with a base URL the base is a root: /de/ -> /de/index.md, /de/intro -> /de/intro.md', () => {
  assert.equal(companionPath('/de/', false, '/de/'), '/de/index.md');
  assert.equal(companionPath('/de', false, '/de/'), '/de/index.md');
  assert.equal(companionPath('/de/intro', false, '/de/'), '/de/intro.md');
  assert.equal(companionPath('/de/intro', true, '/de/'), '/de/intro/index.md');
  assert.equal(companionUrl('https://stackql.io', '/de/', false, '/de/'), 'https://stackql.io/de/index.md');
  assert.equal(htmlPath('/de/', false, '/de/'), '/de/index.html');
  assert.equal(htmlPath('/de/intro', false, '/de/'), '/de/intro.html');
  assert.equal(pageUrl('https://stackql.io', '/de/', '/de/'), 'https://stackql.io/de/');
  assert.equal(pageUrl('https://stackql.io', '/de/intro', '/de/'), 'https://stackql.io/de/intro');
  // the default base changes nothing
  assert.equal(companionPath('/', false, '/'), '/index.md');
  assert.equal(pageUrl('https://stackql.io', '/', '/'), 'https://stackql.io/');
});

const { outputRoute } = require('../src/companionPath');

test('outputRoute strips siteConfig.baseUrl so file paths land under outDir', () => {
  assert.equal(outputRoute('/intro', '/'), '/intro');
  assert.equal(outputRoute('/', '/'), '/');
  assert.equal(outputRoute('/de/intro', '/de/'), '/intro');
  assert.equal(outputRoute('/de/', '/de/'), '/');
  assert.equal(outputRoute('/de', '/de/'), '/');
  assert.equal(outputRoute('/docs/a/b', '/docs/'), '/a/b');
  // a route outside the base URL is left alone
  assert.equal(outputRoute('/other', '/de/'), '/other');
  // /de-fr is not under /de/
  assert.equal(outputRoute('/de-fr/intro', '/de/'), '/de-fr/intro');
  assert.equal(outputRoute('/intro', undefined), '/intro');
});
