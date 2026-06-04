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

  // Group by kind.
  const groups = { docs: [], blog: [], pages: [] };
  for (const item of filtered) {
    const g = groupKind(item.kind, item.pluginId);
    groups[g].push(item);
  }

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

  const sectionOrder = [
    ['docs', options.sections.docs],
    ['blog', options.sections.blog],
    ['pages', options.sections.pages],
  ];

  for (const [key, title] of sectionOrder) {
    const items = groups[key];
    if (!items || items.length === 0) continue;
    lines.push(`## ${title}`);
    lines.push('');
    // Stable order: by permalink.
    items.sort((a, b) => a.permalink.localeCompare(b.permalink));
    for (const item of items) {
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
  // emitted in feature 1. Requires feature 1 to have been enabled.
  if (options.fullTxt) {
    if (!companionsEnabled) {
      if (verbose) {
        console.log(
          '[plugin-aeo] llmsTxt: companions disabled, skipping llms-full.txt',
        );
      }
      return;
    }

    const blocks = [];
    for (const [key] of sectionOrder) {
      const items = groups[key];
      if (!items) continue;
      for (const item of items) {
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
    }

    const fullPath = path.join(outDir, 'llms-full.txt');
    await fs.writeFile(fullPath, blocks.join('\n---\n\n'), 'utf8');
    if (verbose) {
      console.log(`[plugin-aeo] llmsTxt: wrote ${fullPath}`);
    }
  }
};
