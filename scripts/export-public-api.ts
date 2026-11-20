// Snapshots the read-only studio data to JSON so the published studio can serve it as static files.
// usage: node scripts/export-public-api.ts <outDir> [mountPrefix]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudioTemplatesRepository, PRIMETECH_THEME_SCENES } from '../server/studioTemplatesDb.ts';
import { PrimeTechEcosystemRepository } from '../server/primetechEcosystemDb.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] ?? 'api-data');
const prefix = (process.argv[3] ?? '').replace(/\/$/, '');
fs.mkdirSync(out, { recursive: true });

// Work on copies so exporting never touches the live local databases.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'samscene-export-'));
const copy = (name: string) => {
  const src = path.join(root, '.data', name);
  const dst = path.join(tmp, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, dst);
  return dst;
};
const templates = new StudioTemplatesRepository(copy('samscene_templates.sqlite'));
const ecosystem = new PrimeTechEcosystemRepository(copy('primetech_ecosystem.sqlite'));

// Media paths in the data are root-relative; re-root them under the mount prefix.
const reroot = (value: unknown) =>
  JSON.parse(JSON.stringify(value).replace(/"\/(models|library|assets)\//g, `"${prefix}/$1/`));
const write = (name: string, value: unknown) => fs.writeFileSync(path.join(out, name), JSON.stringify(reroot(value)));

write('theme-scenes.json', { scenes: PRIMETECH_THEME_SCENES });
write('ecosystem.json', ecosystem.getSnapshot());
write('lumber.json', { specs: ecosystem.lookupLumber(undefined) });
write('templates.json', { templates: templates.listTemplates({}) });
console.log('exported', fs.readdirSync(out).join(', '));
