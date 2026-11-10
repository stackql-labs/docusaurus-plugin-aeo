// Shared scaffolding for the tests that touch the file system. Lives in a
// subdirectory so `node --test test/*.test.js` does not run it as a test.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

// A temp directory removed when the test finishes.
async function tempDir(t, prefix = 'aeo-') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

// Write { 'relative/path': 'content' } under `root`, creating directories.
async function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }
}

// Every file under `root`, relative, with forward slashes, sorted.
async function listFiles(root, rel = '') {
  const out = [];
  for (const entry of await fs.readdir(path.join(root, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(root, child)));
    else out.push(child);
  }
  return out.sort();
}

// The docs plugin's loaded content, in the shape the plugin reads it:
// docs is [{ permalink, source, title, description }].
function docsContent(docs) {
  return { loadedVersions: [{ docs: docs.map((d) => ({ frontMatter: {}, ...d })) }] };
}

const HTML_PAGE = '<!doctype html><html><head><title>x</title></head><body>hi</body></html>';

module.exports = { tempDir, writeFiles, listFiles, docsContent, HTML_PAGE };
