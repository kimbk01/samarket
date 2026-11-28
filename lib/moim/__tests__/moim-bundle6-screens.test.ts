import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 모임 감사 6번 묶음 6-B — 모임 화면·디자인 (docs/audit/moim-bundle6-design-2026-11-28.md)
 * 동작 시험: B11 글자 수 정책·D3 단수·검색 패턴·검색 API. 나머지는 「구조 확인」(파일 문자열 대조).
 */

const read = (p: string) => readFileSync(p, "utf8");
const MANAGE = "components/moim/manage";

type Call = { table: string; filters: string[]; ors: string[]; ilikes: string[] };
function countingSb(tables: Record<string, unknown[]>, single: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const sb = {
    calls,
    from(table: string) {
      const entry: Call = { table, filters: [], ors: [], ilikes: [] };
      calls.push(entry);
      const rows = tables[table] ?? [];
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "in", "is", "not", "order", "limit", "lt", "gte"]) chain[m] = () => chain;
      chain.eq = (col: string, v: unknown) => {
        entry.filters.push(`${col}=${String(v)}`);
        return chain;
      };
      chain.or = (expr: string) => {
        entry.ors.push(expr);
        return chain;
      };
      chain.ilike = (col: string, v: string) => {
        entry.ilikes.push(`${col}:${v}`);
        return chain;
      };
      chain.maybeSingle = async () => ({ data: single[table] ?? rows[0] ?? null, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
      return chain;
    },
    rpc: async () => ({ data: null, error: null }),
  };
  return sb;
}

beforeEach(() => vi.clearAllMocks());

describe("버튼 체계 (F1·F2·F3·F4·F6)", () => {
  it("moimCls 보조·위험도 disabledToken 을 갖고, 운영 화면은 Sam.btn 을 직접 쓰지 않는다 (구조 확인)", () => {
    const ui = read("components/moim/moim-ui.tsx");
    expect(ui).toContain("btnSecondary: `${Sam.btn.outlineCombo} ${Sam.btn.disabledToken} rounded-ui-rect`");
    expect(ui).toContain("btnDanger: `${Sam.btn.dangerCombo} ${Sam.btn.disabledToken} rounded-ui-rect`");
    for (const f of readdirSync(MANAGE).filter((x) => x.endsWith(".tsx"))) {
      expect(read(`${MANAGE}/${f}`), f).not.toMatch(/Sam\.btn\./);
    }
  });

  it("신고 숨기기·가입 거절·앨범 삭제·일정 취소 = 위험, 멤버 홈 글쓰기·일정 만들기 = 기본 (구조 확인)", () => {
    const reports = read(`${MANAGE}/MoimManageReports.tsx`);
    expect(reports).toMatch(/moimCls\.btnDanger[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*moim_manage_reports_hide_btn|className=\{`\$\{moimCls\.btnDanger\} flex-1`\}/);
    const requests = read(`${MANAGE}/MoimManageRequests.tsx`);
    const rejectIdx = requests.indexOf("moim_manage_reject_btn");
    expect(requests.slice(Math.max(0, rejectIdx - 400), rejectIdx)).toContain("moimCls.btnDanger");
    const album = read("components/moim/MoimAlbum.tsx");
    /** R5 B8·B9: 앨범은 공용 뷰어 「⋯」 시트 — 삭제·숨기기 = 시트 맨 아래 위험 줄 (예전 뷰어 버튼 줄 대신) */
    expect(album).toMatch(/key: "delete", label: t\("common_delete"\), danger: true/);
    expect(album).toMatch(/key: "hide", label: t\("moim_post_hide_btn"\), danger: true/);
    expect(album).not.toContain("disabled:opacity-50");
    const sched = read("components/moim/MoimScheduleDetailScreen.tsx");
    expect(sched).toContain('className={`${moimCls.btnDanger} w-full`} onClick={cancelSchedule}');
    expect(sched).not.toContain('className={`${moimCls.btnSecondary} w-full`} onClick={cancelSchedule}');
    const member = read("components/moim/MoimMemberView.tsx");
    /** R3 D-31: 위임 배너가 떠 있으면(primaryCtaTaken) 탭 CTA 는 보조 — 그 밖에는 기본 */
    expect(member.match(/\$\{primaryCtaTaken \? moimCls\.btnSecondary : moimCls\.btnPrimary\} \$\{moimCls\.btnSm\} w-full gap-1\.5/g)?.length).toBe(2);
  });
});

describe("F5·F7·F8·F9·F10·F12 (구조 확인)", () => {
  it("F5 탭 순서 = 홈·게시판·일정·앨범·멤버", () => {
    expect(read("components/moim/MoimMemberView.tsx")).toContain('const MOIM_TABS: readonly MoimTab[] = ["home", "board", "schedules", "album", "members"];');
  });

  it("F7 누를 수 없는 버튼 대신 안내 줄", () => {
    for (const f of ["components/moim/MoimPublicView.tsx", "components/moim/MoimScheduleDetailScreen.tsx"]) {
      expect(read(f), f).not.toContain("disabled className={`${moimCls.btnPrimary} w-full`}");
    }
    expect(read("components/moim/MoimPublicView.tsx")).toContain('<p role="status" className={`${moimCls.noticeWarn} text-center text-[13px]`}>');
  });

  it("F8 문자 › ⋯ 대신 아이콘, 허브 대기 배지는 빨강이 아님", () => {
    const hub = read(`${MANAGE}/MoimManageHub.tsx`);
    expect(hub).not.toMatch(/>\s*›\s*</);
    expect(hub).not.toContain("Sam.badge.danger");
    expect(read("components/moim/MoimTabHome.tsx")).not.toContain("<span aria-hidden>›</span>");
    expect(read(`${MANAGE}/MoimManageMembers.tsx`)).not.toMatch(/>\s*⋯\s*</);
  });

  it("F9 운영 화면 6곳 저장 줄 = MoimStickyFooter", () => {
    for (const f of ["Info", "Permissions", "Invite", "Transfer", "HostRequest", "Close"]) {
      expect(read(`${MANAGE}/MoimManage${f}.tsx`), f).toContain("<MoimStickyFooter");
    }
  });

  it("F10 댓글 ⋮ 44px", () => {
    const post = read("components/moim/MoimPostDetailScreen.tsx");
    expect(post).toContain("grid h-11 w-11 shrink-0 place-items-center text-sam-muted");
    expect(post).not.toContain("grid h-8 w-8 shrink-0 place-items-center text-sam-muted");
  });

  it("F12 메신저 목록 배지 4개 = pill (R3 W3 — 배지는 pill · D-13)", () => {
    const lines = read("components/community-messenger/MessengerChatListItem.tsx").split("\n").slice(1140, 1190);
    expect(lines.filter((l) => l.includes("sam-text-xxs") && l.includes("rounded-[6px]"))).toHaveLength(0);
    expect(lines.filter((l) => l.includes("sam-text-xxs") && l.includes("rounded-ui-rect"))).toHaveLength(0);
    expect(lines.filter((l) => l.includes("sam-text-xxs") && l.includes("rounded-full")).length).toBeGreaterThanOrEqual(4);
  });
});

describe("D3 「1 members」", () => {
  it("1명이면 _one 키, 영어 「1 member」", async () => {
    const { formatMoimCount } = await import("@/components/moim/moim-ui");
    const t = (k: string, v?: Record<string, string | number>) => `${k}:${v?.count}`;
    expect(formatMoimCount(1, null, t as never)).toBe("moim_screen_member_count_one:1");
    expect(formatMoimCount(2, null, t as never)).toBe("moim_screen_member_count:2");
    expect(read("lib/i18n/catalog/moim-screens.ts")).toContain('moim_screen_member_count_one: "{count} member",');
  });
});

describe("D5 모임장 메뉴 (구조 확인)", () => {
  it("모임장은 「나가기」 대신 위임·종료, 다른 역할은 나가기", () => {
    const s = read("components/moim/MoimDetailScreen.tsx");
    expect(s).toContain('const hostMenu = isMember && moim.viewer.role === "host";');
    expect(s).toContain('router.push(moimRoutes.manageTransfer(moim.id))');
    expect(s).toContain('router.push(moimRoutes.manageClose(moim.id))');
    expect(s).toMatch(/\} else if \(isMember\) \{\n\s*items\.push\(\{ key: "leave"/);
  });
});

describe("B11 이름·소개 글자 수 = 운영 정책", () => {
  it("moimTextWithin — 공백 제외·코드 포인트 기준", async () => {
    const { moimTextWithin } = await import("@/components/moim/moim-ui");
    expect(moimTextWithin("가", 2, 30)).toBe(false);
    expect(moimTextWithin(" 가나 ", 2, 30)).toBe(true);
    expect(moimTextWithin("a".repeat(31), 2, 30)).toBe(false);
    /** 정책이 비면(최소 0) 서버처럼 빈 소개 허용 — 재감사 L3 */
    expect(moimTextWithin("", 0, 10)).toBe(true);
    expect(moimTextWithin("", 1, 10)).toBe(false);
  });

  it("categories 응답에 limits, 정책은 5분 캐시(두 번째 요청은 정책 조회 없음)", async () => {
    vi.resetModules();
    const sb = countingSb({ moim_categories: [], moim_policies: [{ name_min_len: 2, name_max_len: 30, intro_min_len: 10, intro_max_len: 1000 }] });
    vi.doMock("@/lib/moim/server/moim-route-guard.server", async () => {
      const actual = await vi.importActual<object>("@/lib/moim/server/moim-route-guard.server");
      return { ...actual, guardMoimRead: async () => ({ ok: true, userId: "u1", sb }) };
    });
    const { GET } = await import("@/app/api/moim/categories/route");
    const { NextRequest } = await import("next/server");
    const r1 = await GET(new NextRequest("https://x.test/api/moim/categories"));
    expect(((await r1.json()) as { limits: unknown }).limits).toEqual({ nameMin: 2, nameMax: 30, introMin: 10, introMax: 1000 });
    await GET(new NextRequest("https://x.test/api/moim/categories"));
    expect(sb.calls.filter((c) => c.table === "moim_policies")).toHaveLength(1);
    vi.doUnmock("@/lib/moim/server/moim-route-guard.server");
  });

  it("만들기·정보 수정 화면이 고정 상수 대신 정책값을 쓴다 (구조 확인)", () => {
    const wiz = read("components/moim/MoimCreateWizard.tsx");
    expect(wiz).toContain("moimTextWithin(name, limits.nameMin, limits.nameMax) && moimTextWithin(intro, limits.introMin, limits.introMax)");
    expect(wiz).toContain("maxLength={limits.nameMax}");
    const info = read(`${MANAGE}/MoimManageInfo.tsx`);
    expect(info).not.toMatch(/const (NAME|INTRO)_(MIN|MAX) =/);
  });
});

describe("F11 모임 안 검색", () => {
  it("검색어 패턴: 2~40자, 필터 문법 글자 제거", async () => {
    const { moimSearchPattern } = await import("@/lib/moim/server/moim-queries.server");
    expect(moimSearchPattern("a")).toBeNull();
    expect(moimSearchPattern("a".repeat(41))).toBeNull();
    expect(moimSearchPattern(" 배드민턴 ")).toBe("%배드민턴%");
    expect(moimSearchPattern("a,b(c)%_")).toBe("%a b c%");
    expect(moimSearchPattern(",,")).toBeNull();
    /** 화면도 같은 함수로 거른다 — 특수문자만 넣어 오류 화면이 뜨지 않게 (재감사 L4) */
    const { normalizeMoimSearchQuery } = await import("@/lib/moim/moim-search-query");
    expect(normalizeMoimSearchQuery("a,")).toBeNull();
    expect(read("components/moim/MoimSearchInMoimScreen.tsx")).toContain("normalizeMoimSearchQuery(input)");
  });

  async function searchRoute(access: unknown, q: string) {
    vi.resetModules();
    const sb = countingSb({ moim_posts: [], moim_schedules: [] });
    vi.doMock("@/lib/moim/server/moim-route-guard.server", async () => {
      const actual = await vi.importActual<object>("@/lib/moim/server/moim-route-guard.server");
      return { ...actual, guardMoimRead: async () => ({ ok: true, userId: "u1", sb }) };
    });
    vi.doMock("@/lib/moim/server/moim-queries.server", async () => {
      const actual = await vi.importActual<object>("@/lib/moim/server/moim-queries.server");
      return { ...actual, loadMoimAccess: async () => access };
    });
    const { GET } = await import("@/app/api/moim/[moimId]/search/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest(`https://x.test/api/moim/m/search?q=${encodeURIComponent(q)}`), {
      params: Promise.resolve({ moimId: "11111111-1111-4111-8111-111111111111" }),
    });
    vi.doUnmock("@/lib/moim/server/moim-route-guard.server");
    vi.doUnmock("@/lib/moim/server/moim-queries.server");
    return { res, sb };
  }

  it("멤버가 아니면 403, 검색어가 짧으면 400", async () => {
    expect((await searchRoute({ moim: { id: "m1" }, role: null }, "배드민턴")).res.status).toBe(403);
    expect((await searchRoute({ moim: { id: "m1" }, role: "member" }, "a")).res.status).toBe(400);
  });

  it("멤버: 활성 글만 제목·본문, 일정 제목 검색", async () => {
    const { res, sb } = await searchRoute({ moim: { id: "m1" }, role: "member" }, "배드민턴");
    expect(res.status).toBe(200);
    const posts = sb.calls.find((c) => c.table === "moim_posts")!;
    expect(posts.filters).toEqual(expect.arrayContaining(["moim_id=m1", "status=active"]));
    expect(posts.ors).toEqual(["title.ilike.%배드민턴%,body.ilike.%배드민턴%"]);
    const scheds = sb.calls.find((c) => c.table === "moim_schedules")!;
    expect(scheds.ilikes).toEqual(["title:%배드민턴%"]);
  });

  it("멤버 머리글 ⌕ → 검색 화면, 요청 예산 등록 (구조 확인)", () => {
    expect(read("components/moim/MoimDetailScreen.tsx")).toContain("router.push(moimRoutes.searchIn(moim.id))");
    expect(read("lib/perf/request-budget.ts")).toContain('"/api/moim/[moimId]/search": 10.0,');
  });
});

describe("F11 일정 머리글 ⋮·⤴, 멤버 시트 대화하기 (구조 확인)", () => {
  it("일정 관리 칸이 본문에서 머리글 메뉴로", () => {
    const s = read("components/moim/MoimScheduleDetailScreen.tsx");
    expect(s).not.toContain('<h2 className={moimCls.sectionTitle}>{t("moim_schedule_manage_title")}</h2>');
    expect(s).toContain("<DibayActionSheet open={menuOpen}");
    expect(s).toMatch(/key: "cancel",\n\s*label: t\("moim_schedule_cancel_btn"\),\n\s*danger: true,\n\s*disabled: busy,/);
    /** 공유 = 모임 초대 링크 · 미리보기도 모임(받는 곳과 같은 내용) */
    expect(s).toContain("useMoimInviteShare(moim, onToast);");
  });

  it("멤버 시트 대화하기: 메신저 1:1 시작 API, 자기 자신 제외", () => {
    const s = read(`${MANAGE}/MoimManageMembers.tsx`);
    /** R3 U-04 ①: 메신저 1:1 시작은 공용 훅 하나 (모임 멤버 탭과 같은 동작) */
    expect(s).toContain('import { useMoimDirectMessage } from "@/components/moim/use-moim-direct-message";');
    expect(read("components/moim/use-moim-direct-message.ts")).toContain('"/api/community-messenger/direct/start"');
    expect(s).toContain("if (myId && m.userId === myId) return [];");
    expect(s).toContain('t("moim_manage_action_message")');
  });
});
