/**
 * Deterministic title wrap for portrait gift face (viewBox user units).
 * Same title → same lines on every device (no CSS reflow).
 */

export function wrapGiftCertificateTitle(
  title: string,
  opts?: { maxCharsPerLine?: number; maxLines?: number }
): string[] {
  const maxChars = opts?.maxCharsPerLine ?? 22;
  const maxLines = opts?.maxLines ?? 2;
  const raw = title.trim().replace(/\s+/g, " ");
  if (!raw) return [];

  const words = raw.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
      current = word;
    } else {
      // Single overlong token — hard slice
      lines.push(word.slice(0, maxChars));
      current = word.slice(maxChars);
    }
    if (lines.length >= maxLines) break;
  }

  if (lines.length < maxLines && current) {
    lines.push(current.length > maxChars ? current.slice(0, maxChars) : current);
  }

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  // Truncate last line with ellipsis if leftover content
  const joined = lines.join(" ");
  if (joined.length < raw.length && lines.length === maxLines) {
    const last = lines[maxLines - 1] ?? "";
    lines[maxLines - 1] = last.length >= 2 ? `${last.slice(0, Math.max(1, last.length - 1))}…` : "…";
  }

  return lines;
}
