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
