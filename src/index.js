const path = require('path');
const emitCompanions = require('./features/companions');
const emitLlmsTxt = require('./features/llmsTxt');
const { validateAiRoutes } = require('./features/aiRoutes');

const DEFAULT_LLMS_EXCLUDE = [
  '/search',
  '/404',
  '/blog/tags/**',
  '/blog/page/**',
  '/blog/archive',
  '/blog/authors/**',
];

const DEFAULT_PROVIDER_ORDER = ['claude', 'chatgpt', 'perplexity', 'gemini'];
const VALID_PROVIDERS = new Set(DEFAULT_PROVIDER_ORDER);
const DEFAULT_PROMPT_TEMPLATE =
  'Read {pageUrl}.md and help me with the following question about it: ';

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
      format: companions.format || 'raw',
      exclude: companions.exclude || [],
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
      fullTxt: llmsTxt.fullTxt !== false,
    },
    askAi: {
      enabled: askAi.enabled !== false,
      providerOrder: askAi.providerOrder || DEFAULT_PROVIDER_ORDER,
      promptTemplate: askAi.promptTemplate || DEFAULT_PROMPT_TEMPLATE,
      placement: askAi.placement || 'doc-footer',
    },
    aiRoutes: {
      validate: aiRoutes.validate === true,
    },
    verbose: opts.verbose === true,
  };
}

function validateOptions(opts) {
  const errs = [];

  if (!['raw', 'plain'].includes(opts.companions.format)) {
    errs.push(
      `companions.format must be "raw" or "plain", got "${opts.companions.format}"`,
    );
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

  if (!Array.isArray(opts.askAi.providerOrder)) {
    errs.push('askAi.providerOrder must be an array');
  } else {
    for (const p of opts.askAi.providerOrder) {
      if (!VALID_PROVIDERS.has(p)) {
        errs.push(
          `askAi.providerOrder contains unknown provider "${p}". Valid: ${[...VALID_PROVIDERS].join(', ')}`,
        );
      }
    }
  }
  if (typeof opts.askAi.promptTemplate !== 'string') {
    errs.push('askAi.promptTemplate must be a string');
  }
  if (!['doc-footer', 'none'].includes(opts.askAi.placement)) {
    errs.push(
      `askAi.placement must be "doc-footer" or "none", got "${opts.askAi.placement}"`,
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

  return {
    name: '@stackql/docusaurus-plugin-aeo',

    getThemePath() {
      if (!options.askAi.enabled || options.askAi.placement === 'none') {
        return undefined;
      }
      return path.resolve(__dirname, './theme');
    },

    getClientModules() {
      return [];
    },

    // Surface the askAi config to theme components via a global data
    // injection. Docusaurus client code can read this through useDocusaurusContext().
    async contentLoaded({ actions, allContent }) {
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

      await actions.setGlobalData({
        askAi: {
          enabled: options.askAi.enabled,
          providerOrder: options.askAi.providerOrder,
          promptTemplate: options.askAi.promptTemplate,
          placement: options.askAi.placement,
          companionsEnabled: options.companions.enabled,
        },
      });

      if (options.aiRoutes.validate) {
        validateAiRoutes({
          loadedContentByPlugin,
          verbose: options.verbose,
        });
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
};

module.exports.validateOptions = function validateDocusaurusOptions({
  options,
  validate: _validate,
}) {
  // Docusaurus passes a Joi validator we deliberately don't use - the plugin
  // entry runs its own handwritten validator at construction time.
  return options || {};
};
