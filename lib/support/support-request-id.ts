/** 고객센터 쓰기 요청 id (계약 `docs/audit/customer-support-full-fix-contract-2026-11-28.md` §1) — uuid v4. */
/** 보낸 본문에 묶어 쓴다(본문이 같으면 다시 보낼 때 같은 id) */
export function newSupportRequestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // uuid v4 모양 대체(옛 웹뷰)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
