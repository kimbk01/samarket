/**
 * 거래 목록 계약 ① 검색 — 검색어 단계(일치 0–4 → 나머지 5)가 바깥, 그 안에 목록과 같은 구간(②~⑤), 구간 안 정렬.
 * (`docs/dibay-marketplace-list-ssot-target.md` §3)
 * 안내 줄 키: 일치 단계 = 구간 키, 나머지 = "q:rest" + 구간 키.
 */
import { sortBrowseListingsWithinLocationBlock } from "@/lib/trade/marketplace/assemble-marketplace-browse-order";
import type {
  MarketplaceBrowseListing,
  MarketplaceBrowseSort,
} from "@/lib/trade/marketplace/assemble-marketplace-browse-order";
import type { ListSegment } from "@/lib/trade/marketplace/list-contract/list-segments";

import { SEARCH_REST_SECTION } from "@/lib/trade/marketplace/list-contract/list-section-keys";

export { SEARCH_REST_SECTION };

export function searchSectionKey(band: number, segment: ListSegment | undefined): string {
  const seg = segment?.section ?? "";
  if (band < 5) return seg;
  return seg ? `${SEARCH_REST_SECTION}|${seg}` : SEARCH_REST_SECTION;
}

/**
 * 같은 배치의 행을 (단계, 구간) 순서로 정렬한다. `bandOf`·`segmentOf` 는 호출측 분류기.
 * 반환 행에는 `list_section` 이 붙는다.
 */
export function rankSearchRowsBySegments<T extends MarketplaceBrowseListing>(input: {
  rows: T[];
  segments: ListSegment[];
  bandOf: (row: T) => number;
  segmentOf: (row: T) => number;
  sort: MarketplaceBrowseSort;
  anchorCanonicalId: string | null;
  /** true 면 나머지(단계 5)는 결과에서 빼고 `rest` 로 돌려준다(후보 1라운드 — 나머지는 구간별 SQL 과 합쳐 낸다) */
  holdRest?: boolean;
}): { ranked: Array<T & { list_section: string }>; rest: Array<{ segment: number; row: T }> } {
  const groups = new Map<string, T[]>();
  const rest: Array<{ segment: number; row: T }> = [];
  for (const row of input.rows) {
    const band = Math.min(5, Math.max(0, input.bandOf(row)));
    const seg = input.segmentOf(row);
    if (band >= 5 && input.holdRest) {
      rest.push({ segment: seg, row });
      continue;
    }
    const key = `${band}:${seg}`;
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }
  const ranked: Array<T & { list_section: string }> = [];
  for (let band = 0; band <= 5; band++) {
    for (let seg = 0; seg < input.segments.length; seg++) {
      const arr = groups.get(`${band}:${seg}`);
      if (!arr?.length) continue;
      const section = searchSectionKey(band, input.segments[seg]);
      for (const row of sortBrowseListingsWithinLocationBlock(arr, input.sort, input.anchorCanonicalId)) {
        ranked.push({ ...row, list_section: section });
      }
    }
  }
  return { ranked, rest };
}
