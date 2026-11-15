"use client";

import type { MainTabKeepAliveHubId } from "@/lib/layout/resolve-main-surface";

/**
 * 하단 탭 이동 중 뼈대 — 계약 v2(`main-bottom-nav-interaction-contract.ts` · Owner 2026-11-15).
 * 누른 프레임에 그 허브의 첫 화면 모양을 회색 블록으로 먼저 보인다(네이버 실측 N1·N3: 이전 화면·흰 화면 없음).
 * 보관 중인 허브는 이 뼈대 대신 보관 화면을 바로 보인다(`HubRetentionStack`). Next 경로가 확정되면 실제 화면으로 바뀐다.
 * 정지 화면(깜빡임 없음) — 네이버와 같음. 글자 없음(언어 무관).
 */
const BLOCK = "rounded-ui-rect bg-sam-surface-muted";

function Row({ avatar = false, thumb = false }: { avatar?: boolean; thumb?: boolean }) {
  return (
    <div className="flex items-center gap-3 bg-sam-surface px-4 py-3">
      {avatar ? <div className="h-11 w-11 shrink-0 rounded-full bg-sam-surface-muted" /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className={`h-4 w-2/3 ${BLOCK}`} />
        <div className={`h-3 w-5/6 ${BLOCK}`} />
      </div>
      {thumb ? <div className={`h-16 w-16 shrink-0 ${BLOCK}`} /> : null}
    </div>
  );
}

function ChipRow() {
  return (
    <div className="flex gap-2 px-4 py-3">
      {[64, 80, 72, 88].map((w) => (
        <div key={w} className={`h-8 shrink-0 ${BLOCK}`} style={{ width: w }} />
      ))}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <>
      <div className="px-4 pt-3">
        <div className={`h-11 w-full ${BLOCK}`} />
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 py-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-28 ${BLOCK}`} />
        ))}
      </div>
      <div className="flex flex-col gap-px">
        <Row thumb />
        <Row thumb />
      </div>
    </>
  );
}

function FeedSkeleton() {
  return (
    <>
      <ChipRow />
      <div className="flex flex-col gap-2">
        <Row thumb />
        <Row thumb />
        <Row thumb />
        <Row thumb />
      </div>
    </>
  );
}

function DeliverySkeleton() {
  return (
    <>
      <div className="px-4 pt-3">
        <div className={`h-11 w-full ${BLOCK}`} />
      </div>
      <div className="px-4 py-3">
        <div className={`h-40 w-full ${BLOCK}`} />
      </div>
      <div className="grid grid-cols-5 gap-3 px-4 py-2">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className={`h-12 w-12 ${BLOCK}`} />
            <div className={`h-3 w-10 ${BLOCK}`} />
          </div>
        ))}
      </div>
    </>
  );
}

function ChatSkeleton() {
  return (
    <>
      <div className="flex items-center justify-between px-4 py-3">
        <div className={`h-6 w-24 ${BLOCK}`} />
        <div className="flex gap-3">
          <div className="h-6 w-6 rounded-full bg-sam-surface-muted" />
          <div className="h-6 w-6 rounded-full bg-sam-surface-muted" />
        </div>
      </div>
      <ChipRow />
      <div className="flex flex-col gap-px">
        {Array.from({ length: 7 }, (_, i) => (
          <Row key={i} avatar />
        ))}
      </div>
    </>
  );
}

function MypageSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-3 rounded-ui-rect bg-sam-surface p-4">
        <div className="h-14 w-14 shrink-0 rounded-full bg-sam-surface-muted" />
        <div className="flex flex-1 flex-col gap-2">
          <div className={`h-4 w-1/3 ${BLOCK}`} />
          <div className={`h-3 w-1/4 ${BLOCK}`} />
        </div>
      </div>
      <div className={`h-32 w-full ${BLOCK}`} />
      <div className={`h-24 w-full ${BLOCK}`} />
      <div className={`h-24 w-full ${BLOCK}`} />
    </div>
  );
}

export function BottomNavHubSkeleton({ hub }: { hub: MainTabKeepAliveHubId }) {
  const body =
    hub === "home" ? (
      <HomeSkeleton />
    ) : hub === "delivery" ? (
      <DeliverySkeleton />
    ) : hub === "chat" ? (
      <ChatSkeleton />
    ) : hub === "mypage" ? (
      <MypageSkeleton />
    ) : (
      <FeedSkeleton />
    );
  return (
    <div
      className="min-h-[70dvh] w-full min-w-0 bg-sam-app"
      aria-busy="true"
      data-bottom-nav-hub-skeleton={hub}
    >
      {body}
    </div>
  );
}
