"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMessengerRoomUrlSearchParams } from "@/lib/community-messenger/room/use-messenger-room-url-search-params";
import {
  resolveMessengerRoomBackTargetNow,
  runMessengerRoomBackTarget,
} from "@/lib/community-messenger/room/messenger-room-back-target";
import { hasPageBackOwner, setPageBackOwner } from "@/lib/ui/overlay-back-stack";

/** 메신저 방 경로(`/community-messenger/rooms/…`)만 — 통화 경로(`/community-messenger/calls/…`)는 대상 아님. */
export function isMessengerRoomPreShellBackPath(pathname: string): boolean {
  return pathname.trim().startsWith("/community-messenger/rooms/");
}

type Props = {
  /** 「차단」 화면(세션 확인 전 — 방 셸 없음)을 그리는 동안만 참 */
  active: boolean;
};

/**
 * FAIL-2 (docs/audit/messenger-chat-fail2-fail3-call-impact-analysis-2026-11-18.md §2) — 앱이 꺼진 상태에서 알림으로
 * 방 주소가 열린 뒤 `AuthSessionBoundary` 가 세션 확인 전 「불러오는 중…」 을 그리는 동안(방 셸 없음) Android ◁ 의 주인.
 * 목적지는 방 셸과 같은 함수(`resolveMessengerRoomBackTargetNow` → `runMessengerRoomBackTarget`) — 방 정보 전이므로
 * roomType 없음: `cm_return` → `cm_list` → 대화 목록. 앱 안 진입(in_app = history back)이면 셸처럼 등록하지 않는다.
 *
 * 등록·해제는 셸(`MessengerRoomSwipeBackShell` pageBackOwnerReleaseRef)과 같은 규칙: 「등록 조건」이 바뀔 때만, 해제는 자기 등록일 때만.
 * 차단이 풀리면(active=false) 해제를 **언마운트 정리가 아닌 effect 본문**에서 한다 — 이 요소는 `AuthSessionBoundary` 에서
 * 방 화면(`children`) 뒤 형제로 남아 있으므로 같은 커밋에서 방 셸의 등록 effect 가 먼저 실행되고(슬롯을 덮음), 이 해제는
 * 자기 등록이 아니라서 아무것도 하지 않는다 → ◁ 주인 공백·네이티브 리스너 재설치 없음.
 * (언마운트 정리로 해제하면 정리가 셸 등록보다 먼저 실행돼 리스너가 제거 후 다시 설치된다 — #454 감사의 재설치 공백.)
 * 타이머·재시도·대체 이동·전역 이동 상태 없음.
 */
export function MessengerRoomPreShellBackOwner({ active }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useMessengerRoomUrlSearchParams();
  const committedNavRef = useRef(false);

  const resolveBackTarget = useCallback(
    () => resolveMessengerRoomBackTargetNow({ roomType: null, listKind: null, searchParams, ownerOrderChatsHref: null }),
    [searchParams]
  );

  /** 주인 함수 — 누른 순간 목적지를 계산해 이동 1회 */
  const runBackRef = useRef<() => void>(() => {});
  useEffect(() => {
    runBackRef.current = () => {
      if (committedNavRef.current) return;
      committedNavRef.current = true;
      runMessengerRoomBackTarget(router, resolveBackTarget());
    };
  }, [router, resolveBackTarget]);

  const pageBackOwnerReleaseRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const target = active ? resolveBackTarget() : null;
    const held = pageBackOwnerReleaseRef.current;
    if (target?.kind !== "replace") {
      if (held) {
        pageBackOwnerReleaseRef.current = null;
        held();
      }
      return;
    }
    if (held && hasPageBackOwner()) return;
    pageBackOwnerReleaseRef.current = null;
    console.info("[cm-room-back] pre_shell_page_back_owner", { href: target.href });
    pageBackOwnerReleaseRef.current = setPageBackOwner(() => runBackRef.current());
    /** pathname: 같은 요소에서 주소가 바뀌면 진입 출처·목적지를 다시 판정 */
  }, [active, pathname, resolveBackTarget]);
  useEffect(
    () => () => {
      const held = pageBackOwnerReleaseRef.current;
      pageBackOwnerReleaseRef.current = null;
      held?.();
    },
    []
  );

  return null;
}
