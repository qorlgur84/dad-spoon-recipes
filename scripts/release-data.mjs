import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const raw = await readFile('recipes.json', 'utf8');
const data = JSON.parse(raw);
const manifest = {
  dataVersion: data.version,
  schemaVersion: 1,
  updatedAt: data.updatedAt || new Date().toISOString().slice(0,10),
  recipeCount: data.recipes.length,
  recipesUrl: './recipes.json',
  sha256: createHash('sha256').update(raw).digest('hex')
};
await writeFile('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest 생성 완료: ${manifest.dataVersion} / ${manifest.recipeCount}개`);
