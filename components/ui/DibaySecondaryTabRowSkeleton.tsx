import {
  DIBAY_CHROME_SECONDARY_HOST_BORDERED_CLASS,
  DIBAY_CHROME_SECONDARY_HOST_CLASS,
  DIBAY_SECONDARY_TAB_INNER_CLASS,
  DIBAY_SECONDARY_TAB_ROW_CLASS,
} from "@/lib/ui/dibay-secondary-tabs";

/**
 * 2단 탭 줄 자리(밑줄형) — 실제 탭이 늦게 붙는 동안 같은 높이를 미리 차지한다.
 * 줄 높이 44px + `bordered` 면 아래 구분선 1px = 실제 `DibaySecondaryTabRow`(section) 와 같은 크기
 * → 탭이 붙어도 아래 줄(3단 전환 줄·본문)이 밀려 내려가지 않는다 (Owner 「3건 수정」 2026-11-12).
 * 가벼운 서버·클라이언트 공용 부품 — 탭 본체(늦게 불러오는 코드)를 끌어오지 않는다.
 */
export function DibaySecondaryTabRowSkeleton({ bordered }: { bordered: boolean }) {
  return (
    <div
      className={bordered ? DIBAY_CHROME_SECONDARY_HOST_BORDERED_CLASS : DIBAY_CHROME_SECONDARY_HOST_CLASS}
      data-dibay-nav="secondary"
      data-dibay-tab-row-skeleton
    >
      <div className={DIBAY_SECONDARY_TAB_INNER_CLASS}>
        <div className={DIBAY_SECONDARY_TAB_ROW_CLASS} aria-hidden>
          {/* 글자 막대만 (실제 탭과 같은 44px 줄·12px 칸 여백) */}
          <div className="flex min-w-0 flex-1 flex-nowrap items-center overflow-hidden">
            <span className="mx-3 inline-flex h-4 w-8 animate-pulse rounded-ui-rect bg-sam-surface-muted" />
            <span className="mx-3 inline-flex h-4 w-14 animate-pulse rounded-ui-rect bg-sam-surface-muted" />
            <span className="mx-3 inline-flex h-4 w-8 animate-pulse rounded-ui-rect bg-sam-surface-muted" />
            <span className="mx-3 inline-flex h-4 w-14 animate-pulse rounded-ui-rect bg-sam-surface-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
