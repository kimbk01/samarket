import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMemberPhoneState } from "@/lib/profile/member-account-status";
import {
  resolveMypageRequiredInfoRows,
  type MypageRequiredInfoInput,
  type MypageRequiredRow,
} from "@/lib/mypage/mypage-home-required-items";
import type { ProfileRow } from "@/lib/profile/types";

/** 필수 정보 3행 상시 표시 (real-screen-redesign §11 · 11-1 · 11-2 · 11-3, Owner 승인 2026-10-20) */

const NOW = Date.parse("2026-10-20T08:00:00.000Z");

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id: "user-1",
    nickname: "홍길동",
    display_name: "홍길동",
    dibay_id: "dibay_ab12cd",
    dibay_id_auto_assigned: true,
    dibay_id_changed_once: false,
    dibay_id_locked: false,
    username: "dibay_ab12cd",
    username_confirmed: true,
    phone: "09171234567",
    phone_verified: true,
    phone_verified_at: "2026-01-01T00:00:00.000Z",
    phone_verification_status: "verified",
    role: "user",
    status: "active",
    auth_provider: "google",
    manner_score: 36.5,
    ...overrides,
  } as ProfileRow;
}

const addressComplete: MypageRequiredInfoInput["address"] = {
  status: "complete",
  label: "Poblacion, Makati",
  activeCount: 1,
  failed: false,
};

function rows(p: ProfileRow | null, address = addressComplete, extra: Partial<MypageRequiredInfoInput> = {}) {
  const r = resolveMypageRequiredInfoRows({ profile: p, profileFailed: false, address, nowMs: NOW, ...extra });
  if (!r.settled) throw new Error("not settled");
  return r.rows;
}

function pick(row: MypageRequiredRow) {
  return {
    state: row.state,
    tone: row.tone,
    badge: row.badgeKey,
    sub: row.subKey,
    cta: row.ctaKey,
    ctaVariant: row.ctaVariant,
  };
}

describe("3행 상시 표시 — 완료여도 숨기지 않는다", () => {
  it("모두 완료 → 3행 모두 그린 완료", () => {
    const r = rows(profile());
    expect(r.map((x) => x.key)).toEqual(["handle", "phone", "address"]);
    expect(r.map((x) => x.tone)).toEqual(["complete", "complete", "complete"]);
  });

  it("상태 확정 전(프로필 없음 · 주소 unknown) → settled:false (3행 스켈레톤)", () => {
    const unknownAddr = { status: "unknown" as const, label: null, activeCount: null, failed: false };
    expect(resolveMypageRequiredInfoRows({ profile: null, profileFailed: false, address: addressComplete }).settled).toBe(
      false,
    );
    expect(resolveMypageRequiredInfoRows({ profile: profile(), profileFailed: false, address: unknownAddr }).settled).toBe(
      false,
    );
  });
});

describe("11-1 회원 아이디", () => {
  it("미등록 → 빨강 「설정 필요」 [설정하기]", () => {
    const [h] = rows(profile({ dibay_id: null, username: null, username_confirmed: false } as Partial<ProfileRow>));
    expect(pick(h)).toEqual({
      state: "missing",
      tone: "missing",
      badge: "mypage_req_badge_setup_needed",
      sub: null,
      cta: "mypage_req_cta_setup",
      ctaVariant: "primary",
    });
    expect(h.value).toEqual({ key: "mypage_req_value_handle_none" });
  });

  it("변경 필요 (미잠금·자동 아님 초안) → 주황 「확정 필요」 [확정하기]", () => {
    const [h] = rows(
      profile({
        dibay_id: "mydraft",
        dibay_id_auto_assigned: false,
        dibay_id_locked: false,
        username: null,
        username_confirmed: false,
      } as Partial<ProfileRow>),
    );
    expect(pick(h)).toMatchObject({ state: "draft", tone: "action", badge: "mypage_req_badge_confirm_needed" });
    expect(h.ctaKey).toBe("mypage_req_cta_confirm");
    expect(h.value).toEqual({ text: "@mydraft" });
  });

  it("완료 (자동 ID) → 그린 「설정 완료」 + 「1회 변경 가능」 + 보조 [변경]", () => {
    const [h] = rows(profile());
    expect(pick(h)).toEqual({
      state: "complete_auto",
      tone: "complete",
      badge: "mypage_req_badge_setup_done",
      sub: "mypage_req_sub_change_once",
      cta: "mypage_req_cta_change",
      ctaVariant: "secondary",
    });
    expect(h.value).toEqual({ text: "@dibay_ab12cd" });
  });

  it("완료 (직접 확정 · locked/changed_once) → 「변경 완료」 + 버튼 없음", () => {
    const [h] = rows(
      profile({
        dibay_id: "mycustomid",
        dibay_id_auto_assigned: false,
        dibay_id_changed_once: true,
        dibay_id_locked: true,
        username: "mycustomid",
      } as Partial<ProfileRow>),
    );
    expect(pick(h)).toEqual({
      state: "complete_locked",
      tone: "complete",
      badge: "mypage_req_badge_setup_done",
      sub: "mypage_req_sub_change_done",
      cta: null,
      ctaVariant: null,
    });
  });

  it("오류 (프로필 조회 실패) → 회색 「확인 불가」 [다시 시도] — 그린 완료 금지", () => {
    const r = resolveMypageRequiredInfoRows({ profile: null, profileFailed: true, address: addressComplete });
    if (!r.settled) throw new Error("expected settled");
    const [h, p] = r.rows;
    for (const row of [h, p]) {
      expect(pick(row)).toEqual({
        state: "error",
        tone: "error",
        badge: "mypage_req_badge_unknown",
        sub: null,
        cta: "common_retry",
        ctaVariant: "secondary",
      });
      expect(row.action).toBe("retry");
    }
    // 주소는 아는 값 그대로
    expect(r.rows[2].tone).toBe("complete");
  });
});

describe("11-2 전화번호 인증 (hasVerifiedPhone 불변)", () => {
  const unverified = { phone_verified: false, phone_verified_at: null, phone_verification_status: "unverified" };

  it("미인증 · 번호 없음 → 빨강 「인증 필요」 · 「번호 미등록」 [인증하기]", () => {
    const [, p] = rows(profile({ ...unverified, phone: null } as Partial<ProfileRow>));
    expect(pick(p)).toMatchObject({ state: "unverified", tone: "missing", badge: "mypage_req_badge_verify_needed" });
    expect(p.value).toEqual({ key: "mypage_req_value_phone_none" });
    expect(p.ctaKey).toBe("mypage_req_cta_verify");
  });

  it("미인증 · 번호만 있음 → 마스킹 번호 + 빨강 「인증 필요」", () => {
    const [, p] = rows(profile(unverified as Partial<ProfileRow>));
    expect(pick(p)).toMatchObject({ state: "unverified_with_number", tone: "missing" });
    expect(p.value).toEqual({ text: "+63 9** *** 4567" });
  });

  it("진행 중 (pending · TTL 안) → 주황 테두리 「인증 진행 중」 [이어서 인증]", () => {
    const [, p] = rows(
      profile({
        ...unverified,
        phone_verification_status: "pending",
        phone_verification_requested_at: new Date(NOW - 60_000).toISOString(),
      } as Partial<ProfileRow>),
    );
    expect(pick(p)).toEqual({
      state: "pending",
      tone: "progress",
      badge: "mypage_req_badge_verify_pending",
      sub: null,
      cta: "mypage_req_cta_continue_verify",
      ctaVariant: "primary",
    });
  });

  it("진행 만료 (pending · TTL 300초 초과 / 시각 없음) → 빨강 「인증 만료」 [다시 인증]", () => {
    for (const requestedAt of [new Date(NOW - 301_000).toISOString(), null]) {
      const [, p] = rows(
        profile({
          ...unverified,
          phone_verification_status: "pending",
          phone_verification_requested_at: requestedAt,
        } as Partial<ProfileRow>),
      );
      expect(pick(p)).toMatchObject({
        state: "pending_expired",
        tone: "missing",
        badge: "mypage_req_badge_verify_expired",
        cta: "mypage_req_cta_reverify",
      });
    }
  });

  it("완료 (인증 + 번호) → 그린 「인증 완료」 + 보조 [번호 변경]", () => {
    const [, p] = rows(profile());
    expect(pick(p)).toEqual({
      state: "verified",
      tone: "complete",
      badge: "mypage_req_badge_verify_done",
      sub: null,
      cta: "mypage_req_cta_change_number",
      ctaVariant: "secondary",
    });
  });

  it("인증됨 + 번호 없음 (과거 관리자 수동 인증) → 그린 「인증 완료」 · 「번호 미등록」 · 보조 [번호 등록]", () => {
    const [, p] = rows(
      profile({ phone: null, phone_number: null, phone_verification_method: "admin_manual" } as Partial<ProfileRow>),
    );
    expect(pick(p)).toEqual({
      state: "verified",
      tone: "complete",
      badge: "mypage_req_badge_verify_done",
      sub: null,
      cta: "mypage_req_cta_register_number",
      ctaVariant: "secondary",
    });
    expect(p.value).toEqual({ key: "mypage_req_value_phone_none" });
  });

  it("인증됨 + 번호 없음 (인증 방식 기록 없음) → 같은 「인증 완료」", () => {
    const [, p] = rows(
      profile({ phone: null, phone_number: null, phone_verification_method: null } as Partial<ProfileRow>),
    );
    expect(pick(p).state).toBe("verified");
    expect(pick(p).badge).toBe("mypage_req_badge_verify_done");
  });

  it("인증 판정은 hasVerifiedPhone 과 동일 — 관리자 면제·번호 없음도 「인증 완료」", () => {
    const p = profile({ phone: null, phone_verified: false, phone_verified_at: null, role: "admin", privilegedAdmin: true } as Partial<ProfileRow>);
    const state = resolveMemberPhoneState(p);
    expect(state).toEqual({ kind: "verified", verified: true, masked: null });
    expect(rows(p)[1].tone).toBe("complete");
  });

  it("오류 → 회색 「확인 불가」", () => {
    const r = resolveMypageRequiredInfoRows({ profile: null, profileFailed: true, address: addressComplete });
    expect(r.settled && r.rows[1].state).toBe("error");
  });
});

describe("11-3 대표 주소 — 등록 상태만 (주소 인증·배달 가능 없음)", () => {
  it("미등록 (활성 0건) → 빨강 「등록 필요」 [주소 등록]", () => {
    const [, , a] = rows(profile(), { status: "required", label: null, activeCount: 0, failed: false });
    expect(pick(a)).toEqual({
      state: "missing",
      tone: "missing",
      badge: "mypage_req_badge_register_needed",
      sub: null,
      cta: "mypage_req_cta_register_address",
      ctaVariant: "primary",
    });
    expect(a.value).toEqual({ key: "mypage_req_value_address_none" });
  });

  it("완료 → 동네 라벨 + 그린 「등록 완료」 + 보조 [변경]", () => {
    const [, , a] = rows(profile());
    expect(pick(a)).toEqual({
      state: "complete",
      tone: "complete",
      badge: "mypage_req_badge_register_done",
      sub: null,
      cta: "mypage_req_cta_change",
      ctaVariant: "secondary",
    });
    expect(a.value).toEqual({ text: "Poblacion, Makati" });
  });

  it("변경 필요 (주소는 있으나 대표 없음) → 주황 「대표 지정 필요」 [대표 지정]", () => {
    const [, , a] = rows(profile(), { status: "required", label: null, activeCount: 2, failed: false });
    expect(pick(a)).toMatchObject({ state: "needs_master", tone: "action", badge: "mypage_req_badge_master_needed" });
    expect(a.ctaKey).toBe("mypage_req_cta_set_master");
  });

  it("오류 (주소 조회 실패) → 회색 「확인 불가」 [다시 시도]", () => {
    const [, , a] = rows(profile(), { status: "unknown", label: null, activeCount: null, failed: true });
    expect(pick(a)).toMatchObject({ state: "error", tone: "error", cta: "common_retry" });
  });

  it("「주소 인증」 상태·키를 만들지 않는다", () => {
    const src = readFileSync(path.join(process.cwd(), "lib/mypage/mypage-home-required-items.ts"), "utf8");
    expect(src).not.toMatch(/address_verified|주소 인증 완료|deliverable/);
  });
});

describe("컴포넌트 계약", () => {
  const src = readFileSync(path.join(process.cwd(), "components/mypage/home/MypageRequiredInfoSummary.tsx"), "utf8");

  it("완료 시 숨김(null 반환) 분기 없음 · 루트 testid 유지 · 주소 핀 유지", () => {
    expect(src).toMatch(/mypage-account-control-card/);
    expect(src).toMatch(/AddressKindHeadPin kind="master"/);
    expect(src).not.toMatch(/items\.length === 0/);
  });

  it("대표주소 훅·주소 재조회 없음 (루트 네트워크 계약)", () => {
    expect(src).not.toMatch(/useRepresentativeFullAddressLine|useRepresentativeAddressLine/);
    expect(src).not.toMatch(/fetchAddressDefaultsSnapshot\s*\(/);
  });

  it("계정 S03 도 같은 컴포넌트로 3행 상시 표시", () => {
    const account = readFileSync(path.join(process.cwd(), "components/my/MyAccountContent.tsx"), "utf8");
    expect(account).toMatch(/MypageRequiredInfoRowsCard/);
    expect(account).not.toMatch(/essentialsIncomplete/);
  });

  it("「주소관리」 메뉴 행은 동네 값을 다시 표시하지 않는다", () => {
    const config = readFileSync(path.join(process.cwd(), "lib/mypage/mypage-home-menu-config.ts"), "utf8");
    expect(config).not.toMatch(/address-public-label/);
  });
});
