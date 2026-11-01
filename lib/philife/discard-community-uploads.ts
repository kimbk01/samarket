"use client";

/**
 * 작성 중 올렸지만 쓰지 않은 사진 정리 요청 (Owner 승인 ③ 2026-10-31).
 * 서버가 「본인 업로드 · 24시간 이내 · 어떤 글·기능에서도 참조 안 됨」만 지운다 — 여기서는 요청만 보낸다.
 * 화면 이동 중에도 끝나도록 keepalive. 실패해도 매일 정리 작업이 다시 확인한다.
 */
export const COMMUNITY_UPLOAD_DISCARD_URL = "/api/community/upload-image/discard";

/** 서버 한 요청 최대 주소 수(`upload-image/discard` MAX_URLS) — 넘으면 나눠 보낸다(앞 20장만 정리되던 누락 방지) */
const DISCARD_BATCH = 20;

export function discardCommunityUploads(urls: readonly string[]): void {
  const list = [...new Set(urls.map((u) => (u ?? "").trim()).filter(Boolean))];
  if (!list.length || typeof fetch !== "function") return;
  for (let i = 0; i < list.length; i += DISCARD_BATCH) {
    void fetch(COMMUNITY_UPLOAD_DISCARD_URL, {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: list.slice(i, i + DISCARD_BATCH) }),
    }).catch(() => {});
  }
}
