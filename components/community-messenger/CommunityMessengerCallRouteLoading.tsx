import { MESSENGER_CALL_GRADIENT_SURFACE } from "@/lib/community-messenger/messenger-call-gradient";

/**
 * 통화 라우트 전환·무거운 클라이언트 청크 로드 동안 즉시 보여 줄 풀스크린 골격.
 */
export function CommunityMessengerCallRouteLoading() {
  return (
    <div
      className={`flex min-h-[100dvh] min-h-0 flex-col ${MESSENGER_CALL_GRADIENT_SURFACE}`}
      data-messenger-shell
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="relative flex h-[72px] w-[72px] items-center justify-center" aria-hidden>
          <span className="absolute inset-0 animate-ping rounded-full bg-white/15 opacity-40" />
          <span className="absolute inset-2 rounded-full border-2 border-white/25" />
          <span className="h-9 w-9 rounded-full bg-white/20 shadow-[0_0_24px_rgba(255,255,255,0.12)]" />
        </div>
        <p className="mt-8 text-[16px] font-semibold text-white/95">통화 화면을 불러오는 중</p>
        <p className="mt-2 max-w-[260px] text-center text-[13px] leading-snug text-white/50">
          연결 준비가 끝나면 바로 표시됩니다
        </p>
      </div>
    </div>
  );
}
