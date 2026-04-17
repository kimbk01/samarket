export function scoreKeywordMatch(fields: Array<string | null | undefined>, keyword: string): number {
  const q = keyword.trim().toLowerCase();
  if (!q) return 0;
  let best = 0;
  for (const field of fields) {
    const value = (field ?? "").trim().toLowerCase();
    if (!value) continue;
    if (value === q) {
      best = Math.max(best, 500);
      continue;
    }
    if (value.startsWith(q)) {
      best = Math.max(best, 400);
      continue;
    }
    if (value.split(/\s+/).some((part) => part.startsWith(q))) {
      best = Math.max(best, 300);
      continue;
    }
    if (value.includes(q)) {
      best = Math.max(best, 200);
    }
  }
  return best;
}
