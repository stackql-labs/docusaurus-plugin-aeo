[![NPM Version](https://img.shields.io/npm/v/%40stackql%2Fdocusaurus-plugin-aeo)](https://www.npmjs.com/package/@stackql/docusaurus-plugin-aeo) 
[![NPM Downloads](https://img.shields.io/npm/d18m/%40stackql%2Fdocusaurus-plugin-aeo)](https://www.npmjs.com/package/@stackql/docusaurus-plugin-aeo)

# @stackql/docusaurus-plugin-aeo

AEO (Answer Engine Optimization) helpers for Docusaurus 3.x sites: emit plain-markdown `.md` companions for docs and blog posts, generate `llms.txt` and `llms-full.txt` at the build root, add an "Ask AI" dropdown above doc and blog content, and document a `/ai/*` routing convention for machine-readable companion content. This is a sibling to `@stackql/docusaurus-plugin-structured-data` (which emits JSON-LD); the two plugins compose without overlap.

## Installation

```bash
npm install @stackql/docusaurus-plugin-aeo
```

```bash
yarn add @stackql/docusaurus-plugin-aeo
```

## Setup

Minimal `docusaurus.config.js`:

```js
module.exports = {
  // ...
  plugins: [
    '@stackql/docusaurus-plugin-aeo',
  ],
};
```

Companions, `llms.txt` / `llms-full.txt`, and the Ask AI button are enabled by default. The `/ai/*` docs instance requires site configuration, and its optional validator is off by default. To configure, pass options:

```js
module.exports = {
  plugins: [
    [
      '@stackql/docusaurus-plugin-aeo',
      {
        companions: { format: 'raw' },
        llmsTxt: { header: 'StackQL is a SQL interface to cloud and SaaS APIs.' },
        askAi: { providerOrder: ['claude', 'perplexity', 'chatgpt'] },
        verbose: true,
      },
    ],
  ],
};
```

## Feature 1: `.md` companion files

For each doc or blog post with a readable source file, this plugin writes a sibling `.md` file unless its permalink matches `companions.exclude`. The companion mirrors the HTML layout: a page at `/docs/intro` gets `/docs/intro/index.md` (or `/docs/intro.md` if `siteConfig.trailingSlash` is `false`). A doc or blog post at the site root gets `/index.md`. The same URL rule (`src/companionPath.js`) is used by `llms.txt` and the Ask AI button.

Two modes:

- `companions.format: 'plain'` (default since 0.5.0; `'clean'` is accepted as a synonym): plain markdown rendered from the MDX source, with a `# Title`, `> description` and `Source: <page URL>` block from the page metadata at the top, so an LLM can cite the page without parsing YAML. The converter uses remark-mdx, GFM, directives and comments to locate MDX constructs, then edits the original text by source position. It does not load the site's custom remark/rehype plugins:
  - `import` / `export` statements and `{expressions}` are removed (a string literal expression keeps its value)
  - presentational elements (`<svg>`, `<video>`, `<iframe>`, icons, ...) are dropped with their subtree
  - `<Tabs>` / `<TabItem>` become a bold label per tab followed by the tab's content; the label comes from the `label` attribute or from the `<Tabs values={[...]}>` expression
  - `<a>`, `<img>`, `<b>`, `<i>`, `<code>`, `<h2>`, `<br>`, `<details>` / `<summary>` become their markdown equivalent
  - a self-closing component that plainly carries a link (`to` or `href` plus `text`, `label` or `title`) becomes a markdown link, so download buttons survive
  - everything else (`<div>`, `<Box>`, `<span>`, your own layout components) is unwrapped: the tags go, the children stay, and indentation the author added inside the container is removed
  - HTML comments (including `<!-- truncate -->`) and `{#custom-id}` heading ids are removed outside ordinary code fences; `mdx-code-block` fences are unwrapped and their contents are processed as markup

  Markdown is not re-stringified, so `snake_case` is not escaped and Markdown syntax is retained. Output is not byte-for-byte identical: line endings become LF, surplus blank lines and outer whitespace are trimmed, leading/trailing horizontal rules are removed, and content inside unwrapped containers is dedented. An existing opening H1 is retained instead of adding another title. A Markdown/MDX parse or conversion failure uses a regex fallback and logs a warning; front matter parsing errors are not covered by that fallback.

  Source format follows front matter `format`, then `siteConfig.markdown.format`; `detect` selects by extension (`.md` as Markdown, `.mdx` as MDX). Files resolved as `md` use a CommonMark parser with GFM and directives, with HTML tags stripped or converted.
- `companions.format: 'raw'`: the MDX source is emitted as-is, front matter included. MDX `<Component />` tags, imports and inline SVG data all pass through.

Fetch example:

```bash
curl https://your-site.example/docs/intro/index.md
```

**MIME type note.** The plugin writes `.md` files; the host determines their `Content-Type`. Check a deployed companion with `curl -I` and configure the host if needed. The alternate link below advertises the companion as `text/markdown` but does not set its HTTP response type.

### Advertising the companion from the page

Every page that has a companion gets, in its `<head>`:

```html
<link rel="alternate" type="text/markdown" href="https://your-site.example/docs/intro/index.md">
```

inserted into the built HTML in `postBuild` (the same pattern `@stackql/docusaurus-plugin-structured-data` uses). An agent that lands on the HTML can find the markdown without guessing the URL, and agent-readiness checkers score it. The href is absolute and follows the same rule as the file on disk. Options:

| Option | Default | Description |
| --- | --- | --- |
| `companions.alternateLink` | `true` | Insert the `<link rel="alternate" type="text/markdown">` tag into each page that has a companion. |
| `companions.linkHeader` | `false` | Also write the relation as an HTTP header for Netlify-style hosts: a `_headers` file in the build root with `Link: <url>; rel="alternate"; type="text/markdown"` per route (appended to a `_headers` your `static/` already ships). Requires `companions.alternateLink: true`. |

Generated category indexes, custom React pages and blog listing pages do not get companions. `verbose: true` logs unreadable source files and missing HTML during alternate-link insertion.

## Feature 2: `llms.txt` and `llms-full.txt`

With the defaults enabled, the plugin writes two files to the build root after emitting companions. Both use the emitted companion list, filtered by `llmsTxt.include` and `llmsTxt.exclude`. If companions are disabled, `llms.txt` contains only the site title, tagline and optional header; no page entries or `llms-full.txt` are emitted.

- `llms.txt` - sectioned index of included doc/blog companions, in the format described at <https://llmstxt.org>. Links are absolute (`https://site/foo.md`) since 0.5.0, as the spec's examples are; the file is read away from the site, where a relative link has no base:

  ```text
  # StackQL

  > A SQL interface to cloud and SaaS APIs.

  ## Documentation

  - [Getting started](https://stackql.io/docs/intro/index.md): Install StackQL and run your first query.
  - [Providers](https://stackql.io/docs/providers/index.md): Catalog of supported cloud APIs.

  ## Blog

  - [Querying Snowflake with StackQL](https://stackql.io/blog/snowflake/index.md): ...

  ## Optional

  - [Full text of every page](https://stackql.io/llms-full.txt): one file with the content of every page listed above
  ```

  The `## Optional` section is the llmstxt.org convention for secondary resources a reader can skip; it points at `llms-full.txt` whenever that file is emitted (`llmsTxt.linkFullTxt`, default `true`).

- `llms-full.txt` - the included companions concatenated with a `\n---\n\n` separator, each block carrying a `Source: <page URL>` line and the page's title (a plain companion already opens with both; a raw one has them added) so an LLM can cite individual sections. Limit it to chosen content instances or a byte budget with the object form of `llmsTxt.fullTxt` (below).

Options:

| Option | Default | Description |
| --- | --- | --- |
| `llmsTxt.enabled` | `true` | Master switch. |
| `llmsTxt.exclude` | `["/search", "/404", "/blog/tags/**", "/blog/page/**", "/blog/archive", "/blog/authors/**"]` | Route glob patterns to skip. |
| `llmsTxt.include` | `null` | If set, only routes matching at least one pattern are included. Use for opt-in mode. |
| `llmsTxt.header` | `null` | String inserted after the site title/tagline and before the section list. Good for a project intro paragraph or links to key external resources. |
| `llmsTxt.sections` | `{ docs: 'Documentation', blog: 'Blog', pages: 'Pages' }` | Section title overrides for the default per-type grouping. |
| `llmsTxt.instanceSections` | `null` | Per-content-plugin-instance section map. When set, supersedes `sections` (see below). |
| `llmsTxt.fullTxt` | `true` | Emit `llms-full.txt`. `true` is every section, uncapped. The object form `{ include?: string[], maxBytes?: number }` limits it: `include` names the content instances to concatenate (`'<pluginName>@<pluginId>'` keys, e.g. `'docusaurus-plugin-content-docs@ai'`; with per-type grouping the keys are `docs`, `blog`, `pages`), in `llms.txt` section order; `maxBytes` stops appending once the next page would cross the cap, so the file always ends on a whole page. The budget includes section headings and separators. If the first page exceeds it, the file is empty. An omitted or empty `include` selects all sections. |
| `llmsTxt.linkFullTxt` | `true` | Add the `## Optional` section to `llms.txt` with a link to `llms-full.txt`. |

Glob patterns are matched against route permalinks. `**` matches across path segments; `*` matches within a single segment.

### Per-instance sectioning

By default, `llms.txt` groups by content-plugin TYPE: every `@docusaurus/plugin-content-docs` instance lands under one `## Documentation` heading, every blog instance under `## Blog`, and so on. This is fine for sites with a single docs instance, but it breaks down for sites that run multiple docs instances with different audiences - for example, one for human-facing docs at `/docs/*` and one for AI-targeted reference content at `/ai/*`. In that case, `llms.txt` and `llms-full.txt` interleave both surfaces under one heading, hiding the corpus shape from the crawlers and agents the file exists to serve.

Set `llmsTxt.instanceSections` to switch to per-instance grouping. Keys are `"${pluginName}@${pluginId}"`; each value is `{ title, order? }`.

Two content-docs instances + blog in `docusaurus.config.js`:

```js
module.exports = {
  plugins: [
    '@docusaurus/plugin-content-blog',           // id: 'default'
    '@docusaurus/plugin-content-docs',           // id: 'default'
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'ai',
        routeBasePath: '/ai',
        path: 'ai-content',
        sidebarPath: false,
      },
    ],
    [
      '@stackql/docusaurus-plugin-aeo',
      {
        llmsTxt: {
          instanceSections: {
            'docusaurus-plugin-content-docs@default': { title: 'Documentation', order: 1 },
            'docusaurus-plugin-content-docs@ai':      { title: 'AI Reference',  order: 2 },
            'docusaurus-plugin-content-blog@default': { title: 'Blog',          order: 3 },
          },
        },
      },
    ],
  ],
};
```

Resulting `llms.txt`:

```text
# Your site

> Your tagline.

## Documentation

- [Getting started](https://your-site.example/docs/intro/index.md): Install and run your first query.
- [Providers](https://your-site.example/docs/providers/index.md): Catalog of supported cloud APIs.

## AI Reference

- [What is StackQL](https://your-site.example/ai/faqs/what-is-stackql/index.md): Canonical one-paragraph definition.
- [Connecting to AWS](https://your-site.example/ai/howto/connect-to-aws/index.md): Step-by-step authentication.

## Blog

- [Querying Snowflake](https://your-site.example/blog/snowflake/index.md): ...

## Optional

- [Full text of every page](https://your-site.example/llms-full.txt): one file with the content of every page listed above
```

`llms-full.txt` mirrors the same section structure: each section's title is emitted as an `## H2` heading above its concatenated companion blocks, in the same order.

Behavior:

- Non-empty sections appear in ascending `order`. Ties break alphabetically by title. Sections with no `order` go last. Pages within each mapped section are sorted by permalink.
- Instances not present in `instanceSections` are collected into a single appended `## Other` section, sorted alphabetically by page title. When `verbose: true`, each unmapped instance name is logged once so you notice and can map it.
- `llmsTxt.sections` (the per-type titles) is ignored when `instanceSections` is set. When `verbose: true`, the plugin logs a one-line notice if both are configured.
- When `instanceSections` is `null` (default), grouping is by content type using `llmsTxt.sections` titles.

## Feature 3: "Ask AI" button

An outlined pill button with a caret reading "Ask AI about this page" appears above eligible doc and blog-post content. Each item in the dropdown opens the corresponding AI surface in a new tab with a prefilled prompt that references the current page's `.md` companion. The button is hidden on viewports under 997px to keep the breadcrumb row uncluttered on mobile.

Placement specifics:

- **Doc pages** - the button sits on the same row as the breadcrumb trail, flex-aligned to the right edge of the content area.
- **Blog posts** - blog posts have no breadcrumbs, so the button sits at the very top of the post, right-aligned above the post title (the closest visual equivalent to the docs breadcrumb-row position).

Providers and URL patterns:

| Provider | URL |
| --- | --- |
| Claude | `https://claude.ai/new?q={prompt}` |
| ChatGPT | `https://chatgpt.com/?q={prompt}` |
| Perplexity | `https://www.perplexity.ai/search?q={prompt}` |

Default prompt:

```text
Read https://your-site.example/path/to/page/index.md and help me understand it. Summarize the key points, then ask me one clarifying question to dig deeper.
```

The default is self-contained - submitting it as-is yields a useful summary plus a follow-up question. The prompt is prefilled in each provider's input box, so users can still edit or replace it before sending.

Template placeholders:

| Placeholder | Value |
| --- | --- |
| `{companionUrl}` | The page's `.md` companion, by the same rule feature 1 writes it: `https://site/index.md` for the homepage, `https://site/foo.md` or `https://site/foo/index.md` depending on `trailingSlash`. With feature 1 disabled, the page URL. |
| `{pageUrl}` | The page itself: canonical URL, no trailing slash. |
| `{pageUrl}.md` | Still honoured for templates written against v0.4, and resolves to `{companionUrl}`. (On its own it produced `https://site.md` for the homepage and the wrong path on sites that build `/foo/index.html`.) |

The button only renders on pages that have a companion. Generated category index pages, React pages and blog list pages have no `.md` file, so on those the button is not shown rather than sending the reader to a 404. (The list of routes comes from `allContentLoaded`; with feature 1 disabled, the companion-route filter is disabled and the prompt uses the page URL wherever the button is rendered.)

Provider icons are hand-rolled inline SVGs in each provider's brand color (Claude `#D97757`, ChatGPT `#000000`, Perplexity `#21808D`). The Claude and Perplexity SVG paths come from [simple-icons](https://simpleicons.org) (CC0-1.0); the OpenAI mark is sourced from the @lobehub/icons project. Bundle cost is ~3KB across the three components combined.

> **Gemini was previously supported but was removed in 0.4.2** because `gemini.google.com` silently ignores URL-encoded prompts, leaving users on an empty prompt box. There is no documented Gemini URL prefill API and Google has not indicated one is coming.

**Trademark note.** Brand logos are trademarks of their respective owners; their inclusion in this plugin does not imply endorsement. Consumers using the Ask AI button in commercial contexts should review each provider's brand-usage policy.

Options:

| Option | Default | Description |
| --- | --- | --- |
| `askAi.enabled` | `true` | When `false`, the theme components are not registered. |
| `askAi.providerOrder` | `['claude', 'chatgpt', 'perplexity']` | Order of items in the dropdown. Omit providers to hide them; an empty array falls back to the default order. Valid values: `'claude'`, `'chatgpt'`, `'perplexity'`. |
| `askAi.promptTemplate` | `'Read {companionUrl} and help me understand it. Summarize the key points, then ask me one clarifying question to dig deeper.'` | Prompt sent to each provider. `{companionUrl}` is the page's `.md` companion (the page URL when feature 1 is disabled); `{pageUrl}` is the page's canonical URL (no trailing slash). See the placeholder table above. |
| `askAi.placement` | `'breadcrumb-row'` | `'breadcrumb-row'` puts the button at the top of every doc/blog page (docs breadcrumb row, or above the blog title). `'none'` disables all bundled theme components, including the `@theme/AskAiButton` alias. See custom placement below. |

The button is built from [MUI](https://mui.com) primitives - outlined `Button` with a `KeyboardArrowDownIcon` caret as the trigger, and a `Menu` of `MenuItem` rows for the providers. Theming reads `--ifm-color-primary` and `--ifm-font-family-base` via MUI's `sx` prop, so dark/light mode work automatically. The MUI `Menu` handles click-outside-to-close and Esc-to-close natively.

### Peer dependencies

The package declares these MUI/Emotion peers as required, in addition to Docusaurus `^3.0.0` and React/React DOM `^18.0.0 || ^19.0.0`:

| Package | Range |
| --- | --- |
| `@mui/material` | `^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0` |
| `@mui/icons-material` | `^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0` |
| `@emotion/react` | `^11.0.0` |
| `@emotion/styled` | `^11.0.0` |

These are peer dependencies so the plugin can share the site's MUI installation. npm can install missing peers automatically; other package managers may require you to add them explicitly.

Disabling Ask AI (`askAi.enabled: false`) prevents the plugin from registering its theme components, so they do not import MUI at runtime. It does not change the package's required peer declarations or the package manager's installation requirements.

### Customizing placement

`askAi.placement: 'none'` disables the entire theme path, so `@theme/AskAiButton` is unavailable with that setting.

To reuse the bundled button in a custom location, keep Ask AI enabled with `placement: 'breadcrumb-row'`. Add site-level theme overrides for `DocBreadcrumbs` and `BlogPostItem/Header/Title` that omit the default button, then import it in your chosen site component:

```jsx
import AskAiButton from '@theme/AskAiButton';
```

The button retains its companion-route filter and desktop-only styling in a custom location.

## Feature 4: `/ai/*` routing convention

This plugin documents but does not auto-configure a second docs instance for machine-targeted content. The pattern:

```js
// docusaurus.config.js
const { sitemapExclude } = require('@stackql/docusaurus-plugin-aeo/helpers');

module.exports = {
  plugins: [
    '@stackql/docusaurus-plugin-aeo',
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'ai',
        routeBasePath: '/ai',
        path: 'ai-content',
        sidebarPath: false,
      },
    ],
    [
      '@docusaurus/plugin-sitemap',
      {
        ...sitemapExclude, // skip /ai/* in sitemap.xml
        // your other sitemap options
      },
    ],
    // ...other plugins
  ],
  themeConfig: {
    structuredData: {
      // @stackql/docusaurus-plugin-structured-data's `excludedRoutes` is an
      // exact-match array, NOT a glob list. List the /ai/* routes you want
      // skipped explicitly, or build the list at config time from a known
      // route enumeration. See "Helpers" below.
      excludedRoutes: [
        '/ai',
        // '/ai/faqs/install', '/ai/howto/connect', ...
      ],
      // ...rest of structuredData config
    },
  },
};
```

Suggested directory layout under `ai-content/`:

```text
ai-content/
├── faqs/
│   └── what-is-stackql.md     # frontmatter: faq: { ... }
├── howto/
│   └── connect-to-aws.md      # frontmatter: howTo: { ... }
└── apps/
    └── stackql-cli.md         # frontmatter: softwareApplication: { ... }
```

With default filters, these docs appear in `llms.txt` and `llms-full.txt`. Their companions follow the same URL rule: `/ai/faqs/<slug>/index.md`, or `/ai/faqs/<slug>.md` when `trailingSlash: false`.

### Optional validation

Set `aiRoutes.validate: true` to warn when docs at `/ai/faqs/*`, `/ai/howto/*`, or `/ai/apps/*` lack the corresponding frontmatter payload (`faq`, `howTo`, `softwareApplication`). Validation uses route permalinks, not source directories, and does not fail the build. Set `verbose: true` for per-page details. Off by default.

### Helpers

```js
const {
  AI_ROUTE_PATTERNS,             // ['/ai', '/ai/**'] - glob patterns
  sitemapExclude,                // { ignorePatterns: AI_ROUTE_PATTERNS }
  isAiRoute,                     // true for /ai/*; false for /ai itself
  buildStructuredDataAiExcludes, // (routePaths[]) => string[]
} = require('@stackql/docusaurus-plugin-aeo/helpers');
```

**Heads-up on the structured-data plugin.** `@stackql/docusaurus-plugin-structured-data`'s `themeConfig.structuredData.excludedRoutes` compares routes with strict equality, so glob patterns like `/ai/**` do not work there. Use one of these approaches:

- List the exact `/ai/*` permalinks you want skipped by hand (works if your `/ai/*` tree is small and stable).
- Compute the list at config time from an enumeration you control:

  ```js
  const { buildStructuredDataAiExcludes } = require('@stackql/docusaurus-plugin-aeo/helpers');
  const aiRoutes = require('./ai-content/_routes.json'); // your own enumeration
  // ...
  themeConfig: {
    structuredData: {
      excludedRoutes: buildStructuredDataAiExcludes(aiRoutes),
      // ...
    },
  }
  ```

The `sitemapExclude` helper, by contrast, does work with globs because `@docusaurus/plugin-sitemap` uses `ignorePatterns` (micromatch under the hood).

## Full options reference

```js
{
  // Feature 1
  companions: {
    enabled: true,            // emit .md siblings
    format: 'plain',          // 'plain' ('clean' is a synonym) | 'raw'
    exclude: [],              // route glob patterns to skip
    alternateLink: true,      // <link rel="alternate" type="text/markdown"> in each page
    linkHeader: false,        // also a Link: header via a Netlify _headers file
  },

  // Feature 2
  llmsTxt: {
    enabled: true,
    exclude: [
      '/search',
      '/404',
      '/blog/tags/**',
      '/blog/page/**',
      '/blog/archive',
      '/blog/authors/**',
    ],
    include: null,            // null = all not-excluded
    header: null,             // optional text after the site title/tagline
    sections: {               // per-type section titles (used when
      docs: 'Documentation',  // instanceSections is null)
      blog: 'Blog',
      pages: 'Pages',
    },
    instanceSections: null,   // per-instance section map, supersedes
                              // sections when set. Shape:
                              //   { '${pluginName}@${pluginId}':
                              //       { title: string, order?: number } }
    fullTxt: true,            // emit llms-full.txt: true | false |
                              //   { include: ['<plugin>@<id>'], maxBytes: 65536 }
    linkFullTxt: true,        // "## Optional" section in llms.txt -> llms-full.txt
  },

  // Feature 3
  askAi: {
    enabled: true,
    providerOrder: ['claude', 'chatgpt', 'perplexity'],
    promptTemplate: 'Read {companionUrl} and help me understand it. Summarize the key points, then ask me one clarifying question to dig deeper.',
    placement: 'breadcrumb-row',  // 'breadcrumb-row' | 'none'
  },

  // Feature 4
  aiRoutes: {
    validate: false,
  },

  // Cross-cutting
  verbose: false,
}
```

Options are validated by a small handwritten validator at plugin construction. Invalid options throw a clear error before the build starts.

## Development

Use Node.js 24.x to match CI. From the repository root:

```bash
npm ci
npm test
```

`npm test` runs every `test/*.test.js` file with Node's test runner: companion paths, Ask AI prompts, plain Markdown, alternate links/headers, `llms.txt`, and AI route classification.

The [Tests workflow](.github/workflows/tests.yml) runs on every pull request targeting `main` and on pushes to `main`, using the committed lockfile and Node 24.x. To make it a merge gate, require the **Tests (Node 24)** status check in the branch protection rule or ruleset for `main`. Until that rule is enabled, a failed check does not block merging.

The plain-markdown converter lives in `src/features/plainMarkdown.js` and is exercised by `test/plainMarkdown.test.js` with small MDX fixtures; add a fixture there when a new construct needs handling.

## Composing with `@stackql/docusaurus-plugin-structured-data`

The two plugins are complementary and intended to be used together:

- `@stackql/docusaurus-plugin-structured-data` emits JSON-LD into page `<head>`. <https://github.com/stackql/docusaurus-plugin-structured-data>
- `@stackql/docusaurus-plugin-aeo` provides plain-markdown `.md` companions by default (raw mode is optional), `llms.txt` / `llms-full.txt`, the Ask AI button, and the `/ai/*` convention.

There is no overlap and no shared state. Add both:

```js
module.exports = {
  plugins: [
    '@stackql/docusaurus-plugin-aeo',
    [
      '@stackql/docusaurus-plugin-structured-data',
      {
        /* structured-data options */
      },
    ],
  ],
};
```

## License

MIT - Jeffrey Aven @ StackQL Studios.
