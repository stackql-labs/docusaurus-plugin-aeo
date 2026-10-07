const test = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('../src/features/aiRoutes');

test('classify maps every how-to directory spelling to howTo', () => {
  for (const dir of ['howto', 'howtos', 'how-to', 'how-tos']) {
    assert.equal(classify(`/ai/${dir}/authenticate`), 'howTo', dir);
  }
  assert.equal(classify('/ai/faqs/x'), 'faq');
  assert.equal(classify('/ai/concepts/x'), null);
  assert.equal(classify('/docs/x'), null);
});
