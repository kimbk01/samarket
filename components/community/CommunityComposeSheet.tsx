"use client";

import Link from "next/link";
import { useEffect } from "react";
import { philifeAppPaths } from "@domain/philife/paths";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import {
  COMMUNITY_BOTTOM_SHEET_PANEL_CLASS,
  COMMUNITY_BUTTON_PRIMARY_CLASS,
  COMMUNITY_BUTTON_SECONDARY_CLASS,
  COMMUNITY_OVERLAY_BACKDROP_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";

export function CommunityComposeSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  /** @deprecated 글쓰기는 /philife/write 고정 */
  sectionSlug?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const writeHref = philifeAppPaths.write;
  const writeMeetingHref = philifeAppPaths.writeMeeting;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button type="button" className={COMMUNITY_OVERLAY_BACKDROP_CLASS} aria-label="닫기" onClick={onClose} />
      <div className={`relative z-50 px-4 pb-8 pt-3 ${COMMUNITY_BOTTOM_SHEET_PANEL_CLASS}`}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-[4px] bg-[#E5E7EB]" />
        <p className="mb-3 text-center text-[13px] font-normal text-[#6B7280]">무엇을 할까요?</p>
        <ul className="space-y-2">
          <li>
            <Link
              href={TRADE_CHAT_SURFACE.messengerListHref}
              onClick={onClose}
              className={`flex items-center justify-center ${COMMUNITY_BUTTON_SECONDARY_CLASS}`}
            >
              동네봇에게 질문 남기기
            </Link>
          </li>
          <li>
            <Link
              href={writeHref}
              onClick={onClose}
              className={`flex items-center justify-center ${COMMUNITY_BUTTON_SECONDARY_CLASS}`}
            >
              커뮤니티 글쓰기
            </Link>
          </li>
          <li>
            <Link
              href={writeMeetingHref}
              onClick={onClose}
              className={`flex items-center justify-center ${COMMUNITY_BUTTON_PRIMARY_CLASS}`}
            >
              모임 만들기
            </Link>
          </li>
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full py-2 text-[14px] font-semibold text-[#6B7280]"
        >
          취소
        </button>
      </div>
    </div>
  );
}
