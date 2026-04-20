/** 비우면 `지정 안함`, `지정 안함 2` … 자동 부여 */
export function nextAutoUnspecifiedNickname(existingNicknames: string[]): string {
  const base = "지정 안함";
  const taken = new Set(
    existingNicknames.map((s) => s.trim().toLowerCase()).filter((x) => x.length > 0),
  );
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (i < 10_000) {
    const label = `${base} ${i}`;
    if (!taken.has(label.toLowerCase())) return label;
    i += 1;
  }
  return `${base} ${i}`;
}
