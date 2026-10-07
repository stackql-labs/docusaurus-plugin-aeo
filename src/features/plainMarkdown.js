// MDX source -> plain markdown, for the `.md` companions and llms-full.txt.
//
// Strategy: parse the source with the same remark toolchain Docusaurus uses
// (remark-mdx, gfm, directive, comments) to find every MDX construct, then
// edit the ORIGINAL text by source position:
//
//   - imports, exports and `{expressions}` are cut
//   - presentational elements (svg, video, iframe, ...) are dropped with
//     their whole subtree
//   - a handful of elements become their markdown equivalent (<a>, <img>,
//     <b>, <i>, <code>, <h2>, <br>, <summary>, <TabItem> -> a bold label)
//   - a self-closing component that carries a link (`to`/`href` plus
//     `text`/`label`/`title`) becomes a markdown link
//   - everything else is unwrapped: the tags go, the children stay
//
// Nothing that is not MDX is touched, and nothing is re-stringified, so the
// author's markdown survives byte for byte: no escaping drift (snake_case
// stays snake_case), and tables, admonitions and code fences are exactly as
// written. A parse failure falls back to the regex stripper from v0.4 so a
// build never breaks on one odd file.

const path = require('path');

// Elements whose whole subtree is presentational.
const DROP = new Set([
  'svg', 'path', 'g', 'circle', 'rect', 'line', 'polygon', 'polyline', 'use',
  'defs', 'symbol', 'iframe', 'video', 'audio', 'source', 'track', 'picture',
  'canvas', 'script', 'style', 'object', 'embed', 'noscript', 'template',
  'button', 'input', 'select', 'textarea', 'form', 'label', 'head',
  'Head', 'BrowserOnly', 'Redirect',
]);

// Inline elements that become markdown delimiters: [open, close].
const INLINE_MARKS = {
  b: ['**', '**'],
  strong: ['**', '**'],
  i: ['_', '_'],
  em: ['_', '_'],
  code: ['`', '`'],
  kbd: ['`', '`'],
  samp: ['`', '`'],
  var: ['`', '`'],
  summary: ['**', '**'],
  del: ['~~', '~~'],
  s: ['~~', '~~'],
};

// Attribute names a self-closing component might use for a link target and
// its text, in order of preference.
const LINK_HREF_ATTRS = ['href', 'to', 'url', 'link'];
const LINK_TEXT_ATTRS = ['text', 'label', 'title', 'children', 'name'];

const MD_EXTENSIONS = new Set([
  '.md', '.markdown', '.mdown', '.mkdn', '.mkd', '.mdwn', '.mkdown', '.ron',
]);

// --------------------------------------------------------------- helpers

// Resolve the Docusaurus markdown format for a file: the page's front
// matter `format`, else siteConfig.markdown.format, else by extension.
function resolveFormat({ filePath, frontMatterFormat, markdownConfigFormat }) {
  const byExtension = () =>
    MD_EXTENSIONS.has(path.extname(filePath || '').toLowerCase()) ? 'md' : 'mdx';
  if (frontMatterFormat && frontMatterFormat !== 'detect') return frontMatterFormat;
  if (frontMatterFormat === 'detect') return byExtension();
  if (markdownConfigFormat && markdownConfigFormat !== 'detect') return markdownConfigFormat;
  return byExtension();
}

// A JS string literal -> its value, else null. Good enough for the
// `{'text'}` / `label: 'macOS'` cases; template literals with `${}` are
// not literals.
function stringLiteral(expr) {
  const s = String(expr == null ? '' : expr).trim();
  const m = /^(['"`])([\s\S]*)\1$/.exec(s);
  if (!m) return null;
  const inner = m[2];
  if (m[1] === '`' && inner.includes('${')) return null;
  if (inner.includes(m[1]) && !inner.includes('\\' + m[1])) return null;
  return inner.replace(/\\(['"`\\])/g, '$1');
}

// { name: string } for every attribute whose value is a string or a string
// literal expression. Expression attributes keep their raw source under
// `__expr:<name>` for the Tabs `values` lookup.
function attrMap(node) {
  const out = {};
  for (const a of node.attributes || []) {
    if (a.type !== 'mdxJsxAttribute') continue;
    if (a.value == null) {
      out[a.name] = '';
    } else if (typeof a.value === 'string') {
      out[a.name] = a.value;
    } else if (a.value && typeof a.value.value === 'string') {
      out[`__expr:${a.name}`] = a.value.value;
      const lit = stringLiteral(a.value.value);
      if (lit !== null) out[a.name] = lit;
    }
  }
  return out;
}

// Pull { value -> label } out of a Docusaurus <Tabs values={[...]}>
// expression. Labels are often JSX (`tabLabel(<Icon />, 'macOS')`), so the
// label is the last string literal inside the `label:` property. Objects
// are found with a brace counter so nested `{{ style }}` do not confuse it.
function parseTabsValues(expr) {
  const labels = new Map();
  if (!expr) return labels;
  const objects = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        objects.push(expr.slice(start + 1, i));
        start = -1;
      }
    }
  }
  for (const obj of objects) {
    const valueMatch = /\bvalue\s*:\s*(['"`])([^'"`]*)\1/.exec(obj);
    if (!valueMatch) continue;
    const value = valueMatch[2];
    const labelIdx = obj.search(/\blabel\s*:/);
    let label = null;
    if (labelIdx >= 0) {
      // The label property runs to the next top-level comma or the end.
      let d = 0;
      let end = obj.length;
      for (let i = labelIdx; i < obj.length; i++) {
        const c = obj[i];
        if (c === '(' || c === '[' || c === '{' || c === '<') d++;
        else if (c === ')' || c === ']' || c === '}' || c === '>') d--;
        else if (c === ',' && d <= 0) {
          end = i;
          break;
        }
      }
      const segment = obj.slice(labelIdx, end);
      const literals = [...segment.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]);
      if (literals.length > 0) label = literals[literals.length - 1];
    }
    labels.set(value, label || value);
  }
  return labels;
}

function titleCase(s) {
  return String(s || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Docusaurus preprocessing the parser needs to see the same document the
// site compiles, done on the text so positions stay aligned:
//   - ```mdx-code-block fences are unwrapped (their JSX is then parsed and
//     stripped like any other)
//   - HTML comments are removed (the comment syntax leaves no node behind,
//     so they would otherwise survive into the companion)
//   - `{#custom-id}` heading ids are removed (Docusaurus escapes them before
//     MDX sees them; unescaped they are an invalid expression)
// The last two skip fenced code blocks.
function preprocess(source) {
  let text = source;
  const unwrap = (re) =>
    text.replace(re, (...args) => {
      const g = args[args.length - 1];
      return `${g.begin}${g.children}${g.end}`;
    });
  text = unwrap(
    /(?<begin>^|\r?\n)(?<indentStart>\x20*)```(?<spaces>\x20*)mdx-code-block\r?\n(?<children>.*?)\r?\n(?<indentEnd>\x20*)```(?<end>\r?\n|$)/gs,
  );
  text = unwrap(
    /(?<begin>^|\r?\n)(?<indentStart>\x20*)````(?<spaces>\x20*)mdx-code-block\r?\n(?<children>.*?)\r?\n(?<indentEnd>\x20*)````(?<end>\r?\n|$)/gs,
  );

  const lines = text.split('\n');
  let fence = null;
  let inComment = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      continue;
    }
    if (inComment) {
      const close = line.indexOf('-->');
      if (close === -1) {
        lines[i] = '';
        continue;
      }
      line = line.slice(close + 3);
      inComment = false;
    }
    line = line.replace(/<!--[\s\S]*?-->/g, '');
    const open = line.indexOf('<!--');
    if (open !== -1) {
      line = line.slice(0, open);
      inComment = true;
    }
    if (/^\s{0,3}#{1,6}\s/.test(line)) {
      line = line.replace(/\s*\{#[^}\n]*\}\s*$/, '');
    }
    lines[i] = line;
  }
  return lines.join('\n');
}

// Remove `{#id}` heading ids and HTML comments only - used before the
// CommonMark parse of `md` format files, which have no MDX syntax.
function preprocessMd(source) {
  return preprocess(source);
}

// ------------------------------------------------------------ the planner

// Walk the tree and collect non-overlapping text edits.
function planEdits(tree, source) {
  const edits = [];
  const put = (start, end, text) => {
    if (end > start || text) edits.push({ start, end, text });
  };
  const cut = (start, end) => put(start, end, '');
  const tabsStack = [];
  const htmlLinkStack = [];
  const markStack = []; // inline marks currently open, to avoid **a **b** c**
  // Content regions of unwrapped flow containers, outer before inner, for
  // planDedents.
  const dedentRegions = [];

  const inTableCell = (parents) => parents.some((p) => p.type === 'tableCell');

  function visitChildren(node, parents) {
    for (const child of node.children || []) visit(child, [node, ...parents]);
  }

  function visit(node, parents) {
    const pos = node.position;
    switch (node.type) {
      case 'yaml':
      case 'toml':
      case 'mdxjsEsm':
        if (pos) cut(pos.start.offset, pos.end.offset);
        return;
      case 'mdxFlowExpression':
      case 'mdxTextExpression': {
        if (!pos) return;
        const lit = stringLiteral(node.value);
        put(pos.start.offset, pos.end.offset, lit === null ? '' : lit);
        return;
      }
      case 'mdxJsxFlowElement':
      case 'mdxJsxTextElement':
        handleJsx(node, parents);
        return;
      case 'html':
        handleHtml(node, parents);
        return;
      default:
        visitChildren(node, parents);
    }
  }

  function handleJsx(node, parents) {
    const pos = node.position;
    if (!pos) return;
    const start = pos.start.offset;
    const end = pos.end.offset;
    const name = node.name || ''; // '' for a fragment <>...</>
    const kids = (node.children || []).filter((k) => k.position);
    const attrs = attrMap(node);
    const openEnd = kids.length ? kids[0].position.start.offset : end;
    const closeStart = kids.length ? kids[kids.length - 1].position.end.offset : end;

    const isFlow = node.type === 'mdxJsxFlowElement';
    // A block container's closing tag becomes a newline so the block that
    // follows is separated from the last child by a blank line (the tidy
    // pass collapses any surplus).
    const replaceTags = (openText, closeText) => {
      put(start, openEnd, openText);
      const closing = isFlow && kids.length ? `${closeText}\n` : closeText;
      if (kids.length) put(closeStart, end, closing);
      else if (closing) put(end, end, closing);
      if (kids.length && isFlow) {
        dedentRegions.push([openEnd, closeStart]);
      }
      visitChildren(node, parents);
    };
    const unwrap = () => replaceTags('', '');

    if (DROP.has(name)) {
      cut(start, end);
      return;
    }

    switch (name) {
      case '':
        unwrap();
        return;
      case 'img': {
        const src = attrs.src;
        put(start, end, src ? `![${attrs.alt || ''}](${src})` : '');
        return;
      }
      case 'br':
        put(start, end, inTableCell(parents) ? ' ' : '\n');
        return;
      case 'hr':
        put(start, end, '\n---\n');
        return;
      case 'a': {
        const href = attrs.href;
        if (!href) {
          unwrap();
        } else if (!kids.length) {
          put(start, end, `[${href}](${href})`);
        } else {
          replaceTags('[', `](${href})`);
        }
        return;
      }
      case 'Tabs': {
        tabsStack.push(parseTabsValues(attrs['__expr:values']));
        unwrap();
        tabsStack.pop();
        return;
      }
      case 'TabItem': {
        const scope = tabsStack.length ? tabsStack[tabsStack.length - 1] : null;
        const label =
          attrs.label ||
          (scope && attrs.value !== undefined && scope.get(attrs.value)) ||
          titleCase(attrs.value) ||
          'Tab';
        if (!kids.length) {
          put(start, end, `**${label}**\n`);
        } else {
          replaceTags(`**${label}**\n\n`, '\n');
        }
        return;
      }
      case 'li':
        replaceTags('- ', '\n');
        return;
      case 'tr':
        replaceTags('', '\n');
        return;
      case 'td':
      case 'th':
        replaceTags('', ' | ');
        return;
      default:
        break;
    }

    const heading = /^h([1-6])$/.exec(name);
    if (heading) {
      replaceTags(`${'#'.repeat(Number(heading[1]))} `, '\n');
      return;
    }

    if (INLINE_MARKS[name]) {
      const [open, close] = INLINE_MARKS[name];
      if (!kids.length) {
        cut(start, end);
      } else if (markStack.includes(open)) {
        unwrap(); // already inside the same mark
      } else {
        markStack.push(open);
        replaceTags(open, close);
        markStack.pop();
      }
      return;
    }

    if (kids.length) {
      unwrap();
      return;
    }

    // Self-closing component: recover a link if it plainly carries one,
    // otherwise it is presentational (icon, embed, diagram, card list).
    const href = LINK_HREF_ATTRS.map((k) => attrs[k]).find((v) => typeof v === 'string' && v);
    const text = LINK_TEXT_ATTRS.map((k) => attrs[k]).find((v) => typeof v === 'string' && v);
    if (href && /^(https?:\/\/|\/|\.\.?\/|#|mailto:)/.test(href)) {
      put(start, end, `[${text || href}](${href})`);
    } else {
      cut(start, end);
    }
  }

  // `md` format: raw HTML arrives as `html` nodes, one per tag run.
  function handleHtml(node, parents) {
    const pos = node.position;
    if (!pos) return;
    const start = pos.start.offset;
    const end = pos.end.offset;
    const value = String(node.value || '');
    if (/^<!--[\s\S]*-->$/.test(value.trim())) {
      cut(start, end);
      return;
    }
    const single = /^<\/?([A-Za-z][A-Za-z0-9-]*)([^>]*)>$/.exec(value.trim());
    if (single) {
      const tag = single[1].toLowerCase();
      const closing = value.trim().startsWith('</');
      const attrSrc = single[2] || '';
      const attr = (n) => {
        const m = new RegExp(`\\b${n}\\s*=\\s*(["'])(.*?)\\1`).exec(attrSrc);
        return m ? m[2] : null;
      };
      if (tag === 'br') {
        put(start, end, inTableCell(parents) ? ' ' : '\n');
      } else if (tag === 'img') {
        const src = attr('src');
        put(start, end, src ? `![${attr('alt') || ''}](${src})` : '');
      } else if (tag === 'a') {
        if (closing) {
          const href = htmlLinkStack.pop();
          put(start, end, href ? `](${href})` : '');
        } else {
          const href = attr('href');
          htmlLinkStack.push(href);
          put(start, end, href ? '[' : '');
        }
      } else if (INLINE_MARKS[tag]) {
        put(start, end, INLINE_MARKS[tag][closing ? 1 : 0]);
      } else {
        cut(start, end);
      }
      return;
    }
    // A block of HTML with text inside: keep the text, lose the tags.
    const text = value
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    put(start, end, text);
  }

  visit(tree, []);
  planDedents(source, edits, dedentRegions);
  return edits;
}

// Content written inside a JSX container is usually indented to match the
// tags. Removing the tags leaves that indentation behind, which reads as
// stray whitespace at best and as an indented code block at worst. For each
// container region, outer to inner, the indentation its content lines have
// in common is cut from every one of them; a nested container then cuts
// only what its own content adds on top, so the cuts never overlap. Lines
// that begin inside another edit (a nested tag, an expression) are left
// alone: that edit already removes them.
function planDedents(source, edits, regions) {
  if (regions.length === 0) return;
  const cutSoFar = new Map(); // lineStart -> spaces already removed
  const taken = [...edits].sort((a, b) => a.start - b.start);
  const insideEdit = (offset) => {
    // binary search for the last edit starting at or before offset
    let lo = 0;
    let hi = taken.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (taken[mid].start <= offset) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    for (let i = found; i >= 0 && i > found - 8; i--) {
      const e = taken[i];
      if (e.start <= offset && offset < e.end) return true;
    }
    return false;
  };
  const indentOf = (lineStart) => {
    let i = lineStart;
    while (i < source.length && (source[i] === ' ' || source[i] === '\t')) i++;
    return { indent: i - lineStart, blank: i >= source.length || source[i] === '\n' || source[i] === '\r' };
  };
  for (const [regionStart, regionEnd] of regions) {
    const lines = [];
    let nl = source.indexOf('\n', regionStart);
    while (nl !== -1 && nl + 1 < regionEnd) {
      const lineStart = nl + 1;
      if (!insideEdit(lineStart)) lines.push({ lineStart, ...indentOf(lineStart) });
      nl = source.indexOf('\n', lineStart);
    }
    const remaining = (l) => l.indent - (cutSoFar.get(l.lineStart) || 0);
    const content = lines.filter((l) => !l.blank);
    if (content.length === 0) continue;
    const common = Math.min(...content.map(remaining));
    if (common <= 0) continue;
    for (const l of lines) {
      const done = cutSoFar.get(l.lineStart) || 0;
      const n = Math.min(common, l.indent - done);
      if (n > 0) {
        edits.push({ start: l.lineStart + done, end: l.lineStart + done + n, text: '' });
        cutSoFar.set(l.lineStart, done + n);
      }
    }
  }
}

function applyEdits(source, edits) {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  let out = '';
  let cursor = 0;
  for (const e of sorted) {
    if (e.start < cursor) {
      throw new Error(`overlapping edits at offset ${e.start} (cursor ${cursor})`);
    }
    out += source.slice(cursor, e.start) + e.text;
    cursor = e.end;
  }
  return out + source.slice(cursor);
}

function tidy(text) {
  return (
    text
      // whitespace-only lines become empty (tags and indentation leave them)
      .replace(/^[ \t]+$/gm, '')
      // at most one blank line in a row
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      // a horizontal rule that opened or closed the page only separated a
      // component that is gone now
      .replace(/^(?:(?:---|\*\*\*|___)\n+)+/, '')
      .replace(/(?:\n+(?:---|\*\*\*|___))+$/, '')
      .trim() + '\n'
  );
}

// The regex stripper from v0.4, kept as the fallback for a source that
// does not parse (it compiled for Docusaurus, so this should not happen,
// but one odd file must not fail the build).
function stripMdxRegex(source) {
  let out = source;
  out = out.replace(/^\s*import\s+[^\n]+\n/gm, '');
  out = out.replace(/^\s*export\s+[^\n]+\n/gm, '');
  out = out.replace(/<([A-Z][A-Za-z0-9]*)\b[^>]*\/>\s*/g, '');
  out = out.replace(/<([A-Z][A-Za-z0-9]*)\b[^>]*>[\s\S]*?<\/\1>\s*/g, '');
  out = out.replace(/<\/?[A-Z][A-Za-z0-9]*\b[^>]*>/g, '');
  return tidy(out);
}

// ------------------------------------------------------------- the parser

let processors = null;

async function getProcessors() {
  if (processors) return processors;
  // These packages are ESM; the plugin is CommonJS, so load them lazily.
  const [
    { unified },
    { default: remarkParse },
    { default: remarkMdx },
    { default: remarkGfm },
    { default: remarkDirective },
    { default: remarkComment },
  ] = await Promise.all([
    import('unified'),
    import('remark-parse'),
    import('remark-mdx'),
    import('remark-gfm'),
    import('remark-directive'),
    import('@slorber/remark-comment'),
  ]);
  processors = {
    mdx: unified()
      .use(remarkParse)
      .use(remarkMdx)
      .use(remarkGfm)
      .use(remarkDirective)
      .use(remarkComment)
      .freeze(),
    md: unified().use(remarkParse).use(remarkGfm).use(remarkDirective).freeze(),
  };
  return processors;
}

// Convert one page body (front matter already removed) to plain markdown.
// Returns { markdown, fallback: boolean, error?: Error }.
async function toPlainMarkdown(body, { format = 'mdx', filePath } = {}) {
  const { mdx, md } = await getProcessors();
  // LF throughout: the companion is a file of ours, and the tidy pass and
  // the dedent work on '\n'.
  const normalized = String(body || '').replace(/\r\n?/g, '\n');
  const source = format === 'md' ? preprocessMd(normalized) : preprocess(normalized);
  try {
    const tree = (format === 'md' ? md : mdx).parse(source);
    const edits = planEdits(tree, source);
    return { markdown: tidy(applyEdits(source, edits)), fallback: false };
  } catch (error) {
    return { markdown: stripMdxRegex(source), fallback: true, error };
  }
}

module.exports = {
  toPlainMarkdown,
  resolveFormat,
  // exported for tests
  parseTabsValues,
  preprocess,
  stripMdxRegex,
};
