/** 붙여넣기·API 요청에 흔한 `www....` / `//cdn...` 형태를 절대 http(s) URL로 맞춥니다. */
export function normalizeHttpUrlString(input: string): string {
  const t = input.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;
  if (/^www\./i.test(t)) return `https://${t}`;
  return t;
}
