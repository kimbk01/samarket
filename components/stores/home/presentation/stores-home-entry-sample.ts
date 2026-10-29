import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

/**
 * v4 W3 PL-02 — 홈 선반 카드 샘플 배지 판정.
 * 서버(W2)가 `StoresHomeFoodEntry.isSampleStore` 를 채우면 그대로 쓰고,
 * 없으면 같은 home-feed 응답의 매장 행(`StoreHomeFeedItem.isSampleStore`) 으로 판정한다.
 * 샘플 판정 원천은 서버 공개 응답(`stores.store_kind='sample'`) 하나뿐 — 클라 추정 금지.
 */
type EntryWithSample = StoresHomeFoodEntry & { isSampleStore?: boolean | null };

export function readHomeShelfEntryIsSample(
  entry: StoresHomeFoodEntry,
  override?: boolean | null
): boolean {
  if (override === true) return true;
  return (entry as EntryWithSample).isSampleStore === true;
}

export function buildHomeSampleStoreIdSet(
  stores: readonly Pick<StoreHomeFeedItem, "id" | "isSampleStore">[] | undefined
): ReadonlySet<string> {
  const out = new Set<string>();
  if (!stores) return out;
  for (const s of stores) {
    if (s.isSampleStore === true) out.add(s.id);
  }
  return out;
}

/** 좁은 홈 카드(레일·원형)용 — 배지 줄바꿈 허용 */
export const HOME_SHELF_SAMPLE_BADGE_CLASS = "mt-1 !whitespace-normal";
