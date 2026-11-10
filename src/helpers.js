// Helpers exported as "@stackql/docusaurus-plugin-aeo/helpers".
//
// These are pure data helpers - consumers spread them into other plugin
// configs so that /ai/* routes don't pollute artifacts aimed at humans
// (sitemaps, breadcrumb graphs, etc.).
//
// The convention is relative to the site's base URL. Docusaurus routes
// carry it, so on a site built at '/docs/' the routes are '/docs/ai/...'
// and in a localized build they are '/de/ai/...'. Every helper takes the
// base URL as an optional argument; without one it means '/'.

const { stripBase } = require('./companionPath');

// Glob patterns matching the /ai/* convention under a base URL:
// aiRoutePatterns('/de/') is ['/de/ai', '/de/ai/**']. Suitable for plugins
// whose exclude lists accept globs and match full route paths (notably
// @docusaurus/plugin-sitemap's `ignorePatterns`). One list can cover every
// locale of a site:
//   ignorePatterns: ['/', '/de/'].flatMap(aiRoutePatterns)
function aiRoutePatterns(baseUrl) {
  const base = String(baseUrl || '/').replace(/\/+$/, '');
  return [`${base}/ai`, `${base}/ai/**`];
}

// The patterns for a site at the root with one locale.
const AI_ROUTE_PATTERNS = aiRoutePatterns('/');

// Sitemap slice for @docusaurus/plugin-sitemap (standalone or via preset),
// for a site at the root with one locale. Usage:
//   [
//     '@docusaurus/plugin-sitemap',
//     { ...sitemapExclude, /* your other sitemap options */ },
//   ]
// With a base URL or several locales, build `ignorePatterns` from
// aiRoutePatterns instead.
const sitemapExclude = {
  ignorePatterns: [...AI_ROUTE_PATTERNS],
};

// Predicate consumers can use in custom code or when building an exact
// excludedRoutes list for plugins that don't accept globs (e.g.
// @stackql/docusaurus-plugin-structured-data, whose `excludedRoutes`
// is an exact-match array).
function isAiRoute(permalink, baseUrl) {
  return typeof permalink === 'string' && stripBase(permalink, baseUrl).startsWith('/ai/');
}

// Build an exact-match exclude list for @stackql/docusaurus-plugin-
// structured-data. That plugin compares `themeConfig.structuredData
// .excludedRoutes` with strict equality, so globs don't work there.
//
// Pass an array of route permalinks (typically the docs/blog plugin
// outputs, or your own enumerated list); the function returns the subset
// that matches /ai/*. Spread the result into your structuredData config:
//
//   themeConfig: {
//     structuredData: {
//       excludedRoutes: [
//         ...buildStructuredDataAiExcludes(allRoutePaths),
//         // ...other exact-match routes you want to skip
//       ],
//       // ...rest of structuredData config
//     },
//   }
//
// If you don't have the route list at config time, list the known
// /ai/* parents by hand (e.g. ['/ai', '/ai/faqs/install', ...]); the
// glob-based AI_ROUTE_PATTERNS will NOT work for that plugin.
//
// With a base URL, pass it as the second argument: the routes are matched
// under it and the parent route returned is '<baseUrl>ai'.
function buildStructuredDataAiExcludes(allRoutePaths, baseUrl) {
  if (!Array.isArray(allRoutePaths)) return [];
  return allRoutePaths
    .filter((permalink) => isAiRoute(permalink, baseUrl))
    .concat([aiRoutePatterns(baseUrl)[0]]);
}

module.exports = {
  AI_ROUTE_PATTERNS,
  aiRoutePatterns,
  sitemapExclude,
  isAiRoute,
  buildStructuredDataAiExcludes,
};
