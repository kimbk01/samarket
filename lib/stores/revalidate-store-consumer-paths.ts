import { revalidatePath } from "next/cache";

/** 매장 소비자 화면 캐시 무효화 — 배너·공지·메뉴 변경 후 서버에서 호출 */
export function revalidateStoreConsumerPathsBySlug(slug: string): void {
  const s = slug.trim();
  if (!s) return;
  try {
    revalidatePath(`/stores/${encodeURIComponent(s)}`);
    revalidatePath(`/stores/${encodeURIComponent(s)}/info`);
    revalidatePath(`/stores/${encodeURIComponent(s)}/reviews`);
  } catch {
    /* revalidatePath는 서버 전용 — 호출부에서 이미 서버 라우트임 */
  }
}
