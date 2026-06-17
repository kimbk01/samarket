export type CommunityShareCopyResult = "clipboard" | "legacy" | "failed";

export function isShareAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: string }).name) : "";
  return name === "AbortError";
}

export async function copyTextToClipboard(text: string): Promise<CommunityShareCopyResult> {
  const value = text.trim();
  if (!value) return "failed";

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return "clipboard";
    } catch {
      /* fall through */
    }
  }

  if (typeof document === "undefined") return "failed";

  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok ? "legacy" : "failed";
  } catch {
    return "failed";
  }
}
