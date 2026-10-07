const test = require('node:test');
const assert = require('node:assert/strict');
const { fillPrompt } = require('../src/askAiPrompt');

const urls = { pageUrl: 'https://stackql.io', companionUrl: 'https://stackql.io/index.md' };

test('{companionUrl} is the .md file', () => {
  assert.equal(fillPrompt('Read {companionUrl} please', urls), 'Read https://stackql.io/index.md please');
});

test('the v0.4 idiom {pageUrl}.md resolves to the real companion, not https://site.md', () => {
  assert.equal(fillPrompt('Read {pageUrl}.md please', urls), 'Read https://stackql.io/index.md please');
});

test('{pageUrl} on its own is the page', () => {
  assert.equal(fillPrompt('See {pageUrl} and {companionUrl}', urls), 'See https://stackql.io and https://stackql.io/index.md');
});

test('every occurrence is replaced', () => {
  assert.equal(fillPrompt('{pageUrl} {pageUrl}', urls), 'https://stackql.io https://stackql.io');
});
