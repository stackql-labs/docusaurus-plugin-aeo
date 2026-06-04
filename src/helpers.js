// Helpers exported as "@stackql/docusaurus-plugin-aeo/helpers".
//
// These are pure data helpers - consumers spread them into their other
// plugin configs (notably @stackql/docusaurus-plugin-structured-data) so
// that /ai/* routes don't pollute breadcrumb / hierarchy generation aimed
// at humans.

// Glob patterns that match the /ai/* routing convention.
const AI_ROUTE_PATTERNS = ['/ai', '/ai/**'];

// Default exclude block that other plugins (e.g. structured-data,
// sitemap-like plugins) can splice into their own ignore lists.
const structuredDataExclude = {
  // Exclude /ai/* from breadcrumb structured data generation.
  excludedRoutes: [...AI_ROUTE_PATTERNS],
};

// Convenience: a sitemap config slice that asks the sitemap plugin to
// skip /ai/* (these routes are aimed at machines, not search-indexed
// human navigation).
const sitemapExclude = {
  ignorePatterns: [...AI_ROUTE_PATTERNS],
};

// Predicate consumers can use in custom code.
function isAiRoute(permalink) {
  return typeof permalink === 'string' && permalink.startsWith('/ai/');
}

module.exports = {
  AI_ROUTE_PATTERNS,
  structuredDataExclude,
  sitemapExclude,
  isAiRoute,
};
