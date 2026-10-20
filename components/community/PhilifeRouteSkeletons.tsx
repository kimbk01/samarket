/**
 * 필라이프 하위 화면 전용 스켈레톤 (설계서 §13-2·3).
 *
 * - 피드 스켈레톤(`CommunityFeedSkeleton`·`MainFeedRouteLoading`)은 **피드 페이지 안**(`CommunityFeed`)에만 둔다.
 * - 피드가 아닌 화면(상세·글쓰기·내 활동)은 각 화면 구조와 같은 블록 높이의 스켈레톤을 쓴다.
 * - 한 경로에 스켈레톤 소유자는 하나 — 세그먼트 `loading.tsx` 또는 페이지 `Suspense` 중 하나.
 * - 헤더는 1단 셸(`RegionBar`)이 즉시 그리므로 여기서는 본문만 그린다(내 활동은 로컬 헤더 화면이라 헤더 포함).
 */
import type { ReactNode } from "react";

const BONE = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";

function SkeletonShell({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <div aria-busy="true" data-testid={testId} className="min-w-0 max-w-full overflow-x-hidden bg-sam-app">
      {children}
    </div>
  );
}

/** `/philife/[postId]` 글 상세 — 카테고리 행 · 작성자 행 · 제목 · 본문 · 반응 행 (`CommunityDetail` 골격) */
export function PhilifePostDetailSkeleton() {
  return (
    <SkeletonShell testId="philife-post-detail-skeleton">
      <div className="w-full min-w-0 px-4 pb-6 pt-2">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-4 py-4">
          <span className={`block h-5 w-20 ${BONE}`} />
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 shrink-0 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <span className={`block h-3.5 w-28 ${BONE}`} />
              <span className={`block h-3 w-40 ${BONE}`} />
            </span>
          </div>
          <span className={`block h-6 w-[80%] ${BONE}`} />
          <div className="flex flex-col gap-2">
            {["w-full", "w-full", "w-[92%]", "w-[70%]"].map((w, i) => (
              <span key={i} className={`block h-4 ${w} ${BONE}`} />
            ))}
          </div>
          <div className="flex gap-4 border-t border-sam-border-soft pt-3">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`block h-4 w-14 ${BONE}`} />
            ))}
          </div>
        </div>
      </div>
    </SkeletonShell>
  );
}

/** `/philife/write` 글쓰기 — 주제 칩 · 제목 입력 · 본문 입력 · 사진 행 (`PhilifeNeighborhoodWriteForm` 섹션 골격) */
export function PhilifeWriteSkeleton() {
  return (
    <SkeletonShell testId="philife-write-skeleton">
      <div className="flex w-full min-w-0 flex-col gap-2 pt-2">
        <section className="bg-sam-surface px-4 py-4">
          <span className={`block h-3.5 w-16 ${BONE}`} />
          <div className="mt-3 flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="h-8 w-16 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
            ))}
          </div>
        </section>
        <section className="bg-sam-surface px-4 py-4">
          <span className={`block h-3.5 w-12 ${BONE}`} />
          <span className={`mt-3 block h-11 w-full ${BONE}`} />
        </section>
        <section className="bg-sam-surface px-4 py-4">
          <span className={`block h-3.5 w-12 ${BONE}`} />
          <span className={`mt-3 block h-40 w-full ${BONE}`} />
        </section>
        <section className="bg-sam-surface px-4 py-4">
          <span className={`block h-3.5 w-14 ${BONE}`} />
          <div className="mt-3 flex gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`block h-20 w-20 ${BONE}`} />
            ))}
          </div>
        </section>
      </div>
    </SkeletonShell>
  );
}

/** `/philife/my` 내 활동 본문 — 안내 한 줄 · 카드 2개(동네 전용 · 내 글 목록) */
export function PhilifeMyHubBodySkeleton() {
  return (
    <SkeletonShell testId="philife-my-skeleton">
      <div className="flex min-w-0 flex-col gap-3 pt-2">
        <span className={`block h-4 w-[70%] ${BONE}`} />
        <div className="mt-1 flex flex-col gap-4">
          <section className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4">
            <span className={`block h-4 w-32 ${BONE}`} />
            <span className={`mt-2 block h-3.5 w-[80%] ${BONE}`} />
            <span className={`mt-3 block h-9 w-28 ${BONE}`} />
          </section>
          <section className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4">
            <span className={`block h-4 w-24 ${BONE}`} />
            <div className="mt-3 divide-y divide-sam-border-soft">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-2 py-3">
                  <span className={`block h-4 w-[75%] ${BONE}`} />
                  <span className={`block h-3 w-24 ${BONE}`} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </SkeletonShell>
  );
}
