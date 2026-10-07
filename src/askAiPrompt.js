// Fills the Ask AI prompt template. Plain CommonJS so the theme component
// can bundle it and the tests can require it.
//
//   {companionUrl}  the page's .md companion (absolute URL)
//   {pageUrl}       the page itself (canonical, no trailing slash)
//
// The v0.4 idiom `{pageUrl}.md` is still honoured so a custom template
// keeps working. It was wrong for the homepage (`https://site.md`) and for
// sites that build /foo/index.html; it now resolves to the real companion
// URL.
function fillPrompt(template, { pageUrl, companionUrl }) {
  return String(template || '')
    .split('{pageUrl}.md')
    .join(companionUrl)
    .split('{companionUrl}')
    .join(companionUrl)
    .split('{pageUrl}')
    .join(pageUrl);
}

module.exports = { fillPrompt };
