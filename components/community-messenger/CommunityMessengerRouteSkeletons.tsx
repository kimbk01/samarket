"use client";

function SkeletonPulse({ className }: { className: string }) {
  return <div aria-hidden className={`animate-pulse rounded-[12px] bg-[color:var(--messenger-surface-muted,#eceff4)] ${className}`} />;
}

export function CommunityMessengerHomeShellSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "min-h-[56dvh] space-y-3 px-1 pt-1"
          : "min-h-0 space-y-3 bg-[color:var(--messenger-bg,#f7f8fb)] px-3 py-2 pb-[calc(7rem+env(safe-area-inset-bottom,0px))]"
      }
      aria-hidden
      data-cm-home-skeleton={compact ? "compact" : "full"}
    >
      <section className="space-y-3">
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2 rounded-[16px] bg-[color:var(--messenger-surface,#fff)] p-1 shadow-[var(--messenger-shadow-soft)]">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonPulse key={i} className="h-10" />
            ))}
          </div>
          <div className="px-1">
            <SkeletonPulse className="h-6 w-24" />
            <SkeletonPulse className="mt-2 h-3 w-48" />
          </div>
        </div>

        <div className="min-h-[56dvh] space-y-3">
          <div className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider,#d9dee7)] bg-[color:var(--messenger-surface,#fff)] px-3 py-3 shadow-[var(--messenger-shadow-soft)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <SkeletonPulse className="h-4 w-20" />
                <SkeletonPulse className="mt-2 h-3 w-40" />
              </div>
              <div className="flex gap-2">
                <SkeletonPulse className="h-10 w-16 rounded-full" />
                <SkeletonPulse className="h-10 w-16 rounded-full" />
              </div>
            </div>
          </div>

          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider,#d9dee7)] bg-[color:var(--messenger-surface,#fff)] px-3 py-3 shadow-[var(--messenger-shadow-soft)]"
            >
              <div className="flex items-center gap-3">
                <SkeletonPulse className="h-12 w-12 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <SkeletonPulse className="h-4 w-24" />
                    <SkeletonPulse className="h-3 w-10" />
                  </div>
                  <SkeletonPulse className="mt-2 h-3 w-[88%]" />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <SkeletonPulse className="h-3 w-20" />
                    <SkeletonPulse className="h-5 w-6 rounded-full" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function CommunityMessengerRoomShellSkeleton() {
  return (
    <div
      data-messenger-shell
      data-cm-room
      className="flex min-h-[100dvh] flex-1 flex-col overflow-hidden bg-[color:var(--cm-room-page-bg,#f5f6fb)] text-[color:var(--cm-room-text,#111827)]"
      aria-hidden
    >
      <div className="border-b border-[color:var(--cm-room-divider,#d9dee7)] bg-[color:var(--cm-room-header-bg,#fff)] px-3 py-3">
        <div className="flex items-center gap-3">
          <SkeletonPulse className="h-9 w-9 rounded-full" />
          <div className="min-w-0 flex-1">
            <SkeletonPulse className="h-4 w-32" />
            <SkeletonPulse className="mt-2 h-3 w-24" />
          </div>
          <div className="flex gap-2">
            <SkeletonPulse className="h-9 w-9 rounded-full" />
            <SkeletonPulse className="h-9 w-9 rounded-full" />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-[color:var(--cm-room-chat-bg,#eef1f7)] px-3 py-3">
        <div className="mx-auto mb-3">
          <SkeletonPulse className="h-6 w-44 rounded-full" />
        </div>
        <div className="space-y-3">
          <div className="flex justify-start">
            <SkeletonPulse className="h-16 w-[72%] rounded-[18px]" />
          </div>
          <div className="flex justify-end">
            <SkeletonPulse className="h-14 w-[58%] rounded-[18px]" />
          </div>
          <div className="flex justify-start">
            <SkeletonPulse className="h-20 w-[80%] rounded-[18px]" />
          </div>
          <div className="flex justify-end">
            <SkeletonPulse className="h-14 w-[46%] rounded-[18px]" />
          </div>
        </div>
      </div>

      <div className="border-t border-[color:var(--cm-room-divider,#d9dee7)] bg-[color:var(--cm-room-header-bg,#fff)] px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center gap-2">
          <SkeletonPulse className="h-10 w-10 rounded-full" />
          <SkeletonPulse className="h-11 flex-1 rounded-full" />
          <SkeletonPulse className="h-10 w-10 rounded-full" />
        </div>
      </div>
    </div>
  );
}
