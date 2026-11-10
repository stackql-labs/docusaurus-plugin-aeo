// Loads a theme component (JSX, ES modules) into Node so a test can render
// it. The source is compiled with the Babel options Docusaurus uses for its
// server bundle, then evaluated with a `require` that:
//
//   - returns the test's stand-ins for the webpack-only `@docusaurus/*`
//     aliases (and anything else listed in `stubs`),
//   - returns a class-name proxy for CSS modules,
//   - compiles other files under src/theme the same way,
//   - uses the real modules for everything else: React, MUI, and the
//     CommonJS helpers in src/ that the theme shares with the build.
//
// No loader hooks and no extra dependencies: @docusaurus/babel and
// @babel/core arrive with the @docusaurus/core peer dependency.
const fs = require('node:fs');
const path = require('node:path');
const { getBabelOptions } = require('@docusaurus/babel');

const babel = require(
  require.resolve('@babel/core', { paths: [path.dirname(require.resolve('@docusaurus/babel'))] }),
);

const THEME_DIR = path.resolve(__dirname, '..', '..', 'src', 'theme');
const cssModule = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };

function loadThemeModule(file, stubs = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);

  const { code } = babel.transformSync(fs.readFileSync(file, 'utf8'), {
    ...getBabelOptions({ isServer: true }),
    filename: file,
  });

  const localRequire = (spec) => {
    if (Object.prototype.hasOwnProperty.call(stubs, spec)) return stubs[spec];
    if (spec.endsWith('.css')) return cssModule;
    if (spec.startsWith('.')) {
      const target = path.resolve(path.dirname(file), spec);
      return target.startsWith(THEME_DIR + path.sep)
        ? loadThemeModule(target, stubs, cache)
        : require(target);
    }
    return require(spec);
  };

  new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
  return mod.exports;
}

// `relPath` is relative to src/theme, e.g. 'AskAiButton/index.jsx'.
function loadTheme(relPath, stubs) {
  return loadThemeModule(path.join(THEME_DIR, relPath), stubs);
}

module.exports = { loadTheme, THEME_DIR };
