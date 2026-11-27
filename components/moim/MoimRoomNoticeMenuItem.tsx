"use client";

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { moimApi, moimRoutes } from "@/lib/moim/moim-client-api";

type LatestNotice = { postId: string; text: string } | null;

/**
 * 메신저 모임 방 메뉴의 「모임 공지」 줄 (4번 묶음 D1) — 모임 방 공지는 모임 게시판 공지 하나.
 * 메뉴를 열 때만 최신 고정 공지 1건을 묻는다(목록·방 열기 핫 경로 요청 없음).
 * 공지가 있으면 그 글로, 없으면 공지 게시판(없으면 모임 홈)으로 간다.
 */
export function MoimRoomNoticeMenuItem({ moimId, trailingClassName }: { moimId: string; trailingClassName: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<{ status: "loading" | "ready"; notice: LatestNotice; noticeBoardId: string | null }>({
    status: "loading",
    notice: null,
    noticeBoardId: null,
  });

  useEffect(() => {
    let alive = true;
    void moimApi.latestNotice(moimId).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setState({ status: "ready", notice: null, noticeBoardId: null });
        return;
      }
      const post = r.items[0];
      const text = post ? (post.title.trim() || post.body.split("\n")[0]?.trim() || "") : "";
      setState({ status: "ready", notice: post ? { postId: post.id, text } : null, noticeBoardId: r.noticeBoardId ?? null });
    });
    return () => {
      alive = false;
    };
  }, [moimId]);

  const href = state.notice
    ? moimRoutes.post(moimId, state.notice.postId)
    : state.noticeBoardId
      ? moimRoutes.board(moimId, state.noticeBoardId)
      : moimRoutes.home(moimId);

  return (
    /** 같은 서랍의 「모임 홈」 링크와 같은 이동 방식(메신저 화면 밖 페이지 · 전체 이동) */
    <a href={href} data-moim-room-notice="menu" className="dibay-overlay-menu__item">
      <span className="dibay-overlay-menu__icon text-[color:var(--overlay-text-secondary)]">
        <Megaphone strokeWidth={2} aria-hidden />
      </span>
      <span className="dibay-overlay-menu__text min-w-0 flex-1">
        <span className="dibay-overlay-menu__label">{t("moim_room_notice_label")}</span>
        <span className="dibay-overlay-menu__hint line-clamp-2">
          {state.status === "loading" ? t("common_loading") : state.notice?.text || t("moim_room_notice_empty")}
        </span>
      </span>
      <span className={trailingClassName} aria-hidden>
        ›
      </span>
    </a>
  );
}
