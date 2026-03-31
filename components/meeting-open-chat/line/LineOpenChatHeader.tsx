"use client";

import Link from "next/link";

export type LineOpenChatHeaderProps = {
  backHref: string;
  thumbnailUrl: string | null;
  title: string;
  participantCount: number;
  /** 입장한 멤버 기준, 타인 메시지 안 읽음 개수 */
  unreadBadgeCount?: number;
  onSearchClick?: () => void;
  onParticipantsClick?: () => void;
  onMenuClick?: () => void;
  /** 입장 후에만: 강한 알림음 켜짐 */
  loudSoundEnabled?: boolean;
  onLoudSoundToggle?: () => void;
  /** 입장 후에만: 채팅방 나가기 */
  onLeaveClick?: () => void;
};

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 active:bg-gray-200"
    >
      {children}
    </button>
  );
}

export function LineOpenChatHeader({
  backHref,
  thumbnailUrl,
  title,
  participantCount,
  unreadBadgeCount = 0,
  onSearchClick,
  onParticipantsClick,
  onMenuClick,
  loudSoundEnabled = true,
  onLoudSoundToggle,
  onLeaveClick,
}: LineOpenChatHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#e2e2e2] bg-white/95 backdrop-blur-md">
      <div className="flex h-[52px] items-center gap-1 px-1 pr-2">
        <Link
          href={backHref}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-800 hover:bg-gray-100"
          aria-label="뒤로"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>

        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-gray-200">
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[13px] font-bold text-gray-500">
              OC
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 px-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="truncate text-[15px] font-bold leading-tight text-gray-900">{title}</h1>
            {unreadBadgeCount > 0 && (
              <span
                className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                aria-label={`안 읽은 메시지 ${unreadBadgeCount > 99 ? "99개 이상" : `${unreadBadgeCount}개`}`}
              >
                {unreadBadgeCount > 99 ? "99+" : unreadBadgeCount}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-500">참여자 {participantCount}명</p>
        </div>

        <IconButton label="검색" onClick={onSearchClick}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
            <path d="M16 16l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </IconButton>
        <IconButton label="참여자 보기" onClick={onParticipantsClick}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M9 11a3 3 0 100-6 3 3 0 000 6zm0 2c-3.33 0-6 2-6 4v1h12v-1c0-2-2.67-4-6-4zm7-6a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm0 2c-1.86 0-3.43.64-4.66 1.61.59.91.99 1.96 1.15 3.09H22v-1c0-1.74-2.24-3.7-6-3.7z" />
          </svg>
        </IconButton>
        {onLoudSoundToggle && (
          <IconButton
            label={loudSoundEnabled ? "강한 알림음 켜짐" : "강한 알림음 꺼짐"}
            onClick={onLoudSoundToggle}
          >
            {loudSoundEnabled ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 3c-1.25-1.33-2-3.08-2-5 0-1.93.75-3.68 2-5l1.41 1.41C15.89 5.55 15.25 7.17 15.25 9s.64 3.45 1.91 4.59L16.5 15zM19 3l-1.41 1.41C18.36 5.5 18 7.22 18 9s.36 3.5 1.09 4.59L19 15l1.41-1.41C21.64 12.55 22 10.83 22 9s-.36-3.5-1.09-4.59L19 3z" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            )}
          </IconButton>
        )}
        {onLeaveClick && (
          <IconButton label="채팅방 나가기" onClick={onLeaveClick}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M10 7V5a2 2 0 012-2h7v18h-7a2 2 0 01-2-2v-2M15 12H3M6 9l-3 3 3 3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </IconButton>
        )}
        <IconButton label="메뉴" onClick={onMenuClick}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </IconButton>
      </div>
    </header>
  );
}
