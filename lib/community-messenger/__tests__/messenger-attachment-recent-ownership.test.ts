import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

describe("메신저 최근 사진 보관소 — URL 주인 = 보관소", () => {
  const live = new Set<string>();
  let seq = 0;
  beforeEach(() => {
    vi.resetModules();
    live.clear();
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      const u = `blob:rec/${++seq}`;
      live.add(u);
      return u;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((u: string) => void live.delete(u));
  });
  afterEach(() => vi.restoreAllMocks());

  function file(name: string) {
    return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg", lastModified: 1 });
  }

  it("같은 파일을 5번 기억해도 live URL 1개", async () => {
    const s = await import("@/lib/community-messenger/attachment/messenger-attachment-recent-store");
    for (let i = 0; i < 5; i += 1) s.rememberMessengerAttachmentRecent([file("a.jpg")]);
    expect(s.listMessengerAttachmentRecent()).toHaveLength(1);
    expect(live.size).toBe(1);
  });

  it("로그아웃 정리 후 live 0", async () => {
    const s = await import("@/lib/community-messenger/attachment/messenger-attachment-recent-store");
    s.rememberMessengerAttachmentRecent([file("a.jpg"), file("b.jpg")]);
    s.clearMessengerAttachmentRecent();
    expect(s.listMessengerAttachmentRecent()).toHaveLength(0);
    expect(live.size).toBe(0);
  });

  it("배선 계약: 시트 전송은 보관소 URL 을 넘기지 않고 새 URL 을 만든다 · 로그아웃 wipe 가 보관소를 비운다", () => {
    const sheet = readFileSync("components/community-messenger/room/phase2/CommunityMessengerAttachmentSheet.tsx", "utf8");
    expect(sheet).not.toContain("previewUrls.push(item.previewUrl)");
    expect(sheet).toContain("previewUrls.push(URL.createObjectURL(item.file))");
    const wipe = readFileSync("lib/auth/client-session-wipe.ts", "utf8");
    expect(wipe).toContain("clearMessengerAttachmentRecent();");
  });
});
