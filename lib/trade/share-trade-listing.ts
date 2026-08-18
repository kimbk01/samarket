/**
 * Trade DETAIL share only — navigator.share when available, else copy canonical `/post/[id]` URL.
 * Do not import community/store share modules.
 */

export function canonicalTradeDetailUrl(origin: string, postId: string): string {
  const id = typeof postId === "string" ? postId.trim() : "";
  const base = typeof origin === "string" ? origin.trim().replace(/\/+$/, "") : "";
  if (!id || !base) return "";
  return `${base}/post/${id}`;
}

export type ShareTradeListingResult = "shared" | "copied" | "cancelled" | "failed";

async function copyText(text: string): Promise<boolean> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (nav?.clipboard && typeof nav.clipboard.writeText === "function") {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      /* execCommand fallback */
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export async function shareOrCopyTradeListing(input: {
  title: string;
  url: string;
}): Promise<ShareTradeListingResult> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const url = typeof input.url === "string" ? input.url.trim() : "";
  if (!url) return "failed";

  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (nav && typeof nav.share === "function") {
    try {
      await nav.share({ title: title || url, url, text: title || url });
      return "shared";
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && (error as { name?: string }).name === "AbortError") {
        return "cancelled";
      }
    }
  }

  const copied = await copyText(url);
  return copied ? "copied" : "failed";
}
