/**
 * 광고 ② 묶음 C·A (인트로) — 동작 시험.
 * - IN-P10: Live 게시본 문서가 손상되면 GET /api/launch-intro/live 가 200 unpublished(인트로 없음) · 기기는 같은
 *   revision 이어도 state 를 반영해 인트로를 끈다
 * - DS-8: CTA 저장 검사에 공통 목적지 계약(회원 금지 경로) — /admin CTA 초안 저장 거부(DB 호출 전 400)
 * - IN-A05: 손상 게시본 검사 코드 → 한국어 사유 · 표에 없는 코드는 「게시본 형식 오류」
 * - D-18: 게시 폼 기본 빈도 정본 once_per_day
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyLaunchIntroDocument,
  LAUNCH_INTRO_ADMIN_DEFAULT_FREQUENCY,
  validateLaunchIntroDocument,
  type LaunchIntroDocument,
} from "@/lib/launch-intro/document";
import {
  LAUNCH_INTRO_INVALID_REASON_TABLE,
  launchIntroInvalidPublicationReasonKey,
} from "@/lib/launch-intro/invalid-publication-reason";
import { adsImpl1104IntroMessages } from "@/lib/i18n/catalog/ads-impl-1104-i";

function docWithCta(path: string): LaunchIntroDocument {
  const d = emptyLaunchIntroDocument();
  d.scenes[0] = {
    ...d.scenes[0]!,
    text: { headline: { value: "Hi", size: "L", weight: "bold", color: "#FFFFFF" }, supporting: null, align: "center" },
    cta: { label: "보기", action: { type: "route", path } },
  };
  return d;
}

/** 아주 작은 Supabase 모의 — launch_intro_live / launch_intro_publications 단건 조회만 */
function fakeSb(rows: { live: unknown; publication: unknown }) {
  const calls: string[] = [];
  const builder = (table: string) => {
    const b = {
      select: () => b,
      eq: () => b,
      order: () => b,
      limit: () => b,
      insert: () => {
        calls.push(`insert:${table}`);
        return b;
      },
      update: () => {
        calls.push(`update:${table}`);
        return b;
      },
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({
        data: table === "launch_intro_live" ? rows.live : table === "launch_intro_publications" ? rows.publication : null,
        error: null,
      }),
    };
    return b;
  };
  return {
    calls,
    from: (table: string) => {
      calls.push(`from:${table}`);
      return builder(table);
    },
    storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) }) },
  };
}

const LIVE = { publication_id: "11111111-1111-4111-8111-111111111111", state: "active", revision: 7, updated_at: "2026-11-04T00:00:00Z" };
const pubRow = (document: unknown) => ({
  id: LIVE.publication_id,
  source_draft_id: null,
  source_draft_version: 3,
  document,
  assets: [],
  eligibility: { frequency: "once_per_day" },
  created_at: "2026-11-01T00:00:00Z",
});

describe("IN-P10 — 손상 Live 게시본 → 200 unpublished", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/stores/try-supabase-stores");
  });

  it("손상 문서(scene_empty) → 라우트 200 · state=unpublished · publication=null · revision 유지", async () => {
    const broken = { ...emptyLaunchIntroDocument() }; // 장면에 내용 없음 → publication 검사 scene_empty
    const sb = fakeSb({ live: LIVE, publication: pubRow(broken) });
    vi.doMock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => sb }));
    const { GET } = await import("@/app/api/launch-intro/live/route");
    const res = await GET(new Request("https://x.test/api/launch-intro/live") as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    const body = await res.json();
    expect(body).toEqual({ ok: true, revision: 7, state: "unpublished", publication: null });
  });

  it("정상 문서 → 그대로 active + publication (회귀 없음)", async () => {
    const sb = fakeSb({ live: LIVE, publication: pubRow(docWithCta("/philife")) });
    vi.doMock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => sb }));
    const { GET } = await import("@/app/api/launch-intro/live/route");
    const res = await GET(new Request("https://x.test/api/launch-intro/live") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe("active");
    expect(body.publication?.id).toBe(LIVE.publication_id);
  });

  it("기기: 캐시가 active(같은 revision)여도 200 unpublished 를 받으면 state 만 바꿔 인트로를 끈다", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.doMock("@/lib/launch-intro/launch-epoch", async (orig) => ({
      ...(await orig<typeof import("@/lib/launch-intro/launch-epoch")>()),
      readLaunchEpoch: () => "22222222-2222-4222-8222-222222222222",
    }));
    const cachedPub = {
      id: LIVE.publication_id,
      document: docWithCta("/philife"),
      assets: [],
      eligibility: { frequency: "every_launch" as const },
    };
    const promoted: Array<{ revision: number; state: string; publication: unknown }> = [];
    vi.doMock("@/lib/launch-intro/cache", () => ({
      readLaunchIntroIndex: () => ({ schema: 1, revision: 7, state: "active", publication: cachedPub, promotedAt: "x" }),
      promoteLaunchIntroIndex: (n: { revision: number; state: string; publication: unknown }) => {
        promoted.push(n);
        return true;
      },
      acquireLaunchIntroAssets: vi.fn(async () => true),
      collectLaunchIntroAssetGarbage: async () => {},
    }));
    vi.doMock("@/lib/launch-intro/startup-destination", () => ({
      getLaunchDestination: () => ({ destination: "community", reason: "x", snapshot: null }),
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, revision: 7, state: "unpublished", publication: null }), { status: 200 }))
    );
    const { runLaunchIntroDiscovery } = await import("@/lib/launch-intro/discovery");
    await runLaunchIntroDiscovery("resume");
    expect(promoted).toHaveLength(1);
    expect(promoted[0]!.state).toBe("unpublished");
    expect(promoted[0]!.revision).toBe(7);
    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/launch-intro/launch-epoch");
    vi.doUnmock("@/lib/launch-intro/cache");
    vi.doUnmock("@/lib/launch-intro/startup-destination");
  });
});

describe("DS-8 — CTA 저장 검사 = 인트로 경로 규칙 + 공통 목적지 계약", () => {
  it("회원 금지 경로(/admin·/stores/owner) CTA 는 cta_path_forbidden, 정상 경로는 통과", () => {
    for (const p of ["/admin", "/admin/users?x=1", "/ADMIN/launch-intro", "/stores/owner", "/stores/owner/orders"]) {
      const v = validateLaunchIntroDocument(docWithCta(p), "draft");
      expect(v, p).toEqual({ ok: false, error: "cta_path_forbidden" });
    }
    for (const p of ["/philife", "/market?tab=1", "/events/abc", "/stores/some-store"]) {
      const v = validateLaunchIntroDocument(docWithCta(p), "publication");
      expect(v.ok, p).toBe(true);
    }
    expect(validateLaunchIntroDocument(docWithCta("//evil.test"), "draft")).toEqual({ ok: false, error: "cta_path_invalid" });
  });

  it("/admin CTA 초안 저장 → 400 cta_path_forbidden · DB 쓰기 0", async () => {
    vi.resetModules();
    const { saveLaunchIntroDraft } = await import("@/lib/launch-intro/server");
    const sb = fakeSb({ live: null, publication: null });
    const r = await saveLaunchIntroDraft(sb as never, {
      id: null,
      expectedVersion: null,
      document: docWithCta("/admin/users"),
      actor: "admin-1",
    });
    expect(r).toEqual({ ok: false, error: "cta_path_forbidden", status: 400 });
    expect(sb.calls).toEqual([]);
  });

  it("거부 문구는 한국어(코드 원문 없음)", () => {
    const ko = adsImpl1104IntroMessages.ko.admin_launch_intro_err_cta_path_forbidden;
    expect(ko).toMatch(/[가-힣]/);
    expect(ko).not.toMatch(/cta_path_forbidden/);
  });
});

describe("IN-A05 — 손상 게시본 사유 표", () => {
  it("표의 코드는 한국어 사유, 표에 없는 코드·빈 값은 「게시본 형식 오류」", () => {
    const ko = adsImpl1104IntroMessages.ko as Record<string, string>;
    expect(ko[launchIntroInvalidPublicationReasonKey("scene_empty")]).toBe("내용이 없는 장면이 있음");
    expect(ko[launchIntroInvalidPublicationReasonKey("publication_document_unreadable")]).toBe("게시본 문서를 읽을 수 없음");
    expect(ko[launchIntroInvalidPublicationReasonKey("image_sha_invalid")]).toBe("그림 정보 오류");
    expect(ko[launchIntroInvalidPublicationReasonKey("headline_too_long")]).toBe("문구 설정 오류");
    expect(ko[launchIntroInvalidPublicationReasonKey("cta_path_forbidden")]).toBe("버튼이 관리자·사장님 화면으로 이동");
    expect(ko[launchIntroInvalidPublicationReasonKey("something_new_xyz")]).toBe("게시본 형식 오류");
    expect(ko[launchIntroInvalidPublicationReasonKey("")]).toBe("게시본 형식 오류");
    expect(ko[launchIntroInvalidPublicationReasonKey(undefined)]).toBe("게시본 형식 오류");
    expect(ko[launchIntroInvalidPublicationReasonKey("toString")]).toBe("게시본 형식 오류");
  });

  it("모든 사유 키가 ko·en 에 있고 ko 는 한국어 · 손상 줄 문구에 검사 코드 자리가 사유로 채워진다", () => {
    const ko = adsImpl1104IntroMessages.ko as Record<string, string>;
    const en = adsImpl1104IntroMessages.en as Record<string, string>;
    for (const key of new Set(Object.values(LAUNCH_INTRO_INVALID_REASON_TABLE))) {
      expect(ko[key], key).toMatch(/[가-힣]/);
      expect(en[key], key).toBeTruthy();
    }
    // 실제 손상 문서의 검사 코드가 표로 한국어가 된다
    const v = validateLaunchIntroDocument(emptyLaunchIntroDocument(), "publication");
    expect(v.ok).toBe(false);
    const reason = ko[launchIntroInvalidPublicationReasonKey(v.ok ? "" : v.error)]!;
    const line = ko.admin_launch_intro_history_invalid!.replace("{error}", reason);
    expect(line).toBe("손상됨 — 내용이 없는 장면이 있음 · 다시 게시할 수 없습니다");
    expect(line).not.toMatch(/[a-z]+_[a-z]+/);
  });
});

describe("D-18 — 게시 폼 기본 빈도 정본", () => {
  it("once_per_day", () => {
    expect(LAUNCH_INTRO_ADMIN_DEFAULT_FREQUENCY).toBe("once_per_day");
  });
});
