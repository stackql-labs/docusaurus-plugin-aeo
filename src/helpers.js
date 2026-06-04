// Helpers exported as "@stackql/docusaurus-plugin-aeo/helpers".
//
// These are pure data helpers - consumers spread them into other plugin
// configs so that /ai/* routes don't pollute artifacts aimed at humans
// (sitemaps, breadcrumb graphs, etc.).

// Glob patterns matching the /ai/* convention. Suitable for plugins whose
// exclude lists accept globs (notably @docusaurus/plugin-sitemap, which
// uses `ignorePatterns`).
const AI_ROUTE_PATTERNS = ['/ai', '/ai/**'];

// Sitemap slice for @docusaurus/plugin-sitemap (standalone or via preset).
// Usage:
//   [
//     '@docusaurus/plugin-sitemap',
//     { ...sitemapExclude, /* your other sitemap options */ },
//   ]
const sitemapExclude = {
  ignorePatterns: [...AI_ROUTE_PATTERNS],
};

// Predicate consumers can use in custom code or when building an exact
// excludedRoutes list for plugins that don't accept globs (e.g.
// @stackql/docusaurus-plugin-structured-data, whose `excludedRoutes`
// is an exact-match array).
function isAiRoute(permalink) {
  return typeof permalink === 'string' && permalink.startsWith('/ai/');
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
function buildStructuredDataAiExcludes(allRoutePaths) {
  if (!Array.isArray(allRoutePaths)) return [];
  return allRoutePaths.filter(isAiRoute).concat(['/ai']);
}

module.exports = {
  AI_ROUTE_PATTERNS,
  sitemapExclude,
  isAiRoute,
  buildStructuredDataAiExcludes,
};
