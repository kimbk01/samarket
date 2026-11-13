// @vitest-environment jsdom
/**
 * 머리글 공유 1곳 · 기기 공유 창 바로 (Owner 2026-11-14 · 설계 §N-3 · 시안 dibay-header-share-mockup-2026-11-14.html)
 * 「공유 부분은 게시물의 헤더 부분에 위치」 · 「공유되는 기기의 저장되어진 SNS 가 모두 나오는 부분」 · 「중복되지 않게」
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({
  canUse: true,
  result: "handed_off" as "handed_off" | "cancelled" | "failed" | "unavailable",
  calls: [] as unknown[],
}));
const prod = vi.hoisted(() => ({ value: true }));

vi.mock("@/lib/share/platform-share", () => ({
  canUsePlatformShare: () => platform.canUse,
  shareViaPlatform: async (p: unknown) => {
    platform.calls.push(p);
    return platform.result;
  },
}));
vi.mock("@/lib/share/share-url", () => ({ isProductionShareContext: () => prod.value }));
vi.mock("@/components/share/DibayShareSheet", () => ({
  DibayShareSheet: ({ open }: { open: boolean }) => (open ? <div data-testid="sheet" /> : null),
}));

import { useDibayShareSheet, type DibayShareSheetConfig } from "@/components/share/use-dibay-share-sheet";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const count = (src: string, needle: string) => src.split(needle).length - 1;

const CONFIG: DibayShareSheetConfig = {
  url: "https://samarket.vercel.app/post/abc",
  previewTitle: "김밥",
  shareText: "₱500",
};

let host: HTMLDivElement;
let r: Root;
function Harness() {
  const { openShare, shareSheet } = useDibayShareSheet();
  return (
    <>
      <button type="button" data-testid="share" onClick={() => openShare(CONFIG)} />
      {shareSheet}
    </>
  );
}

async function press() {
  await act(async () => {
    host.querySelector<HTMLButtonElement>("[data-testid=share]")?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  platform.canUse = true;
  platform.result = "handed_off";
  platform.calls = [];
  prod.value = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  r = createRoot(host);
  await act(async () => r.render(<Harness />));
});

afterEach(() => {
  act(() => r.unmount());
  host.remove();
});

describe("공유 누름 1번 = 기기 공유 창 바로", () => {
  it("앱·브라우저 공유가 있으면 우리 시트 없이 기기 공유 창(제목·글·주소)", async () => {
    await press();
    expect(platform.calls).toEqual([{ title: "김밥", text: "₱500", url: CONFIG.url }]);
    expect(host.querySelector("[data-testid=sheet]")).toBeNull();
  });

  it("취소 = 아무 것도 안 함", async () => {
    platform.result = "cancelled";
    await press();
    expect(host.querySelector("[data-testid=sheet]")).toBeNull();
  });

  it("실패(브라우저가 막음 등) = 시트를 열어 다시 누르거나 복사", async () => {
    platform.result = "failed";
    await press();
    expect(host.querySelector("[data-testid=sheet]")).not.toBeNull();
  });

  it("기기 공유 창이 없으면(데스크톱 웹) 시트(링크 복사)", async () => {
    platform.canUse = false;
    await press();
    expect(platform.calls).toHaveLength(0);
    expect(host.querySelector("[data-testid=sheet]")).not.toBeNull();
  });

  it("운영 주소가 아니면 기기 공유 창을 열지 않음(시트가 칸을 숨김)", async () => {
    prod.value = false;
    await press();
    expect(platform.calls).toHaveLength(0);
    expect(host.querySelector("[data-testid=sheet]")).not.toBeNull();
  });
});

describe("화면당 공유 1곳 = 머리글", () => {
  it("FEED: 머리글 [공유][🔔] · 본문 통계 줄·내 글 ⋮ 에 공유 없음", () => {
    const header = read("components/community/post-detail/CommunityPostDetailHeader.tsx");
    expect(header).toContain("DibayHeaderShareButton");
    expect(header.indexOf("DibayHeaderShareButton\n")).toBeLessThan(header.indexOf("<Tier1NotificationAnchor"));
    const detail = read("components/community/CommunityDetail.tsx");
    expect(detail).toContain("onShare={communityShare.share}");
    expect(count(detail, "communityShare.share}")).toBe(1);
    expect(detail).not.toContain("onOwnShare");
    for (const rel of [
      "components/community/ui/CommunityActionBar.tsx",
      "components/community/ui/CommunityOwnPostMoreMenu.tsx",
      "components/community/ui/CommunityAuthorRow.tsx",
      "components/community/post-detail/CommunityPostDetailStatsActions.tsx",
    ]) {
      const src = read(rel);
      expect(src, rel).not.toMatch(/onShare|onOwnShare|Share2|community_share_label/);
    }
  });

  it("MARKET: 머리글 [공유][⋮] (겹쳐 열린 상세도 [공유]) · 행동 줄·⋮ 메뉴에 공유 없음", () => {
    const view = read("components/post/PostDetailView.tsx");
    expect(count(view, "<DibayHeaderShareButton")).toBe(2);
    expect(view).not.toContain("trade_detail_share");
    expect(view).not.toContain("onSelectShare");
    const right = view.slice(view.indexOf("rightSlot: (\n          <div"));
    expect(right.indexOf("<DibayHeaderShareButton")).toBeLessThan(right.indexOf("setDetailMoreOpen(true)"));
    const more = read("components/post/PostDetailMoreBottomSheet.tsx");
    expect(more).not.toMatch(/trade_detail_share|onSelectShare|shareEnabled/);
  });

  it("CREW: 초대 권한자만 머리글 [공유=초대 링크][⋮] · ⋮ 메뉴는 친구 초대만 · 초대 시트 없음", () => {
    const moim = read("components/moim/MoimDetailScreen.tsx");
    expect(moim).toContain("canShareInvite = !!moim && isMember && moim.can.manage_invite_link");
    expect(moim).toContain("{canShareInvite ? (");
    expect(moim).toContain('buildShareUrl({ kind: "moim_invite", token: r.token })');
    expect(moim).toContain("moimRoutes.manageInvite(moim.id)");
    expect(moim).not.toContain("MoimInviteSheet");
    expect(moim).not.toContain('t("moim_menu_invite")');
  });

  it("공유 아이콘 모양 하나(Share2) · 이름 = common_share", () => {
    const btn = read("components/share/DibayHeaderShareButton.tsx");
    expect(btn).toContain("<Share2");
    expect(btn).toContain('t("common_share")');
  });
});
