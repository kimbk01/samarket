/** 거래 후기 저장 성공 시 후기 관리 등 목록 갱신용 */
export const WRITTEN_REVIEW_UPDATED_EVENT = "kasama-written-review-updated";

export function dispatchWrittenReviewUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(WRITTEN_REVIEW_UPDATED_EVENT));
  }
}
