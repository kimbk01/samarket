/**
 * PHASE 1 TOTAL BURN — failed Intro implementations removed.
 * This route is a rebuild notice only. Not a Studio. Not a runtime consumer.
 */
export function IntroRebuildNotice() {
  return (
    <div className="mx-auto max-w-xl p-6 text-sam-fg">
      <h1 className="text-lg font-semibold">인트로</h1>
      <p className="mt-3 text-sm text-sam-muted">
        인트로 제품은 재구축을 위해 비활성화되었습니다. 앱은 OS 부팅 화면 다음 HOME으로 바로
        들어갑니다.
      </p>
      <p className="mt-2 text-sm text-sam-muted">
        Intro is disabled for a clean rebuild. The app goes from the OS launch surface to HOME.
      </p>
    </div>
  );
}
