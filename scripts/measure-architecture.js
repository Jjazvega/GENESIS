#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve('.');
const SOURCE_ROOTS = ['src', 'functions'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.firebase', 'playwright-report', 'test-results']);
const DEFAULT_JSON = 'docs/architecture/architecture-metrics.json';
const DEFAULT_MD = 'docs/architecture/architecture-metrics.md';
const IMPORT_PATTERN = /(?:import\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?|export\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)|import\s*\()\s*['"]([^'"]+)['"]/g;

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const abs = join(dir, entry);
    const stats = statSync(abs);
    if (stats.isDirectory()) walk(abs, files);
    else if (SOURCE_EXTENSIONS.has(extname(abs))) files.push(abs);
  }
  return files;
}

function repoPath(abs) {
  return relative(ROOT, abs).split(sep).join('/');
}

function featureOf(file) {
  const parts = file.split('/');
  if (parts[0] === 'src' && parts[1] === 'features') return `feature:${parts[2] || 'unknown'}`;
  if (parts[0] === 'src') return `src:${parts[1] || 'root'}`;
  if (parts[0] === 'functions') return 'functions';
  return parts[0];
}

function resolveImport(fromFile, specifier) {
  if (specifier.startsWith('@/')) return `src/${specifier.slice(2)}`;
  if (specifier.startsWith('.')) return repoPath(resolve(dirname(resolve(ROOT, fromFile)), specifier));
  return null;
}

function collect() {
  const files = SOURCE_ROOTS.flatMap((root) => walk(resolve(ROOT, root))).map(repoPath).sort();
  const nodes = new Set(files);
  const edges = [];
  const external = new Map();
  const incoming = new Map(files.map((file) => [file, 0]));
  const outgoing = new Map(files.map((file) => [file, 0]));
  const moduleEdges = new Map();
  const duplicateLines = new Map();

  for (const file of files) {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1];
      const internal = resolveImport(file, specifier);
      if (!internal) {
        const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
        external.set(packageName, (external.get(packageName) || 0) + 1);
        continue;
      }
      const target = [...nodes].find((candidate) => candidate === internal || candidate.startsWith(`${internal}.`) || candidate.startsWith(`${internal}/index.`));
      if (!target) continue;
      edges.push({ from: file, to: target });
      outgoing.set(file, (outgoing.get(file) || 0) + 1);
      incoming.set(target, (incoming.get(target) || 0) + 1);
      const key = `${featureOf(file)} -> ${featureOf(target)}`;
      moduleEdges.set(key, (moduleEdges.get(key) || 0) + 1);
    }

    source.split(/\r?\n/).forEach((raw) => {
      const line = raw.trim().replace(/\s+/g, ' ');
      if (line.length < 40 || line.startsWith('import ') || line.startsWith('//') || line.startsWith('*')) return;
      if (!/[A-Za-z]/.test(line)) return;
      const list = duplicateLines.get(line) || [];
      list.push(file);
      duplicateLines.set(line, list);
    });
  }

  const hotspots = files.map((file) => ({ file, incoming: incoming.get(file) || 0, outgoing: outgoing.get(file) || 0, score: (incoming.get(file) || 0) + (outgoing.get(file) || 0) }))
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
    .slice(0, 20);
  const duplicated = [...duplicateLines.entries()]
    .filter(([, refs]) => new Set(refs).size > 1)
    .map(([line, refs]) => ({ line, occurrences: refs.length, files: [...new Set(refs)].sort().slice(0, 8) }))
    .sort((a, b) => b.occurrences - a.occurrences || a.line.localeCompare(b.line))
    .slice(0, 30);

  return {
    generatedAt: new Date().toISOString(),
    scope: SOURCE_ROOTS,
    totals: { files: files.length, internalDependencies: edges.length, externalPackages: external.size, duplicateLineGroups: duplicated.length },
    externalPackages: [...external.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 50),
    moduleCoupling: [...moduleEdges.entries()].map(([edge, count]) => ({ edge, count })).sort((a, b) => b.count - a.count || a.edge.localeCompare(b.edge)).slice(0, 50),
    hotspots,
    duplicatedLines: duplicated,
  };
}

function toMarkdown(report) {
  const table = (rows, headers) => [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows].join('\n');
  return `# Métricas de arquitectura\n\nGenerado: ${report.generatedAt}\n\n## Resumen\n\n${table([
    `| Archivos medidos | ${report.totals.files} |`,
    `| Dependencias internas | ${report.totals.internalDependencies} |`,
    `| Paquetes externos importados | ${report.totals.externalPackages} |`,
    `| Grupos de líneas duplicadas | ${report.totals.duplicateLineGroups} |`,
  ], ['Métrica', 'Valor'])}\n\n## Top acoplamiento entre módulos\n\n${table(report.moduleCoupling.slice(0, 15).map((item) => `| ${item.edge} | ${item.count} |`), ['Relación', 'Imports'])}\n\n## Hotspots por fan-in/fan-out\n\n${table(report.hotspots.slice(0, 15).map((item) => `| ${item.file} | ${item.incoming} | ${item.outgoing} | ${item.score} |`), ['Archivo', 'Entrantes', 'Salientes', 'Score'])}\n\n## Paquetes externos más importados\n\n${table(report.externalPackages.slice(0, 15).map((item) => `| ${item.name} | ${item.count} |`), ['Paquete', 'Imports'])}\n\n## Duplicación textual candidata\n\n${table(report.duplicatedLines.slice(0, 15).map((item) => `| ${item.occurrences} | ${item.files.join('<br>')} | \`${item.line.replaceAll('`', '\\`')}\` |`), ['Ocurrencias', 'Archivos', 'Línea normalizada'])}\n\n> Estas métricas son una línea base previa a refactors. No son una orden automática de cambio: usa los hotspots para priorizar revisiones con contexto de producto y riesgo.\n`;
}

const report = collect();
const jsonPath = process.argv.find((arg) => arg.startsWith('--json='))?.slice(7) || DEFAULT_JSON;
const mdPath = process.argv.find((arg) => arg.startsWith('--md='))?.slice(5) || DEFAULT_MD;
mkdirSync(dirname(resolve(ROOT, jsonPath)), { recursive: true });
writeFileSync(resolve(ROOT, jsonPath), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(resolve(ROOT, mdPath), toMarkdown(report));
console.log(`✅ Métricas de arquitectura generadas: ${jsonPath}, ${mdPath}`);
