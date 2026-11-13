/**
 * DIBAY 통화 — 화면 밖 표면(PiP·알림·최근 앱·Dock)·CTA SSOT HARD LOCK 검사.
 *
 * SSOT: docs/dibay-call-minimized-surface-cta-ssot.md (§3 CTA · §4 내비 · §4-1 자동 PiP · §5 알림 · §6 최근 앱 · §9 잠금)
 * 근거: docs/audit/call-pip-nav-notification-audit-design-2026-11-12.md (Telegram 실측 T1~T10 · DIBAY 실측 D1~D11)
 *
 * 바꾸려면 Owner 명시 재개방 + SSOT 개정 + AGENTS.md 「통화 변경 규정」 3번. 이 검사를 느슨하게 고치는 것으로 대신하지 않는다.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const APP = "android/app/src/main";
const JAVA = `${APP}/java/com/dibay/app`;
let failed = false;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}
function fail(message) {
  console.error(`verify:call-surface-cta-ssot FAIL - ${message}`);
  failed = true;
}
function ok(message) {
  console.log(`  OK ${message}`);
}
function mustInclude(rel, needle, why) {
  if (!read(rel).includes(needle)) fail(`${rel}: ${why} (missing \`${needle}\`)`);
  else ok(`${rel}: ${why}`);
}
function mustNotInclude(rel, needle, why) {
  if (read(rel).includes(needle)) fail(`${rel}: ${why} (found \`${needle}\`)`);
}

// 표면 코드 (통화 화면·PiP·알림·Dock·최근 앱)
const SURFACE_FILES = [
  `${JAVA}/nativevideo/NativeVideoCallActivity.java`,
  `${JAVA}/nativevideo/NativeVideoCallPipPresenter.java`,
  `${JAVA}/nativevideo/NativeVideoCallService.java`,
  `${JAVA}/nativevideo/NativeVideoCallDockPresenter.java`,
  `${JAVA}/nativevideo/NativeVideoCallActionReceiver.java`,
  `${JAVA}/nativevoice/NativeVoiceCallActivity.java`,
  `${JAVA}/nativevoice/NativeVoiceCallPipPresenter.java`,
  `${JAVA}/nativevoice/NativeVoiceCallService.java`,
  `${JAVA}/nativevoice/NativeVoiceCallDockPresenter.java`,
  `${JAVA}/nativevoice/NativeVoiceCallActionReceiver.java`,
  `${JAVA}/call/CallPipActionPlan.java`,
  `${JAVA}/call/CallRecentsCardPresenter.java`,
  `${APP}/res/layout/activity_native_video_call.xml`,
  `${APP}/res/layout/activity_native_voice_call.xml`,
  // 수신 화면(FSI)·구형 통화 FGS 알림 — §0: 경로는 잠긴 그대로, X 금지만 적용
  `${APP}/res/layout/activity_incoming_call.xml`,
  `${JAVA}/call/CallForegroundService.java`,
];
for (const rel of SURFACE_FILES) {
  if (!exists(rel)) fail(`missing surface file ${rel}`);
}
if (failed) process.exit(1);

console.log("① 통화 CTA 에 X 모양 금지 (§3)");
if (exists(`${APP}/res/drawable/ic_call_end_x.xml`)) fail("res/drawable/ic_call_end_x.xml must be deleted (X 모양 통화 CTA 금지)");
for (const rel of SURFACE_FILES) {
  mustNotInclude(rel, "ic_menu_close_clear_cancel", "X 모양 시스템 아이콘을 통화 CTA 로 쓰면 안 됨");
  mustNotInclude(rel, "ic_call_end_x", "X 모양 종료 아이콘 금지 — ic_call_end(수화기)");
}
ok("ic_call_end_x · ic_menu_close_clear_cancel 0건");
mustInclude(`${APP}/res/layout/activity_native_video_call.xml`, '@drawable/ic_call_end"', "영상 통화 종료 = 수화기");
mustInclude(`${APP}/res/layout/activity_native_voice_call.xml`, '@drawable/ic_call_end"', "음성 통화 종료·거절 = 수화기");
// Owner 2026-11-14: 영상 연결 후 버튼은 아이콘만 — 버튼 아래 이름 없음 (SSOT §3 규칙 변경).
for (const label of ["camera_flip_label", "camera_label", "mic_label", "end_label"]) {
  mustNotInclude(`${APP}/res/layout/activity_native_video_call.xml`, `native_video_call_${label}`, "영상 버튼 아래 이름 금지(아이콘만)");
}

console.log("② PiP 버튼 = 마이크 · 카메라(영상) · 통화 종료 (§3 · §4)");
mustInclude(`${JAVA}/call/CallPipActionPlan.java`, "Arrays.asList(Action.MIC, Action.CAMERA, Action.END)", "화면 순서 고정");
for (const rel of [`${JAVA}/nativevideo/NativeVideoCallPipPresenter.java`, `${JAVA}/nativevoice/NativeVoiceCallPipPresenter.java`]) {
  mustInclude(rel, "CallPipActionPlan.plan(", "버튼 계획 단일 규칙 사용");
  mustInclude(rel, "R.drawable.ic_call_end", "종료 = 수화기");
  mustInclude(rel, "R.string.dibay_call_end_call", "종료 문구 = dibay_call_end_call");
  mustInclude(rel, "ACTION_PIP_MIC", "PiP 마이크 버튼");
  mustInclude(rel, "setAutoEnterEnabled(autoEnter)", "§4-1 자동 PiP");
}
mustInclude(`${JAVA}/nativevideo/NativeVideoCallPipPresenter.java`, "ACTION_PIP_CAMERA", "PiP 카메라 버튼");

console.log("③ 자동 PiP 는 CONNECTED 동안만 (§4-1)");
for (const rel of [`${JAVA}/nativevideo/NativeVideoCallActivity.java`, `${JAVA}/nativevoice/NativeVoiceCallActivity.java`]) {
  mustInclude(rel, "private boolean isAutoPipEligible()", "자동 PiP 조건 함수");
  mustInclude(rel, "State.CONNECTED", "CONNECTED 조건");
  mustInclude(rel, "refreshPipParams(\"state_", "상태 바뀔 때 PiP 파라미터 갱신");
  mustInclude(rel, "public void onUserLeaveHint()", "onUserLeaveHint 유지(PiP 꺼진 기기 Dock 대체 경로)");
}

console.log("④ 진행 중 통화 알림 = 통화 카드 (§5)");
for (const rel of [`${JAVA}/nativevideo/NativeVideoCallService.java`, `${JAVA}/nativevoice/NativeVoiceCallService.java`]) {
  mustInclude(rel, "CallStyle.forOngoingCall(", "CallStyle 통화 카드");
  mustInclude(rel, 'CALL_NOTIFICATION_GROUP = "dibay.call.ongoing"', "통화 전용 묶음 키");
  mustInclude(rel, ".setGroup(CALL_NOTIFICATION_GROUP)", "일반 알림과 자동 묶음 금지");
  mustInclude(rel, ".setUsesChronometer(true)", "통화 시간");
  mustInclude(rel, "R.string.dibay_call_end_call", "종료 문구 = dibay_call_end_call");
  for (const banned of [
    '"DIBAY video call"',
    '"DIBAY voice call"',
    '"Native video runtime"',
    '"Native voice runtime"',
    '"DIBAY video connecting"',
    '"DIBAY voice connecting"',
    '"DIBAY incoming video call"',
    '"DIBAY incoming call"',
  ]) {
    mustNotInclude(rel, banned, "코드 안 영어 고정 문구 금지(i18n SSOT) — 문자열 키만");
  }
}
mustInclude(`${JAVA}/nativevideo/NativeVideoCallService.java`, ".setIsVideo(true)", "영상 통화 표시");
mustInclude(`${JAVA}/nativevideo/NativeVideoCallService.java`, "R.string.dibay_call_ch_video_ongoing_name", "「영상 통화 중」");
mustInclude(`${JAVA}/nativevoice/NativeVoiceCallService.java`, "R.string.dibay_call_ch_voice_ongoing_name", "「음성 통화 중」");

console.log("⑤ 최근 앱 통화 카드 = CONNECTED 동안만, 종료 후 잔류 0 (§6)");
mustInclude(`${JAVA}/call/CallRecentsCardPresenter.java`, "task.setExcludeFromRecents(!visible)", "표시/숨김 단일 함수");
for (const rel of [`${JAVA}/nativevideo/NativeVideoCallActivity.java`, `${JAVA}/nativevoice/NativeVoiceCallActivity.java`]) {
  mustInclude(rel, "CallRecentsCardPresenter.apply(", "상태에 따라 카드 표시/숨김");
  mustInclude(rel, "if (isFinishing()) CallRecentsCardPresenter.apply(this, false", "화면 종료 시 숨김");
}

console.log("⑥ Dock 종료 문구 (§3)");
mustInclude(`${JAVA}/nativevideo/NativeVideoCallDockPresenter.java`, "R.string.dibay_call_end_call", "Dock 종료 문구");
mustInclude(`${JAVA}/nativevoice/NativeVoiceCallDockPresenter.java`, "R.string.dibay_call_end_call", "Dock 종료 문구");

console.log("⑦ 문자열 키 ko·en 동시 (§3 · §6)");
for (const key of ["dibay_call_end_call", "dibay_call_recents_label", "dibay_call_recents_label_no_name"]) {
  for (const rel of [`${APP}/res/values/strings.xml`, `${APP}/res/values-ko/strings.xml`]) {
    mustInclude(rel, `name="${key}"`, `문자열 키 ${key}`);
  }
}

console.log("⑧ 종료 판단표 불변 — PiP 닫기·카드 제거 = 통화 유지 (§4, 11-01)");
mustInclude(
  `${JAVA}/nativevideo/NativeVideoCallActivity.java`,
  'stoppedInPip ? "pip_dismissed" : "activity_destroyed"',
  "화면 소실은 SURFACE_LOST 로만 보고(종료 아님)",
);

console.log("⑨ ◁ 뒤로 메신저 복귀 = PiP 요청 수락 직후 요청, 콜백·타이머는 확인 전용 (BAL 설계 §5)");
for (const rel of [`${JAVA}/nativevideo/NativeVideoCallActivity.java`, `${JAVA}/nativevoice/NativeVoiceCallActivity.java`]) {
  mustInclude(rel, "private void confirmOrRetryAppReturn(", "콜백·타이머 확인 전용 함수");
  mustInclude(rel, 'confirmOrRetryAppReturn(source, "pip_callback")', "PiP 콜백은 확인 전용");
  mustInclude(rel, 'confirmOrRetryAppReturn(source, "timeout")', "보조 타이머는 확인 전용");
  mustInclude(rel, "appReturnRequestedAtMs = SystemClock.elapsedRealtime();", "PiP 수락 직후 복귀 요청 시각 기록");
}
mustInclude(`${JAVA}/call/NativeCallAppReturn.java`, "native_call_app_return_unconfirmed", "실제 결과 기록(막혀도 성공처럼 기록 금지)");
mustInclude(`${JAVA}/MainActivity.java`, "NativeCallAppReturn.onMainResumed()", "메신저 재개 시 복귀 결과 확인");
console.log("⑩ 뒤로 → 메신저 + PiP = 고정 전 startActivity(OPEN) → 자동 PiP (원인 문서 §7)");
{
  const ret = read(`${JAVA}/call/NativeCallAppReturn.java`);
  const m = ret.match(/public static boolean openAppForAutoPip\([\s\S]*?\n  \}/);
  if (!m) fail("NativeCallAppReturn.openAppForAutoPip 없음");
  else {
    if (!m[0].includes("from.startActivity(open)")) fail("openAppForAutoPip 는 startActivity(OPEN 전환)로 열어야 함 — moveToFront(TO_FRONT)는 PiP2 자동 PiP 불가");
    if (m[0].includes("FLAG_ACTIVITY_NO_USER_ACTION")) fail("openAppForAutoPip 에 FLAG_ACTIVITY_NO_USER_ACTION 금지 — 사용자 떠남이 꺼지면 자동 PiP 불가");
    ok("openAppForAutoPip = startActivity · NO_USER_ACTION 없음");
  }
}
for (const [rel, tag] of [
  [`${JAVA}/nativevideo/NativeVideoCallActivity.java`, "native_video"],
  [`${JAVA}/nativevoice/NativeVoiceCallActivity.java`, "native_voice"],
]) {
  mustInclude(rel, "if (canOpenAppForAutoPip() && openAppThenAutoPip(source)) return true;", "뒤로·줄이기 = 고정 전 메신저 열기(실패 시 기존 경로)");
  mustInclude(rel, `"${tag}_user_leave_skipped"`, "메신저 연 직후 onUserLeaveHint PiP 중복 요청 건너뜀");
  mustInclude(rel, `"${tag}_auto_pip_missed"`, "자동 PiP 실패 기록(통화 유지)");
  mustInclude(rel, `"${tag}_auto_pip_entered"`, "자동 PiP 진입 기록");
}

if (failed) {
  console.error("verify:call-surface-cta-ssot FAILED");
  process.exit(1);
}
console.log("verify:call-surface-cta-ssot PASS");
