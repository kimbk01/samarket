// @vitest-environment jsdom
/**
 * R4 (S01–S19) 화면 상호작용 테스트 — 최종 설계 Part B 「완료 검증」 단위 항목.
 * 확인 시트(`MobileConfirmBottomSheet`)는 단순 버튼으로 대체해 요청 수만 검증한다.
 */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let search = "";
const routerReplace = vi.fn();
const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: routerPush, back: vi.fn() }),
  usePathname: () => "/mypage",
  useSearchParams: () => new URLSearchParams(search),
}));

/** Provider 밖 기본 `useI18n` 은 렌더마다 새 `t` 를 만든다 — 실제 앱(Provider)처럼 안정된 ko 번역 객체로 고정 */
vi.mock("@/components/i18n/AppLanguageProvider", async () => {
  const { safeTranslate } = await import("@/lib/i18n/safe-translate");
  const { translateText } = await import("@/lib/i18n/messages");
  const stable = {
    language: "ko",
    languagePreference: "ko",
    setLanguage: () => undefined,
    t: (key: string, vars?: Record<string, string | number>) => safeTranslate("ko", key as never, { vars }),
    safeT: (key: string, fallbacks?: string | { fallbackKo?: string; fallbackEn?: string }) =>
      typeof fallbacks === "string"
        ? safeTranslate("ko", key as never, { fallbackKo: fallbacks, fallbackEn: fallbacks })
        : safeTranslate("ko", key as never, fallbacks),
    tt: (text: string, vars?: Record<string, string | number>) => translateText("ko", text, vars),
  };
  return { useI18n: () => stable };
});

vi.mock("@/lib/ui/use-form-keyboard-viewport", () => ({
  useFormKeyboardViewport: () => ({ effectiveBottomInset: 0, keyboardOpen: false }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...(rest as Record<string, never>)}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/MobileConfirmBottomSheet", () => ({
  MobileConfirmBottomSheet: ({
    open,
    title,
    onCancel,
    onConfirm,
  }: {
    open: boolean;
    title: string;
    onCancel: () => void;
    onConfirm: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-sheet">
        <p data-testid="confirm-title">{title}</p>
        <button type="button" data-testid="confirm-cancel" onClick={onCancel} />
        <button type="button" data-testid="confirm-ok" onClick={onConfirm} />
      </div>
    ) : null,
}));

const getMyProfileMock = vi.fn();
vi.mock("@/lib/profile/getMyProfile", () => ({
  getMyProfile: () => getMyProfileMock(),
}));

import {
  MypageProfileSheetsProvider,
  useMypageProfileSheets,
} from "@/components/mypage/profile-settings/mypage-profile-sheets-context";
import { MypageProfileEditQueryOpener } from "@/components/mypage/profile-settings/MypageProfileEditQueryOpener";
import { ProfileDibayIdSection, DIBAY_ID_AUTO_CHECK_DEBOUNCE_MS } from "@/components/my/edit/ProfileDibayIdSection";
import { UserListContent } from "@/components/my/settings/UserListContent";
import { AccountDeletionRequestForm } from "@/components/account/AccountDeletionRequestForm";
import { PhoneVerificationBox } from "@/components/mypage/profile/PhoneVerificationBox";
import { MypageRequiredPhoneClient } from "@/components/mypage/required/MypageRequiredPhoneClient";
import { ACCOUNT_DELETION_CONFIRMATION_TOKEN } from "@/lib/account/account-deletion-contract";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const { activeSheet } = useMypageProfileSheets();
  return <span data-testid="active-sheet">{activeSheet ?? "none"}</span>;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(node: ReactNode) {
  act(() => root!.render(node));
}

function q(testId: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${testId}"]`);
}

function click(el: Element | null) {
  expect(el).not.toBeNull();
  act(() => {
    (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  search = "";
  routerReplace.mockReset();
  routerPush.mockReset();
  getMyProfileMock.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("S01 `/mypage?edit=profile` → 시트 열기 후 쿼리 제거", () => {
  it("쿼리가 있으면 profile-edit 시트를 열고 /mypage 로 replace", () => {
    search = "edit=profile";
    mount(
      <MypageProfileSheetsProvider>
        <MypageProfileEditQueryOpener />
        <Probe />
      </MypageProfileSheetsProvider>,
    );
    expect(q("active-sheet")?.textContent).toBe("profile-edit");
    expect(routerReplace).toHaveBeenCalledTimes(1);
    expect(routerReplace.mock.calls[0][0]).toBe("/mypage");
  });

  it("쿼리 없으면 아무것도 하지 않는다", () => {
    mount(
      <MypageProfileSheetsProvider>
        <MypageProfileEditQueryOpener />
        <Probe />
      </MypageProfileSheetsProvider>,
    );
    expect(q("active-sheet")?.textContent).toBe("none");
    expect(routerReplace).not.toHaveBeenCalled();
  });
});

describe("S04 아이디 확정 — 자동 확인·확인 시트", () => {
  function setupFetch() {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.includes("/reserve")) return jsonResponse({ ok: true, available: true, normalized: body.dibay_id });
      if (url.includes("/confirm")) return jsonResponse({ ok: true, dibay_id: body.dibay_id });
      return jsonResponse({ ok: false }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function renderSection(onConfirmed = vi.fn()) {
    mount(
      <ProfileDibayIdSection
        dibay_id="user12345"
        dibay_id_locked={false}
        dibay_id_auto_assigned
        dibay_id_changed_once={false}
        username="user12345"
        username_confirmed={false}
        onConfirmed={onConfirmed}
      />,
    );
    // 자동 배정 상태 — [1회 변경] 을 눌러 입력 폼 열기
    if (!document.getElementById("profile-dibay-id")) {
      click(host!.querySelector("button"));
    }
    const input = document.getElementById("profile-dibay-id") as HTMLInputElement;
    expect(input).not.toBeNull();
    return input;
  }

  it("디바운스 — 입력이 멈춘 뒤 마지막 값만 확인", async () => {
    vi.useFakeTimers();
    const fetchMock = setupFetch();
    const input = renderSection();
    fetchMock.mockClear();
    typeInto(input, "abc");
    act(() => {
      vi.advanceTimersByTime(DIBAY_ID_AUTO_CHECK_DEBOUNCE_MS - 100);
    });
    typeInto(input, "abcd");
    act(() => {
      vi.advanceTimersByTime(DIBAY_ID_AUTO_CHECK_DEBOUNCE_MS);
    });
    await flush();
    const reserveCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes("/reserve"));
    expect(reserveCalls).toHaveLength(1);
    expect(JSON.parse(String(reserveCalls[0][1]?.body)).dibay_id).toBe("abcd");
  });

  it("확인 시트 취소 → confirm 요청 0, 승인 2연타 → confirm 요청 1", async () => {
    vi.useFakeTimers();
    const fetchMock = setupFetch();
    const onConfirmed = vi.fn();
    const input = renderSection(onConfirmed);
    typeInto(input, "newid");
    act(() => {
      vi.advanceTimersByTime(DIBAY_ID_AUTO_CHECK_DEBOUNCE_MS);
    });
    await flush();
    expect(q("dibay-id-status-available")).not.toBeNull();

    click(q("dibay-id-confirm"));
    expect(q("confirm-title")?.textContent).toContain("newid");
    click(q("confirm-cancel"));
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("/confirm"))).toHaveLength(0);

    click(q("dibay-id-confirm"));
    const ok = q("confirm-ok");
    // 같은 틱 2연타 — 진행 중 ref 가 두 번째를 막는다
    act(() => {
      (ok as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
      (ok as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush(8);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("/confirm"))).toHaveLength(1);
    expect(onConfirmed).toHaveBeenCalledWith("newid");
  });
});

describe("S05 전화 인증 — 무한 로딩 금지 · 재전송 타이머", () => {
  it("프로필 조회 실패 → 오류 + [다시 시도] (로딩 고착 없음)", async () => {
    getMyProfileMock.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true, verification: { settings: { enabled: true } } })),
    );
    mount(<MypageRequiredPhoneClient />);
    await flush(8);
    expect(q("my-state-error")).not.toBeNull();
    expect(q("my-state-retry")).not.toBeNull();
  });

  it("설정 조회 거부 → 오류", async () => {
    getMyProfileMock.mockResolvedValue({ id: "u1" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    mount(<MypageRequiredPhoneClient />);
    await flush(8);
    expect(q("my-state-error")).not.toBeNull();
  });

  it("재전송 남은 초가 1초마다 줄어든다", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: true, phone: "+639123456789" })));
    mount(
      <PhoneVerificationBox
        snapshot={{
          phone: "09123456789",
          phone_verified: false,
          settings: { enabled: true, guide_text: "", resend_cooldown_seconds: 60 },
        }}
        onRefreshProfile={async () => undefined}
      />,
    );
    const sendBtn = Array.from(host!.querySelectorAll("button")).find((b) => !b.disabled);
    click(sendBtn ?? null);
    await flush(6);
    const resendText = () => Array.from(host!.querySelectorAll("button")).map((b) => b.textContent ?? "").join("|");
    expect(resendText()).toMatch(/60/);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(resendText()).toMatch(/59/);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(resendText()).toMatch(/57/);
  });
});

describe("S14 관심·차단·숨김 — 해제 확인", () => {
  const item = {
    id: "rel-1",
    targetId: "user-9",
    nickname: "상대",
    username: "other",
    avatarUrl: null,
    regionName: null,
    createdAt: "2025-01-01T00:00:00Z",
  };

  function setup() {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (!init || !init.method || init.method === "GET") return jsonResponse({ ok: true, items: [item] });
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("종류별 버튼 문구 · 차단은 확인 후에만 DELETE(targetUserId 포함) · 취소 시 요청 0", async () => {
    const fetchMock = setup();
    mount(<UserListContent type="blocked" emptyMessage="없음" />);
    await flush(6);
    const releaseBtn = q("user-relation-release");
    expect(releaseBtn?.textContent).toBe("차단 해제");
    click(releaseBtn);
    expect(q("confirm-sheet")).not.toBeNull();
    click(q("confirm-cancel"));
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === "DELETE")).toHaveLength(0);

    click(q("user-relation-release"));
    click(q("confirm-ok"));
    await flush(6);
    const deletes = fetchMock.mock.calls.filter(([, i]) => i?.method === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(String(deletes[0][0])).toContain("targetUserId=user-9");
    expect(q("user-relation-release")).toBeNull();
  });

  it("관심·숨김 문구", async () => {
    setup();
    mount(<UserListContent type="hidden" emptyMessage="없음" />);
    await flush(6);
    expect(q("user-relation-release")?.textContent).toBe("숨김 해제");
    act(() => root!.unmount());
    root = createRoot(host!);
    mount(<UserListContent type="favorite" emptyMessage="없음" />);
    await flush(6);
    expect(q("user-relation-release")?.textContent).toBe("관심 해제");
  });
});

describe("S19 탈퇴 — 확인 시트 · 공용 상수 · 공개 경로 보존", () => {
  function setupFetch() {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, requestedAt: "2026-10-20T01:00:00Z" }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("동의 없으면 [탈퇴 요청] 비활성 · 시트 취소 → POST 0 · 승인 → 공용 상수 · 2연타 POST 1", async () => {
    const fetchMock = setupFetch();
    mount(<AccountDeletionRequestForm source="mypage_settings" />);
    const primary = q("my-sticky-cta-primary") as HTMLButtonElement;
    expect(primary.disabled).toBe(true);
    click(primary);
    expect(q("confirm-sheet")).toBeNull();

    click(q("mypage-leave-agree"));
    expect((q("my-sticky-cta-primary") as HTMLButtonElement).disabled).toBe(false);
    click(q("my-sticky-cta-primary"));
    click(q("confirm-cancel"));
    expect(fetchMock).not.toHaveBeenCalled();

    click(q("my-sticky-cta-primary"));
    const ok = q("confirm-ok") as HTMLElement;
    act(() => {
      ok.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      ok.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush(6);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.confirmationText).toBe(ACCOUNT_DELETION_CONFIRMATION_TOKEN);
    expect(body.source).toBe("mypage_settings");
    expect(q("mypage-leave-submitted")).not.toBeNull();
  });

  it("공개 경로(web_delete_request)는 기존 단어 입력 유지", () => {
    setupFetch();
    mount(<AccountDeletionRequestForm source="web_delete_request" />);
    expect(q("mypage-leave-form")).toBeNull();
    expect(host!.querySelector('input[type="text"]')).not.toBeNull();
  });
});
