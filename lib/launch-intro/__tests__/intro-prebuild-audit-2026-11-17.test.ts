/**
 * @vitest-environment node
 * 앱 진입 빌드 전 감사(2026-11-17) PR-3 인트로 — I1 그림 정리 jsonb 검사 · I2 발견 응답 조회 · I3 기록 API · I5 PNG 투명 · I6 기간 비교·오류 문구.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- 가짜 DB */
import { PostgrestClient } from "@supabase/postgrest-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { launchIntroPoolErrorText } from "@/components/admin/launch-intro/launch-intro-pool-client";
import { pngBytesHasAlpha } from "@/lib/admin/media/image-slot-spec";
import { normalizeLaunchIntroEventDeviceKey, normalizeLaunchIntroEventPlatform } from "@/lib/launch-intro/pool";
import {
  LAUNCH_INTRO_POOL_LIVE_COLS,
  buildLaunchIntroPoolPayload,
  launchIntroAssetsContainsValue,
  recordLaunchIntroEvent,
  removeUnreferencedLaunchIntroImage,
  updateLaunchIntroPoolCreative,
} from "@/lib/launch-intro/pool-server";

const SHA = "a".repeat(64);

type Call = { table: string; ops: [string, unknown[]][] };

/** 표별 응답을 돌려주는 가짜 supabase — 호출한 체인을 기록한다 */
function fakeSb(results: Record<string, { data: unknown; error: unknown } | ((c: Call) => { data: unknown; error: unknown })>) {
  const calls: Call[] = [];
  const removed: string[][] = [];
  const resolve = (c: Call) => {
    const r = results[c.table];
    return typeof r === "function" ? r(c) : (r ?? { data: [], error: null });
  };
  const sb: any = {
    from(table: string) {
      const c: Call = { table, ops: [] };
      calls.push(c);
      const chain: any = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(resolve(c)).then(res, rej);
            }
            if (prop === "maybeSingle" || prop === "single") {
              return () => {
                c.ops.push([String(prop), []]);
                const r = resolve(c);
                const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
                return Promise.resolve({ data: d, error: r.error });
              };
            }
            return (...args: unknown[]) => {
              c.ops.push([String(prop), args]);
              return chain;
            };
          },
        }
      );
      return chain;
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { error: null };
        },
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }),
      }),
    },
  };
  return { sb, calls, removed };
}

describe("I1 — 게시본 assets jsonb 포함 검사", () => {
  it("실제 postgrest-js 로 만든 요청이 cs.[{\"sha256\":…}] 이다 ([object Object] 아님)", () => {
    const b = new PostgrestClient("http://db.test/rest/v1")
      .from("launch_intro_publications")
      .select("id")
      .contains("assets", launchIntroAssetsContainsValue(SHA));
    const url = decodeURIComponent(String((b as any).url));
    expect(url).toContain(`assets=cs.[{"sha256":"${SHA}"}]`);
    expect(url).not.toContain("object");
  });

  it("아무도 안 쓰면 공개 파일을 지운다 · contains 인자는 JSON 문자열", async () => {
    const { sb, calls, removed } = fakeSb({
      launch_intro_creatives: { data: [], error: null },
      launch_intro_publications: { data: [], error: null },
    });
    await removeUnreferencedLaunchIntroImage(sb, "pool/x.png", SHA);
    const pubs = calls.find((c) => c.table === "launch_intro_publications")!;
    expect(pubs.ops.find((o) => o[0] === "contains")![1]).toEqual(["assets", JSON.stringify([{ sha256: SHA }])]);
    expect(removed).toEqual([["pool/x.png"]]);
  });

  it("게시본이 쓰면 남긴다", async () => {
    const { sb, removed } = fakeSb({
      launch_intro_creatives: { data: [], error: null },
      launch_intro_publications: { data: [{ id: "p1" }], error: null },
    });
    await removeUnreferencedLaunchIntroImage(sb, "pool/x.png", SHA);
    expect(removed).toEqual([]);
  });
});

describe("I2 — 발견 응답은 켜진 행 · 필요한 열만", () => {
  it("status=active · 고정 열 · 같은 순서·상한, `*` 아님", async () => {
    const { sb, calls } = fakeSb({
      admin_settings: { data: null, error: null },
      launch_intro_creatives: {
        data: [
          {
            id: "c1",
            status: "active",
            sort_order: 10,
            start_at: null,
            end_at: null,
            image_path: "pool/c1.png",
            image_sha256: SHA,
            image_mime: "image/png",
            background_color: "#000000",
            duration_ms: 2000,
            cta_href: null,
            show_ad_label: true,
            created_at: "2026-11-17T00:00:00Z",
          },
        ],
        error: null,
      },
    });
    const payload = await buildLaunchIntroPoolPayload(sb);
    const q = calls.find((c) => c.table === "launch_intro_creatives")!;
    expect(q.ops).toEqual([
      ["select", [LAUNCH_INTRO_POOL_LIVE_COLS]],
      ["eq", ["status", "active"]],
      ["order", ["sort_order", { ascending: true }]],
      ["order", ["created_at", { ascending: false }]],
      ["limit", [200]],
    ]);
    expect(LAUNCH_INTRO_POOL_LIVE_COLS).not.toContain("*");
    expect(LAUNCH_INTRO_POOL_LIVE_COLS.split(",").map((s) => s.trim()).sort()).toEqual(
      [
        "id",
        "image_path",
        "image_sha256",
        "image_mime",
        "background_color",
        "duration_ms",
        "cta_href",
        "show_ad_label",
        "start_at",
        "end_at",
        "sort_order",
        "created_at",
        "status",
      ].sort()
    );
    expect(payload?.entries.map((e) => e.id)).toEqual(["c1"]);
  });

  it("표 없음(42P01·PGRST205) = 빈 목록, 다른 오류 = null", async () => {
    for (const code of ["42P01", "PGRST205"]) {
      const { sb } = fakeSb({
        admin_settings: { data: null, error: null },
        launch_intro_creatives: { data: null, error: { code } },
      });
      expect((await buildLaunchIntroPoolPayload(sb))?.entries).toEqual([]);
    }
    const { sb } = fakeSb({
      admin_settings: { data: null, error: null },
      launch_intro_creatives: { data: null, error: { code: "57014" } },
    });
    expect(await buildLaunchIntroPoolPayload(sb)).toBeNull();
  });
});

describe("I3 — 기록은 켜진 소재만 · platform · deviceKey 형식", () => {
  const input = {
    creativeId: "11111111-1111-1111-1111-111111111111",
    eventType: "impression" as const,
    renderer: "native" as const,
    platform: "android",
    exposureId: "exp-12345678",
    deviceKey: null,
    userId: null,
  };

  it("꺼진 소재 = 저장 안 함(creative_not_active) · 없는 소재 = creative_not_found", async () => {
    for (const [status, err] of [
      ["paused", "creative_not_active"],
      ["ended", "creative_not_active"],
    ] as const) {
      const { sb, calls } = fakeSb({
        launch_intro_creatives: { data: { id: input.creativeId, status }, error: null },
      });
      expect(await recordLaunchIntroEvent(sb, input)).toMatchObject({ ok: false, error: err });
      expect(calls.some((c) => c.table === "launch_intro_events")).toBe(false);
    }
    const { sb } = fakeSb({ launch_intro_creatives: { data: null, error: null } });
    expect(await recordLaunchIntroEvent(sb, input)).toMatchObject({ ok: false, error: "creative_not_found" });
  });

  it("켜진 소재 = 저장", async () => {
    const { sb, calls } = fakeSb({
      launch_intro_creatives: { data: { id: input.creativeId, status: "active" }, error: null },
      launch_intro_events: { data: null, error: null },
    });
    expect(await recordLaunchIntroEvent(sb, input)).toEqual({ ok: true });
    expect(calls.find((c) => c.table === "launch_intro_events")!.ops[0][0]).toBe("insert");
  });

  it("platform 은 android·ios·web 만 · deviceKey 는 [0-9A-Za-z_-]{8,80}", () => {
    expect(normalizeLaunchIntroEventPlatform("android")).toBe("android");
    expect(normalizeLaunchIntroEventPlatform(" ios ")).toBe("ios");
    expect(normalizeLaunchIntroEventPlatform("web")).toBe("web");
    expect(normalizeLaunchIntroEventPlatform("windows")).toBeNull();
    expect(normalizeLaunchIntroEventPlatform("Android")).toBeNull();
    expect(normalizeLaunchIntroEventPlatform(3)).toBeNull();
    expect(normalizeLaunchIntroEventDeviceKey("abcd_EF-12")).toBe("abcd_EF-12");
    expect(normalizeLaunchIntroEventDeviceKey("short")).toBeNull();
    expect(normalizeLaunchIntroEventDeviceKey("a".repeat(81))).toBeNull();
    expect(normalizeLaunchIntroEventDeviceKey("abcd efgh")).toBeNull();
    expect(normalizeLaunchIntroEventDeviceKey("<script>xx")).toBeNull();
    expect(normalizeLaunchIntroEventDeviceKey(null)).toBeNull();
  });
});

const R = vi.hoisted(() => ({ status: "active" as string | null, inserted: [] as unknown[] }));
vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({ getOptionalAuthenticatedUserId: async () => null }));
vi.mock("@/lib/http/api-route", () => ({ getClientIp: () => "1.2.3.4" }));
vi.mock("@/lib/security/rate-limit-presets", () => ({
  adEventRecordActorKey: () => "k",
  enforceAdEventRecordQuota: async () => ({ ok: true }),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () =>
    fakeSb({
      launch_intro_creatives: { data: R.status ? { id: "x", status: R.status } : null, error: null },
      launch_intro_events: (c) => {
        R.inserted.push(c.ops[0]?.[1]?.[0]);
        return { data: null, error: null };
      },
    }).sb,
}));

describe("I3 — POST /api/launch-intro/events", () => {
  beforeEach(() => {
    R.status = "active";
    R.inserted = [];
  });
  const post = async (body: Record<string, unknown>) => {
    const { POST } = await import("@/app/api/launch-intro/events/route");
    const req = new Request("http://app.test/api/launch-intro/events", { method: "POST", body: JSON.stringify(body) });
    const res = await POST(req as any);
    return { status: res.status, json: await res.json() };
  };
  const base = {
    creativeId: "11111111-1111-1111-1111-111111111111",
    eventType: "impression",
    renderer: "native",
    exposureId: "exp-12345678",
  };

  it("꺼진 소재 = 200 skipped · 저장 없음", async () => {
    R.status = "paused";
    expect(await post(base)).toEqual({ status: 200, json: { ok: true, skipped: true } });
    expect(R.inserted).toEqual([]);
  });

  it("켜진 소재 = 저장 · 형식 밖 platform·deviceKey 는 null", async () => {
    expect(await post({ ...base, platform: "windows", deviceKey: "bad key!" })).toEqual({ status: 200, json: { ok: true } });
    expect(R.inserted[0]).toMatchObject({ platform: null, device_key: null });
    await post({ ...base, exposureId: "exp-87654321", platform: "ios", deviceKey: "dev_key-0001" });
    expect(R.inserted[1]).toMatchObject({ platform: "ios", device_key: "dev_key-0001" });
  });
});

describe("I6 — 기간 비교는 시각(ms) · 오류 문구", () => {
  it("DB 값(+00:00)과 같은 순간의 끝(Z) = 400 window_invalid (DB 500 아님)", async () => {
    const { sb, calls } = fakeSb({
      launch_intro_creatives: {
        data: {
          id: "c1",
          status: "paused",
          start_at: "2026-11-20T00:00:00+00:00",
          end_at: null,
          updated_at: "2026-11-17T00:00:00+00:00",
          kind: "ad",
          show_ad_label: true,
        },
        error: null,
      },
    });
    const res = await updateLaunchIntroPoolCreative(sb, "c1", { endAt: "2026-11-20T00:00:00.000Z" }, "2026-11-17T00:00:00+00:00");
    expect(res).toEqual({ ok: false, error: "window_invalid", status: 400 });
    expect(calls.some((c) => c.ops.some((o) => o[0] === "update"))).toBe(false);
  });

  it("not_found · duration_invalid · kind_invalid 는 각자 문구 (「저장 실패」 아님)", () => {
    const t = (k: string, v?: Record<string, string | number>) => (v ? `${k}:${JSON.stringify(v)}` : k);
    expect(launchIntroPoolErrorText("not_found", t as any)).toBe("admin_launch_intro_v3_err_not_found");
    expect(launchIntroPoolErrorText("duration_invalid", t as any)).toBe('admin_launch_intro_v3_err_duration:{"min":1,"max":5}');
    expect(launchIntroPoolErrorText("kind_invalid", t as any)).toBe("admin_launch_intro_v3_err_kind");
    expect(launchIntroPoolErrorText("something_else", t as any)).toBe("admin_launch_intro_pool_err_save");
  });
});

describe("I5 — PNG 투명 판정은 서버와 같은 머리 정보 규칙", () => {
  /** 서명 + IHDR(+선택 청크) + IDAT 만 — 픽셀 내용은 보지 않는다 */
  function png(colorType: number, extra: string[] = []): Uint8Array {
    const chunk = (type: string, data: number[]) => {
      const len = data.length;
      return [(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...[...type].map((c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0];
    };
    const ihdr = [0, 0, 2, 0, 0, 0, 2, 0, 8, colorType, 0, 0, 0];
    const bytes = [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...chunk("IHDR", ihdr),
      ...extra.flatMap((t) => chunk(t, [0, 0, 0])),
      ...chunk("IDAT", [1, 2, 3]),
      ...(colorType === 3 ? chunk("tRNS", [0]) : []), // IDAT 뒤 tRNS 는 무시(서버와 같음)
    ];
    return new Uint8Array(bytes);
  }

  it("RGBA·회색+알파 = 투명 · RGB = 불투명 · 팔레트는 IDAT 앞 tRNS 일 때만 · PNG 아님 = null", () => {
    expect(pngBytesHasAlpha(png(6))).toBe(true);
    expect(pngBytesHasAlpha(png(4))).toBe(true);
    expect(pngBytesHasAlpha(png(2))).toBe(false);
    expect(pngBytesHasAlpha(png(3, ["PLTE", "tRNS"]))).toBe(true);
    expect(pngBytesHasAlpha(png(3, ["PLTE"]))).toBe(false);
    expect(pngBytesHasAlpha(new Uint8Array(64))).toBeNull();
  });

  it("앞부분만 읽어도(IDAT 중간에서 잘림) 같은 결과", () => {
    const full = png(3, ["PLTE", "tRNS"]);
    expect(pngBytesHasAlpha(full.slice(0, full.length - 10))).toBe(true);
  });
});
