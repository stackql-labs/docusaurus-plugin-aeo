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
