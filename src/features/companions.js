const path = require('path');
const fs = require('fs').promises;
const matter = require('gray-matter');
const { companionPath } = require('../companionPath');
const { toPlainMarkdown, resolveFormat } = require('./plainMarkdown');

// Minimal glob matcher for route paths. Patterns like "/blog/tags/**",
// "/search". Avoids pulling micromatch directly.
function matchAny(value, patterns) {
  if (!patterns || patterns.length === 0) return false;
  for (const p of patterns) {
    if (toRegExp(p).test(value)) return true;
  }
  return false;
}

function toRegExp(glob) {
  // Minimal globstar -> regex translation. Supports: **, *, ?, character
  // classes left untouched. Good enough for route paths like
  // "/blog/tags/**" and "/search".
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

function collectFromDocs(content, pluginName, pluginId) {
  // Docs plugin loaded content shape:
  //   { loadedVersions: [{ docs: [{ id, permalink, source, title, description, frontMatter }] }] }
  const results = [];
  if (!content || !Array.isArray(content.loadedVersions)) return results;
  for (const version of content.loadedVersions) {
    if (!Array.isArray(version.docs)) continue;
    for (const doc of version.docs) {
      if (!doc.permalink || !doc.source) continue;
      results.push({
        permalink: doc.permalink,
        // doc.source is prefixed with "@site/" - resolve later against siteDir.
        sourceRef: doc.source,
        title: doc.title,
        description: doc.description,
        frontMatter: doc.frontMatter || {},
        kind: 'docs',
        pluginName,
        pluginId,
      });
    }
  }
  return results;
}

function collectFromBlog(content, pluginName, pluginId) {
  // Blog plugin loaded content shape:
  //   { blogPosts: [{ id, metadata: { permalink, source, title, description, frontMatter } }] }
  const results = [];
  if (!content || !Array.isArray(content.blogPosts)) return results;
  for (const post of content.blogPosts) {
    const m = post.metadata || {};
    if (!m.permalink || !m.source) continue;
    results.push({
      permalink: m.permalink,
      sourceRef: m.source,
      title: m.title,
      description: m.description,
      frontMatter: m.frontMatter || {},
      kind: 'blog',
      pluginName,
      pluginId,
    });
  }
  return results;
}

// Every page that gets a companion: docs and blog pages with a source file,
// minus `companions.exclude`. Generated category indexes, React pages and
// blog list/tag/author pages have no source and are not in this list. Used
// by postBuild to emit the files and by allContentLoaded to tell the Ask AI
// button which routes have one.
function collectCompanionItems(loadedContentByPlugin, options) {
  const items = [];
  for (const [, entry] of loadedContentByPlugin) {
    const { pluginName, pluginId, content } = entry;
    if (pluginName === 'docusaurus-plugin-content-docs') {
      items.push(...collectFromDocs(content, pluginName, pluginId));
    } else if (pluginName === 'docusaurus-plugin-content-blog') {
      items.push(...collectFromBlog(content, pluginName, pluginId));
    }
    // Custom pages plugin emits React components, not markdown. Skip silently.
  }
  const exclude = (options && options.exclude) || [];
  return items.filter((item) => !matchAny(item.permalink, exclude));
}

function resolveSourcePath(sourceRef, siteDir) {
  if (!sourceRef) return null;
  // Docusaurus content references look like "@site/docs/intro.md".
  if (sourceRef.startsWith('@site/')) {
    return path.join(siteDir, sourceRef.slice('@site/'.length));
  }
  if (path.isAbsolute(sourceRef)) return sourceRef;
  return path.join(siteDir, sourceRef);
}

async function ensureDir(p) {
  await fs.mkdir(path.dirname(p), { recursive: true });
}

// Put the page's title and description at the top of a plain companion so
// an LLM sees them without parsing YAML. A body that already opens with an
// H1 keeps it; the description goes under whichever H1 is there.
function withTitleBlock(markdown, title, description) {
  const lines = markdown.split('\n');
  const first = lines.findIndex((l) => l.trim() !== '');
  const hasH1 = first >= 0 && /^#\s+\S/.test(lines[first]);
  const quote = description ? `> ${String(description).replace(/\s+/g, ' ').trim()}` : null;
  if (hasH1) {
    if (!quote) return markdown;
    return [...lines.slice(0, first + 1), '', quote, ...lines.slice(first + 1)].join('\n');
  }
  const head = [];
  if (title) head.push(`# ${title}`);
  if (quote) head.push(quote);
  return head.length ? `${head.join('\n\n')}\n\n${markdown}` : markdown;
}

module.exports = async function emitCompanions({
  props,
  options,
  loadedContentByPlugin,
  verbose,
}) {
  const { outDir, siteConfig, siteDir } = props;
  const trailingSlash = siteConfig.trailingSlash;
  const format = options.format;
  const markdownConfigFormat = siteConfig.markdown && siteConfig.markdown.format;

  const items = collectCompanionItems(loadedContentByPlugin, options);

  const emitted = [];
  let fallbacks = 0;
  for (const item of items) {
    const sourcePath = resolveSourcePath(item.sourceRef, siteDir);
    if (!sourcePath) {
      if (verbose) {
        console.log(
          `[plugin-aeo] companions: skipping ${item.permalink} (no source)`,
        );
      }
      continue;
    }

    let raw;
    try {
      raw = await fs.readFile(sourcePath, 'utf8');
    } catch (e) {
      if (verbose) {
        console.log(
          `[plugin-aeo] companions: failed to read source for ${item.permalink}: ${e.message}`,
        );
      }
      continue;
    }

    let body = raw;
    if (format === 'plain') {
      const parsed = matter(raw);
      const sourceFormat = resolveFormat({
        filePath: sourcePath,
        frontMatterFormat: parsed.data && parsed.data.format,
        markdownConfigFormat,
      });
      const result = await toPlainMarkdown(parsed.content, {
        format: sourceFormat,
        filePath: sourcePath,
      });
      if (result.fallback) {
        fallbacks++;
        console.warn(
          `[plugin-aeo] companions: ${path.relative(siteDir, sourcePath)} did not parse as ${sourceFormat} (${result.error && result.error.message}); used the regex stripper for its companion`,
        );
      }
      body = withTitleBlock(result.markdown, item.title, item.description);
    }

    const target = path.join(outDir, companionPath(item.permalink, trailingSlash));
    await ensureDir(target);
    await fs.writeFile(target, body, 'utf8');

    emitted.push({
      permalink: item.permalink,
      companionPath: target,
      title: item.title,
      description: item.description,
      kind: item.kind,
      pluginName: item.pluginName,
      pluginId: item.pluginId,
      frontMatter: item.frontMatter,
    });

    if (verbose) {
      console.log(
        `[plugin-aeo] companions: emitted ${path.relative(outDir, target)}`,
      );
    }
  }

  if (verbose) {
    console.log(
      `[plugin-aeo] companions: emitted ${emitted.length} file(s)${fallbacks ? `, ${fallbacks} via the regex fallback` : ''}`,
    );
  }
  return emitted;
};

module.exports.collectCompanionItems = collectCompanionItems;
module.exports.withTitleBlock = withTitleBlock;
module.exports.matchAny = matchAny;
