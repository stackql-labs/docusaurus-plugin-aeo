const path = require('path');
const fs = require('fs').promises;
const { companionUrl, pageUrl } = require('../companionPath');

function matchAny(value, patterns) {
  if (!patterns || patterns.length === 0) return false;
  for (const p of patterns) {
    if (toRegExp(p).test(value)) return true;
  }
  return false;
}

function toRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^$()|{}[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

function groupKind(kind, pluginId) {
  if (kind === 'docs') return 'docs';
  if (kind === 'blog') return 'blog';
  if (kind === 'pages') return 'pages';
  // Treat additional content-docs instances (id !== 'default') as docs too.
  if (pluginId && pluginId !== 'default') return 'docs';
  return 'pages';
}

function instanceKey(item) {
  return `${item.pluginName}@${item.pluginId}`;
}

// Returns an ordered array of { key, title, items[] }. The same shape is
// consumed by both llms.txt and llms-full.txt emitters so their section
// structure stays in lock-step.
function buildSections(filtered, options, verbose) {
  if (options.instanceSections) {
    if (verbose && options.sections && Object.keys(options.sections).length > 0) {
      // Both options set is allowed; instanceSections wins. Log so the
      // consumer isn't confused that their `sections` titles aren't
      // appearing.
      console.log(
        '[plugin-aeo] llmsTxt: both `sections` and `instanceSections` are set; `instanceSections` takes precedence',
      );
    }

    const mapped = new Map(); // key -> { title, order, items[] }
    const unmapped = []; // items that don't match any configured instance
    const seenUnmappedKeys = new Set();

    for (const [key, cfg] of Object.entries(options.instanceSections)) {
      mapped.set(key, { title: cfg.title, order: cfg.order, items: [] });
    }

    for (const item of filtered) {
      const key = instanceKey(item);
      if (mapped.has(key)) {
        mapped.get(key).items.push(item);
      } else {
        unmapped.push(item);
        if (verbose && !seenUnmappedKeys.has(key)) {
          seenUnmappedKeys.add(key);
          console.log(
            `[plugin-aeo] llmsTxt: instance "${key}" is not in instanceSections; routing to "Other"`,
          );
        }
      }
    }

    const sections = [];
    const ordered = [...mapped.entries()]
      .map(([key, v]) => ({
        key,
        title: v.title,
        order: typeof v.order === 'number' ? v.order : Number.POSITIVE_INFINITY,
        items: v.items,
      }))
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.title.localeCompare(b.title);
      });

    for (const s of ordered) {
      if (s.items.length === 0) continue;
      s.items.sort((a, b) => a.permalink.localeCompare(b.permalink));
      sections.push({ key: s.key, title: s.title, items: s.items });
    }

    if (unmapped.length > 0) {
      // Spec: unmapped items go in a single "Other" section, sorted by
      // page title (alphabetical). Stable tiebreak on permalink.
      unmapped.sort((a, b) => {
        const at = a.title || a.permalink;
        const bt = b.title || b.permalink;
        const cmp = at.localeCompare(bt);
        return cmp !== 0 ? cmp : a.permalink.localeCompare(b.permalink);
      });
      sections.push({ key: '__other__', title: 'Other', items: unmapped });
    }

    return sections;
  }

  // Default path - per-type grouping, identical to v0.1.x behavior.
  const groups = { docs: [], blog: [], pages: [] };
  for (const item of filtered) {
    const g = groupKind(item.kind, item.pluginId);
    groups[g].push(item);
  }

  const sections = [];
  const order = [
    ['docs', options.sections.docs],
    ['blog', options.sections.blog],
    ['pages', options.sections.pages],
  ];
  for (const [key, title] of order) {
    const items = groups[key];
    if (!items || items.length === 0) continue;
    items.sort((a, b) => a.permalink.localeCompare(b.permalink));
    sections.push({ key, title, items });
  }
  return sections;
}

// Normalised view of `llmsTxt.fullTxt`: the boolean form (`true` = every
// section, no cap) or the object form `{ include, maxBytes }`.
function fullTxtOptions(fullTxt) {
  if (!fullTxt) return null;
  if (fullTxt === true) return { include: null, maxBytes: null };
  return {
    include: Array.isArray(fullTxt.include) && fullTxt.include.length > 0 ? fullTxt.include : null,
    maxBytes: Number.isFinite(fullTxt.maxBytes) && fullTxt.maxBytes > 0 ? fullTxt.maxBytes : null,
  };
}

// Render llms.txt from the sections. Pure, so it can be tested without a
// build: returns the file text.
function renderLlmsTxt({ siteConfig, siteUrl, trailingSlash, sections, options, companionsEnabled }) {
  const lines = [];
  lines.push(`# ${siteConfig.title}`);
  lines.push('');
  if (siteConfig.tagline) {
    lines.push(`> ${siteConfig.tagline}`);
    lines.push('');
  }
  if (options.header) {
    lines.push(options.header.trim());
    lines.push('');
  }

  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    for (const item of section.items) {
      // Absolute, as the llms.txt spec's examples are: the file is read
      // away from the site, where a relative link has no base.
      const url = companionsEnabled
        ? companionUrl(siteUrl, item.permalink, trailingSlash)
        : pageUrl(siteUrl, item.permalink);
      const desc = item.description || siteConfig.tagline || '';
      const titleText = item.title || item.permalink;
      if (desc) {
        lines.push(`- [${titleText}](${url}): ${desc}`);
      } else {
        lines.push(`- [${titleText}](${url})`);
      }
    }
    lines.push('');
  }

  // The llmstxt.org convention for secondary resources: an "Optional"
  // section a reader can skip. llms-full.txt is the whole corpus in one
  // file, so it belongs here rather than inline with the page list.
  if (options.fullTxt && options.linkFullTxt !== false && companionsEnabled) {
    lines.push('## Optional');
    lines.push('');
    lines.push(
      `- [Full text of every page](${siteUrl}/llms-full.txt): one file with the content of every page listed above`,
    );
    lines.push('');
  }

  return lines.join('\n');
}

// One block of llms-full.txt: the companion body with a `Source:` line (and
// the title, when the body does not already open with it). A plain
// companion already carries both, so the header is skipped and the body
// is emitted as is.
function fullTxtBlock({ body, item, siteUrl }) {
  const url = pageUrl(siteUrl, item.permalink);
  const head = body.trimStart().split('\n', 8);
  const hasH1 = /^#\s+\S/.test(head[0] || '');
  const hasSource = head.some((l) => /^Source: \S/.test(l));
  const header = [
    ...(hasH1 ? [] : [`# ${item.title || item.permalink}`, '']),
    ...(hasSource ? [] : [`Source: ${url}`, '']),
  ];
  const prefix = header.length ? `${header.join('\n')}\n` : '';
  return `${prefix}${body.trim()}\n`;
}

module.exports = async function emitLlmsTxt({
  props,
  options,
  emittedCompanions,
  companionsEnabled,
  verbose,
}) {
  const { outDir, siteConfig } = props;
  const trailingSlash = siteConfig.trailingSlash;
  const siteUrl = (siteConfig.url || '').replace(/\/+$/, '');

  // Filter the companions through include/exclude rules.
  const filtered = emittedCompanions.filter((item) => {
    if (options.include && !options.include.some((p) => toRegExp(p).test(item.permalink))) {
      return false;
    }
    if (matchAny(item.permalink, options.exclude)) {
      return false;
    }
    return true;
  });

  const sections = buildSections(filtered, options, verbose);

  const llmsTxtPath = path.join(outDir, 'llms.txt');
  await fs.writeFile(
    llmsTxtPath,
    renderLlmsTxt({ siteConfig, siteUrl, trailingSlash, sections, options, companionsEnabled }),
    'utf8',
  );
  if (verbose) {
    console.log(`[plugin-aeo] llmsTxt: wrote ${llmsTxtPath}`);
  }

  // Build llms-full.txt by concatenating the companion files that we just
  // emitted in feature 1. Requires feature 1 to have been enabled. Section
  // headings mirror llms.txt so an LLM can navigate the corpus by H2.
  const full = fullTxtOptions(options.fullTxt);
  if (full) {
    if (!companionsEnabled) {
      if (verbose) {
        console.log(
          '[plugin-aeo] llmsTxt: companions disabled, skipping llms-full.txt',
        );
      }
      return;
    }

    // `include` names content instances ("<plugin>@<id>") or, with per-type
    // grouping, the group keys (docs, blog, pages). Sections keep the order
    // of llms.txt; `maxBytes` stops appending once the next block would
    // cross the cap, so the file always ends on a whole page.
    const wanted = full.include
      ? sections.filter((s) => full.include.includes(s.key))
      : sections;
    if (full.include && wanted.length === 0 && verbose) {
      console.log(
        `[plugin-aeo] llmsTxt: fullTxt.include matched no section (have: ${sections.map((s) => s.key).join(', ')})`,
      );
    }

    const SEP = '\n---\n\n';
    let out = '';
    let size = 0;
    let truncated = false;
    let pages = 0;
    outer: for (const section of wanted) {
      let sectionOpen = false;
      for (const item of section.items) {
        let body;
        try {
          body = await fs.readFile(item.companionPath, 'utf8');
        } catch (e) {
          if (verbose) {
            console.log(
              `[plugin-aeo] llmsTxt: cannot read ${item.companionPath}: ${e.message}`,
            );
          }
          continue;
        }
        const block = fullTxtBlock({ body, item, siteUrl });
        const chunk = `${sectionOpen ? SEP : `${out ? SEP : ''}## ${section.title}\n\n`}${block}`;
        const bytes = Buffer.byteLength(chunk, 'utf8');
        if (full.maxBytes && size + bytes > full.maxBytes) {
          truncated = true;
          break outer;
        }
        out += chunk;
        size += bytes;
        sectionOpen = true;
        pages++;
      }
    }

    const fullPath = path.join(outDir, 'llms-full.txt');
    await fs.writeFile(fullPath, out, 'utf8');
    if (verbose) {
      console.log(
        `[plugin-aeo] llmsTxt: wrote ${fullPath} (${pages} page(s), ${size} bytes${truncated ? `, stopped at the ${full.maxBytes}-byte cap` : ''})`,
      );
    }
  }
};

module.exports.renderLlmsTxt = renderLlmsTxt;
module.exports.fullTxtBlock = fullTxtBlock;
module.exports.fullTxtOptions = fullTxtOptions;
module.exports.buildSections = buildSections;
