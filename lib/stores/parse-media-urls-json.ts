/** JSONB 이미지 배열: `["url"]` 또는 `[{ "url": "..." }]` */
export function parseMediaUrlsJson(raw: unknown, max = 20): string[] {
  let arr: unknown[];
  if (raw == null) return [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      arr = Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  } else {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    let u = "";
    if (typeof item === "string") u = item.trim();
    else if (item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string") {
      u = String((item as { url: string }).url).trim();
    }
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
      if (out.length >= max) break;
    }
  }
  return out;
}
