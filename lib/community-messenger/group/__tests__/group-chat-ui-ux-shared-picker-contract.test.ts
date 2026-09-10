import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("group chat UI/UX shared picker + surface contracts", () => {
  it("Create and Invite both mount shared CommunityMessengerGroupMemberPicker", () => {
    const create = read("components/community-messenger/CommunityMessengerPrivateGroupCreatePanel.tsx");
    const sheets = read(
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx"
    );
    expect(create).toContain("CommunityMessengerGroupMemberPicker");
    expect(sheets).toContain("CommunityMessengerGroupMemberPicker");
    expect(sheets).toContain('activeSheet === "invite"');
    expect(sheets).not.toContain("nav_messenger_no_invitable_friends");
  });

  it("participants sheet has no primary stats cards / inline invite dashboard", () => {
    const sheets = read(
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx"
    );
    const membersBlock =
      sheets.match(/\{vm\.activeSheet === "members" \? \([\s\S]*?\) : null\}/)?.[0] ?? "";
    expect(membersBlock).toContain("nav_messenger_participants");
    expect(membersBlock).not.toContain("grid-cols-3");
    expect(membersBlock).not.toContain("cm_ui_operation_guide");
    expect(membersBlock).not.toContain("nav_messenger_invite_selected_friends");
    expect(membersBlock).toContain('setActiveSheet("invite")');
  });

  it("room menu has file archive but not send-file action row", () => {
    const sheets = read(
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx"
    );
    expect(sheets).toContain('setActiveSheet("files")');
    expect(sheets).not.toContain("cm_ui_attach_send_file");
  });

  it("tablet room header ownership is list-column-only SplitTopBar + Phase2Header safe-top", () => {
    const topBar = read("components/community-messenger/MessengerSplitTopBar.tsx");
    const header = read(
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx"
    );
    expect(topBar).toContain('data-messenger-split-top-bar-mode="list-column-only"');
    expect(topBar).toContain("roomPaneActive");
    expect(header).toContain('pt-[var(--safe-top)]');
  });

  it("shared overlay max-width SSOT; BottomNav + home sheet left-pane classes", () => {
    const layout = read("lib/ui/messenger-split-pane-layout.ts");
    const sheets = read(
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx"
    );
    const sheetUi = read("components/community-messenger/MessengerSheetUi.tsx");
    expect(layout).toContain("MESSENGER_GROUP_OVERLAY_SHEET_MAX_W_CLASS");
    expect(layout).toContain("APP_BOTTOM_NAV_MESSENGER_SPLIT_LIST_CLASS");
    expect(layout).toContain("MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS");
    expect(sheets).toContain("MESSENGER_GROUP_OVERLAY_SHEET_MAX_W_CLASS");
    expect(sheetUi).toContain("absolute inset-x-0 w-full");
    expect(sheetUi).not.toMatch(/splitListSheet\s*\?/);
  });

  it("wide room header grows with safe-top (presentation after 48px lock)", () => {
    const presentation = read("app/messenger-presentation.css");
    const transitions = read("app/messenger-view-transitions.css");
    expect(presentation).toContain("min-height: calc(48px + var(--safe-top, 0px))");
    expect(presentation).toContain("padding-right: max(12px, var(--safe-right, 0px))");
    expect(transitions).toContain("min-height: calc(48px + var(--safe-top, 0px))");
  });

  it("create panel remains two-step (members → details)", () => {
    const panel = read("components/community-messenger/CommunityMessengerPrivateGroupCreatePanel.tsx");
    expect(panel).toContain('subStep === "details"');
    expect(panel).toContain("PrivateGroupCreateSubStep");
  });
});
