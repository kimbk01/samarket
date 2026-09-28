/**
 * Global Search canonical normalization.
 * NFC only — NFKC is forbidden. Do not rewrite the Search input display string.
 */

export function normalizeGlobalSearchText(raw: string | null | undefined): string {
  const nfc = (raw ?? "").normalize("NFC");
  let out = "";
  let prevSpace = false;
  for (const ch of nfc) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x41 && cp <= 0x5a) {
      out += String.fromCodePoint(cp + 32);
      prevSpace = false;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\u00a0") {
      if (out.length === 0 || prevSpace) continue;
      out += " ";
      prevSpace = true;
      continue;
    }
    out += ch;
    prevSpace = false;
  }
  return out.trim();
}
