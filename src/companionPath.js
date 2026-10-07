// The one rule for where a page's `.md` companion lives, shared by the
// emitter (feature 1), llms.txt (feature 2) and the Ask AI button (feature 3)
// so the three can never disagree.
//
// Docusaurus emits either /foo/index.html (trailingSlash true or undefined)
// or /foo.html (trailingSlash false); the companion mirrors the HTML:
//
//   route            trailingSlash: false   trailingSlash: true / undefined
//   /                /index.md              /index.md
//   /foo             /foo.md                /foo/index.md
//   /foo/            /foo.md                /foo/index.md
//   /docs/intro      /docs/intro.md         /docs/intro/index.md
//
// Plain CommonJS with no dependencies: required by the Node-side features
// and bundled into the theme component by webpack.

function normalizeRoute(routePath) {
  const cleaned = String(routePath || '').replace(/\/+$/, '');
  return cleaned === '' ? '/' : cleaned;
}

// Site-relative companion path for a route, e.g. '/foo.md'. Always starts
// with '/'.
function companionPath(routePath, trailingSlash) {
  const route = normalizeRoute(routePath);
  if (route === '/') return '/index.md';
  return trailingSlash === false ? `${route}.md` : `${route}/index.md`;
}

// Absolute companion URL for a route, e.g. 'https://example.com/foo.md'.
// `siteUrl` is siteConfig.url; the route already carries siteConfig.baseUrl
// (Docusaurus permalinks and location.pathname both include it).
function companionUrl(siteUrl, routePath, trailingSlash) {
  return `${String(siteUrl || '').replace(/\/+$/, '')}${companionPath(routePath, trailingSlash)}`;
}

// Site-relative path of the HTML file Docusaurus writes for a route, the
// same rule as @docusaurus/core's pathnameToFilename once the route has
// been normalised: '/foo.html' when trailingSlash is false, '/foo/index.html'
// otherwise, '/index.html' for the root.
function htmlPath(routePath, trailingSlash) {
  const route = normalizeRoute(routePath);
  if (route === '/') return '/index.html';
  return trailingSlash === false ? `${route}.html` : `${route}/index.html`;
}

// Absolute URL of the page itself: canonical, no trailing slash except on
// the root.
function pageUrl(siteUrl, routePath) {
  const base = String(siteUrl || '').replace(/\/+$/, '');
  const route = normalizeRoute(routePath);
  return route === '/' ? `${base}/` : `${base}${route}`;
}

module.exports = { companionPath, companionUrl, htmlPath, pageUrl, normalizeRoute };
