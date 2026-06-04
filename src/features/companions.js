const path = require('path');
const fs = require('fs').promises;
const matter = require('gray-matter');

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

function stripMdx(source) {
  let out = source;
  // Strip import / export lines (top-of-file MDX).
  out = out.replace(/^\s*import\s+[^\n]+\n/gm, '');
  out = out.replace(/^\s*export\s+[^\n]+\n/gm, '');
  // Strip self-closing JSX tags like <Component prop="x" />.
  out = out.replace(/<([A-Z][A-Za-z0-9]*)\b[^>]*\/>\s*/g, '');
  // Strip paired JSX blocks like <Foo>...</Foo> (non-greedy, single component).
  out = out.replace(
    /<([A-Z][A-Za-z0-9]*)\b[^>]*>[\s\S]*?<\/\1>\s*/g,
    '',
  );
  // Strip stray opening or closing component tags left behind.
  out = out.replace(/<\/?[A-Z][A-Za-z0-9]*\b[^>]*>/g, '');
  // Collapse 3+ blank lines.
  out = out.replace(/\n{3,}/g, '\n\n');
  return out;
}

function routeToCompanionPath(routePath, trailingSlash, outDir) {
  // Docusaurus emits either /foo/index.html (trailingSlash: true / undefined)
  // or /foo.html (trailingSlash: false). The companion mirrors the HTML.
  let rel;
  if (routePath === '/' || routePath === '') {
    rel = 'index.md';
  } else {
    const cleaned = routePath.replace(/^\/+|\/+$/g, '');
    if (trailingSlash === false) {
      rel = `${cleaned}.md`;
    } else {
      // true or undefined (Docusaurus default behavior: index.html in folder)
      rel = `${cleaned}/index.md`;
    }
  }
  return path.join(outDir, rel);
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

module.exports = async function emitCompanions({
  props,
  options,
  loadedContentByPlugin,
  verbose,
}) {
  const { outDir, siteConfig, siteDir } = props;
  const trailingSlash = siteConfig.trailingSlash;
  const excludePatterns = options.exclude || [];
  const format = options.format;

  // Build the work list from captured loadedContent.
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

  const emitted = [];
  for (const item of items) {
    if (matchAny(item.permalink, excludePatterns)) {
      if (verbose) {
        console.log(`[plugin-aeo] companions: excluded ${item.permalink}`);
      }
      continue;
    }

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
      // Strip frontmatter, then strip MDX-specific bits.
      const parsed = matter(raw);
      body = stripMdx(parsed.content);
      // Re-prepend a minimal "title + description" block so an LLM can see them
      // without parsing YAML.
      const prefixParts = [];
      if (item.title) prefixParts.push(`# ${item.title}`);
      if (item.description) prefixParts.push(`> ${item.description}`);
      if (prefixParts.length > 0) {
        body = `${prefixParts.join('\n\n')}\n\n${body.trim()}\n`;
      }
    }

    const target = routeToCompanionPath(item.permalink, trailingSlash, outDir);
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
    console.log(`[plugin-aeo] companions: emitted ${emitted.length} file(s)`);
  }
  return emitted;
};
