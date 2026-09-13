const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export type FetchHtmlResult = {
  ok: true;
  status: number;
  finalUrl: string;
  html: string;
} | {
  ok: false;
  status: number | null;
  finalUrl: string;
  error: string;
};

export async function fetchExternalBoardHtml(
  url: string,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<FetchHtmlResult> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? 25000;
  try {
    const res = await fetchImpl(url, {
      redirect: "follow",
      headers: {
        "user-agent": DEFAULT_UA,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9,ko;q=0.8",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const buf = await res.arrayBuffer();
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    if (!res.ok) {
      return { ok: false, status: res.status, finalUrl: res.url, error: `http_${res.status}` };
    }
    if (/cf-browser-verification|just a moment|attention required|access denied/i.test(html) && html.length < 8000) {
      return { ok: false, status: res.status, finalUrl: res.url, error: "waf_challenge" };
    }
    return { ok: true, status: res.status, finalUrl: res.url, html };
  } catch (e) {
    return {
      ok: false,
      status: null,
      finalUrl: url,
      error: String((e as Error).message || e),
    };
  }
}

export function absolutizeUrl(baseUrl: string, href: string): string | null {
  const raw = String(href ?? "").trim();
  if (!raw || raw.startsWith("#") || raw.toLowerCase().startsWith("javascript:")) return null;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return null;
  }
}
