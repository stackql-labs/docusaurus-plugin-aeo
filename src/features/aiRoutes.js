// Feature 4: validate that pages under /ai/* carry frontmatter payloads
// consistent with their filename pattern. Off by default.
//
// Convention enforced when enabled:
//   ai/faqs/<slug>.md          -> must declare a `faq` frontmatter object
//   ai/howto/<slug>.md         -> must declare a `howTo` frontmatter object
//   ai/howtos/<slug>.md        -> same as above
//   ai/apps/<slug>.md          -> must declare a `softwareApplication`
//                                   frontmatter object
//
// Anything else under /ai/* is permitted without a payload (consumer can
// extend this with additional checks if needed).

const KIND_FOR_DIR = {
  faqs: 'faq',
  faq: 'faq',
  howto: 'howTo',
  howtos: 'howTo',
  apps: 'softwareApplication',
  app: 'softwareApplication',
  applications: 'softwareApplication',
};

function classify(permalink) {
  // permalink like "/ai/faqs/foo"
  if (!permalink.startsWith('/ai/')) return null;
  const segments = permalink.split('/').filter(Boolean); // ["ai", "faqs", "foo"]
  if (segments.length < 2) return null;
  const dir = segments[1].toLowerCase();
  return KIND_FOR_DIR[dir] || null;
}

function collectDocs(content) {
  const out = [];
  if (!content || !Array.isArray(content.loadedVersions)) return out;
  for (const v of content.loadedVersions) {
    if (!Array.isArray(v.docs)) continue;
    for (const d of v.docs) {
      out.push(d);
    }
  }
  return out;
}

function validateAiRoutes({ loadedContentByPlugin, verbose }) {
  const problems = [];
  for (const [, entry] of loadedContentByPlugin) {
    if (entry.pluginName !== 'docusaurus-plugin-content-docs') continue;
    const docs = collectDocs(entry.content);
    for (const doc of docs) {
      const permalink = doc.permalink;
      if (!permalink) continue;
      const expectedKey = classify(permalink);
      if (!expectedKey) continue;
      const fm = doc.frontMatter || {};
      const value = fm[expectedKey];
      if (
        value === undefined ||
        value === null ||
        (typeof value === 'object' && Object.keys(value).length === 0)
      ) {
        problems.push(
          `[plugin-aeo] aiRoutes: ${permalink} is missing required frontmatter "${expectedKey}" (source: ${doc.source || doc.id})`,
        );
      }
    }
  }

  if (problems.length > 0) {
    const msg = problems.join('\n');
    if (verbose) {
      console.warn(msg);
    } else {
      console.warn(
        `[plugin-aeo] aiRoutes: ${problems.length} validation issue(s). Enable verbose: true for details.`,
      );
    }
  } else if (verbose) {
    console.log('[plugin-aeo] aiRoutes: validation OK');
  }
}

module.exports = { validateAiRoutes, classify };
