import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const budgetPath = path.join(root, 'performance-budgets.json');
const manifestPath = path.join(root, 'dist/.vite/manifest.json');
const distPath = path.join(root, 'dist');

const kb = (bytes) => bytes / 1024;
const formatKb = (value) => `${value.toFixed(1)} kB`;

function gzipKb(relativeFile) {
  const absolute = path.join(distPath, relativeFile);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) return 0;
  return kb(gzipSync(readFileSync(absolute)).length);
}

function chunkName(file) {
  return path.basename(file).replace(/-[A-Za-z0-9_-]+\.js$/, '');
}

if (!existsSync(manifestPath)) {
  throw new Error('No existe dist/.vite/manifest.json. Ejecuta npm run build antes de npm run budget:bundle.');
}

const budgets = JSON.parse(readFileSync(budgetPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const assetFiles = readdirSync(path.join(distPath, 'assets')).map((file) => `assets/${file}`);
const vendorFiles = assetFiles.filter((file) => path.basename(file).startsWith('vendor-') && file.endsWith('.js'));
const sharedVendorKb = vendorFiles.reduce((sum, file) => sum + gzipKb(file), 0);
const failures = [];

console.log('Bundle budgets gzip:');
console.log(`- vendors compartidos: ${formatKb(sharedVendorKb)} / ${formatKb(budgets.sharedVendorMaxKb)}`);
if (sharedVendorKb > budgets.sharedVendorMaxKb) {
  failures.push(`vendors compartidos exceden presupuesto (${formatKb(sharedVendorKb)} > ${formatKb(budgets.sharedVendorMaxKb)})`);
}

for (const [route, budget] of Object.entries(budgets.routes)) {
  const routeEntry = manifest[budget.module];
  if (!routeEntry) {
    failures.push(`${route}: no se encontró ${budget.module} en manifest`);
    continue;
  }

  const routeFiles = [routeEntry.file];
  const routeKb = routeFiles.reduce((sum, file) => sum + gzipKb(file), 0);
  const dynamicVendorNames = new Set((routeEntry.dynamicImports || [])
    .map((key) => manifest[key]?.file)
    .filter(Boolean)
    .map(chunkName)
    .filter((name) => name.startsWith('vendor-')));
  const blockedVendors = [...dynamicVendorNames].filter((name) => !budget.allowedVendors.includes(name));

  console.log(`- ${route}: ${formatKb(routeKb)} / ${formatKb(budget.routeMaxKb)} (${budget.module})`);

  if (routeKb > budget.routeMaxKb) {
    failures.push(`${route}: excede presupuesto (${formatKb(routeKb)} > ${formatKb(budget.routeMaxKb)})`);
  }
  if (blockedVendors.length > 0) {
    failures.push(`${route}: carga vendors no permitidos: ${blockedVendors.join(', ')}`);
  }
}

if (failures.length > 0) {
  console.error('\nPresupuesto de bundle falló:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('✅ Presupuestos de bundle dentro del límite.');
