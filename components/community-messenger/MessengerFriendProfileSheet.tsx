"use client";

import { useState } from "react";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

type Props = {
  profile: CommunityMessengerProfileLite;
  /** `CommunityMessengerHome` 의 `busyId` — `call:voice:${id}` 등과 매칭 */
  busyId: string | null;
  onClose: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onChat: () => void;
  onToggleFavorite: () => void;
  onRemoveFriend?: () => void;
  onBlock?: () => void;
  onReport?: () => void;
};

/**
 * 친구를 눌렀을 때 바로 채팅으로 보내지 않고, 먼저 행동을 고르게 하는 하단 시트.
 */
export function MessengerFriendProfileSheet({
  profile,
  busyId,
  onClose,
  onVoiceCall,
  onVideoCall,
  onChat,
  onToggleFavorite,
  onRemoveFriend,
  onBlock,
  onReport,
}: Props) {
  const pid = profile.id;
  const bVoice = busyId === `call:voice:${pid}`;
  const bVideo = busyId === `call:video:${pid}`;
  const bChat = busyId === `room:${pid}`;
  const bFav = busyId === `favorite:${pid}`;
  const anyBusy = Boolean(busyId);
  const [callOptionsOpen, setCallOptionsOpen] = useState(false);

  const avatarSrc = profile.avatarUrl ?? undefined;
  const initial = profile.label.trim().slice(0, 1) || "?";

  return (
    <div className="fixed inset-0 z-[45] flex flex-col justify-end bg-black/45" role="dialog" aria-modal="true" aria-labelledby="messenger-friend-sheet-title">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-[12px] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_32px_rgba(0,0,0,0.12)]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" aria-hidden />
        <div className="flex flex-col items-center text-center">
          <div className="h-20 w-20 overflow-hidden rounded-full bg-gray-100">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-gray-500">{initial}</div>
            )}
          </div>
          <h2 id="messenger-friend-sheet-title" className="mt-3 text-[18px] font-bold text-gray-900">
            {profile.label}
          </h2>
          <p className="mt-1 text-[13px] text-gray-500">{profile.subtitle ?? "SAMarket"}</p>
        </div>

        <div className="mt-5 rounded-ui-rect border border-gray-200 bg-gray-50 px-3 py-3 text-left">
          <p className="text-[13px] font-semibold text-gray-900">무엇을 하시겠어요?</p>
          <p className="mt-1 text-[12px] text-gray-500">친구를 선택한 뒤 바로 이동하지 않고 원하는 동작을 먼저 고를 수 있습니다.</p>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setCallOptionsOpen(false);
              onChat();
            }}
            disabled={anyBusy}
            className="flex min-h-[60px] items-center justify-between rounded-ui-rect border border-gray-200 bg-white px-4 py-3 text-left text-[14px] font-semibold text-gray-900 disabled:opacity-50"
          >
            <span>1:1 채팅</span>
            <span className="text-[12px] font-medium text-gray-400">{bChat ? "열는 중…" : "대화 시작"}</span>
          </button>
          <button
            type="button"
            onClick={() => setCallOptionsOpen((prev) => !prev)}
            disabled={anyBusy}
            className="flex min-h-[60px] items-center justify-between rounded-ui-rect border border-gray-200 bg-white px-4 py-3 text-left text-[14px] font-semibold text-gray-900 disabled:opacity-50"
          >
            <span>통화</span>
            <span className="text-[12px] font-medium text-gray-400">{callOptionsOpen ? "옵션 닫기" : "음성/영상 선택"}</span>
          </button>
        </div>

        {callOptionsOpen ? (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onVoiceCall}
              disabled={anyBusy}
              className="flex min-h-[56px] items-center justify-between rounded-ui-rect border border-gray-200 bg-white px-4 py-3 text-left text-[14px] font-semibold text-gray-900 disabled:opacity-50"
            >
              <span>음성 통화</span>
              <span className="text-[12px] font-medium text-gray-400">{bVoice ? "연결 중…" : "바로 연결"}</span>
            </button>
            <button
              type="button"
              onClick={onVideoCall}
              disabled={anyBusy}
              className="flex min-h-[56px] items-center justify-between rounded-ui-rect border border-gray-200 bg-white px-4 py-3 text-left text-[14px] font-semibold text-gray-900 disabled:opacity-50"
            >
              <span>영상 통화</span>
              <span className="text-[12px] font-medium text-gray-400">{bVideo ? "연결 중…" : "화상 연결"}</span>
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onToggleFavorite}
          disabled={anyBusy}
          className="mt-2 flex w-full items-center justify-center rounded-ui-rect border border-amber-200 bg-amber-50 py-3 text-[14px] font-semibold text-amber-900 disabled:opacity-50"
        >
          {bFav ? "처리 중…" : profile.isFavoriteFriend ? "즐겨찾기 해제" : "즐겨찾기에 추가"}
        </button>

        {profile.isFriend ? (
          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
            {onRemoveFriend ? (
              <button
                type="button"
                onClick={onRemoveFriend}
                disabled={anyBusy}
                className="w-full rounded-ui-rect border border-gray-200 py-2.5 text-[13px] font-medium text-gray-800 disabled:opacity-50"
              >
                친구 삭제
              </button>
            ) : null}
            {onBlock ? (
              <button
                type="button"
                onClick={onBlock}
                disabled={anyBusy}
                className="w-full rounded-ui-rect border border-red-200 py-2.5 text-[13px] font-medium text-red-700 disabled:opacity-50"
              >
                {profile.blocked ? "차단 해제" : "차단"}
              </button>
            ) : null}
            {onReport ? (
              <button
                type="button"
                onClick={onReport}
                disabled={anyBusy}
                className="w-full py-2 text-[12px] font-medium text-gray-500 disabled:opacity-50"
              >
                신고
              </button>
            ) : null}
          </div>
        ) : null}

        <button type="button" onClick={onClose} className="mt-3 w-full py-3 text-[14px] font-medium text-gray-600">
          닫기
        </button>
      </div>
    </div>
  );
}
