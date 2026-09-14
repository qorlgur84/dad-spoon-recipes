import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const raw = await readFile('recipes.json', 'utf8');
const data = JSON.parse(raw);
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const errors = [];
const ids = new Set();
const units = new Set(['g', 'ml', 'count']);
if (!/^\d+\.\d+\.\d+$/.test(data.version || '')) errors.push('version은 1.2.3 형식이어야 합니다.');
if (data.recipePolicy?.differentIngredients !== 'separate_recipe' || data.recipePolicy?.differentTexture !== 'separate_recipe' || data.recipePolicy?.preparationRequired !== true || data.recipePolicy?.substitutions !== 'same_preparation_and_cook_time_only') errors.push('주재료·식감별 별도 레시피 및 손질 의무 정책이 없습니다.');
for (const [index, recipe] of (data.recipes || []).entries()) {
  const at = `recipes[${index}] ${recipe.name || ''}`;
  if (!recipe.id || ids.has(recipe.id)) errors.push(`${at}: ID가 없거나 중복입니다.`); ids.add(recipe.id);
  for (const key of ['name','cuisine','category','summary','defaultTool']) if (!recipe[key]) errors.push(`${at}: ${key}가 없습니다.`);
  if (!recipe.safety) errors.push(`${at}: 안전 확인 문구가 없습니다.`);
  if (!Array.isArray(recipe.preparation) || recipe.preparation.length < 2 || recipe.preparation.some(item => !item.ingredient || !item.text)) errors.push(`${at}: 재료별 기초 손질법이 2개 이상 필요합니다.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recipe.verification?.reviewedAt || '')) errors.push(`${at}: 검증일이 없습니다.`);
  if (!Array.isArray(recipe.verification?.sources) || recipe.verification.sources.length < 2 || recipe.verification.sources.some(source => !/^https:\/\//.test(source))) errors.push(`${at}: HTTPS 검증 출처가 2개 이상 필요합니다.`);
  if (!(recipe.baseServings > 0)) errors.push(`${at}: 기준 인분 오류`);
  if (!(recipe.ingredients || []).some(item => item.optional)) errors.push(`${at}: 제외 가능한 재료와 생략 이유가 필요합니다.`);
  if (!(recipe.ingredients || []).some(item => item.alternatives?.length)) errors.push(`${at}: 같은 손질·조리 시간으로 쓸 수 있는 대체 재료가 필요합니다.`);
  for (const item of recipe.ingredients || []) {
    if (!item.name || !(item.amount > 0) || !units.has(item.unit)) errors.push(`${at}: 재료 ${item.name || '?'} 형식 오류`);
    if (item.unit !== 'count' && (!(item.density > 0) || item.density > 5)) errors.push(`${at}: ${item.name} 밀도 누락 또는 범위 오류`);
    if (item.unit === 'count' && (!(item.gramsPerUnit > 0) || !(item.mlPerUnit > 0))) errors.push(`${at}: ${item.name} 개수 환산 누락`);
    for (const alt of item.alternatives || []) {
      if (!alt.name || !(alt.amount > 0) || !units.has(alt.unit)) errors.push(`${at}: ${item.name} 대체 재료 오류`);
      if (alt.samePreparation !== true || !alt.preparation) errors.push(`${at}: ${item.name}→${alt.name} 대체는 동일 손질 확인과 기초 손질법이 필요합니다. 손질·시간이 다르면 별도 레시피로 등록하세요.`);
    }
  }
  const methods = [{id:'default', steps:recipe.steps}, ...(recipe.cookerVariants || [])];
  const methodIds = new Set();
  for (const method of methods) {
    if (methodIds.has(method.id)) errors.push(`${at}: 조리도구 ID 중복 ${method.id}`); methodIds.add(method.id);
    if (!Array.isArray(method.steps) || !method.steps.length) errors.push(`${at}: ${method.id} 조리 과정 누락`);
    for (const step of method.steps || []) if (!step.heat || !step.text || !step.cue) errors.push(`${at}: ${method.id} 단계의 불/과정/확인 기준 누락`);
    if (/전자레인지/.test(method.label || '') && !/전자레인지용/.test(method.warning || '')) errors.push(`${at}: ${method.id} 전자레인지 전용 용기 안전 문구 누락`);
    if (/압력/.test(method.label || '') && !/(압력|증기|표시핀)/.test(method.warning || '')) errors.push(`${at}: ${method.id} 압력 안전 문구 누락`);
  }
}
const checksum = createHash('sha256').update(raw).digest('hex');
if (manifest.dataVersion !== data.version) errors.push('manifest와 recipes 버전이 다릅니다.');
if (manifest.recipeCount !== data.recipes.length) errors.push('manifest 레시피 개수가 다릅니다.');
if (manifest.sha256 !== checksum) errors.push(`manifest 체크섬 오류. npm run release-data를 실행하세요.\n계산값: ${checksum}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`검증 완료: 레시피 ${data.recipes.length}개, 조리법 ${data.recipes.reduce((n,r)=>n+1+(r.cookerVariants?.length||0),0)}개, 버전 ${data.version}`);
