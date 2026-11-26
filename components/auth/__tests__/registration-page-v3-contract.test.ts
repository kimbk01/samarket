import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** 가입 단계 화면 시안 v3 (Owner 2026-11-27 「v3대로 구현」) — 팝업 아님 · 입력 위쪽 · 하단 [가입 취소 · 주 버튼] */
describe("가입 단계 전체 화면 틀 (시안 v3)", () => {
  const shell = read("components/auth/RegistrationPageShell.tsx");

  it("팝업·시트가 아니라 일반 전체 화면 — 보이는 영역(visualViewport)에 고정", () => {
    expect(shell).not.toMatch(/DibayBottomSheet|AuthGateOverlay|DibayOverlayRoot/);
    expect(shell).toContain('className="fixed inset-0 flex flex-col bg-sam-surface"');
    expect(shell).toContain("top: Math.max(0, Math.round(visualViewportOffsetTop))");
    expect(shell).toContain("height: Math.round(visualViewportHeight)");
  });

  it("맨 위 줄 「회원가입」 · 하단 고정 줄 순서 = 가입 취소 → 주 버튼 → 고객센터", () => {
    expect(shell).toContain('t("auth_reg_header")');
    const exit = shell.indexOf('variant="sticky_secondary"');
    const primary = shell.indexOf("{primaryAction ?? null}");
    const slot = shell.indexOf("ref={primarySlotRef}");
    const support = shell.indexOf("CUSTOMER_CENTER_HREF}");
    expect(exit).toBeGreaterThan(-1);
    expect(primary).toBeGreaterThan(exit);
    expect(slot).toBeGreaterThan(primary);
    expect(support).toBeGreaterThan(slot);
    expect(shell).toContain('data-form-keyboard-footer="1"');
  });

  it("키보드 열림 = 하단 줄이 키보드 바로 위(높이를 두 번 더하지 않음) · 고객센터 줄 숨김", () => {
    expect(shell).toContain("paddingBottom: `${keyboardOpen ? 0 : effectiveBottomInset}px`");
    expect(shell).toMatch(/\{keyboardOpen \? null : \(/);
  });

  it("Android ◁ — 머문다(국가 선택이면 번호 화면으로)", () => {
    expect(shell).toContain("useOverlayHardwareBack(true, onTopBack ?? null)");
  });
});

describe("전화 단계 — 버튼 이름 = 동작 (시안 v3 2-1~3-3)", () => {
  const box = read("components/mypage/profile/PhoneVerificationBox.tsx");
  const reg = box.slice(box.indexOf("function renderRegistration()"), box.indexOf("/** ① 번호 입력"));

  it("번호 화면 주 버튼 = 「인증번호 받기」 · 6자리 화면 = 「인증하기」/「확인 중…」 · 완료 = 「확인」", () => {
    expect(reg).toContain('t("my_phone_btn_get_code")');
    expect(reg).toContain('verifying ? t("my_phone_verifying") : t("popup_btn_verify")');
    expect(reg).toContain('t("common_confirm")');
    expect(reg).not.toContain("my_phone_tg_continue");
  });

  it("주 버튼은 하단 고정 줄(포털) — 본문 안 알약 버튼 아님", () => {
    expect(reg).toContain("createPortal(node, slot)");
    expect(reg).not.toContain("pillBtn");
    expect(reg).toContain("MY_STICKY_CTA_PRIMARY_BUTTON_CLASS");
  });

  it("[인증하기] 는 6자리가 채워져야 켜짐 · [다시 보내기] 는 6칸 아래 글자 버튼", () => {
    expect(reg).toContain("disabled={!codeComplete || verifying}");
    const boxes = reg.indexOf('data-testid="phone-verify-code"');
    const resend = reg.indexOf('data-testid="phone-verify-resend"');
    expect(resend).toBeGreaterThan(boxes);
  });

  it("내정보 배치(알약 [계속])는 그대로", () => {
    expect(box).toContain('t("my_phone_tg_continue")');
  });

  it("전화 단계 화면이 맨 위 줄(국가 선택)·[가입 취소](완료 때 숨김)를 상자 단계에 맞춘다", () => {
    const step = read("components/auth/RegistrationPhoneStep.tsx");
    expect(step).toContain('exit={regStep === "done" ? null : "signup_cancel"}');
    expect(step).toContain('regStep === "country" ? t("my_phone_tg_country_title") : undefined');
    expect(step).toContain("primarySlotRef={setActionSlot}");
  });
});
