"use client";

import { memo, useMemo, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { MessengerHeader } from "@/components/community-messenger/line-ui";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { AppBackIcon } from "@/components/navigation/AppBackButton";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import {
  readMessengerSplitRoomEntryFrameSeed,
  readMessengerSplitRoomEntryFrameSeedRaw,
} from "@/lib/community-messenger/room/messenger-split-room-entry-frame-seed";

/**
 * 분할 화면(768px+) 방 진입 틀 — 방이 준비되기 전 오른쪽 칸에 실제 방과 **같은 틀**(상단바 + 대화 배경)을 그린다.
 * 사용처 2곳이 같은 틀을 그려 화면 교체가 한 번(연두 빈 배경 → 틀)만 보이게 한다 (설계 P1·P2, 2026-11-07):
 * - `rooms/[roomId]/loading.tsx` — 방 화면을 불러오는 동안 (분할일 때만)
 * - `CommunityMessengerRoomEntryEmpty` — 방 데이터를 기다리는 동안 (분할일 때만, 대화 영역에만 대기 표시)
 * 상단바 치수는 `CommunityMessengerRoomPhase2Header` 분할 클래스와 같다. 이름·사진은 목록에서 누를 때 저장한
 * 진입 의도(`markRoomEntryIntent`)가 일반 1:1 방일 때만 — 거래·배달·그룹은 상단바 모양이 달라 빈 상단바.
 * 휴대폰(768px 미만)에서는 쓰지 않는다 (모바일 진입 애니메이션·목록 복사본 계약 그대로).
 */

/** `CommunityMessengerRoomPhase2Header` 와 같은 값 — 계약 테스트가 일치를 확인한다. */
export const SPLIT_ROOM_ENTRY_FRAME_HEADER_CLASS =
  "min-w-0 overflow-hidden pt-[var(--safe-top)]";
/** `CommunityMessengerRoomPhase2Header` 상태 줄(statusLine)과 같은 값 — 계약 테스트가 일치를 확인한다 (B-6). */
export const SPLIT_ROOM_ENTRY_FRAME_STATUS_LINE_CLASS =
  "truncate sam-text-xxs leading-tight text-[color:var(--cm-room-text-muted)]";
const HEADER_TOUCH_BTN_CLASS = "group relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full";
const HEADER_TOUCH_FACE_CLASS = "flex h-9 w-9 items-center justify-center rounded-full transition";

export const MessengerSplitRoomEntryFrame = memo(function MessengerSplitRoomEntryFrame({
  roomId,
  children,
  dataAttrs,
  ariaProps,
}: {
  roomId?: string;
  /** 대화 영역(상단바 아래)에 넣을 내용 — 대기·실패 표시 */
  children?: ReactNode;
  dataAttrs?: Record<string, string | undefined>;
  ariaProps?: Record<string, string | boolean | undefined>;
}) {
  const params = useParams();
  const rid = roomId?.trim() || String(params?.roomId ?? "").trim();
  /**
   * 마운트 때 한 번 읽어 고정 — 진입 의도는 방이 열리면 지워지므로, 틀이 보이는 동안 이름이 사라지지 않게 한다.
   * 틀은 분할 판정(useIsMessengerSplitViewport, 서버 값 false)이 참일 때만 마운트되므로 하이드레이션 불일치가 없다.
   */
  const [seedRaw] = useState(() =>
    typeof window === "undefined" ? null : readMessengerSplitRoomEntryFrameSeedRaw(rid)
  );
  const seed = useMemo(() => readMessengerSplitRoomEntryFrameSeed(rid, seedRaw), [rid, seedRaw]);

  return (
    <div
      data-messenger-shell
      data-cm-room
      data-cm-room-split-entry-frame=""
      {...dataAttrs}
      {...ariaProps}
      className="cm-room-shell flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <MessengerHeader className={SPLIT_ROOM_ENTRY_FRAME_HEADER_CLASS}>
        <span className={`${HEADER_TOUCH_BTN_CLASS} self-center text-[color:var(--cm-room-text)]`} aria-hidden>
          <span className={HEADER_TOUCH_FACE_CLASS}>
            <AppBackIcon />
          </span>
        </span>
        {seed ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 self-center" aria-hidden>
            <div className="relative h-9 w-9 shrink-0 self-center">
              <div className="h-full w-full overflow-hidden rounded-full bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]">
                <SamarketThumbnail
                  src={resolveUserAvatarImageSrc(seed.avatarUrl)}
                  fill
                  roundedClassName="rounded-full"
                  className="bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]"
                  fallbackSrc=""
                  fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
                />
              </div>
            </div>
            <div className="flex min-h-9 min-w-0 flex-1 flex-col justify-center self-center gap-0 leading-tight">
              <p className="truncate text-[length:var(--sector-header-title-size)] font-semibold leading-tight text-[color:var(--sector-header-title-color)]">
                {seed.title}
              </p>
              {/* 실제 방 상단바 상태 줄(1:1 방은 항상 1줄)과 같은 높이 자리 — 문구 없이 높이만 (B-6, 이름 7px 이동 방지) */}
              <p className={SPLIT_ROOM_ENTRY_FRAME_STATUS_LINE_CLASS} aria-hidden>
                {"\u00a0"}
              </p>
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1" aria-hidden />
        )}
      </MessengerHeader>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
});
