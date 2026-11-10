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

// Every function below takes an optional `baseUrl` (siteConfig.baseUrl).
// Docusaurus permalinks and location.pathname carry it, and the part of
// the route that is the base is a root, not a page: on a site built at
// '/docs/' or in a localized build (baseUrl '/de/') the route '/de/' is the
// home page, whose companion is '/de/index.md', not '/de.md'. With the
// default '/' nothing changes.
function withBase(baseUrl, sitePath) {
  return `${String(baseUrl || '/').replace(/\/+$/, '')}${sitePath}`;
}

// Site-relative companion path for a route, e.g. '/foo.md'. Always starts
// with '/'.
function companionPath(routePath, trailingSlash, baseUrl) {
  const route = outputRoute(routePath, baseUrl);
  const rel = route === '/'
    ? '/index.md'
    : trailingSlash === false ? `${route}.md` : `${route}/index.md`;
  return withBase(baseUrl, rel);
}

// Absolute companion URL for a route, e.g. 'https://example.com/foo.md'.
// `siteUrl` is siteConfig.url.
function companionUrl(siteUrl, routePath, trailingSlash, baseUrl) {
  return `${String(siteUrl || '').replace(/\/+$/, '')}${companionPath(routePath, trailingSlash, baseUrl)}`;
}

// Site-relative path of the HTML file Docusaurus writes for a route, the
// same rule as @docusaurus/core's pathnameToFilename once the route has
// been normalised: '/foo.html' when trailingSlash is false, '/foo/index.html'
// otherwise, '/index.html' for the root.
function htmlPath(routePath, trailingSlash, baseUrl) {
  const route = outputRoute(routePath, baseUrl);
  const rel = route === '/'
    ? '/index.html'
    : trailingSlash === false ? `${route}.html` : `${route}/index.html`;
  return withBase(baseUrl, rel);
}

// Absolute URL of the page itself: canonical, no trailing slash except on
// the root (the site root, or the localized root '/de/').
function pageUrl(siteUrl, routePath, baseUrl) {
  const base = String(siteUrl || '').replace(/\/+$/, '');
  const route = outputRoute(routePath, baseUrl);
  return `${base}${withBase(baseUrl, route)}`;
}

// The route relative to the build output tree. Docusaurus permalinks carry
// siteConfig.baseUrl, but the output tree is rooted at it: a site with
// baseUrl '/docs/' writes /docs/intro to build/intro.html, and a localized
// build (baseUrl '/de/', outDir build/de) writes /de/intro to
// build/de/intro.html. URLs keep the full route (pass baseUrl to the
// functions above); file paths under outDir use this route with no base.
function outputRoute(routePath, baseUrl) {
  const route = normalizeRoute(routePath);
  const base = String(baseUrl || '/').replace(/\/+$/, '');
  if (base === '') return route;
  if (route === base) return '/';
  return route.startsWith(`${base}/`) ? route.slice(base.length) : route;
}

module.exports = { companionPath, companionUrl, htmlPath, pageUrl, outputRoute, normalizeRoute };
