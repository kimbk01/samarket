import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("call-client remote terminal feed contracts", () => {
  it("dispatches terminal handoff independent of incoming list removal", () => {
    const feed = read("lib/community-messenger/call-client-remote-terminal-feed.ts");
    expect(feed).toContain("dispatchRemoteCallSessionTerminalHandoff");
    expect(feed).toContain("postCommunityMessengerCallSessionTerminalBusEvent");
    expect(feed).toContain("shouldSkipDuplicateTerminalHandoff");
    expect(feed).toContain("TERMINAL_HANDOFF_DEDUPE_MS");

    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("dispatchRemoteCallSessionTerminalHandoff");
    expect(global).not.toContain("postCommunityMessengerBusEvent({\n            type: \"cm.call.session_terminal\"");
  });

  it("CallClient subscribes native terminal feed without Realtime-only gate", () => {
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(client).toContain("subscribeCommunityMessengerCallClientRemoteTerminalFeed");
    expect(client).toContain("callClientRemoteTerminalQueryFromFeed");
    expect(client).toContain("remoteTerminalHandoffOnceRef");
  });
});
