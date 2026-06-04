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
        askAi: { providerOrder: ['claude', 'perplexity', 'chatgpt', 'gemini'] },
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
| `llmsTxt.sections` | `{ docs: 'Documentation', blog: 'Blog', pages: 'Pages' }` | Section title overrides. |
| `llmsTxt.fullTxt` | `true` | Emit `llms-full.txt`. |

Glob patterns are matched against route permalinks. `**` matches across path segments; `*` matches within a single segment.

## Feature 3: "Ask AI" button

A swizzle-friendly dropdown is injected above the existing `DocItem/Footer` and `BlogPostItem/Footer`. Each item opens the corresponding AI surface in a new tab with a prefilled prompt that references the current page's `.md` companion.

Providers and URL patterns:

| Provider | URL |
| --- | --- |
| Claude | `https://claude.ai/new?q={prompt}` |
| ChatGPT | `https://chatgpt.com/?q={prompt}` |
| Perplexity | `https://www.perplexity.ai/search?q={prompt}` |
| Gemini | `https://gemini.google.com/app?q={prompt}` |

Default prompt:

```text
Read https://your-site.example/path/to/page.md and help me with the following question about it: 
```

The trailing space is intentional - the cursor lands ready for the user to type.

Options:

| Option | Default | Description |
| --- | --- | --- |
| `askAi.enabled` | `true` | When `false`, the theme components are not registered. |
| `askAi.providerOrder` | `['claude', 'chatgpt', 'perplexity', 'gemini']` | Order of items in the dropdown. Drop entries to hide them. |
| `askAi.promptTemplate` | `'Read {pageUrl}.md and help me with the following question about it: '` | Prompt sent to each provider. `{pageUrl}` is the page's canonical URL (no trailing slash). If feature 1 is disabled, the consumer should remove the `.md` from the template. |
| `askAi.placement` | `'doc-footer'` | `'doc-footer'` injects above doc and blog footers. `'none'` does not register any theme components - swizzle manually if you want to place the button elsewhere. |

Styling uses CSS modules and reads from Docusaurus's theme tokens (`--ifm-color-primary`, etc.) so dark/light mode work automatically.

Swizzle to move the button:

```bash
npm run swizzle @stackql/docusaurus-plugin-aeo AskAiButton -- --wrap
```

The component lives at `@theme/AskAiButton`. Import and place it wherever you want.

## Feature 4: `/ai/*` routing convention

This plugin documents but does not auto-configure a second docs instance for machine-targeted content. The pattern:

```js
// docusaurus.config.js
const { sitemapExclude, structuredDataExclude } = require('@stackql/docusaurus-plugin-aeo/helpers');

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
      '@stackql/docusaurus-plugin-structured-data',
      {
        ...structuredDataExclude, // skip /ai/* in breadcrumbs etc.
      },
    ],
  ],
  themeConfig: {
    sitemap: {
      ...sitemapExclude, // skip /ai/* in sitemap.xml
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
  AI_ROUTE_PATTERNS,    // ['/ai', '/ai/**']
  structuredDataExclude, // { excludedRoutes: AI_ROUTE_PATTERNS }
  sitemapExclude,        // { ignorePatterns: AI_ROUTE_PATTERNS }
  isAiRoute,             // (permalink) => boolean
} = require('@stackql/docusaurus-plugin-aeo/helpers');
```

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
    sections: {
      docs: 'Documentation',
      blog: 'Blog',
      pages: 'Pages',
    },
    fullTxt: true,            // emit llms-full.txt
  },

  // Feature 3
  askAi: {
    enabled: true,
    providerOrder: ['claude', 'chatgpt', 'perplexity', 'gemini'],
    promptTemplate: 'Read {pageUrl}.md and help me with the following question about it: ',
    placement: 'doc-footer',  // 'doc-footer' | 'none'
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
