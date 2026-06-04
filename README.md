# @stackql/docusaurus-plugin-aeo

AEO (Answer Engine Optimization) helpers for Docusaurus 3.x sites: emit raw `.md` companion files for every page, generate `llms.txt` and `llms-full.txt` at the site root, drop an "Ask AI" dropdown into doc and blog footers, and document a `/ai/*` routing convention for machine-readable companion content. This is a sibling to `@stackql/docusaurus-plugin-structured-data` (which emits JSON-LD); the two plugins compose without overlap.

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

All four features are on by default. To configure, pass options:

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

For every emitted HTML route from the docs and blog plugins, this plugin writes a sibling `.md` file. A page at `/docs/intro` gets a companion at `/docs/intro/index.md` (or `/docs/intro.md` if `siteConfig.trailingSlash` is `false`). The file contains the raw markdown source.

Two modes:

- `companions.format: 'raw'` (default): the MDX source is emitted as-is. MDX `<Component />` tags pass through. LLMs handle them fine, and the file is a faithful representation of the page.
- `companions.format: 'plain'`: a best-effort regex pass strips `import` / `export` lines and JSX tags, then prepends a `# Title\n\n> description` block from the page frontmatter. Not a full remark pipeline - use `'raw'` unless an MDX-heavy page is causing concrete problems.

Fetch example:

```bash
curl https://your-site.example/docs/intro/index.md
```

**MIME type note.** Setting `Content-Type: text/markdown` from a static-site plugin is not possible. The file simply gets a `.md` extension and the host's MIME table handles it. Vercel, Netlify, Cloudflare Pages, GitHub Pages, and S3+CloudFront all serve `.md` as `text/markdown` or `text/plain` out of the box. If you serve from Nginx, ensure `text/markdown md;` is in your `mime.types`.

Non-content routes (custom React pages, redirects, the 404 page, search) are skipped silently. Enable `verbose: true` to log skips.

## Feature 2: `llms.txt` and `llms-full.txt`

After feature 1 emits all companions, the plugin writes two files to the build root:

- `llms.txt` - sectioned index of every doc/blog page, in the format described at <https://llmstxt.org>:

  ```text
  # StackQL

  > A SQL interface to cloud and SaaS APIs.

  ## Documentation

  - [Getting started](/docs/intro/index.md): Install StackQL and run your first query.
  - [Providers](/docs/providers/index.md): Catalog of supported cloud APIs.

  ## Blog

  - [Querying Snowflake with StackQL](/blog/snowflake/index.md): ...
  ```

- `llms-full.txt` - every companion concatenated with a `\n---\n\n` separator, each block prefixed with the page's title and URL so an LLM can cite individual sections.

Options:

| Option | Default | Description |
| --- | --- | --- |
| `llmsTxt.enabled` | `true` | Master switch. |
| `llmsTxt.exclude` | `["/search", "/404", "/blog/tags/**", "/blog/page/**", "/blog/archive", "/blog/authors/**"]` | Route glob patterns to skip. |
| `llmsTxt.include` | `null` | If set, only routes matching at least one pattern are included. Use for opt-in mode. |
| `llmsTxt.header` | `null` | String prepended to `llms.txt` above the section list. Good for a project intro paragraph or links to key external resources. |
| `llmsTxt.sections` | `{ docs: 'Documentation', blog: 'Blog', pages: 'Pages' }` | Section title overrides for the default per-type grouping. |
| `llmsTxt.instanceSections` | `null` | Per-content-plugin-instance section map. When set, supersedes `sections` (see below). |
| `llmsTxt.fullTxt` | `true` | Emit `llms-full.txt`. |

Glob patterns are matched against route permalinks. `**` matches across path segments; `*` matches within a single segment.

### Per-instance sectioning

By default, `llms.txt` groups by content-plugin TYPE: every `@docusaurus/plugin-content-docs` instance lands under one `## Documentation` heading, every blog instance under `## Blog`, and so on. This is fine for sites with a single docs instance, but it breaks down for sites that run multiple docs instances with different audiences — for example, one for human-facing docs at `/docs/*` and one for AI-targeted reference content at `/ai/*`. In that case, `llms.txt` and `llms-full.txt` interleave both surfaces under one heading, hiding the corpus shape from the crawlers and agents the file exists to serve.

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

- [Getting started](/docs/intro/index.md): Install and run your first query.
- [Providers](/docs/providers/index.md): Catalog of supported cloud APIs.

## AI Reference

- [What is StackQL](/ai/faqs/what-is-stackql/index.md): Canonical one-paragraph definition.
- [Connecting to AWS](/ai/howto/connect-to-aws/index.md): Step-by-step authentication.

## Blog

- [Querying Snowflake](/blog/snowflake/index.md): ...
```

`llms-full.txt` mirrors the same section structure: each section's title is emitted as an `## H2` heading above its concatenated companion blocks, in the same order.

Behavior:

- Sections appear in ascending `order`. Ties break alphabetically by title. Entries with no `order` go last.
- Instances not present in `instanceSections` are collected into a single appended `## Other` section, sorted alphabetically by page title. When `verbose: true`, each unmapped instance name is logged once so you notice and can map it.
- `llmsTxt.sections` (the per-type titles) is ignored when `instanceSections` is set. When `verbose: true`, the plugin logs a one-line notice if both are configured.
- When `instanceSections` is `null` (default), behavior is identical to v0.1.x: per-type grouping using `llmsTxt.sections` titles.

## Feature 3: "Ask AI" button

An outlined pill button with a caret reading "Ask AI about this page" is injected at the top of every doc and blog-post content area, right-aligned in the breadcrumb row. Each item in the dropdown opens the corresponding AI surface in a new tab with a prefilled prompt that references the current page's `.md` companion. The button is hidden on viewports under 997px to keep the breadcrumb row uncluttered on mobile.

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
Read https://your-site.example/path/to/page.md and help me understand it. Summarize the key points, then ask me one clarifying question to dig deeper.
```

The default is self-contained - submitting it as-is yields a useful summary plus a follow-up question. The prompt is prefilled in each provider's input box, so users can still edit or replace it before sending.

Provider icons are hand-rolled inline SVGs in each provider's brand color (Claude `#D97757`, ChatGPT `#000000`, Perplexity `#21808D`). The Claude and Perplexity SVG paths come from [simple-icons](https://simpleicons.org) (CC0-1.0); the OpenAI mark is sourced from the @lobehub/icons project. Bundle cost is ~3KB across the three components combined.

> **Gemini was previously supported but was removed in 0.4.2** because `gemini.google.com` silently ignores URL-encoded prompts, leaving users on an empty prompt box. There is no documented Gemini URL prefill API and Google has not indicated one is coming.

**Trademark note.** Brand logos are trademarks of their respective owners; their inclusion in this plugin does not imply endorsement. Consumers using the Ask AI button in commercial contexts should review each provider's brand-usage policy.

Options:

| Option | Default | Description |
| --- | --- | --- |
| `askAi.enabled` | `true` | When `false`, the theme components are not registered. |
| `askAi.providerOrder` | `['claude', 'chatgpt', 'perplexity']` | Order of items in the dropdown. Drop entries to hide them. Valid values: `'claude'`, `'chatgpt'`, `'perplexity'`. |
| `askAi.promptTemplate` | `'Read {pageUrl}.md and help me understand it. Summarize the key points, then ask me one clarifying question to dig deeper.'` | Prompt sent to each provider. `{pageUrl}` is the page's canonical URL (no trailing slash). If feature 1 is disabled, the consumer should remove the `.md` from the template. |
| `askAi.placement` | `'breadcrumb-row'` | `'breadcrumb-row'` puts the button at the top of every doc/blog page (docs breadcrumb row, or above the blog title). `'none'` does not register any theme components - swizzle the button into your preferred location manually. |

The button is built from [MUI](https://mui.com) primitives - outlined `Button` with a `KeyboardArrowDownIcon` caret as the trigger, and a `Menu` of `MenuItem` rows for the providers. Theming reads `--ifm-color-primary` and `--ifm-font-family-base` via MUI's `sx` prop, so dark/light mode work automatically. The MUI `Menu` handles click-outside-to-close and Esc-to-close natively.

### Peer dependencies

When `askAi.enabled` is `true` (the default), the following peer dependencies must be installed by the consumer site:

| Package | Range |
| --- | --- |
| `@mui/material` | `^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0` |
| `@mui/icons-material` | `^5.0.0 \|\| ^6.0.0 \|\| ^7.0.0` |
| `@emotion/react` | `^11.0.0` |
| `@emotion/styled` | `^11.0.0` |

These are declared as peer dependencies (not direct dependencies) so consumers that already use MUI - common in Docusaurus sites - get a single deduped copy at install time. Consumers without MUI will get a clean npm peer-dependency error pointing at exactly what to install.

Consumers who disable the Ask AI button (`askAi.enabled: false`) can ignore these peers; the theme components are not registered in that case and MUI is never imported.

### Customizing placement

To put the button somewhere other than the breadcrumb row - sidebar, header, a specific page region - set `askAi.placement: 'none'` to disable the bundled swizzles, then import and place the component manually wherever you want:

```jsx
import AskAiButton from '@theme/AskAiButton';
```

Wrap an existing theme component (e.g. `@theme/Layout`) the same way Docusaurus documents for any swizzle.

## Feature 4: `/ai/*` routing convention

This plugin documents but does not auto-configure a second docs instance for machine-targeted content. The pattern:

```js
// docusaurus.config.js
const { sitemapExclude, AI_ROUTE_PATTERNS } = require('@stackql/docusaurus-plugin-aeo/helpers');

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

The companion files emitted by feature 1 will live at `/ai/faqs/<slug>/index.md` (etc.), and they will appear in `llms.txt` and `llms-full.txt` just like any other doc, which is the point.

### Optional validation

Set `aiRoutes.validate: true` to fail the build (with warnings, not errors) when files under `ai/faqs/`, `ai/howto/`, or `ai/apps/` are missing the corresponding frontmatter payload (`faq`, `howTo`, `softwareApplication`). Off by default.

### Helpers

```js
const {
  AI_ROUTE_PATTERNS,             // ['/ai', '/ai/**'] - glob patterns
  sitemapExclude,                // { ignorePatterns: AI_ROUTE_PATTERNS }
  isAiRoute,                     // (permalink) => boolean
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
    format: 'raw',            // 'raw' | 'plain'
    exclude: [],              // route glob patterns to skip
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
    header: null,             // optional string prepended to llms.txt
    sections: {               // per-type section titles (used when
      docs: 'Documentation',  // instanceSections is null)
      blog: 'Blog',
      pages: 'Pages',
    },
    instanceSections: null,   // per-instance section map, supersedes
                              // sections when set. Shape:
                              //   { '${pluginName}@${pluginId}':
                              //       { title: string, order?: number } }
    fullTxt: true,            // emit llms-full.txt
  },

  // Feature 3
  askAi: {
    enabled: true,
    providerOrder: ['claude', 'chatgpt', 'perplexity'],
    promptTemplate: 'Read {pageUrl}.md and help me understand it. Summarize the key points, then ask me one clarifying question to dig deeper.',
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

## Composing with `@stackql/docusaurus-plugin-structured-data`

The two plugins are complementary and intended to be used together:

- `@stackql/docusaurus-plugin-structured-data` emits JSON-LD into page `<head>`. <https://github.com/stackql/docusaurus-plugin-structured-data>
- `@stackql/docusaurus-plugin-aeo` does everything else AEO-adjacent: raw `.md` companions, `llms.txt`, the Ask AI button, the `/ai/*` convention.

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
