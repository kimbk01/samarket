import fs from "node:fs";

const p = "components/admin/community-messenger/AdminCommunityMessengerPage.tsx";
let s = fs.readFileSync(p, "utf8");

s = s.replace(
  "const weekdays = [\"일\", \"월\", \"화\", \"수\", \"목\", \"금\", \"토\"] as const;\nconst heatmapHours = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, \"0\")}시`);\n\n",
  ""
);

if (!s.includes("const {\n    t,\n    formatDateTime")) {
  s = s.replace(
    "export function AdminCommunityMessengerPage() {\n  const searchParams = useSearchParams();",
    `export function AdminCommunityMessengerPage() {
  const {
    t,
    formatDateTime,
    roomTypeLabel,
    periodLabel,
    forceEndReasonOptions,
    forceEndReasonLabel,
    weekdays,
    heatmapHours,
    heatmapHourHeader,
    heatmapCellTitle,
    heatmapSlotLabel,
    adminUnknownLabel,
    defaultRoomLabel,
  } = useCmAdminLabels();
  const searchParams = useSearchParams();`
  );
}

const map = [
  ["재발 {repeatCount}건 · 분석 {analyzedCount}건", '{t("admin_cm_common_repeat_analyzed", { repeat: repeatCount, analyzed: analyzedCount })}'],
  ["총 {totalCount}건 · 재발 {repeatCount}건", '{t("admin_cm_common_total_repeat", { total: totalCount, repeat: repeatCount })}'],
  ["총 강제 종료", '{t("admin_cm_common_total_force_end")}'],
  ["방 재발", '{t("admin_cm_room_recurrence")}'],
  ["반복 방 {roomRepeatedSubjects}개 · 재발 {roomRepeatedEvents}건", '{t("admin_cm_common_room_repeat", { rooms: roomRepeatedSubjects, events: roomRepeatedEvents })}'],
  ["발신자 재발", '{t("admin_cm_caller_recurrence")}'],
  ["반복 발신자 {callerRepeatedSubjects}명 · 재발 {callerRepeatedEvents}건", '{t("admin_cm_common_caller_repeat", { callers: callerRepeatedSubjects, events: callerRepeatedEvents })}'],
  ["총 강제 종료 {totalCount}건", '{t("admin_cm_common_total_force_end")} {t("admin_cm_common_count", { count: totalCount })}'],
  ["방 후속 재발 {roomFollowupCount}건", '{t("admin_cm_common_room_followup", { count: roomFollowupCount })}'],
  ["발신자 후속 재발 {callerFollowupCount}건", '{t("admin_cm_common_caller_followup", { count: callerFollowupCount })}'],
  ["방 기준 억제율", '{t("admin_cm_room_suppression")}'],
  ["발신자 기준 억제율", '{t("admin_cm_caller_suppression")}'],
  ["발신자 매핑 가능 {callerEvaluatedCount}건 기준", '{t("admin_cm_common_caller_evaluated", { count: callerEvaluatedCount })}'],
  [">요일</th>", ">{t(\"admin_cm_weekday_header\")}</th>"],
  ["{hourLabel.replace(\"시\", \"\")}", "{heatmapHourHeader(hour)}"],
  ['title={`${weekday} ${String(hour).padStart(2, "0")}:00 · ${count}건`}', "title={heatmapCellTitle(weekday, hour, count)}"],
  [">낮음</span>", ">{t(\"admin_cm_heatmap_low\")}</span>"],
  [">높음</span>", ">{t(\"admin_cm_heatmap_high\")}</span>"],
  ["집중 시간대", '{t("admin_cm_heatmap_peak_hours")}'],
  ["집계 데이터가 없습니다.", '{t("admin_cm_heatmap_no_data")}'],
  ["{slot.label} · {slot.count}건", '{t("admin_cm_common_slot_line", { label: slot.label, count: slot.count })}'],
  ["후속 재발 {recurrenceCount}건 · 재발 비중 {recurrencePercent}%", '{t("admin_cm_common_recurrence_line", { count: recurrenceCount, percent: recurrencePercent })}'],
  ["처리 운영자 {uniqueAdminCount}명", '{t("admin_cm_common_operators_count", { count: uniqueAdminCount })}'],
  ["집계 가능한 운영자 데이터가 없습니다.", '{t("admin_cm_empty_operator_stats")}'],
  ["이 사유 내 점유율 {percent}%", '{t("admin_cm_common_reason_share", { percent })}'],
  ['{t("admin_cm_common_count", { count: "" }).replace("건", "").replace("", "")}', '{t("admin_cm_common_count", { count: 0 }).replace(/\\d+/, "") || "—"}'],
  ["메모: {room.adminNote}", '{t("admin_cm_common_note", { text: room.adminNote })}'],
  ['{room.roomType === "open_group" ? "공개 그룹" : room.roomType === "private_group" ? "비공개 그룹" : "1:1"}', '{roomTypeLabel(room.roomType === "open_group" ? "open_group" : room.roomType === "private_group" ? "private_group" : "direct")}'],
  ["{room.memberCount}명", '{t("admin_cm_common_members", { count: room.memberCount })}'],
  ["상세보기", '{t("admin_cm_action_view_detail")}'],
  ["상태 {request.status} · 생성 {formatDateTime(request.createdAt)}", '{t("admin_cm_common_status", { status: request.status })} · {t("admin_cm_common_created", { date: formatDateTime(request.createdAt) })}'],
  ["요청 메모: {request.note}", '{t("admin_cm_common_request_note", { text: request.note })}'],
  ["관리 메모: {request.adminNote}", '{t("admin_cm_common_admin_note", { text: request.adminNote })}'],
  [">승인<", ">{t(\"admin_cm_action_approve\")}<"],
  [">거절<", ">{t(\"admin_cm_action_reject\")}<"],
  ["차단 처리", '{t("admin_cm_action_block")}'],
  ['{call.sessionMode === "group" ? "그룹" : "1:1"}', '{call.sessionMode === "group" ? t("admin_cm_session_mode_group") : t("admin_cm_session_mode_direct")}'],
  ["{call.callKind} · {call.status} · {call.durationSeconds}초 · 참여 {call.participantCount}명", '{t("admin_cm_common_call_duration", { kind: call.callKind, status: call.status, seconds: call.durationSeconds, count: call.participantCount })}'],
  ["시작자 {call.initiatorLabel}", '{t("admin_cm_common_initiator", { name: call.initiatorLabel })}'],
  ["참여 {call.joinedCount}명 · 대기 {call.invitedCount}명 · 전체 {call.participantCount}명", '{t("admin_cm_common_participants_joined", { joined: call.joinedCount, invited: call.invitedCount, total: call.participantCount })}'],
  ["방 상세", '{t("admin_cm_action_room_detail")}'],
  [">강제 종료</span>", ">{t(\"admin_cm_force_end_badge\")}</span>"],
  ["관리자 {log.actorLabel}", '{t("admin_cm_common_admin_actor", { name: log.actorLabel })}'],
  ["사유 코드: {log.reasonLabel} ({log.reasonCode})", '{t("admin_cm_common_reason_code", { label: log.reasonLabel, code: log.reasonCode ?? "" })}'],
  ["메모: {log.note}", '{t("admin_cm_common_note", { text: log.note })}'],
  ["신고자 {report.reporterLabel}", ""],
];

// fix report line specially
s = s.replace(
  "신고자 {report.reporterLabel} · 대상 {report.reportedUserLabel} · 상태 {report.status}",
  '{t("admin_cm_common_reporter_line", { reporter: report.reporterLabel, target: report.reportedUserLabel, status: report.status })}'
);
s = s.replace(
  "사유 {report.reasonType}{report.reasonDetail ? ` · ${report.reasonDetail}` : \"\"}",
  '{t("admin_cm_common_reason_line", { reason: `${report.reasonType}${report.reasonDetail ? ` · ${report.reasonDetail}` : ""}` })}'
);
s = s.replaceAll("검토중", '{t("admin_cm_action_reviewing")}');
s = s.replaceAll("해결", '{t("admin_cm_action_resolve")}');
s = s.replaceAll("메시지 숨김", '{t("admin_cm_action_hide_message")}');
s = s.replaceAll("방 차단", '{t("admin_cm_action_block_room")}');

// fix count label - add admin_cm_count_label key usage - use simple text
s = s.replace(
  '{t("admin_cm_common_count", { count: 0 }).replace(/\\d+/, "") || "—"}',
  '"—"'
);

// add admin_cm_count_only key - use th metric wrongly, fix to dedicated
s = s.replace('<p className="sam-text-xxs text-sam-meta">"—"</p>', '<p className="sam-text-xxs text-sam-meta">{t("admin_cm_common_count", { count: item.count }).replace(/\\d+/, "").trim() || t("admin_cm_common_dash")}</p>');

// builder fixes
s = s.replace(
  "function buildForceEndRoomTypeStats(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  roomTypeByRoomId: Map<string, \"direct\" | \"private_group\" | \"open_group\">\n)",
  "function buildForceEndRoomTypeStats(\n  callAudits: AdminCommunityMessengerCallAuditLog[],\n  roomTypeByRoomId: Map<string, \"direct\" | \"private_group\" | \"open_group\">,\n  t: CmAdminTranslate\n)"
);
s = s.replace(
  `  return [
    { key: "direct", label: "1:1", count: countMap.get("direct") ?? 0 },
    { key: "private_group", label: "비공개 그룹", count: countMap.get("private_group") ?? 0 },
    { key: "open_group", label: "공개 그룹", count: countMap.get("open_group") ?? 0 },
    { key: "unknown", label: "미확인", count: countMap.get("unknown") ?? 0 },
  ]`,
  `  return [
    { key: "direct", label: t("admin_cm_room_type_direct"), count: countMap.get("direct") ?? 0 },
    { key: "private_group", label: t("admin_cm_room_type_private_group"), count: countMap.get("private_group") ?? 0 },
    { key: "open_group", label: t("admin_cm_room_type_open_group"), count: countMap.get("open_group") ?? 0 },
    { key: "unknown", label: t("admin_cm_room_type_unknown"), count: countMap.get("unknown") ?? 0 },
  ]`
);

s = s.replaceAll('audit.actorLabel || "관리자 미상"', 'audit.actorLabel || t("admin_cm_admin_unknown")');

// remove COMMUNITY_MESSENGER import if unused
if (!s.includes("COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS")) {
  s = s.replace(
    'import { COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS } from "@/lib/admin-community-messenger/call-force-end-reasons";\n',
    ""
  );
}

// Pass weekdays/t to heatmap cards
s = s.replace(
  "<ForceEndHeatmapCard\n            title={t(\"admin_cm_heatmap_force_end\")}",
  "<ForceEndHeatmapCard\n            weekdays={weekdays}\n            heatmapHours={heatmapHours}\n            title={t(\"admin_cm_heatmap_force_end\")}"
);

// Update ForceEndHeatmapCard to accept weekdays prop - do via replace in component

fs.writeFileSync(p, s);
console.log("done2");
