import { normalizeGlobalSearchText } from "@/lib/search/global/semantics/normalize";
import {
  isHangulJamoCodePoint,
  meaningfulGlobalSearchTokens,
} from "@/lib/search/global/semantics/tokenize";

export function isIsolatedHangulJamoQuery(raw: string | null | undefined): boolean {
  const n = normalizeGlobalSearchText(raw);
  if (!n) return false;
  let seen = false;
  for (const ch of n) {
    if (ch === " ") continue;
    if (!isHangulJamoCodePoint(ch.codePointAt(0)!)) return false;
    seen = true;
  }
  return seen;
}

export function isSearchableGlobalQuery(raw: string | null | undefined): boolean {
  const n = normalizeGlobalSearchText(raw);
  if (!n) return false;
  if (isIsolatedHangulJamoQuery(n)) return false;
  return meaningfulGlobalSearchTokens(n).length > 0;
}
