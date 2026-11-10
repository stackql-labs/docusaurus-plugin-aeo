// Route glob matching for the `exclude` / `include` options.
//
// A pattern describes a route of the site: '/blog/tags/**', '/search'.
// Docusaurus permalinks carry siteConfig.baseUrl, and that differs between
// builds of the same site: a localized build runs with baseUrl '/de/', so
// the page a pattern names is '/de/blog/tags/x' there. A pattern is
// therefore tried against the route with the base URL removed as well as
// the route as Docusaurus reports it:
//
//   - one configuration covers every locale and any baseUrl, and
//   - a pattern that spells the base out keeps working ('/docs/guide/**' on
//     a site built at '/docs/') and can single out one locale
//     ('/de/blog/**').
//
// Minimal matcher, to avoid pulling micromatch in directly: `**` matches
// across path segments, `*` and `?` within one.

const { stripBase } = require('./companionPath');

function toRegExp(glob) {
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

// True when `value` matches at least one glob. No patterns, no match.
function matchAny(value, patterns) {
  if (!patterns || patterns.length === 0) return false;
  for (const p of patterns) {
    if (toRegExp(p).test(value)) return true;
  }
  return false;
}

// True when a permalink matches at least one glob, with or without
// `baseUrl` (siteConfig.baseUrl) in front of it.
function matchesRoute(permalink, patterns, baseUrl) {
  if (matchAny(permalink, patterns)) return true;
  const relative = stripBase(permalink, baseUrl);
  return relative !== permalink && matchAny(relative, patterns);
}

module.exports = { toRegExp, matchAny, matchesRoute };
