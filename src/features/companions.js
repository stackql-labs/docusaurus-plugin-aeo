const path = require('path');
const fs = require('fs').promises;
const matter = require('gray-matter');
const { companionPath, pageUrl, outputRoute } = require('../companionPath');
const { matchAny, matchesRoute } = require('../routeGlob');
const { toPlainMarkdown, resolveFormat } = require('./plainMarkdown');

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
// button which routes have one. `baseUrl` is siteConfig.baseUrl: an exclude
// pattern matches a route with or without it (see src/routeGlob.js), so the
// same patterns apply in every locale's build.
function collectCompanionItems(loadedContentByPlugin, options, baseUrl) {
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
  return items.filter((item) => !matchesRoute(item.permalink, exclude, baseUrl));
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

// Put the page's title, description and canonical URL at the top of a
// plain companion so an LLM sees them without parsing YAML, and can cite
// the page:
//
//   # Title
//
//   > description
//
//   Source: https://site/route
//
// A body that already opens with an H1 keeps it; the rest goes under it.
function withTitleBlock(markdown, title, description, sourceUrl) {
  const lines = markdown.split('\n');
  const first = lines.findIndex((l) => l.trim() !== '');
  const hasH1 = first >= 0 && /^#\s+\S/.test(lines[first]);
  const extras = [];
  if (description) extras.push(`> ${String(description).replace(/\s+/g, ' ').trim()}`);
  if (sourceUrl) extras.push(`Source: ${sourceUrl}`);
  if (hasH1) {
    if (extras.length === 0) return markdown;
    return [...lines.slice(0, first + 1), '', extras.join('\n\n'), ...lines.slice(first + 1)].join('\n');
  }
  const head = [];
  if (title) head.push(`# ${title}`);
  head.push(...extras);
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
  // 'clean' is accepted as a synonym for 'plain' (the name the external
  // audit of 0.4.2 used for this behaviour).
  const format = options.format === 'clean' ? 'plain' : options.format;
  const markdownConfigFormat = siteConfig.markdown && siteConfig.markdown.format;

  const items = collectCompanionItems(loadedContentByPlugin, options, siteConfig.baseUrl);

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
      body = withTitleBlock(
        result.markdown,
        item.title,
        item.description,
        pageUrl(siteConfig.url, item.permalink, siteConfig.baseUrl),
      );
    }

    // The permalink carries siteConfig.baseUrl (localized to /<locale>/ in a
    // localized build, whose outDir is build/<locale>); the file goes under
    // outDir at the route without it.
    const target = path.join(
      outDir,
      companionPath(outputRoute(item.permalink, siteConfig.baseUrl), trailingSlash),
    );
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
