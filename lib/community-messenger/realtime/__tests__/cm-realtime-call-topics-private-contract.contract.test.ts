import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract (Public access OFF): every call topic the web joins must be private AND listed in
 * internal.cm_realtime_can_read_topic — otherwise Realtime rejects the join (PrivateOnly / RLS).
 */
const root = path.resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const MIGRATION = "supabase/migrations/20270424120000_cm_realtime_call_session_incoming_private_topics.sql";

const JOINS = [
  { file: "components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx", topic: "community-messenger-incoming-call:" },
  { file: "components/community-messenger/CommunityMessengerCallClient.tsx", topic: "community-messenger-call-session:" },
  { file: "components/community-messenger/CommunityMessengerCallClient.tsx", topic: "community-messenger-call-signal-hangup:" },
];

describe("call Realtime topics — private join ↔ read policy contract", () => {
  for (const { file, topic } of JOINS) {
    it(`${topic} joins with private channel options`, () => {
      const src = read(file);
      const at = src.indexOf(`name: \`${topic}`);
      expect(at).toBeGreaterThan(-1);
      const window = src.slice(at, at + 400);
      expect(window).toContain("channelOptions: messengerPrivateBroadcastChannelOptions()");
    });

    it(`${topic} is authorized by internal.cm_realtime_can_read_topic`, () => {
      expect(read(MIGRATION)).toContain(`when p_topic like '${topic}%' then`);
    });
  }

  it("hangup channel skips tmp_* ids (no DB row → private join would be denied)", () => {
    const src = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    const at = src.indexOf("name: `community-messenger-call-signal-hangup:");
    const effectHead = src.slice(src.lastIndexOf("useEffect(() => {", at), at);
    expect(effectHead).toContain("isCommunityMessengerTempCallSessionId(sessionId)");
  });

  it("migration keeps send policy untouched (SELECT-only change)", () => {
    expect(read(MIGRATION)).not.toContain("cm_realtime_can_send_topic(p_topic text)");
  });
});
