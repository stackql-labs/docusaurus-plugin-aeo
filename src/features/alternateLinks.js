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
// for agents that read headers before bodies. The file sits at the root of
// the build directory, shared by every locale built into it.
//
// Same approach as @stackql/docusaurus-plugin-structured-data, which also
// post-processes the built HTML in postBuild: the file is a string, the
// insertion point is the first </head>, no DOM library.

const path = require('path');
const fs = require('fs').promises;
const { htmlPath, companionUrl, outputRoute } = require('../companionPath');

const MARK = 'rel="alternate" type="text/markdown"';

function linkTag(href) {
  return `<link ${MARK} href="${href}">`;
}

function headerBlock(route, href) {
  return `${route}\n  Link: <${href}>; rel="alternate"; type="text/markdown"\n`;
}

// Where `_headers` goes. Hosts read it from the root of the deployed
// directory only. A build of several locales puts every locale but the
// default in a sub-directory of the build directory named after the locale
// (baseUrl '/de/' or '/docs/de/' -> build/de), so that locale's rules belong
// one level up, in the file the default locale's build wrote (Docusaurus
// builds the default locale first). Every other build is its own root: one
// locale, a locale built on its own (`--locale de`, baseUrl '/'), a locale
// given its own baseUrl, or a core that passes no i18n.
function headersDir({ outDir, siteConfig, i18n }) {
  const locale = i18n && i18n.currentLocale;
  if (!locale || locale === i18n.defaultLocale) return outDir;
  const base = String(siteConfig.baseUrl || '/').replace(/\/+$/, '');
  const nested = base.endsWith(`/${locale}`) && path.basename(outDir) === locale;
  return nested ? path.dirname(outDir) : outDir;
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
    const href = companionUrl(siteUrl, item.permalink, trailingSlash, siteConfig.baseUrl);
    // The HTML lives under outDir at the route without siteConfig.baseUrl
    // (see outputRoute); the URL and the _headers route keep the full one.
    const file = path.join(
      outDir,
      htmlPath(outputRoute(item.permalink, siteConfig.baseUrl), trailingSlash),
    );
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
      const route = htmlPath(item.permalink, trailingSlash, siteConfig.baseUrl).replace(/index\.html$/, '').replace(/\.html$/, '');
      headerBlocks.push(headerBlock(route === '' ? '/' : route, href));
    }
  }

  if (linkHeader && headerBlocks.length > 0) {
    // Append to a `_headers` the site may already ship from static/, or
    // that another locale's build has already added its rules to. A rule
    // already in the file is not written again.
    const file = path.join(headersDir(props), '_headers');
    const existing = (await readIfExists(file)) || '';
    const fresh = headerBlocks.filter((block) => !existing.includes(block));
    if (fresh.length > 0) {
      const banner = '# @stackql/docusaurus-plugin-aeo: .md companions as Link headers\n';
      const sep = existing && !existing.endsWith('\n') ? '\n\n' : existing ? '\n' : '';
      await fs.writeFile(file, `${existing}${sep}${banner}${fresh.join('')}`, 'utf8');
    }
  }

  if (verbose) {
    console.log(
      `[plugin-aeo] alternate link: injected into ${injected} page(s)${skipped ? `, skipped ${skipped}` : ''}${linkHeader ? `, ${headerBlocks.length} _headers rule(s)` : ''}`,
    );
  }
  return { injected, skipped, headerRules: headerBlocks.length };
};
