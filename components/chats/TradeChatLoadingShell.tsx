import { TradeChatEntryRingSpinner } from "@/components/chats/TradeChatEntryRingSpinner";
import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

const THREAD_COLUMN_CLASS = `mx-auto w-full min-w-0 ${APP_MAIN_COLUMN_MAX_WIDTH_CLASS} ${APP_MAIN_GUTTER_X_CLASS}`;

export function TradeChatLoadingShell({
  label = "채팅 준비 중...",
  description = "대화방을 여는 중이에요.",
  className = "",
  variant = "chat-shell",
}: {
  label?: string;
  description?: string;
  className?: string;
  /** 거래 방 최초 생성·진입 대기 — 링 스피너 중심 UI */
  variant?: "chat-shell" | "creating";
}) {
  if (variant === "creating") {
    return (
      <div
        className={`flex min-h-0 flex-1 flex-col items-center justify-center bg-sam-surface px-6 ${className}`}
        aria-live="polite"
        aria-busy="true"
      >
        <TradeChatEntryRingSpinner />
        <p className="mt-5 text-[15px] font-medium text-sam-fg">{label}</p>
        {description ? <p className="mt-1.5 max-w-[16rem] text-center text-xs text-sam-muted">{description}</p> : null}
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col bg-sam-surface ${className}`} aria-live="polite" aria-busy="true">
      <div className="border-b border-sam-border-soft px-4 py-3">
        <div className={`${THREAD_COLUMN_CLASS} flex items-center gap-3`}>
          <div className="h-9 w-9 animate-pulse rounded-full bg-sam-border-soft" />
          <div className="min-w-0 flex-1">
            <div className="h-3.5 w-24 animate-pulse rounded bg-sam-border-soft" />
            <div className="mt-2 h-3 w-32 animate-pulse rounded bg-sam-surface-muted" />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-between">
        <div className={`${THREAD_COLUMN_CLASS} flex flex-1 flex-col gap-3 py-4`}>
          <div className="flex justify-start">
            <div className="h-10 w-40 animate-pulse rounded-2xl bg-sam-surface-muted" />
          </div>
          <div className="flex justify-end">
            <div className="h-10 w-32 animate-pulse rounded-2xl bg-emerald-50" />
          </div>
          <div className="flex justify-start">
            <div className="h-10 w-48 animate-pulse rounded-2xl bg-sam-surface-muted" />
          </div>
          <div className="pt-2 text-center">
            <p className="text-sm font-medium text-sam-fg">{label}</p>
            <p className="mt-1 text-xs text-sam-muted">{description}</p>
          </div>
        </div>

        <div className="border-t border-sam-border-soft px-4 py-3">
          <div className={`${THREAD_COLUMN_CLASS} flex items-center gap-2`}>
            <div className="h-10 w-10 animate-pulse rounded-full bg-sam-surface-muted" />
            <div className="h-11 flex-1 animate-pulse rounded-full bg-sam-surface-muted" />
            <div className="h-10 w-16 animate-pulse rounded-full bg-sam-border-soft" />
          </div>
        </div>
      </div>
    </div>
  );
}
