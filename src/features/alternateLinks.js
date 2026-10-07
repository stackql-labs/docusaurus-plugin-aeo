// Feature 1b: advertise each page's .md companion from the page itself.
//
// After the companions are written, every route that got one has
//
//   <link rel="alternate" type="text/markdown" href="https://site/foo.md">
//
// inserted into its built HTML before </head>, so an agent that lands on
// the page can find the markdown without guessing the URL. Optionally the
// same relation is written as an HTTP header for Netlify-style hosts via a
// `_headers` file (`Link: <url>; rel="alternate"; type="text/markdown"`),
// for agents that read headers before bodies.
//
// Same approach as @stackql/docusaurus-plugin-structured-data, which also
// post-processes the built HTML in postBuild: the file is a string, the
// insertion point is the first </head>, no DOM library.

const path = require('path');
const fs = require('fs').promises;
const { htmlPath, companionUrl } = require('../companionPath');

const MARK = 'rel="alternate" type="text/markdown"';

function linkTag(href) {
  return `<link ${MARK} href="${href}">`;
}

function headerBlock(route, href) {
  return `${route}\n  Link: <${href}>; rel="alternate"; type="text/markdown"\n`;
}

async function readIfExists(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

module.exports = async function injectAlternateLinks({
  props,
  emittedCompanions,
  linkHeader,
  verbose,
}) {
  const { outDir, siteConfig } = props;
  const trailingSlash = siteConfig.trailingSlash;
  const siteUrl = siteConfig.url;

  let injected = 0;
  let skipped = 0;
  const headerBlocks = [];

  for (const item of emittedCompanions) {
    const href = companionUrl(siteUrl, item.permalink, trailingSlash);
    const file = path.join(outDir, htmlPath(item.permalink, trailingSlash));
    const html = await readIfExists(file);
    if (html === null) {
      skipped++;
      if (verbose) {
        console.log(`[plugin-aeo] alternate link: no HTML at ${path.relative(outDir, file)} for ${item.permalink}`);
      }
      continue;
    }
    if (!html.includes(MARK)) {
      const at = html.indexOf('</head>');
      if (at === -1) {
        skipped++;
        if (verbose) {
          console.log(`[plugin-aeo] alternate link: no </head> in ${path.relative(outDir, file)}`);
        }
        continue;
      }
      await fs.writeFile(file, `${html.slice(0, at)}${linkTag(href)}${html.slice(at)}`, 'utf8');
      injected++;
    }
    if (linkHeader) {
      // Netlify matches the route as requested; with trailingSlash false
      // that is the bare route, otherwise the route with its slash.
      const route = htmlPath(item.permalink, trailingSlash).replace(/index\.html$/, '').replace(/\.html$/, '');
      headerBlocks.push(headerBlock(route === '' ? '/' : route, href));
    }
  }

  if (linkHeader && headerBlocks.length > 0) {
    // Append to a `_headers` the site may already ship from static/.
    const file = path.join(outDir, '_headers');
    const existing = (await readIfExists(file)) || '';
    const banner = '# @stackql/docusaurus-plugin-aeo: .md companions as Link headers\n';
    const sep = existing && !existing.endsWith('\n') ? '\n\n' : existing ? '\n' : '';
    await fs.writeFile(file, `${existing}${sep}${banner}${headerBlocks.join('')}`, 'utf8');
  }

  if (verbose) {
    console.log(
      `[plugin-aeo] alternate link: injected into ${injected} page(s)${skipped ? `, skipped ${skipped}` : ''}${linkHeader ? `, ${headerBlocks.length} _headers rule(s)` : ''}`,
    );
  }
  return { injected, skipped, headerRules: headerBlocks.length };
};
