// @vitest-environment jsdom
import "@/lib/i18n/admin-catalog";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n/messages";

/**
 * 모임 R5 어드민 화면 동작 (작업자 A · D-admin.md §2). 고치기 전 화면에서 실패하고 고친 뒤 통과하는 시험.
 */

import { MoimReportDecisionPanel, type MoimReportDecisionContext } from "@/components/admin/moim/AdminMoimReportDecisionForm";
import { moimPoliciesDraft, moimPolicyPlaceholderKey, moimPolicyReasonsSavable } from "@/components/admin/moim/AdminMoimPoliciesPage";
import { adminChatReportActionsFor, type AdminChatReportSheetInput } from "@/components/admin/chats/AdminChatSheets";
import { useMoimSection } from "@/components/admin/moim/admin-moim-detail-panels";
import { AdminChatActionSheet } from "@/components/admin/chats/AdminChatActionSheet";
import { moimAdminSend } from "@/components/admin/moim/admin-moim-shared";
import type { MoimAdminPoliciesRow } from "@/lib/admin/moim/moim-admin-contract";

let host: HTMLDivElement;
let root: Root;
const both = (key: string) => [translate("ko", key as never), translate("en", key as never)];
const shows = (key: string) => both(key).some((s) => document.body.textContent?.includes(s));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const ctx = (patch: Partial<MoimReportDecisionContext> = {}): MoimReportDecisionContext => ({
  reportId: "33333333-3333-4333-8333-333333333333",
  status: "reviewing",
  targetType: "post",
  handledAt: null,
  handler: null,
  host: null,
  warnCount: 0,
  openSameTargetCount: 0,
  resultActions: [],
  ...patch,
});
const levelSelect = () => [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "unlist"));
const whoSelect = () => [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "host"))!;

describe("D10 삭제된 모임 신고 처리 = 이용 제한·기각만", () => {
  it("삭제 모임이면 콘텐츠 숨김·모임 제재 선택지가 없고 안내가 보인다 (예전: 선택지가 그대로 → 「대상 없음」)", () => {
    act(() => root.render(createElement(MoimReportDecisionPanel, { ctx: ctx({ moimStatus: "deleted" }), onChanged: () => {}, banner: null, setBanner: () => {} })));
    expect(levelSelect()).toBeUndefined();
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
    expect(shows("admin_moim_decide_deleted_note")).toBe(true);
    expect(whoSelect()).toBeTruthy();
  });
  it("운영 중 모임은 그대로", () => {
    act(() => root.render(createElement(MoimReportDecisionPanel, { ctx: ctx({ moimStatus: "active" }), onChanged: () => {}, banner: null, setBanner: () => {} })));
    expect(levelSelect()).toBeTruthy();
    expect(document.querySelector('input[type="checkbox"]')).not.toBeNull();
  });
});

describe("D27 이용 제한 대상 이름 = 신고 대상 종류별", () => {
  it("글 신고 = 「글쓴이」 · 모임 신고 = 「모임장」 하나만", () => {
    act(() => root.render(createElement(MoimReportDecisionPanel, { ctx: ctx({ targetType: "post" }), onChanged: () => {}, banner: null, setBanner: () => {} })));
    const labels = [...whoSelect().options].map((o) => o.textContent ?? "");
    expect(labels.some((l) => both("admin_moim_decide_who_target_post").includes(l))).toBe(true);
    act(() => root.render(createElement(MoimReportDecisionPanel, { ctx: ctx({ targetType: "moim" }), onChanged: () => {}, banner: null, setBanner: () => {} })));
    expect([...whoSelect().options].map((o) => o.value)).toEqual(["", "host"]);
  });
});

describe("D9 검토 시작 = 사유 시트", () => {
  it("버튼을 누르면 바로 요청하지 않고 사유 입력 시트가 열린다 (예전: 사유 없이 바로 POST)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    act(() => root.render(createElement(MoimReportDecisionPanel, { ctx: ctx({ status: "received" }), onChanged: () => {}, banner: null, setBanner: () => {} })));
    const btn = [...document.querySelectorAll("button")].find((b) => both("admin_moim_decide_start_review").includes(b.textContent ?? ""))!;
    await act(async () => {
      btn.click();
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(shows("admin_moim_review_notice")).toBe(true);
    expect(document.querySelector("textarea")).not.toBeNull();
  });
});

describe("D12 실패 안내 = 문장 (코드 글자 없음)", () => {
  it("moimAdminSend 실패 결과: code 는 원래 코드, message 는 문장 · 시트는 message 를 보인다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "moim_closed" }), { status: 422 })));
    const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate("ko", k, v);
    const r = await moimAdminSend("/x", {}, t);
    expect(r).toMatchObject({ ok: false, status: 422, code: "moim_closed", message: translate("ko", "moim_err_moim_closed") });

    act(() =>
      root.render(
        createElement(AdminChatActionSheet, {
          title: "T",
          rows: [],
          reason: null,
          confirmLabel: "Run",
          onSubmit: async () => ({ ok: false as const, status: 422, code: "moim_closed", message: "SENTENCE" }),
          onClose: () => {},
          onSettled: () => {},
        })
      )
    );
    const next = () => [...document.querySelectorAll("button")].at(-1)!;
    act(() => next().click());
    await act(async () => {
      next().click();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain("SENTENCE");
    expect(document.body.textContent).not.toContain("moim_closed");
  });
});

describe("D6·D19 정책 화면 순수 함수", () => {
  const row = (reasons: { code: string; active: boolean }[]) =>
    moimPoliciesDraft({
      updated_at: "x",
      banned_words: [],
      report_reasons: reasons.map((r) => ({ code: r.code, label_ko: "가", label_en: "A", is_active: r.active })),
    } as MoimAdminPoliciesRow).reasons;
  it("신고 사유를 전부 끄면 저장 불가 (예전: 저장됨 → 신고·직접 제재 불가)", () => {
    expect(moimPolicyReasonsSavable(row([{ code: "spam", active: false }, { code: "other", active: false }]))).toBe(false);
    expect(moimPolicyReasonsSavable(row([{ code: "spam", active: false }, { code: "other", active: true }]))).toBe(true);
  });
  it("기본값이 있는 칸만 「비우면 기본 n」", () => {
    expect(moimPolicyPlaceholderKey("name_max_len")).toEqual({ key: "admin_moim_policy_default_n", n: 60 });
    expect(moimPolicyPlaceholderKey("max_capacity")).toEqual({ key: "admin_moim_policy_empty" });
  });
});

describe("D5 메신저 신고 시트 — 모임 방이면 방 정지 선택지 없음", () => {
  const input: AdminChatReportSheetInput = {
    source: "messenger",
    id: "r1",
    bucket: "received",
    reasonLabel: "",
    detail: "",
    reporterLabel: "",
    reportedLabel: "",
    createdAt: "",
    cmMessageId: "m1",
    cmRoomId: "room1",
    reportedUserHref: null,
  };
  it("모임 방 = sanction_room_block 없음 · 일반 방 = 있음", () => {
    expect(adminChatReportActionsFor({ ...input, cmRoomManagedByMoim: true })).not.toContain("sanction_room_block");
    expect(adminChatReportActionsFor({ ...input, cmRoomManagedByMoim: true })).toContain("sanction_message_hide");
    expect(adminChatReportActionsFor(input)).toContain("sanction_room_block");
  });
});

describe("D25 조건이 바뀌면 1쪽부터", () => {
  it("다른 글의 댓글로 바꾸면 offset=0 으로 다시 읽는다 (예전: 이전 쪽 번호 유지)", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) => {
        urls.push(String(u));
        return new Response(JSON.stringify({ ok: true, rows: [], total: 200 }), { status: 200, headers: { "content-type": "application/json" } });
      })
    );
    const holder: { current: ReturnType<typeof useMoimSection> | null } = { current: null };
    function Probe({ postId }: { postId: string }) {
      const sec = useMoimSection("11111111-1111-4111-8111-111111111111", "comments", { postId });
      useEffect(() => {
        holder.current = sec;
      });
      return null;
    }
    await act(async () => {
      root.render(createElement(Probe, { postId: "p1" }));
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      holder.current!.setPage(3);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(urls.some((u) => u.includes("offset=100") && u.includes("postId=p1"))).toBe(true);
    await act(async () => {
      root.render(createElement(Probe, { postId: "p2" }));
      await new Promise((r) => setTimeout(r, 0));
    });
    const last = urls.filter((u) => u.includes("postId=p2"));
    expect(last.length).toBeGreaterThan(0);
    expect(last.every((u) => u.includes("offset=0"))).toBe(true);
    expect(holder.current!.page).toBe(1);
  });
});
