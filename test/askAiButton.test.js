const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { extractAllSourceCodeFileTranslations, getBabelOptions } = require('@docusaurus/babel');
const { loadTheme, THEME_DIR } = require('./helpers/renderTheme');

const DEFAULT_MESSAGES = {
  'aeo.askAi.button': 'Ask AI about this page',
  'aeo.askAi.provider.claude': 'Ask Claude',
  'aeo.askAi.provider.chatgpt': 'Ask ChatGPT',
  'aeo.askAi.provider.perplexity': 'Ask Perplexity',
};

// Render the button as it would be on `pathname` of a site with this
// config. `messages` plays the part of i18n/<locale>/code.json: translate()
// returns the entry for an id, or the default message when there is none,
// as @docusaurus/Translate does.
function render({ pathname, siteConfig, askAi = {}, companionRoutes, messages = {} }) {
  const AskAiButton = loadTheme('AskAiButton/index.jsx', {
    '@docusaurus/router': { useLocation: () => ({ pathname }) },
    '@docusaurus/useDocusaurusContext': {
      __esModule: true,
      default: () => ({ siteConfig: { url: 'https://example.com', ...siteConfig } }),
    },
    '@docusaurus/useGlobalData': {
      usePluginData: () => ({ askAi: { enabled: true, companionsEnabled: true, ...askAi }, companionRoutes }),
    },
    '@docusaurus/Translate': { translate: ({ id, message }) => messages[id] ?? message },
    // The real Menu renders nothing while closed; show its items so their
    // links can be read.
    '@mui/material/Menu': {
      __esModule: true,
      default: ({ children }) => React.createElement('div', { role: 'menu' }, children),
    },
  }).default;
  // MUI inlines its styles next to the elements; drop them and read the
  // markup by element, not by MUI class name.
  const html = renderToStaticMarkup(React.createElement(AskAiButton)).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
  const textOf = (markup) => markup.replace(/<[^>]*>/g, '');
  const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  return {
    html,
    button: textOf((html.match(/<button[^>]*>[\s\S]*?<\/button>/) || [''])[0]),
    items: links.map((m) => textOf(m[2])),
    // The prompt each provider link carries in its ?q= parameter.
    prompts: links.map((m) => new URL(m[1].replace(/&amp;/g, '&')).searchParams.get('q')),
  };
}

const de = { baseUrl: '/de/', trailingSlash: false };
const deRoutes = ['/de/', '/de/docs/intro'];

test('the visible strings are extracted by `docusaurus write-translations`', async () => {
  // The extractor write-translations runs over a plugin's theme directory.
  const file = path.join(THEME_DIR, 'AskAiButton', 'index.jsx');
  const [result] = await extractAllSourceCodeFileTranslations([file], getBabelOptions({ isServer: true }));
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(
    Object.fromEntries(Object.entries(result.translations).map(([id, t]) => [id, t.message])),
    DEFAULT_MESSAGES,
  );
  for (const [id, t] of Object.entries(result.translations)) {
    assert.ok(t.description, `${id} has a description for translators`);
  }
});

test('with no translation the button shows the default English strings', () => {
  const { button, items } = render({ pathname: '/de/docs/intro', siteConfig: de, companionRoutes: deRoutes });
  assert.equal(button, 'Ask AI about this page');
  assert.deepEqual(items, ['Ask Claude', 'Ask ChatGPT', 'Ask Perplexity']);
});

test('a locale that translates the ids gets its strings on the button and in the menu', () => {
  const messages = {
    'aeo.askAi.button': 'KI zu dieser Seite fragen',
    'aeo.askAi.provider.claude': 'Claude fragen',
    'aeo.askAi.provider.chatgpt': 'ChatGPT fragen',
    'aeo.askAi.provider.perplexity': 'Perplexity fragen',
  };
  const { button, items, html } = render({ pathname: '/de/docs/intro', siteConfig: de, companionRoutes: deRoutes, messages });
  assert.equal(button, 'KI zu dieser Seite fragen');
  assert.deepEqual(items, ['Claude fragen', 'ChatGPT fragen', 'Perplexity fragen']);
  for (const english of Object.values(DEFAULT_MESSAGES)) {
    assert.ok(!html.includes(english), `"${english}" is not hardcoded`);
  }
});

test('localized page: the prompt points at the companion under the locale prefix', () => {
  const { prompts } = render({ pathname: '/de/docs/intro', siteConfig: de, companionRoutes: deRoutes });
  assert.equal(prompts.length, 3);
  for (const prompt of prompts) {
    assert.match(prompt, /^Read https:\/\/example\.com\/de\/docs\/intro\.md and help me understand it\./);
  }
});

test('localized home page: /de/ is a root, so the companion is /de/index.md, not /de.md', () => {
  for (const pathname of ['/de/', '/de']) {
    const { prompts } = render({ pathname, siteConfig: de, companionRoutes: deRoutes });
    assert.equal(prompts.length, 3);
    for (const prompt of prompts) {
      assert.match(prompt, /^Read https:\/\/example\.com\/de\/index\.md and /);
    }
  }
});

test('localized page with trailingSlash true: /de/docs/intro/ -> /de/docs/intro/index.md', () => {
  const { prompts } = render({
    pathname: '/de/docs/intro/',
    siteConfig: { baseUrl: '/de/', trailingSlash: true },
    companionRoutes: ['/de/', '/de/docs/intro/'],
  });
  assert.match(prompts[0], /^Read https:\/\/example\.com\/de\/docs\/intro\/index\.md and /);
});

test('a custom template gets the localized {pageUrl} and {companionUrl}, and the v0.4 {pageUrl}.md idiom', () => {
  const site = { siteConfig: de, companionRoutes: deRoutes };
  const page = render({ ...site, pathname: '/de/docs/intro', askAi: { promptTemplate: '{pageUrl} | {companionUrl}' } });
  assert.equal(page.prompts[0], 'https://example.com/de/docs/intro | https://example.com/de/docs/intro.md');
  const home = render({ ...site, pathname: '/de/', askAi: { promptTemplate: 'Read {pageUrl}.md' } });
  assert.equal(home.prompts[0], 'Read https://example.com/de/index.md');
});

test('{pageUrl} has no trailing slash except on a root: the site root or a base URL', () => {
  const askAi = { promptTemplate: '{pageUrl}' };
  const at = (pathname, siteConfig, companionRoutes) => render({ pathname, siteConfig, companionRoutes, askAi }).prompts[0];
  const root = { baseUrl: '/', trailingSlash: true };
  assert.equal(at('/', root, ['/', '/docs/intro/']), 'https://example.com/');
  assert.equal(at('/docs/intro/', root, ['/', '/docs/intro/']), 'https://example.com/docs/intro');
  const localized = { baseUrl: '/de/', trailingSlash: true };
  assert.equal(at('/de/', localized, ['/de/', '/de/docs/intro/']), 'https://example.com/de/');
  assert.equal(at('/de/docs/intro/', localized, ['/de/', '/de/docs/intro/']), 'https://example.com/de/docs/intro');
  const based = { baseUrl: '/docs/', trailingSlash: false };
  assert.equal(at('/docs/', based, ['/docs/', '/docs/guide']), 'https://example.com/docs/');
  assert.equal(at('/docs/guide', based, ['/docs/', '/docs/guide']), 'https://example.com/docs/guide');
});

test('the button is styled from the site theme, with no colour of its own', () => {
  // Brand marks keep their brand colours; everything else follows the
  // site's Infima variables so the button fits any Docusaurus site.
  for (const rel of ['AskAiButton/index.jsx', 'AskAiButton/styles.module.css']) {
    const source = fs.readFileSync(path.join(THEME_DIR, rel), 'utf8');
    assert.doesNotMatch(source, /rgba?\(|hsla?\(|#[0-9a-fA-F]{3,8}\b/, rel);
  }
});

test('localized site with companions disabled: the prompt uses the page under the locale prefix', () => {
  const { prompts } = render({ pathname: '/de/docs/intro', siteConfig: de, askAi: { companionsEnabled: false } });
  assert.match(prompts[0], /^Read https:\/\/example\.com\/de\/docs\/intro and /);
});

test('localized site: no button on a route without a companion', () => {
  const { html } = render({ pathname: '/de/search', siteConfig: de, companionRoutes: deRoutes });
  assert.equal(html, '');
});

test('root baseUrl is unchanged: / -> /index.md, /docs/intro -> /docs/intro.md', () => {
  const site = { siteConfig: { baseUrl: '/', trailingSlash: false }, companionRoutes: ['/', '/docs/intro'] };
  assert.match(render({ ...site, pathname: '/' }).prompts[0], /^Read https:\/\/example\.com\/index\.md and /);
  assert.match(render({ ...site, pathname: '/docs/intro' }).prompts[0], /^Read https:\/\/example\.com\/docs\/intro\.md and /);
});
