# Changelog

## 0.5.0

Plain-markdown companions, one rule for where a companion lives, and the companion advertised from its page. Raised against stackql.io, where the Ask AI prompt on the homepage read `https://stackql.io.md` and every `.md` URL returned raw MDX (imports, MUI components, tab definitions and inline SVG path data before the first sentence), and from an independent agent-readiness audit of the built site (alternate link, `llms-full.txt` reference and size, `Source:` URLs, the `how-tos` alias).

### Changed (breaking)

- **`companions.format` now defaults to `'plain'`.** The companion is plain markdown rendered from the MDX source rather than the source itself. The source is parsed with the remark toolchain Docusaurus compiles it with (`remark-mdx`, `remark-gfm`, `remark-directive`, `@slorber/remark-comment`) to locate every MDX construct, and the original text is edited by source position: imports, exports and `{expressions}` are removed; presentational elements (`svg`, `video`, `iframe`, icons) are dropped; `<Tabs>`/`<TabItem>` become a bold label per tab with the tab's content under it (the label is read from the `label` attribute or from the `<Tabs values={[...]}>` expression); `<a>`, `<img>`, `<b>`, `<i>`, `<code>`, `<h1>`-`<h6>`, `<br>`, `<details>`/`<summary>` become their markdown equivalent; a self-closing component that carries a link (`to`/`href` plus `text`/`label`/`title`) becomes a markdown link; every other element is unwrapped and the indentation its author added inside it is removed. HTML comments (including `<!-- truncate -->`) and `{#custom-id}` heading ids are removed; fenced code is never touched. Nothing outside MDX syntax is re-stringified, so `snake_case` stays unescaped and tables, admonitions and code fences are byte for byte the author's. A `# Title` / `> description` block from the page metadata is prepended (the title only when the body does not already open with an H1). A source that fails to parse falls back to the v0.4 regex stripper with a build warning. `format: md` files (front matter or `siteConfig.markdown.format`) are parsed as CommonMark and their raw HTML stripped. Set `companions: { format: 'raw' }` to keep emitting the source.
- **Default `askAi.promptTemplate` is `'Read {companionUrl} and help me understand it. ...'`.** `{companionUrl}` is the page's `.md` file by the same rule feature 1 writes it. `{pageUrl}` is unchanged (the page, no trailing slash). A custom template still using the v0.4 idiom `{pageUrl}.md` keeps working: that sequence now resolves to `{companionUrl}` instead of being computed from the pathname, which produced `https://site.md` on the homepage and `/foo.md` on sites that build `/foo/index.html`.
- **The Ask AI button is only rendered on pages that have a companion.** Generated category index pages, React pages and blog list pages have no source markdown and so no `.md` file; the button used to point readers at a 404 there. The route list is set as plugin global data from `allContentLoaded` (Docusaurus 3 merges it with the `contentLoaded` data); if it is absent the button shows everywhere as before. With `companions.enabled: false` the button shows everywhere and the prompt uses the page URL.
- **`llms.txt` links are absolute** (`https://site/foo.md`), as the llms.txt spec's examples are. The file is read away from the site, where a relative link has no base.

### Added

- **`<link rel="alternate" type="text/markdown" href="...">` in every page that has a companion** (`companions.alternateLink`, default `true`), inserted into the built HTML in `postBuild`, with the absolute companion URL from the same rule the file is written by. `companions.linkHeader` (default `false`) also writes the relation as a `Link:` header per route in a Netlify-style `_headers` file, appended to one the site already ships.
- **`## Optional` section in `llms.txt`** linking `llms-full.txt` (`llmsTxt.linkFullTxt`, default `true`), the llmstxt.org convention for secondary resources.
- **`llmsTxt.fullTxt` object form** `{ include: ['<plugin>@<id>', ...], maxBytes }` to limit `llms-full.txt` to chosen content instances and/or a byte budget; the file stops before the page that would cross the cap. The boolean form is unchanged (`true` = everything).
- Plain companions carry a `Source: <page URL>` line under the title and description, and `llms-full.txt` reuses it rather than adding a second one.
- `companions.format: 'clean'` is accepted as a synonym for `'plain'`.
- `src/features/aiRoutes.js`: `how-tos` and `how-to` directory names map to the `howTo` payload (only `howto` / `howtos` did; stackql.io uses `how-tos`).

### Fixed

- Feature 1, feature 2 and the Ask AI button each computed the companion location on their own; the button's version was wrong for the site root and for `trailingSlash: true`/undefined sites. All three now use `src/companionPath.js`.
- `llms-full.txt` no longer doubles the page title (the plain companion already opens with it) and now puts a blank line after the `Source:` line, which used to run into the first paragraph.
- Companions are written with LF line endings regardless of the source file's.

### Added

- `src/companionPath.js` (`companionPath`, `companionUrl`, `normalizeRoute`) and `src/askAiPrompt.js` (`fillPrompt`), plain CommonJS shared by the Node side and the theme component.
- Runtime dependencies on `unified`, `remark-parse`, `remark-mdx`, `remark-gfm`, `remark-directive` and `@slorber/remark-comment` at the versions `@docusaurus/mdx-loader` 3.x already ships, so npm dedupes them.
- A test suite (`npm test`, `node --test`): the companion path and HTML path rules, the prompt template, MDX fixtures for the converter (tabs, nested containers and dedent, link recovery, inline elements, details/summary, comments and heading ids, string-literal expressions, `md` format, the parse-failure fallback, CRLF sources), `llms.txt` rendering (sections, absolute links, the Optional block, the `fullTxt` forms), the alternate-link insertion (both `trailingSlash` layouts, idempotence, `_headers`), and the `/ai/*` directory classifier.

## 0.4.2

### Fixed

- **(regression in 0.4.1)** `@lobehub/icons` pins `react: ^19` and pulls `@lobehub/ui` into the import graph via `IconCombine`, which uses React 19's `use()` hook. On React 18 consumers (such as stackql.io), v0.4.1 builds crashed with `Attempted import error: 'use' is not exported from 'react' (imported as 'use')`. Resolved by dropping `@lobehub/icons` entirely and shipping three hand-rolled inline SVG components instead.

### Removed

- **Gemini support.** `gemini.google.com/app?q=...` silently ignores the `q` parameter and opens an empty prompt box, so the "Ask Gemini" entry rendered a button that appeared to do nothing useful. There is no documented Gemini URL prefill API, and Google has not signaled one is coming. Default `askAi.providerOrder` is now `['claude', 'chatgpt', 'perplexity']`. **Breaking** for consumers with an explicit `askAi.providerOrder` containing `'gemini'`: the build will fail at plugin construction with an error that names this changelog. Remove `'gemini'` from your config.
- `@lobehub/icons` dependency.

### Changed

- Provider icons are now hand-rolled inline SVGs co-located with the plugin source (`src/theme/AskAiButton/brand-icons/`). Bundle cost across the three components: ~3KB. Claude and Perplexity paths come from [simple-icons](https://simpleicons.org) (CC0-1.0); the OpenAI mark is sourced from the @lobehub/icons project (MIT). Brand colors are hardcoded on each path so MUI's `ListItemIcon` cannot tint them.
- Default `askAi.promptTemplate` is now self-contained: `'Read {pageUrl}.md and help me understand it. Summarize the key points, then ask me one clarifying question to dig deeper.'` Previous default required the user to type a question after a trailing colon; the new default returns a useful response on its own. Consumers can still override via `askAi.promptTemplate`.

## 0.4.1

Cosmetic patch. No API, option-shape, behavior, or placement changes.

### Changed

- Provider icons swapped from [simple-icons](https://simpleicons.org) (monochrome) to [@lobehub/icons](https://github.com/lobehub/lobe-icons) (colored brand variants). Resolves the ChatGPT-fallback-glyph issue from v0.3.0-v0.4.0: Claude, Perplexity, and Gemini now render in their brand colors via lobehub's `.Color` variants, and ChatGPT renders the OpenAI mark tinted with ChatGPT green (lobehub does not ship a `.Color` variant for OpenAI as of 5.10.0, so the monochrome mark is tinted inline).
- `ListItemIcon` now uses `sx={{ minWidth: 32, color: 'inherit' }}` so MUI's default tint does not override the brand colors.

### Removed

- `simple-icons` dependency.

### Added

- `@lobehub/icons` (`^5.10.0`, MIT) as a runtime dependency.

## 0.4.0

Visual refresh of the Ask AI button (feature 3) to match the look-and-feel of MUI-based dropdown components used elsewhere on consumer sites. No changes to features 1, 2, or 4.

### Changed (breaking)

- `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled` are now required peer dependencies when `askAi.enabled` is `true`. Consumers that already use MUI (common in Docusaurus sites) get a single deduped copy at install time; consumers without MUI will get a clean npm peer-dependency install error pointing at exactly what to install. Consumers who disable the button (`askAi.enabled: false`) can skip these - the theme components are not registered and MUI is never imported.

### Changed

- Ask AI button reimplemented with MUI primitives: outlined `Button` (small, with `KeyboardArrowDownIcon` caret) for the trigger; `Menu` with `MenuItem`s containing `ListItemIcon` (the simple-icons brand SVGs from v0.3.0) and `ListItemText`. Menu is anchored bottom-right of the trigger and opens with transform-origin top-right.
- Button is hidden on viewports under 997px (matches the Docusaurus mobile breakpoint).

### Removed

- Custom click-outside and Esc-to-close handlers. MUI `Menu` provides both natively. Net reduction in `src/theme/AskAiButton/index.jsx`: ~25 lines.
- All custom trigger / menu CSS classes. The CSS module is now a 2-rule wrapper that controls only the responsive show/hide; all other styling lives on the MUI `sx` prop.

## 0.3.0

Focused UX upgrade to the Ask AI button (feature 3). No changes to features 1, 2, or 4.

### Changed (breaking)

- Default Ask AI button placement moved from doc / blog footer to the breadcrumb row at the top of each page. On doc pages the button sits right-aligned in the breadcrumb row; on blog posts (which have no breadcrumbs) it sits right-aligned above the post title.
- `askAi.placement` no longer accepts `'doc-footer'`. Valid values are `'breadcrumb-row'` (the new default) and `'none'`. The v0.1.x-v0.2.x `DocItem/Footer` and `BlogPostItem/Footer` swizzles have been deleted; there is no config flag that restores them. Consumers who want footer placement (or any other custom location) should set `askAi.placement: 'none'` and swizzle `@theme/AskAiButton` manually.
- Ask AI button restyled as a solid pill dropdown (themed background, rounded-full corners, animated caret). The trigger reads "Ask AI about this page". The menu is a right-aligned card with rounded corners and a subtle shadow.

### Changed

- Provider icons replaced with real brand SVGs sourced from [simple-icons](https://simpleicons.org) where available - Claude, Perplexity, Gemini. OpenAI / ChatGPT was removed from simple-icons in 2024 following a takedown; the ChatGPT menu row renders a neutral chat-bubble glyph instead. No build failure; the missing icon is logged as a warning when verbose.

### Added

- `simple-icons` (`^16.22.0`, CC0-1.0) as a runtime dependency. Bundle-size impact is bounded by webpack tree-shaking: the icons module uses named ESM imports so only the three referenced icons end up in the production bundle.

Even though placement changes are breaking, this is 0.3.0 (not 1.0.0) - the project is still pre-1.0 and the README never promised a stable placement option set.

### Migration

Bump the plugin version. If `askAi.placement: 'doc-footer'` is set in plugin options, remove it (or change it to `'breadcrumb-row'` for explicitness). No other config changes needed. After rebuild, the button appears at the top of each doc and blog page.

## 0.2.0

- Added: `llmsTxt.instanceSections` option for per-content-plugin-instance llms.txt section grouping. Use case: consumers with multiple content-docs instances (e.g. human docs + AI reference) can split them into named sections. Map keys are `"${pluginName}@${pluginId}"`; values are `{ title, order? }`. Unmapped instances are collected into a single appended "Other" section. `llms-full.txt` mirrors the same section structure as `llms.txt`.
- No breaking changes: when `llmsTxt.instanceSections` is unset (the default), grouping is identical to v0.1.x — per content-plugin type, using `llmsTxt.sections` titles.

## 0.1.2

Fix: cross-plugin loaded content was not captured because contentLoaded does not receive allContent in Docusaurus 3.x. Use allContentLoaded hook. Without this fix, feature 1 (.md companions) emitted zero files and feature 2 (llms.txt / llms-full.txt) was empty.

## 0.1.1

Bugfix release. v0.1.0 failed to build on a real Docusaurus 3.10 consumer with three distinct crashes; all three are fixed here.

### Fixed

- **Plugin construction crash: `plugin.options.id` is `undefined`.** v0.1.0 exported a `validateOptions` function that bypassed Docusaurus's option normalization, so the standard `id: 'default'` default was never applied. `@docusaurus/core` then crashed in `lib/server/plugins/actions.js` at `createPluginActionsUtils`:

  ```text
  TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string.
  Received undefined
    at Object.join (node:path:460:7)
    at createPluginActionsUtils (.../@docusaurus/core/lib/server/plugins/actions.js:27:36)
  ```

  Fix: removed the `validateOptions` export so Docusaurus's built-in plugin schema runs. The plugin's handwritten construction-time validator (`normalizeOptions` + the internal `validateOptions` in `src/index.js`) still validates plugin-specific options.

- **SSR stack overflow on every doc and blog page.** The footer wrappers at `src/theme/DocItem/Footer/index.jsx` and `src/theme/BlogPostItem/Footer/index.jsx` imported `@theme-original/DocItem/Footer` and `@theme-original/BlogPostItem/Footer`. When a *plugin* (not a *theme*) contributes the wrapper and is the only contributor in the wrapper layer, `@theme-original/X` resolves back to the wrapper itself, recursing during SSG:

  ```text
  Error: Can't render static file for pathname "/docs/intro"
    [cause]: RangeError: Maximum call stack size exceeded
      at RegExp.exec (<anonymous>)
      at F (server.bundle.js:15836:87)
      at Ka (server.bundle.js:15845:249)
      at Pa (server.bundle.js:15853:68)
  ```

  Fix: switched both wrappers to import from `@theme-init/X`, which always resolves to the un-wrapped initial component from the theme chain.

- **`getThemePath()` returning `undefined` crashes core.** With `askAi.enabled: false` (or `askAi.placement: 'none'`), v0.1.0's `getThemePath` returned `undefined`, which `@docusaurus/core` then handed to `path.join` inside `webpack/server.js`. Fix: the plugin now constructs its plugin object conditionally and only attaches `getThemePath` when the theme is enabled. This is the idiomatic signal that a plugin contributes no theme.

### Notes for consumers

No config changes required. Bump the version and rebuild.

## 0.1.0

Initial release.

- Feature 1: `.md` companion files for every doc/blog/page route (`raw` and `plain` modes).
- Feature 2: `llms.txt` and `llms-full.txt` generation at site root, following the llmstxt.org spec.
- Feature 3: Swizzle-friendly "Ask AI" dropdown (Claude, ChatGPT, Perplexity, Gemini) injected into doc and blog footers.
- Feature 4: `/ai/*` routing convention + helper exports for downstream sites.
