import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adminContactEmailEmptyReasonKo,
  adminMemberLoginAccountCopyValue,
  adminMemberLoginAccountLabelKo,
  manualLoginIdFromAuthEmail,
  resolveAdminMemberLoginAccount,
} from "@/lib/admin-users/member-sns-account";
import { adminMemberOriginFilterOps } from "@/lib/admin-users/admin-member-list-query";

const src = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("어드민 회원 로그인 계정 표시 (설계안 ③④)", () => {
  it("Apple — 공유 이메일이면 Apple ID 이메일, 가리면 고유번호", () => {
    const shared = resolveAdminMemberLoginAccount({
      provider: "apple",
      linkedIdentities: [{ provider: "apple", providerUserId: "000899.492e4b98", email: "phlife2424@icloud.com" }],
    });
    expect(adminMemberLoginAccountLabelKo(shared)).toBe("Apple phlife2424@icloud.com");
    expect(adminMemberLoginAccountCopyValue(shared)).toBe("phlife2424@icloud.com");

    const hidden = resolveAdminMemberLoginAccount({
      provider: "apple",
      linkedIdentities: [{ provider: "apple", providerUserId: "001125.5e1ef65b412842028ae4425e15818524.2143", email: null, emailIsPrivateRelay: true }],
    });
    expect(adminMemberLoginAccountLabelKo(hidden)).toMatch(/^Apple · 이메일 가리기 · 001125/);
    expect(adminMemberLoginAccountCopyValue(hidden)).toBe("001125.5e1ef65b412842028ae4425e15818524.2143");
    expect(adminContactEmailEmptyReasonKo(hidden)).toBe("Apple 이메일 가리기");
  });

  it("Kakao — 회원번호, 이메일 동의 시 함께", () => {
    const k = resolveAdminMemberLoginAccount({
      provider: "kakao",
      linkedIdentities: [{ provider: "kakao", providerUserId: "5161739615", email: null }],
    });
    expect(adminMemberLoginAccountLabelKo(k)).toBe("카카오 5161739615");
    expect(adminMemberLoginAccountCopyValue(k)).toBe("5161739615");
    expect(adminContactEmailEmptyReasonKo(k)).toBe("카카오 이메일 미동의");
  });

  it("Google — Gmail", () => {
    const g = resolveAdminMemberLoginAccount({
      provider: "google",
      linkedIdentities: [{ provider: "google", providerUserId: "115511222475946257923", email: "alynque46@gmail.com" }],
    });
    expect(adminMemberLoginAccountLabelKo(g)).toBe("Google alynque46@gmail.com");
  });

  it("관리자 생성 — @manual.local 앞부분이 실제 로그인 아이디", () => {
    expect(manualLoginIdFromAuthEmail("appreview01@manual.local")).toBe("appreview01");
    expect(manualLoginIdFromAuthEmail("kakao.1@kakao.native.dibay.internal")).toBeNull();
    const m = resolveAdminMemberLoginAccount({ provider: "email", authLoginEmail: "appreview01@manual.local" });
    expect(m?.provider).toBe("manual");
    expect(adminMemberLoginAccountLabelKo(m)).toBe("로그인 appreview01");
    expect(adminContactEmailEmptyReasonKo(m)).toBe("관리자 생성 계정");
  });

  it("일반 이메일 가입은 로그인 계정 줄 없음", () => {
    expect(resolveAdminMemberLoginAccount({ provider: "email", authLoginEmail: "a@b.com" })).toBeNull();
  });

  it("가입 방식 필터 — Google·Apple 추가, 관리자 생성은 @manual.local 포함, 일반 가입은 @manual.local 제외", () => {
    expect(adminMemberOriginFilterOps("google")).toEqual([{ type: "or", value: "auth_provider.eq.google,provider.eq.google" }]);
    expect(adminMemberOriginFilterOps("apple")).toEqual([{ type: "or", value: "auth_provider.eq.apple,provider.eq.apple" }]);
    expect(JSON.stringify(adminMemberOriginFilterOps("manual"))).toMatch(/auth_login_email\.ilike\.%@manual\.local/);
    expect(JSON.stringify(adminMemberOriginFilterOps("email"))).toMatch(/auth_login_email\.not\.ilike\.%@manual\.local/);
  });

  it("목록 API — 연락처에 내부 로그인 주소로 되돌아가는 우회 없음 · SNS 계정 기준 테이블 사용 (설계안 ①③)", () => {
    const route = src("app/api/admin/users/route.ts");
    expect(route).not.toMatch(/displayEmail \?\? r\.auth_login_email/);
    expect(route).toMatch(/loadLinkedIdentitiesMapChunked\(supabase, profileIds\)/);
    expect(route).toMatch(/from\("user_auth_identities"\)/);
    expect(route).toMatch(/linkedProviders:/);
  });

  it("상세 — 가입 경로는 목록과 같은 판정, 연락 이메일은 내부 주소 제외 (설계안 ④)", () => {
    const detail = src("app/api/admin/users/[id]/route.ts");
    expect(detail).toMatch(/email: pickContactEmailForProfile\(prof\.email\)/);
    expect(detail).toMatch(/signup_provider: signupProvider/);
    const auth = src("app/api/admin/users/[id]/auth/route.ts");
    expect(auth).toMatch(/linkedIdentities,/);
    const panel = src("components/admin/users/AdminMemberAuthPanel.tsx");
    expect(panel).toMatch(/연결된 로그인 계정/);
    expect(panel).toMatch(/내부 로그인 방식/);
    expect(panel).not.toMatch(/fallbackKo: "연결 provider"/);
    for (const f of ["components/admin/users/AdminMemberMasterHeader.tsx", "components/admin/users/AdminMemberOverviewPanel.tsx"]) {
      expect(src(f), f).toMatch(/user\.signup_provider \?\? resolveDetailAuthProvider/);
    }
  });

  it("로그인 시 프로필 연락 이메일에 내부 주소를 쓰지 않는다 · admin_manual 저장값 (설계안 ②⑥)", () => {
    const ma = src("lib/auth/member-access.ts");
    expect(ma).toMatch(/const contactEmail = pickContactEmailForProfile\(email\);/);
    expect(ma).toMatch(/!inferAuthProviderFromSyntheticEmail\(email\)/);
    expect(ma).toMatch(/if \(normalized === "admin_manual" \|\| normalized === "manual"\) return "admin_manual";/);
    expect(ma).not.toMatch(/if \(!pickTrimmed\(existing\.email\) && email\) patch\.email = email;/);
  });
});
