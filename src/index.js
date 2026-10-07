const path = require('path');
const emitCompanions = require('./features/companions');
const { collectCompanionItems } = require('./features/companions');
const emitLlmsTxt = require('./features/llmsTxt');
const injectAlternateLinks = require('./features/alternateLinks');
const { validateAiRoutes } = require('./features/aiRoutes');

const DEFAULT_LLMS_EXCLUDE = [
  '/search',
  '/404',
  '/blog/tags/**',
  '/blog/page/**',
  '/blog/archive',
  '/blog/authors/**',
];

const DEFAULT_PROVIDER_ORDER = ['claude', 'chatgpt', 'perplexity'];
const VALID_PROVIDERS = new Set(DEFAULT_PROVIDER_ORDER);
const DEFAULT_PROMPT_TEMPLATE =
  'Read {companionUrl} and help me understand it. Summarize the key points, then ask me one clarifying question to dig deeper.';

function normalizeOptions(raw) {
  const opts = raw || {};
  const companions = opts.companions || {};
  const llmsTxt = opts.llmsTxt || {};
  const askAi = opts.askAi || {};
  const aiRoutes = opts.aiRoutes || {};
  const llmsSections = llmsTxt.sections || {};

  return {
    companions: {
      enabled: companions.enabled !== false,
      format: companions.format || 'plain',
      exclude: companions.exclude || [],
      // <link rel="alternate" type="text/markdown"> in every page that has
      // a companion, and optionally the same as a Link header via a
      // Netlify-style _headers file.
      alternateLink: companions.alternateLink !== false,
      linkHeader: companions.linkHeader === true,
    },
    llmsTxt: {
      enabled: llmsTxt.enabled !== false,
      exclude: llmsTxt.exclude || DEFAULT_LLMS_EXCLUDE,
      include: llmsTxt.include || null,
      header: llmsTxt.header || null,
      sections: {
        docs: llmsSections.docs || 'Documentation',
        blog: llmsSections.blog || 'Blog',
        pages: llmsSections.pages || 'Pages',
      },
      // Per-instance section map. Keys are "${pluginName}@${pluginId}".
      // When set, supersedes `sections` and switches feature 2 from
      // per-type grouping to per-instance grouping.
      instanceSections: llmsTxt.instanceSections || null,
      // true (everything), false, or { include: ['<plugin>@<id>'], maxBytes }
      fullTxt: llmsTxt.fullTxt === undefined ? true : llmsTxt.fullTxt,
      // "## Optional" section in llms.txt pointing at llms-full.txt
      linkFullTxt: llmsTxt.linkFullTxt !== false,
    },
    askAi: {
      enabled: askAi.enabled !== false,
      providerOrder: askAi.providerOrder || DEFAULT_PROVIDER_ORDER,
      promptTemplate: askAi.promptTemplate || DEFAULT_PROMPT_TEMPLATE,
      placement: askAi.placement || 'breadcrumb-row',
    },
    aiRoutes: {
      validate: aiRoutes.validate === true,
    },
    verbose: opts.verbose === true,
  };
}

function validateOptions(opts) {
  const errs = [];

  if (!['raw', 'plain', 'clean'].includes(opts.companions.format)) {
    errs.push(
      `companions.format must be "plain" (or its synonym "clean") or "raw", got "${opts.companions.format}"`,
    );
  }
  if (typeof opts.companions.alternateLink !== 'boolean') {
    errs.push('companions.alternateLink must be a boolean');
  }
  if (typeof opts.companions.linkHeader !== 'boolean') {
    errs.push('companions.linkHeader must be a boolean');
  }
  const ft = opts.llmsTxt.fullTxt;
  if (typeof ft !== 'boolean') {
    if (!ft || typeof ft !== 'object' || Array.isArray(ft)) {
      errs.push('llmsTxt.fullTxt must be a boolean or an object { include?: string[], maxBytes?: number }');
    } else {
      if (ft.include !== undefined && (!Array.isArray(ft.include) || ft.include.some((k) => typeof k !== 'string'))) {
        errs.push('llmsTxt.fullTxt.include must be an array of "<plugin>@<id>" strings');
      }
      if (ft.maxBytes !== undefined && (!Number.isFinite(ft.maxBytes) || ft.maxBytes <= 0)) {
        errs.push('llmsTxt.fullTxt.maxBytes must be a positive number');
      }
    }
  }
  if (typeof opts.llmsTxt.linkFullTxt !== 'boolean') {
    errs.push('llmsTxt.linkFullTxt must be a boolean');
  }
  if (!Array.isArray(opts.companions.exclude)) {
    errs.push('companions.exclude must be an array of glob patterns');
  }

  if (!Array.isArray(opts.llmsTxt.exclude)) {
    errs.push('llmsTxt.exclude must be an array of glob patterns');
  }
  if (opts.llmsTxt.include !== null && !Array.isArray(opts.llmsTxt.include)) {
    errs.push('llmsTxt.include must be an array of glob patterns or null');
  }
  if (opts.llmsTxt.header !== null && typeof opts.llmsTxt.header !== 'string') {
    errs.push('llmsTxt.header must be a string or null');
  }
  if (opts.llmsTxt.instanceSections !== null) {
    const is = opts.llmsTxt.instanceSections;
    if (typeof is !== 'object' || Array.isArray(is)) {
      errs.push(
        'llmsTxt.instanceSections must be an object keyed by "${pluginName}@${pluginId}" or undefined',
      );
    } else {
      for (const [key, value] of Object.entries(is)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          errs.push(
            `llmsTxt.instanceSections["${key}"] must be an object with { title, order? }`,
          );
          continue;
        }
        if (typeof value.title !== 'string' || value.title.length === 0) {
          errs.push(
            `llmsTxt.instanceSections["${key}"].title must be a non-empty string`,
          );
        }
        if (
          value.order !== undefined &&
          (typeof value.order !== 'number' || !Number.isFinite(value.order))
        ) {
          errs.push(
            `llmsTxt.instanceSections["${key}"].order must be a finite number when set`,
          );
        }
      }
    }
  }

  if (!Array.isArray(opts.askAi.providerOrder)) {
    errs.push('askAi.providerOrder must be an array');
  } else {
    for (const p of opts.askAi.providerOrder) {
      if (!VALID_PROVIDERS.has(p)) {
        const hint =
          p === 'gemini'
            ? '. Gemini was removed in 0.4.2 because gemini.google.com does not accept URL-encoded prompts'
            : '';
        errs.push(
          `askAi.providerOrder contains unknown provider "${p}"${hint}. Valid providers: ${[...VALID_PROVIDERS].join(', ')}`,
        );
      }
    }
  }
  if (typeof opts.askAi.promptTemplate !== 'string') {
    errs.push('askAi.promptTemplate must be a string');
  }
  if (!['breadcrumb-row', 'none'].includes(opts.askAi.placement)) {
    // 'doc-footer' was the v0.1.x-v0.2.x default and is no longer
    // accepted in v0.3.0. The wrappers that implemented it have been
    // removed. See CHANGELOG for migration notes.
    errs.push(
      `askAi.placement must be "breadcrumb-row" or "none", got "${opts.askAi.placement}"`,
    );
  }

  if (errs.length > 0) {
    throw new Error(
      `@stackql/docusaurus-plugin-aeo: invalid options:\n  - ${errs.join('\n  - ')}`,
    );
  }
}

module.exports = function pluginAeo(context, rawOptions) {
  const options = normalizeOptions(rawOptions);
  validateOptions(options);

  // Captured from contentLoaded for downstream postBuild use.
  // Map<pluginName, { plugin: { name, id }, content: any }>
  const loadedContentByPlugin = new Map();

  const themeEnabled =
    options.askAi.enabled && options.askAi.placement !== 'none';

  const plugin = {
    name: '@stackql/docusaurus-plugin-aeo',

    // Surface the askAi config to theme components, which read it via
    // usePluginData('@stackql/docusaurus-plugin-aeo') at render time. The
    // companion route list is added from allContentLoaded below; Docusaurus
    // merges global data set from the two hooks (shallow, per plugin).
    async contentLoaded({ actions }) {
      await actions.setGlobalData({
        askAi: {
          enabled: options.askAi.enabled,
          providerOrder: options.askAi.providerOrder,
          promptTemplate: options.askAi.promptTemplate,
          placement: options.askAi.placement,
          companionsEnabled: options.companions.enabled,
        },
      });
    },

    // Cross-plugin loaded content (docs, blog, pages) is only delivered to
    // allContentLoaded in Docusaurus 3.x. contentLoaded receives only the
    // current plugin's own content, so feature 1 needs this hook to see
    // the docs/blog source files it has to mirror.
    async allContentLoaded({ allContent, actions }) {
      if (allContent) {
        for (const [pluginName, byId] of Object.entries(allContent)) {
          if (!byId) continue;
          for (const [pluginId, content] of Object.entries(byId)) {
            loadedContentByPlugin.set(`${pluginName}@${pluginId}`, {
              pluginName,
              pluginId,
              content,
            });
          }
        }
      }

      if (options.aiRoutes.validate) {
        validateAiRoutes({
          loadedContentByPlugin,
          verbose: options.verbose,
        });
      }

      // Which routes will have a companion, so the Ask AI button can point
      // at the file and stay hidden on pages without one (generated
      // category indexes, React pages). Same list postBuild emits from.
      if (actions && typeof actions.setGlobalData === 'function') {
        const companionRoutes = options.companions.enabled
          ? collectCompanionItems(loadedContentByPlugin, options.companions).map(
              (item) => item.permalink,
            )
          : [];
        await actions.setGlobalData({ companionRoutes });
      }
    },

    async postBuild(props) {
      let emittedCompanions = [];

      if (options.companions.enabled) {
        emittedCompanions = await emitCompanions({
          props,
          options: options.companions,
          loadedContentByPlugin,
          verbose: options.verbose,
        });
      } else if (options.verbose) {
        console.log('[plugin-aeo] companions disabled, skipping feature 1');
      }

      if (options.companions.enabled && options.companions.alternateLink) {
        await injectAlternateLinks({
          props,
          emittedCompanions,
          linkHeader: options.companions.linkHeader,
          verbose: options.verbose,
        });
      }

      if (options.llmsTxt.enabled) {
        await emitLlmsTxt({
          props,
          options: options.llmsTxt,
          emittedCompanions,
          companionsEnabled: options.companions.enabled,
          verbose: options.verbose,
        });
      } else if (options.verbose) {
        console.log('[plugin-aeo] llmsTxt disabled, skipping feature 2');
      }
    },
  };

  // Only contribute a theme path when the Ask AI button is enabled.
  // Returning undefined or an invalid value from getThemePath crashes
  // @docusaurus/core in webpack/server.js; omitting the method entirely
  // is the idiomatic signal that this plugin contributes no theme.
  if (themeEnabled) {
    plugin.getThemePath = () => path.resolve(__dirname, './theme');
  }

  return plugin;
};

// Intentionally no validateOptions export: Docusaurus applies its own default
// option normalization (including id: 'default') when this is absent.
// The plugin's handwritten validator runs at construction time.
