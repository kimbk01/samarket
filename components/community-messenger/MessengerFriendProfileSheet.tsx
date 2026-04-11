"use client";

import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

type Props = {
  open: boolean;
  profile: CommunityMessengerProfileLite | null;
  /** `CommunityMessengerHome` 의 `busyId` — `call:voice:${id}` 등과 매칭 */
  busyId: string | null;
  onClose: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onChat: () => void;
  onToggleFavorite: () => void;
};

/**
 * LINE 친구 프로필 탭에 가까운 하단 시트 — 음성·영상·채팅·즐겨찾기.
 */
export function MessengerFriendProfileSheet({
  open,
  profile,
  busyId,
  onClose,
  onVoiceCall,
  onVideoCall,
  onChat,
  onToggleFavorite,
}: Props) {
  if (!open || !profile) return null;

  const avatarSrc = profile.avatarUrl ?? undefined;
  const initial = profile.label.trim().slice(0, 1) || "?";
  const pid = profile.id;
  const bVoice = busyId === `call:voice:${pid}`;
  const bVideo = busyId === `call:video:${pid}`;
  const bChat = busyId === `room:${pid}`;
  const bFav = busyId === `favorite:${pid}`;
  const anyBusy = Boolean(busyId);

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

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onVoiceCall}
            disabled={anyBusy}
            className="flex flex-col items-center gap-1 rounded-ui-rect border border-gray-200 py-4 text-[13px] font-semibold text-gray-900 disabled:opacity-50"
          >
            <span className="text-2xl" aria-hidden>
              📞
            </span>
            {bVoice ? "연결 중…" : "음성 통화"}
          </button>
          <button
            type="button"
            onClick={onVideoCall}
            disabled={anyBusy}
            className="flex flex-col items-center gap-1 rounded-ui-rect border border-gray-200 py-4 text-[13px] font-semibold text-gray-900 disabled:opacity-50"
          >
            <span className="text-2xl" aria-hidden>
              📹
            </span>
            {bVideo ? "연결 중…" : "영상 통화"}
          </button>
        </div>

        <button
          type="button"
          onClick={onChat}
          disabled={anyBusy}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-ui-rect bg-[#06C755] py-3.5 text-[15px] font-semibold text-white disabled:opacity-50"
        >
          {bChat ? "열는 중…" : "채팅"}
        </button>

        <button
          type="button"
          onClick={onToggleFavorite}
          disabled={anyBusy}
          className="mt-2 flex w-full items-center justify-center rounded-ui-rect border border-amber-200 bg-amber-50 py-3 text-[14px] font-semibold text-amber-900 disabled:opacity-50"
        >
          {bFav ? "처리 중…" : profile.isFavoriteFriend ? "즐겨찾기 해제" : "즐겨찾기에 추가"}
        </button>

        <button type="button" onClick={onClose} className="mt-3 w-full py-3 text-[14px] font-medium text-gray-600">
          닫기
        </button>
      </div>
    </div>
  );
}
