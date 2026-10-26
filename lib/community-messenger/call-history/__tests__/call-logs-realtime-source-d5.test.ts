import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  notifyCallLogsRealtimeChanged,
  subscribeCallLogsRealtimeChanged,
} from "@/lib/community-messenger/call-history/call-logs-realtime-listeners";

const root = process.cwd();
const src = (p: string) => readFileSync(join(root, p), "utf8");

describe("D-5 통화 탭 실시간 출처", () => {
  it("홈 실시간 call_logs 신호가 통화 탭 리스너에 전달되고 해제 뒤에는 안 감", () => {
    const fn = vi.fn();
    const off = subscribeCallLogsRealtimeChanged(fn);
    notifyCallLogsRealtimeChanged();
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    notifyCallLogsRealtimeChanged();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("홈 메타 채널의 call_logs 두 처리기 모두 통화 탭에 알림", () => {
    const channels = src("lib/community-messenger/realtime/community-messenger-home-realtime-channels.ts");
    expect(channels.match(/notifyCallLogsRealtimeChanged\(\);/g)?.length).toBe(2);
  });

  it("통화 탭 자체 구독에서 call_sessions UPDATE 구독 제거 · 홈 안 통화 탭은 home_meta", () => {
    const hook = src("lib/community-messenger/call-history/use-community-call-history-realtime-sync.ts");
    expect(hook).not.toContain('table: "community_messenger_call_sessions"');
    expect(hook).toContain("runSingleFlightWithTrailing");
    const home = src("components/community-messenger/MessengerHomeMainSections.tsx");
    expect(home).toContain('callLogsRealtimeSource="home_meta"');
  });
});
