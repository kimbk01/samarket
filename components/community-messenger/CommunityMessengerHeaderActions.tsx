"use client";

/**
 * 메신저 홈 상단 우측 액션: 검색 / 새 대화 / 알림 / 설정.
 */
export function CommunityMessengerHeaderActions({
  incomingRequestCount,
  onOpenSearch,
  onOpenComposer,
  onOpenRequestList,
  onOpenSettings,
}: {
  incomingRequestCount: number;
  onOpenSearch: () => void;
  onOpenComposer: () => void;
  onOpenRequestList: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex max-w-[min(100vw-120px,200px)] shrink-0 items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={onOpenSearch}
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
        aria-label="메신저 검색"
      >
        <SearchIcon />
      </button>
      <button
        type="button"
        onClick={onOpenComposer}
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
        aria-label="새 대화"
      >
        <ComposeIcon />
      </button>
      <button
        type="button"
        onClick={onOpenRequestList}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
        aria-label={`알림${incomingRequestCount > 0 ? ` ${incomingRequestCount}건` : ""}`}
      >
        <BellListIcon />
        {incomingRequestCount > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gray-900 px-1 text-[10px] font-bold leading-none text-white">
            {incomingRequestCount > 99 ? "99+" : incomingRequestCount}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
        aria-label="메신저 설정"
      >
        <SettingsIconSolid />
      </button>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="h-[22px] w-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <circle cx="11" cy="11" r="6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 20l-4.2-4.2" />
    </svg>
  );
}

function ComposeIcon() {
  return (
    <svg className="h-[21px] w-[21px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h4l10-10a2.121 2.121 0 10-3-3L5 17v3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6.5l4 4" />
    </svg>
  );
}

function BellListIcon() {
  return (
    <svg className="h-[21px] w-[21px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 21a2 2 0 004 0" />
    </svg>
  );
}

/** 단색 채움 스타일 (톱니 설정) */
function SettingsIconSolid() {
  return (
    <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  );
}
