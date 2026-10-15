/**
 * R4 — 그룹 「일반 멤버 통화 시작」 서버 강제(B-5) + ensure-room 403 raw code 비노출(E-4).
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canRoleStartGroupCall,
  GROUP_MEMBER_CALL_FORBIDDEN_API_ERROR,
} from "@/lib/community-messenger/group/group-call-start-permission";
import { bootstrapCommunityMessengerOutgoingCallSession } from "@/lib/community-messenger/call-session-navigation-seed";
import { releaseCallActionLock } from "@/lib/call/call-action-lock";
import { resolveDirectCallDenyUserMessage } from "@/lib/community-messenger/direct-call-permission-messages";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("B-5 group allow_member_call server enforcement", () => {
  it("owner/admin always allowed; member only when allowMemberCall is on (client canStartGroupCall parity)", () => {
    expect(canRoleStartGroupCall({ myRole: "owner", allowMemberCall: false })).toBe(true);
    expect(canRoleStartGroupCall({ myRole: "admin", allowMemberCall: false })).toBe(true);
    expect(canRoleStartGroupCall({ myRole: "member", allowMemberCall: false })).toBe(false);
    expect(canRoleStartGroupCall({ myRole: "member", allowMemberCall: true })).toBe(true);
    expect(canRoleStartGroupCall({ myRole: "member", allowMemberCall: undefined })).toBe(false);
  });

  it("error code is a call_denied_* code (calls route answers 403)", () => {
    expect(GROUP_MEMBER_CALL_FORBIDDEN_API_ERROR.startsWith("call_denied_")).toBe(true);
    const route = read("app/api/community-messenger/rooms/[roomId]/calls/route.ts");
    expect(route).toContain('err.startsWith("call_denied_")');
  });

  it("startCommunityMessengerCallSession checks group permission before active-call reuse, direct path untouched", () => {
    const src = read("lib/community-messenger/service.ts");
    const start = src.indexOf("export async function startCommunityMessengerCallSession(");
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, start + 6000);
    const guardIdx = body.indexOf("canRoleStartGroupCall({ myRole: snapshot.myRole, allowMemberCall: snapshot.room.allowMemberCall })");
    const reuseIdx = body.indexOf("if (activeCallForReuse) {");
    expect(guardIdx).toBeGreaterThan(0);
    expect(reuseIdx).toBeGreaterThan(guardIdx);
    expect(body.slice(guardIdx - 200, guardIdx)).toContain("isGroupRoom &&");
  });

  it("group call client maps the code to user copy (ko/en catalog)", () => {
    const hook = read("lib/community-messenger/use-community-messenger-group-call.ts");
    expect(hook).toContain("GROUP_MEMBER_CALL_FORBIDDEN_API_ERROR");
    expect(hook).toContain('cmTr("cm_ui_group_member_call_forbidden")');
    const catalog = read("lib/i18n/catalog/community-messenger-ui.ts");
    expect(catalog.match(/cm_ui_group_member_call_forbidden:/g)?.length).toBe(2);
  });
});

describe("E-4 ensure-room 403 during dial", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    releaseCallActionLock("test_cleanup");
  });

  async function dialWith403(error: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: false, error }), { status: 403 }))
    );
    return bootstrapCommunityMessengerOutgoingCallSession({ roomId: null, peerUserId: `peer-${error}`, kind: "voice" });
  }

  it("blocked_target → deny SSOT copy, never the raw code", async () => {
    const res = await dialWith403("blocked_target");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.userMessage).not.toContain("blocked_target");
    expect(res.userMessage).toBe(resolveDirectCallDenyUserMessage("deny_blocked"));
  });

  it("cannot_start_chat → localized copy, never the raw code", async () => {
    const res = await dialWith403("cannot_start_chat");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.userMessage).not.toContain("cannot_start_chat");
    expect(res.userMessage).toBe(
      safeTranslate(getRuntimeAppLanguage(), "cm_social_cannot_start_chat", { fallbackKo: "x", fallbackEn: "x" })
    );
  });
});
