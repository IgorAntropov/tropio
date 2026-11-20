import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';

const handbook = fileURLToPath(new URL('.', import.meta.url));
const project = resolve(handbook, '..');
const localDocs = join(project, '.agents', 'docs');
const localBuild = process.argv.includes('--local');
const includeLocal = localBuild && existsSync(localDocs);
const output = localBuild ? join(project, '.local', 'handbook') : handbook;
const generated = join(output, 'generated');
const mermaid = resolve(fileURLToPath(import.meta.resolve('mermaid')), '../..');
const escapeHtml = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function filesIn(directory, suffix, excluded) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && !excluded.has(entry.name)) return filesIn(path, suffix, excluded);
    return entry.isFile() && extname(entry.name) === suffix ? [path] : [];
  });
}

function renderMarkdown(text) {
  const headings = new Set();
  const marked = new Marked({
    renderer: {
      html: ({ text }) => escapeHtml(text),
      heading({ tokens, depth }) {
        const plain = this.parser.parseInline(tokens, this.parser.textRenderer);
        const base = plain.toLowerCase().trim().replace(/[^\p{L}\p{N}\p{M}_ -]/gu, '').replaceAll(' ', '-') || 'раздел';
        let id = base;
        for (let number = 1; headings.has(id); number += 1) id = `${base}-${number}`;
        headings.add(id);
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
    },
  });
  return marked.parse(text);
}

const excluded = new Set(['generated', 'node_modules']);
const markdown = filesIn(handbook, '.md', excluded);
const htmlPages = filesIn(handbook, '.html', excluded)
  .filter((path) => path !== join(handbook, 'index.html'));
const files = [...markdown, ...htmlPages, join(handbook, 'contracts', 'openapi.yaml')];
if (includeLocal) {
  files.push(...filesIn(localDocs, '.md', excluded));
  files.push(...[
    join(project, 'AGENTS.md'),
    join(localDocs, 'poc-04', 'events.schema.json'),
    join(localDocs, 'poc-04', 'events.examples.json'),
  ].filter((path) => existsSync(path)));
}
const documents = {};
for (const file of files) {
  const key = relative(handbook, file).split(sep).join('/');
  const text = readFileSync(file, 'utf8');
  const type = extname(file).slice(1);
  if (type === 'md') {
    documents[key] = renderMarkdown(text);
  } else if (type === 'html') {
    const content = text.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
    if (!content) throw new Error(`В ${key} должен быть элемент main`);
    documents[key] = content[1];
  } else {
    const name = key.split('/').at(-1);
    documents[key] = `<h1>${escapeHtml(name)}</h1><pre><code class="language-${type}">${escapeHtml(text)}</code></pre>`;
  }
}

mkdirSync(generated, { recursive: true });
if (localBuild) {
  const sourceDirectory = relative(output, handbook).split(sep).join('/');
  const entry = readFileSync(join(handbook, 'index.html'), 'utf8')
    .replace('href="handbook.css"', `href="${sourceDirectory}/handbook.css"`)
    .replace('src="reader.js"', `src="${sourceDirectory}/reader.js"`)
    .replace('href="README.md"', `href="${sourceDirectory}/README.md"`);
  writeFileSync(join(output, 'index.html'), entry);
}
const bundle = { documents, includeLocal };
writeFileSync(join(generated, 'documents.js'), `globalThis.handbookBundle = ${JSON.stringify(bundle, null, 2)};\n`);
copyFileSync(join(mermaid, 'dist/mermaid.min.js'), join(generated, 'mermaid.min.js'));
copyFileSync(join(mermaid, 'LICENSE'), join(generated, 'mermaid.LICENSE'));
console.log(`Справочник собран: ${Object.keys(documents).length} документов.`);
