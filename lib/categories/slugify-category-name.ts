/**
 * Admin create helper — derive URL-safe slug from display name.
 * Does not rewrite existing category slugs.
 */
export function slugifyCategoryName(name: string): string {
  const raw = String(name ?? "").trim().toLowerCase();
  if (!raw) return "";

  // Prefer ascii letters/digits; hangul etc. fall back to timestamp token below.
  let slug = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    slug = `cat-${Date.now().toString(36)}`;
  }
  return slug.slice(0, 100);
}

/** Append -2, -3… until available (caller supplies availability check). */
export async function allocateUniqueCategorySlug(
  baseName: string,
  isAvailable: (slug: string) => Promise<boolean>
): Promise<string> {
  const base = slugifyCategoryName(baseName) || `cat-${Date.now().toString(36)}`;
  if (await isAvailable(base)) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base.slice(0, Math.max(1, 100 - String(n).length - 1))}-${n}`;
    if (await isAvailable(candidate)) return candidate;
  }
  return `${base.slice(0, 80)}-${Date.now().toString(36)}`.slice(0, 100);
}
