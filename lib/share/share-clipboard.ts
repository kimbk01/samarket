/**
 * DIBAY 통합 공유 — 링크 복사. 사용자가 「링크 복사」를 직접 눌렀을 때만 부른다(§I-1).
 * 공유 실패·취소의 대체 동작으로 쓰지 않는다.
 */
export type ShareCopyResult = "copied" | "failed";

export async function copyShareLink(text: string): Promise<ShareCopyResult> {
  const value = text.trim();
  if (!value) return "failed";

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return "copied";
    } catch {
      /* 구형 WebView — 아래 방식 */
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
    return ok ? "copied" : "failed";
  } catch {
    return "failed";
  }
}
