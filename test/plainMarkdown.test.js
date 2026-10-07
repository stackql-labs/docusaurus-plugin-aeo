const test = require('node:test');
const assert = require('node:assert/strict');
const { toPlainMarkdown, parseTabsValues, resolveFormat } = require('../src/features/plainMarkdown');
const { withTitleBlock } = require('../src/features/companions');

const convert = async (src, opts) => (await toPlainMarkdown(src, { format: 'mdx', ...opts })).markdown;

test('imports, exports and expressions are removed; markdown is untouched', async () => {
  const src = `import Tabs from '@theme/Tabs';
import {
  A,
  B,
} from '../src/components';

export const Icon = () => (
  <svg viewBox="0 0 24 24"><path d="M1 1h2" /></svg>
);

Text with snake_case_name and *emphasis* and a [link](/x) and \`code_x\`.

{/* a comment */}

| a | b |
|---|---|
| x_y | z |
`;
  const out = await convert(src);
  assert.equal(
    out,
    `Text with snake_case_name and *emphasis* and a [link](/x) and \`code_x\`.

| a | b |
|---|---|
| x_y | z |
`,
  );
});

test('Tabs/TabItem become bold labels; labels come from the attribute or the values expression', async () => {
  const src = `<Tabs
  defaultValue="macos"
  values={[
    { label: tabLabel(<FaApple />, 'macOS'), value: 'macos', },
    { label: tabLabel(<FaWindows style={{ color: '#00A4EF' }} />, 'Windows'), value: 'windows', },
    { value: 'docker', label: 'Docker' },
  ]}
>
<TabItem value="macos">

Install on a Mac.

</TabItem>
<TabItem value="windows">

Install on Windows.

</TabItem>
<TabItem value="docker">

Run the image.

</TabItem>
<TabItem value="other" label="Other">

Something else.

</TabItem>
</Tabs>
`;
  const out = await convert(src);
  assert.equal(
    out,
    `**macOS**

Install on a Mac.

**Windows**

Install on Windows.

**Docker**

Run the image.

**Other**

Something else.
`,
  );
});

test('indented content inside unwrapped containers is dedented, code fences included', async () => {
  const src = `<Box sx={{
  p: 3,
}}>

  ## Heading

  A paragraph.

  \`\`\`bash
  brew install stackql
  \`\`\`

  <Tabs>
  <TabItem value="a" label="A">

    Nested content.

  </TabItem>
  </Tabs>

</Box>

After.
`;
  const out = await convert(src);
  assert.equal(
    out,
    `## Heading

A paragraph.

\`\`\`bash
brew install stackql
\`\`\`

**A**

Nested content.

After.
`,
  );
});

test('a self-closing component that carries a link becomes a markdown link; icons are dropped', async () => {
  const src = `<div className={clsx(s.b)}>
  <BinaryDownloadLink iconSize={20} text="Download macOS PKG" to="https://releases.example.com/x.pkg" />
</div>

<FaRobot /> <DocCardList /> <RailroadDiagram type="select" />
`;
  const out = await convert(src);
  assert.equal(out, `[Download macOS PKG](https://releases.example.com/x.pkg)\n`);
});

test('inline html-ish elements map to markdown', async () => {
  const src = `Some <b>bold</b>, <i>italic</i>, <code>mono_x</code>, <a href="https://x.io" target="_blank">a link</a><br/>next line.

<summary>What is <b>AWS</b>?</summary>

| col |
|-----|
| a<br/>b |
`;
  const out = await convert(src);
  assert.equal(
    out,
    `Some **bold**, _italic_, \`mono_x\`, [a link](https://x.io)
next line.

**What is AWS?**

| col |
|-----|
| a b |
`,
  );
});

test('details/summary unwrap; a blank line separates unwrapped blocks', async () => {
  const src = `<details>

<summary>Click</summary>

Hidden text.

</details>
<div className="row">
<div className="col">

### One

Para one.
</div>
<div className="col">

### Two

Para two.
</div>
</div>
`;
  const out = await convert(src);
  assert.equal(
    out,
    `**Click**

Hidden text.

### One

Para one.

### Two

Para two.
`,
  );
});

test('HTML comments and heading ids go; code fences are never touched', async () => {
  const src = `## Heading {#custom-id}

Intro.

<!-- truncate -->

\`\`\`html
<!-- keep this -->
<Tabs>not jsx</Tabs>
## not a heading {#keep}
\`\`\`
`;
  const out = await convert(src);
  assert.equal(
    out,
    `## Heading

Intro.

\`\`\`html
<!-- keep this -->
<Tabs>not jsx</Tabs>
## not a heading {#keep}
\`\`\`
`,
  );
});

test('string-literal expressions keep their value', async () => {
  assert.equal(await convert(`Version {'1.2.3'} and {"two"}.\n`), `Version 1.2.3 and two.\n`);
});

test('md format: raw HTML tags are stripped, links and images survive', async () => {
  const src = `Hello <b>world</b>, see <a href="/docs">the docs</a>.

<img src="/img/x.png" alt="An image">

<div class="x">
<p>Block text</p>
</div>
`;
  const out = await convert(src, { format: 'md' });
  assert.equal(
    out,
    `Hello **world**, see [the docs](/docs).

![An image](/img/x.png)

Block text
`,
  );
});

test('a source that does not parse falls back to the regex stripper', async () => {
  const res = await toPlainMarkdown(`import X from 'x';\n\n<Unclosed>\n\nText.\n`, { format: 'mdx' });
  assert.equal(res.fallback, true);
  assert.match(res.markdown, /Text\./);
  assert.doesNotMatch(res.markdown, /import X/);
});

test('CRLF sources come out as LF', async () => {
  assert.equal(await convert('One\r\n\r\nTwo\r\n'), 'One\n\nTwo\n');
});

test('parseTabsValues reads labels out of JSX-heavy values', () => {
  const m = parseTabsValues(`[
    { label: tabLabel(<FaApple />, 'macOS'), value: 'macos', },
    { label: 'Plain', value: 'plain' },
    { value: 'nolabel' },
  ]`);
  assert.equal(m.get('macos'), 'macOS');
  assert.equal(m.get('plain'), 'Plain');
  assert.equal(m.get('nolabel'), 'nolabel');
});

test('resolveFormat follows front matter, then site config, then extension', () => {
  assert.equal(resolveFormat({ filePath: 'a.md', frontMatterFormat: 'mdx', markdownConfigFormat: 'md' }), 'mdx');
  assert.equal(resolveFormat({ filePath: 'a.md', markdownConfigFormat: 'mdx' }), 'mdx');
  assert.equal(resolveFormat({ filePath: 'a.md', markdownConfigFormat: 'detect' }), 'md');
  assert.equal(resolveFormat({ filePath: 'a.mdx', markdownConfigFormat: 'detect' }), 'mdx');
  assert.equal(resolveFormat({ filePath: 'a.md' }), 'md');
});

test('withTitleBlock adds title, description and Source, or only the extras under an existing H1', () => {
  assert.equal(withTitleBlock('Body.\n', 'T', 'D'), '# T\n\n> D\n\nBody.\n');
  assert.equal(
    withTitleBlock('Body.\n', 'T', 'D', 'https://example.com/t'),
    '# T\n\n> D\n\nSource: https://example.com/t\n\nBody.\n',
  );
  assert.equal(
    withTitleBlock('# Own\n\nBody.\n', 'T', 'D', 'https://example.com/t'),
    '# Own\n\n> D\n\nSource: https://example.com/t\n\nBody.\n',
  );
  assert.equal(withTitleBlock('# Own\n\nBody.\n', 'T', null), '# Own\n\nBody.\n');
  assert.equal(withTitleBlock('Body.\n', null, null), 'Body.\n');
});
