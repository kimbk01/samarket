/** 어드민 업종 slug — 영문 소문자·숫자·하이픈 */
export function slugifyStoreTaxonomyLoose(raw: string): string {
  const t = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return t.replace(/-+/g, "-").replace(/^-|-$/g, "");
}
