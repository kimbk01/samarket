import { describe, expect, it } from "vitest";
import {
  planMannerEvents,
  type ConfirmedReport,
  type MannerSources,
  type MoimAttendanceSource,
  type SanctionSource,
} from "@/lib/trust/crew-rep-manner-sync";
import { diffTrustEvents } from "@/lib/trust/crew-rep-sync-core";

const AS_OF = new Date("2026-12-01T04:00:00.000Z");
const D = 86_400_000;
const daysAgo = (n: number) => new Date(AS_OF.getTime() - n * D).toISOString();
const BEFORE_START = "2026-11-10T00:00:00.000Z";

const sanction = (over: Partial<SanctionSource> = {}): SanctionSource => ({
  id: "s1",
  user_id: "bad",
  sanction_type: "warning",
  scope: "community",
  start_at: daysAgo(3),
  end_at: null,
  created_at: daysAgo(3),
  revoked_at: null,
  source_report_id: null,
  ...over,
});
const report = (over: Partial<ConfirmedReport> = {}): ConfirmedReport => ({
  kind: "community",
  reportId: "r1",
  targetUserId: "bad",
  targetKey: "post1",
  decidedAt: daysAgo(2),
  fraud: false,
  contentRemoved: true,
  ...over,
});
const att = (over: Partial<MoimAttendanceSource> = {}): MoimAttendanceSource => ({
  id: "a1",
  user_id: "member",
  attendance: "present",
  status: "confirmed",
  schedule_host_user_id: "host",
  schedule_status: "done",
  schedule_starts_at: daysAgo(10),
  schedule_finished_at: daysAgo(9),
  ...over,
});
const src = (over: Partial<MannerSources> = {}): MannerSources => ({ sanctions: [], reports: [], attendance: [], ...over });
const plan = (s: MannerSources) => planMannerEvents(s, AS_OF).map((e) => `${e.event_type}:${e.member_id}:${e.source_id}`).sort();

describe("CREW REP 매너·제재 동기화 (S4)", () => {
  it("신고 접수만(확정 아님)은 원천에 없다 → 사건 0", () => {
    expect(plan(src())).toEqual([]);
  });

  it("제재 종류 매핑: 경고·제한(채팅·라운지·거래)·정지, 철회·시작 이전은 제외", () => {
    expect(
      plan(
        src({
          sanctions: [
            sanction({ id: "w" }),
            sanction({ id: "c", sanction_type: "chat_ban" }),
            sanction({ id: "t", sanction_type: "trade_restriction", scope: "trade" }),
            sanction({ id: "p", sanction_type: "temp_suspend", scope: "platform" }),
            sanction({ id: "rv", revoked_at: daysAgo(1) }),
            sanction({ id: "old", created_at: BEFORE_START }),
          ],
        })
      )
    ).toEqual([
      "sanction_restriction:bad:c",
      "sanction_restriction:bad:t",
      "sanction_suspension:bad:p",
      "sanction_warning:bad:w",
    ]);
  });

  it("신고 확정(숨김) → 매너 −2, 같은 대상 여러 신고 = 1건", () => {
    expect(plan(src({ reports: [report(), report({ reportId: "r2" }), report({ reportId: "r3" })] }))).toEqual([
      "manner_report_confirmed:bad:post1",
    ]);
  });

  it("같은 신고(또는 같은 대상의 다른 신고)로 제재가 나갔으면 매너 감점 없이 제재만 (이중 감점 없음)", () => {
    expect(
      plan(
        src({
          reports: [report({ reportId: "r1" }), report({ reportId: "r2" })],
          sanctions: [sanction({ source_report_id: "r2" })],
        })
      )
    ).toEqual(["sanction_warning:bad:s1"]);
  });

  it("콘텐츠를 숨기지 않은 확정(조치 없음)은 매너 감점 아님", () => {
    expect(plan(src({ reports: [report({ contentRemoved: false })] }))).toEqual([]);
  });

  it("거래 사기·노쇼 확정 → 거래 신뢰 −3, 제재와 별도로 1건", () => {
    expect(
      plan(
        src({
          reports: [
            report({ kind: "trade", fraud: true, targetKey: "postX" }),
            report({ kind: "trade", fraud: true, reportId: "r2", targetKey: "postX" }),
          ],
          sanctions: [sanction({ source_report_id: "r1", scope: "trade", sanction_type: "trade_restriction" })],
        })
      )
    ).toEqual(["sanction_restriction:bad:s1", "trade_fraud_confirmed:bad:postX"]);
  });

  it("기록 시작 이전 결정은 제외", () => {
    expect(plan(src({ reports: [report({ decidedAt: BEFORE_START })] }))).toEqual([]);
  });

  it("모임 출석 +, 노쇼는 끝난 뒤 7일 지나야, 주최자 본인·미완료 일정·미확정 참여는 제외", () => {
    expect(
      plan(
        src({
          attendance: [
            att({ id: "ok" }),
            att({ id: "ns", attendance: "absent" }),
            att({ id: "ns-early", attendance: "absent", schedule_finished_at: daysAgo(3) }),
            att({ id: "host", user_id: "host" }),
            att({ id: "open", schedule_status: "closed" }),
            att({ id: "req", status: "requested" }),
            att({ id: "unk", attendance: "unknown" }),
            att({ id: "old", schedule_starts_at: BEFORE_START }),
          ],
        })
      )
    ).toEqual(["manner_moim_attended:member:ok", "manner_moim_no_show:member:ns"]);
  });

  it("제재 철회 → 원장 되돌림, 출석 바뀜(참석→노쇼) → 참석 되돌리고 노쇼 기록", () => {
    const before = planMannerEvents(src({ sanctions: [sanction()], attendance: [att()] }), AS_OF);
    const existing = before.map((e) => ({ id: e.idempotency_key, member_id: e.member_id, idempotency_key: e.idempotency_key, status: "confirmed", metadata: {} }));
    const after = planMannerEvents(
      src({ sanctions: [sanction({ revoked_at: daysAgo(1) })], attendance: [att({ attendance: "absent" })] }),
      AS_OF
    );
    const d = diffTrustEvents(after, existing, "manner_source_invalid");
    expect(d.reverse.map((e) => e.idempotency_key).sort()).toEqual(["manner_moim_attended:a1:member", "sanction_warning:s1:bad"]);
    expect(d.insert.map((e) => e.idempotency_key)).toEqual(["manner_moim_no_show:a1:member"]);
  });
});
