const path = require('path');
const fs = require('fs').promises;

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

function companionUrl(permalink, trailingSlash) {
  if (permalink === '/' || permalink === '') {
    return '/index.md';
  }
  const cleaned = permalink.replace(/\/+$/, '');
  if (trailingSlash === false) {
    return `${cleaned}.md`;
  }
  return `${cleaned}/index.md`;
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

module.exports = async function emitLlmsTxt({
  props,
  options,
  emittedCompanions,
  companionsEnabled,
  verbose,
}) {
  const { outDir, siteConfig } = props;
  const trailingSlash = siteConfig.trailingSlash;

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

  // Build llms.txt.
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
      const url = companionsEnabled
        ? companionUrl(item.permalink, trailingSlash)
        : item.permalink;
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

  const llmsTxtPath = path.join(outDir, 'llms.txt');
  await fs.writeFile(llmsTxtPath, lines.join('\n'), 'utf8');
  if (verbose) {
    console.log(`[plugin-aeo] llmsTxt: wrote ${llmsTxtPath}`);
  }

  // Build llms-full.txt by concatenating the companion files that we just
  // emitted in feature 1. Requires feature 1 to have been enabled. Section
  // headings mirror llms.txt so an LLM can navigate the corpus by H2.
  if (options.fullTxt) {
    if (!companionsEnabled) {
      if (verbose) {
        console.log(
          '[plugin-aeo] llmsTxt: companions disabled, skipping llms-full.txt',
        );
      }
      return;
    }

    const sectionChunks = [];
    for (const section of sections) {
      const blocks = [];
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
        const url = `${(siteConfig.url || '').replace(/\/$/, '')}${item.permalink}`;
        const header = [
          `# ${item.title || item.permalink}`,
          '',
          `Source: ${url}`,
          '',
        ].join('\n');
        blocks.push(`${header}${body.trim()}\n`);
      }
      if (blocks.length === 0) continue;
      sectionChunks.push(`## ${section.title}\n\n${blocks.join('\n---\n\n')}`);
    }

    const fullPath = path.join(outDir, 'llms-full.txt');
    await fs.writeFile(fullPath, sectionChunks.join('\n---\n\n'), 'utf8');
    if (verbose) {
      console.log(`[plugin-aeo] llmsTxt: wrote ${fullPath}`);
    }
  }
};
