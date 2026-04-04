import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { createCommunityMessengerCallLog } from "@/lib/community-messenger/service";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import {
  COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS,
  getCommunityMessengerCallForceEndReasonLabel,
  isCommunityMessengerCallForceEndReasonCode,
  type CommunityMessengerCallForceEndReasonCode,
} from "@/lib/admin-community-messenger/call-force-end-reasons";
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallStatus,
  CommunityMessengerFriendRequestStatus,
  CommunityMessengerCallParticipantStatus,
  CommunityMessengerCallSessionMode,
  CommunityMessengerCallSessionStatus,
  CommunityMessengerRoomStatus,
  CommunityMessengerRoomType,
} from "@/lib/community-messenger/types";

type SupabaseLike = ReturnType<typeof getSupabaseServer>;

type ProfileRow = {
  id: string;
  nickname?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

type RoomRow = {
  id: string;
  room_type: CommunityMessengerRoomType;
  room_status: CommunityMessengerRoomStatus | null;
  is_readonly: boolean | null;
  title: string | null;
  avatar_url: string | null;
  created_by: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_type: string | null;
  created_at: string | null;
  updated_at: string | null;
  admin_note?: string | null;
  moderated_by?: string | null;
  moderated_at?: string | null;
};

type ParticipantRow = {
  id: string;
  room_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  unread_count: number | null;
  joined_at: string | null;
  last_read_at?: string | null;
};

type RequestRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: CommunityMessengerFriendRequestStatus;
  note?: string | null;
  admin_note?: string | null;
  created_at: string;
  responded_at?: string | null;
  handled_by_admin_id?: string | null;
  handled_at?: string | null;
};

type MessageRow = {
  id: string;
  room_id: string;
  sender_id: string | null;
  message_type: "text" | "image" | "system" | "call_stub";
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  is_hidden_by_admin?: boolean | null;
};

type CallRow = {
  id: string;
  session_id?: string | null;
  room_id: string | null;
  caller_user_id: string;
  peer_user_id: string | null;
  call_kind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at?: string | null;
  created_at?: string | null;
};

type CallSessionRow = {
  id: string;
  room_id: string;
  initiator_user_id: string;
  recipient_user_id: string | null;
  session_mode: CommunityMessengerCallSessionMode | null;
  call_kind: CommunityMessengerCallKind;
  status: CommunityMessengerCallSessionStatus;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  created_at: string | null;
};

type CallSessionParticipantRow = {
  id: string;
  session_id: string;
  room_id: string;
  user_id: string;
  participation_status: CommunityMessengerCallParticipantStatus;
  joined_at: string | null;
  left_at: string | null;
  created_at: string | null;
};

type ReportRow = {
  id: string;
  report_type: "room" | "message" | "user";
  room_id: string | null;
  message_id: string | null;
  reported_user_id: string | null;
  reporter_user_id: string;
  reason_type: string;
  reason_detail: string | null;
  status: "received" | "reviewing" | "resolved" | "rejected" | "sanctioned";
  admin_note?: string | null;
  assigned_admin_id?: string | null;
  handled_at?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type AuditRow = {
  id: string;
  actor_type: string;
  actor_id: string | null;
  target_type: string;
  target_id: string;
  action: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
};

export type AdminCommunityMessengerRoomSummary = {
  id: string;
  roomType: CommunityMessengerRoomType;
  roomStatus: CommunityMessengerRoomStatus;
  isReadonly: boolean;
  title: string;
  createdByLabel: string;
  memberCount: number;
  memberLabels: string[];
  lastMessage: string;
  lastMessageAt: string;
  lastMessageType: string;
  createdAt: string;
  unreadTotal: number;
  adminNote: string;
};

export type AdminCommunityMessengerFriendRequest = {
  id: string;
  requesterId: string;
  requesterLabel: string;
  addresseeId: string;
  addresseeLabel: string;
  status: CommunityMessengerFriendRequestStatus;
  note: string;
  adminNote: string;
  createdAt: string;
  respondedAt: string | null;
  handledByAdminId: string | null;
  handledByAdminLabel: string;
  handledAt: string | null;
};

export type AdminCommunityMessengerCallLog = {
  id: string;
  sessionId: string | null;
  roomId: string | null;
  roomTitle: string;
  sessionMode: CommunityMessengerCallSessionMode;
  callerLabel: string;
  peerLabel: string;
  participantCount: number;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus;
  durationSeconds: number;
  startedAt: string;
};

export type AdminCommunityMessengerActiveCallSession = {
  id: string;
  roomId: string;
  roomTitle: string;
  sessionMode: CommunityMessengerCallSessionMode;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallSessionStatus;
  initiatorLabel: string;
  startedAt: string;
  answeredAt: string | null;
  participantCount: number;
  joinedCount: number;
  invitedCount: number;
  participants: Array<{
    userId: string;
    label: string;
    status: CommunityMessengerCallParticipantStatus;
    joinedAt: string | null;
    leftAt: string | null;
  }>;
};

export type AdminCommunityMessengerReport = {
  id: string;
  reportType: "room" | "message" | "user";
  roomId: string | null;
  roomTitle: string;
  messageId: string | null;
  reportedUserId: string | null;
  reportedUserLabel: string;
  reporterUserId: string;
  reporterLabel: string;
  reasonType: string;
  reasonDetail: string;
  status: "received" | "reviewing" | "resolved" | "rejected" | "sanctioned";
  adminNote: string;
  assignedAdminId: string | null;
  assignedAdminLabel: string;
  handledAt: string | null;
  createdAt: string;
};

export type AdminCommunityMessengerCallAuditLog = {
  id: string;
  sessionId: string;
  roomId: string;
  roomTitle: string;
  actorLabel: string;
  action: string;
  reasonCode: string;
  reasonLabel: string;
  note: string;
  createdAt: string;
  beforeStatus: string;
  afterStatus: string;
};

export type AdminCommunityMessengerRoomDetail = {
  room: AdminCommunityMessengerRoomSummary & {
    moderatedByLabel: string;
    moderatedAt: string | null;
  };
  participants: Array<{
    id: string;
    userId: string;
    label: string;
    role: "owner" | "admin" | "member";
    unreadCount: number;
    joinedAt: string | null;
    lastReadAt: string | null;
  }>;
  messages: Array<{
    id: string;
    senderId: string | null;
    senderLabel: string;
    messageType: string;
    content: string;
    createdAt: string;
    isHiddenByAdmin: boolean;
    reportCount: number;
  }>;
  calls: AdminCommunityMessengerCallLog[];
  activeCalls: AdminCommunityMessengerActiveCallSession[];
  callAudits: AdminCommunityMessengerCallAuditLog[];
  reports: AdminCommunityMessengerReport[];
};

export type AdminCommunityMessengerDashboard = {
  stats: {
    totalRooms: number;
    activeRooms: number;
    blockedRooms: number;
    archivedRooms: number;
    readonlyRooms: number;
    directRooms: number;
    groupRooms: number;
    pendingRequests: number;
    totalCalls: number;
    activeCallSessions: number;
    activeGroupCallSessions: number;
    openReports: number;
    forceEndTotal: number;
  };
  forceEndReasonStats: Array<{
    code: string;
    label: string;
    count: number;
    share: number;
  }>;
  forceEndTrendStats: Array<{
    key: "24h" | "7d" | "30d";
    label: string;
    currentCount: number;
    previousCount: number;
    delta: number;
    direction: "up" | "down" | "flat";
  }>;
  forceEndAdminStats: Array<{
    adminLabel: string;
    count: number;
    share: number;
  }>;
  rooms: AdminCommunityMessengerRoomSummary[];
  requests: AdminCommunityMessengerFriendRequest[];
  calls: AdminCommunityMessengerCallLog[];
  activeCalls: AdminCommunityMessengerActiveCallSession[];
  callAudits: AdminCommunityMessengerCallAuditLog[];
  reports: AdminCommunityMessengerReport[];
};

function sb(): SupabaseLike {
  return getSupabaseServer();
}

function t(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function roomStatus(value: unknown): CommunityMessengerRoomStatus {
  return value === "blocked" || value === "archived" ? value : "active";
}

function labelForProfile(profile: ProfileRow | undefined, fallback: string): string {
  return t(profile?.nickname) || t(profile?.username) || `회원 ${fallback.replace(/-/g, "").slice(0, 8)}`;
}

async function getProfileMap(userIds: string[]): Promise<Map<string, ProfileRow>> {
  const ids = [...new Set(userIds.map((id) => t(id)).filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await (sb() as any).from("profiles").select("id, nickname, username, avatar_url").in("id", ids);
  return new Map(((data ?? []) as ProfileRow[]).map((row) => [row.id, row]));
}

async function getRoomsAndParticipants(limit = 200): Promise<{
  rooms: RoomRow[];
  participants: ParticipantRow[];
}> {
  const { data: rooms } = await (sb() as any)
    .from("community_messenger_rooms")
    .select(
      "id, room_type, room_status, is_readonly, title, avatar_url, created_by, last_message, last_message_at, last_message_type, created_at, updated_at, admin_note, moderated_by, moderated_at"
    )
    .order("last_message_at", { ascending: false })
    .limit(limit);
  const roomIds = ((rooms ?? []) as RoomRow[]).map((row) => row.id);
  let participants: ParticipantRow[] = [];
  if (roomIds.length) {
    const { data } = await (sb() as any)
      .from("community_messenger_participants")
      .select("id, room_id, user_id, role, unread_count, joined_at, last_read_at")
      .in("room_id", roomIds);
    participants = (data ?? []) as ParticipantRow[];
  }
  return { rooms: (rooms ?? []) as RoomRow[], participants };
}

function mapRoomSummary(
  room: RoomRow,
  participants: ParticipantRow[],
  profileMap: Map<string, ProfileRow>
): AdminCommunityMessengerRoomSummary {
  const memberLabels = participants.map((participant) =>
    labelForProfile(profileMap.get(participant.user_id), participant.user_id)
  );
  const directTitle = room.room_type === "direct" ? memberLabels.slice(0, 2).join(", ") || "1:1 채팅" : "";
  return {
    id: room.id,
    roomType: room.room_type,
    roomStatus: roomStatus(room.room_status),
    isReadonly: room.is_readonly === true,
    title: t(room.title) || directTitle || `그룹 ${participants.length}명`,
    createdByLabel: room.created_by ? labelForProfile(profileMap.get(room.created_by), room.created_by) : "-",
    memberCount: participants.length,
    memberLabels,
    lastMessage: t(room.last_message) || "-",
    lastMessageAt: t(room.last_message_at) || t(room.created_at),
    lastMessageType: t(room.last_message_type) || "system",
    createdAt: t(room.created_at),
    unreadTotal: participants.reduce((sum, participant) => sum + Number(participant.unread_count ?? 0), 0),
    adminNote: t(room.admin_note),
  };
}

function mapCallLog(
  row: CallRow,
  roomMap: Map<string, AdminCommunityMessengerRoomSummary>,
  profileMap: Map<string, ProfileRow>,
  sessionMap: Map<string, CallSessionRow>,
  participantsBySession: Map<string, CallSessionParticipantRow[]>
): AdminCommunityMessengerCallLog {
  const session = row.session_id ? sessionMap.get(row.session_id) : undefined;
  const sessionMode = (session?.session_mode ?? "direct") as CommunityMessengerCallSessionMode;
  const participantRows = row.session_id ? participantsBySession.get(row.session_id) ?? [] : [];
  return {
    id: row.id,
    sessionId: row.session_id ?? null,
    roomId: row.room_id,
    roomTitle: row.room_id ? roomMap.get(row.room_id)?.title ?? "메신저 방" : "메신저 방",
    sessionMode,
    callerLabel: labelForProfile(profileMap.get(row.caller_user_id), row.caller_user_id),
    peerLabel: row.peer_user_id ? labelForProfile(profileMap.get(row.peer_user_id), row.peer_user_id) : "-",
    participantCount: sessionMode === "group" ? Math.max(participantRows.length, 2) : 2,
    callKind: row.call_kind,
    status: row.status,
    durationSeconds: Number(row.duration_seconds ?? 0),
    startedAt: t(row.started_at),
  };
}

function mapActiveCallSession(
  row: CallSessionRow,
  roomMap: Map<string, AdminCommunityMessengerRoomSummary>,
  profileMap: Map<string, ProfileRow>,
  participants: CallSessionParticipantRow[]
): AdminCommunityMessengerActiveCallSession {
  const roomTitle = roomMap.get(row.room_id)?.title ?? "메신저 방";
  const mappedParticipants = participants.map((participant) => ({
    userId: participant.user_id,
    label: labelForProfile(profileMap.get(participant.user_id), participant.user_id),
    status: participant.participation_status,
    joinedAt: participant.joined_at ?? null,
    leftAt: participant.left_at ?? null,
  }));
  return {
    id: row.id,
    roomId: row.room_id,
    roomTitle,
    sessionMode: (row.session_mode ?? "direct") as CommunityMessengerCallSessionMode,
    callKind: row.call_kind,
    status: row.status,
    initiatorLabel: labelForProfile(profileMap.get(row.initiator_user_id), row.initiator_user_id),
    startedAt: t(row.started_at),
    answeredAt: row.answered_at ?? null,
    participantCount: mappedParticipants.length,
    joinedCount: mappedParticipants.filter((participant) => participant.status === "joined").length,
    invitedCount: mappedParticipants.filter((participant) => participant.status === "invited").length,
    participants: mappedParticipants,
  };
}

function mapCallAuditLog(
  row: AuditRow,
  roomMap: Map<string, AdminCommunityMessengerRoomSummary>,
  profileMap: Map<string, ProfileRow>
): AdminCommunityMessengerCallAuditLog {
  const beforeJson = row.before_json ?? {};
  const afterJson = row.after_json ?? {};
  const roomId = t(afterJson.roomId) || t(beforeJson.roomId) || t(row.target_id);
  const sessionId = t(afterJson.sessionId) || t(beforeJson.sessionId) || t(row.target_id);
  const actorId = t(row.actor_id);
  const reasonCode = t(afterJson.reasonCode) || t(beforeJson.reasonCode);
  return {
    id: row.id,
    sessionId,
    roomId,
    roomTitle: roomId ? roomMap.get(roomId)?.title ?? "메신저 방" : "메신저 방",
    actorLabel: actorId ? labelForProfile(profileMap.get(actorId), actorId) : row.actor_type,
    action: row.action,
    reasonCode,
    reasonLabel: getCommunityMessengerCallForceEndReasonLabel(reasonCode),
    note: t(afterJson.adminNote) || t(beforeJson.adminNote),
    createdAt: row.created_at,
    beforeStatus: t(beforeJson.status) || "-",
    afterStatus: t(afterJson.status) || "-",
  };
}

function mapReport(
  row: ReportRow,
  roomMap: Map<string, AdminCommunityMessengerRoomSummary>,
  profileMap: Map<string, ProfileRow>
): AdminCommunityMessengerReport {
  return {
    id: row.id,
    reportType: row.report_type,
    roomId: row.room_id,
    roomTitle: row.room_id ? roomMap.get(row.room_id)?.title ?? "메신저 방" : "메신저 방",
    messageId: row.message_id,
    reportedUserId: row.reported_user_id,
    reportedUserLabel: row.reported_user_id
      ? labelForProfile(profileMap.get(row.reported_user_id), row.reported_user_id)
      : "-",
    reporterUserId: row.reporter_user_id,
    reporterLabel: labelForProfile(profileMap.get(row.reporter_user_id), row.reporter_user_id),
    reasonType: row.reason_type,
    reasonDetail: t(row.reason_detail),
    status: row.status,
    adminNote: t(row.admin_note),
    assignedAdminId: row.assigned_admin_id ?? null,
    assignedAdminLabel: row.assigned_admin_id
      ? labelForProfile(profileMap.get(row.assigned_admin_id), row.assigned_admin_id)
      : "-",
    handledAt: row.handled_at ?? null,
    createdAt: row.created_at,
  };
}

function buildForceEndTrendStats(callAudits: AdminCommunityMessengerCallAuditLog[]) {
  const now = Date.now();
  const windows = [
    { key: "24h" as const, label: "최근 24시간", sizeMs: 24 * 60 * 60 * 1000 },
    { key: "7d" as const, label: "최근 7일", sizeMs: 7 * 24 * 60 * 60 * 1000 },
    { key: "30d" as const, label: "최근 30일", sizeMs: 30 * 24 * 60 * 60 * 1000 },
  ];

  return windows.map((window) => {
    let currentCount = 0;
    let previousCount = 0;

    for (const audit of callAudits) {
      const timestamp = new Date(audit.createdAt).getTime();
      if (!Number.isFinite(timestamp) || timestamp > now) continue;
      const age = now - timestamp;
      if (age <= window.sizeMs) {
        currentCount += 1;
      } else if (age <= window.sizeMs * 2) {
        previousCount += 1;
      }
    }

    const delta = currentCount - previousCount;
    return {
      key: window.key,
      label: window.label,
      currentCount,
      previousCount,
      delta,
      direction: delta > 0 ? ("up" as const) : delta < 0 ? ("down" as const) : ("flat" as const),
    };
  });
}

export async function getAdminCommunityMessengerDashboard(): Promise<AdminCommunityMessengerDashboard> {
  const [{ rooms, participants }, requestData, callData, reportData, sessionData, sessionParticipantData, auditData] = await Promise.all([
    getRoomsAndParticipants(),
    (sb() as any)
      .from("community_friend_requests")
      .select("id, requester_id, addressee_id, status, note, admin_note, created_at, responded_at, handled_by_admin_id, handled_at")
      .order("created_at", { ascending: false })
      .limit(100),
    (sb() as any)
      .from("community_messenger_call_logs")
      .select("id, session_id, room_id, caller_user_id, peer_user_id, call_kind, status, duration_seconds, started_at, ended_at, created_at")
      .order("started_at", { ascending: false })
      .limit(100),
    (sb() as any)
      .from("community_messenger_reports")
      .select("id, report_type, room_id, message_id, reported_user_id, reporter_user_id, reason_type, reason_detail, status, admin_note, assigned_admin_id, handled_at, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(100),
    (sb() as any)
      .from("community_messenger_call_sessions")
      .select("id, room_id, initiator_user_id, recipient_user_id, session_mode, call_kind, status, started_at, answered_at, ended_at, created_at")
      .in("status", ["ringing", "active"])
      .order("created_at", { ascending: false })
      .limit(40),
    (sb() as any)
      .from("community_messenger_call_session_participants")
      .select("id, session_id, room_id, user_id, participation_status, joined_at, left_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    (sb() as any)
      .from("audit_logs")
      .select("id, actor_type, actor_id, target_type, target_id, action, before_json, after_json, ip, created_at")
      .eq("target_type", "community_messenger_call_session")
      .eq("action", "admin.force_end_call_session")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const roomIds = rooms.map((room) => room.id);
  const participantsByRoom = new Map<string, ParticipantRow[]>();
  for (const participant of participants) {
    const list = participantsByRoom.get(participant.room_id) ?? [];
    list.push(participant);
    participantsByRoom.set(participant.room_id, list);
  }

  const requestRows = (requestData.data ?? []) as RequestRow[];
  const callRows = (callData.data ?? []) as CallRow[];
  const reportRows = (reportData.data ?? []) as ReportRow[];
  const sessionRows = (sessionData.data ?? []) as CallSessionRow[];
  const sessionParticipantRows = (sessionParticipantData.data ?? []) as CallSessionParticipantRow[];
  const auditRows = (auditData.data ?? []) as AuditRow[];
  const userIds = [
    ...rooms.flatMap((room) => [room.created_by ?? ""]),
    ...participants.map((participant) => participant.user_id),
    ...requestRows.flatMap((row) => [row.requester_id, row.addressee_id, row.handled_by_admin_id ?? ""]),
    ...callRows.flatMap((row) => [row.caller_user_id, row.peer_user_id ?? ""]),
    ...sessionRows.flatMap((row) => [row.initiator_user_id, row.recipient_user_id ?? ""]),
    ...sessionParticipantRows.map((row) => row.user_id),
    ...reportRows.flatMap((row) => [row.reported_user_id ?? "", row.reporter_user_id, row.assigned_admin_id ?? ""]),
    ...auditRows.map((row) => row.actor_id ?? ""),
  ];
  const profileMap = await getProfileMap(userIds);

  const roomSummaries = rooms.map((room) =>
    mapRoomSummary(room, participantsByRoom.get(room.id) ?? [], profileMap)
  );
  const roomMap = new Map(roomSummaries.map((room) => [room.id, room]));
  const sessionMap = new Map(sessionRows.map((session) => [session.id, session]));
  const participantsBySession = new Map<string, CallSessionParticipantRow[]>();
  for (const participant of sessionParticipantRows) {
    const list = participantsBySession.get(participant.session_id) ?? [];
    list.push(participant);
    participantsBySession.set(participant.session_id, list);
  }

  const requests = requestRows.map((row) => ({
    id: row.id,
    requesterId: row.requester_id,
    requesterLabel: labelForProfile(profileMap.get(row.requester_id), row.requester_id),
    addresseeId: row.addressee_id,
    addresseeLabel: labelForProfile(profileMap.get(row.addressee_id), row.addressee_id),
    status: row.status,
    note: t(row.note),
    adminNote: t(row.admin_note),
    createdAt: row.created_at,
    respondedAt: row.responded_at ?? null,
    handledByAdminId: row.handled_by_admin_id ?? null,
    handledByAdminLabel: row.handled_by_admin_id
      ? labelForProfile(profileMap.get(row.handled_by_admin_id), row.handled_by_admin_id)
      : "-",
    handledAt: row.handled_at ?? null,
  }));

  const calls = callRows.map((row) => mapCallLog(row, roomMap, profileMap, sessionMap, participantsBySession));
  const activeCalls = sessionRows.map((row) =>
    mapActiveCallSession(row, roomMap, profileMap, participantsBySession.get(row.id) ?? [])
  );
  const callAudits = auditRows.map((row) => mapCallAuditLog(row, roomMap, profileMap));
  const reports = reportRows.map((row) => mapReport(row, roomMap, profileMap));
  const forceEndTotal = callAudits.length;
  const forceEndReasonCounts = new Map<string, number>();
  for (const audit of callAudits) {
    const reasonCode = t(audit.reasonCode) || "other";
    forceEndReasonCounts.set(reasonCode, (forceEndReasonCounts.get(reasonCode) ?? 0) + 1);
  }
  const forceEndReasonStats = COMMUNITY_MESSENGER_CALL_FORCE_END_REASONS.map((reason) => {
    const count = forceEndReasonCounts.get(reason.code) ?? 0;
    return {
      code: reason.code,
      label: reason.label,
      count,
      share: forceEndTotal > 0 ? count / forceEndTotal : 0,
    };
  }).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ko-KR"));
  const forceEndTrendStats = buildForceEndTrendStats(callAudits);
  const forceEndAdminCounts = new Map<string, number>();
  for (const audit of callAudits) {
    const adminLabel = t(audit.actorLabel) || "관리자 미상";
    forceEndAdminCounts.set(adminLabel, (forceEndAdminCounts.get(adminLabel) ?? 0) + 1);
  }
  const forceEndAdminStats = [...forceEndAdminCounts.entries()]
    .map(([adminLabel, count]) => ({
      adminLabel,
      count,
      share: forceEndTotal > 0 ? count / forceEndTotal : 0,
    }))
    .sort((left, right) => right.count - left.count || left.adminLabel.localeCompare(right.adminLabel, "ko-KR"))
    .slice(0, 8);

  return {
    stats: {
      totalRooms: roomSummaries.length,
      activeRooms: roomSummaries.filter((room) => room.roomStatus === "active").length,
      blockedRooms: roomSummaries.filter((room) => room.roomStatus === "blocked").length,
      archivedRooms: roomSummaries.filter((room) => room.roomStatus === "archived").length,
      readonlyRooms: roomSummaries.filter((room) => room.isReadonly).length,
      directRooms: roomSummaries.filter((room) => room.roomType === "direct").length,
      groupRooms: roomSummaries.filter((room) => room.roomType === "group").length,
      pendingRequests: requests.filter((request) => request.status === "pending").length,
      totalCalls: calls.length,
      activeCallSessions: activeCalls.length,
      activeGroupCallSessions: activeCalls.filter((call) => call.sessionMode === "group").length,
      openReports: reports.filter((report) => report.status === "received" || report.status === "reviewing").length,
      forceEndTotal,
    },
    forceEndReasonStats,
    forceEndTrendStats,
    forceEndAdminStats,
    rooms: roomSummaries,
    requests,
    calls,
    activeCalls,
    callAudits,
    reports,
  };
}

export async function getAdminCommunityMessengerRoomDetail(
  roomId: string
): Promise<AdminCommunityMessengerRoomDetail | null> {
  const { data: roomData } = await (sb() as any)
    .from("community_messenger_rooms")
    .select(
      "id, room_type, room_status, is_readonly, title, avatar_url, created_by, last_message, last_message_at, last_message_type, created_at, updated_at, admin_note, moderated_by, moderated_at"
    )
    .eq("id", roomId)
    .maybeSingle();
  const room = roomData as RoomRow | null;
  if (!room) return null;

  const [{ data: participantData }, { data: messageData }, { data: callData }, { data: reportData }, { data: sessionData }, { data: sessionParticipantData }, { data: auditData }] = await Promise.all([
    (sb() as any)
      .from("community_messenger_participants")
      .select("id, room_id, user_id, role, unread_count, joined_at, last_read_at")
      .eq("room_id", roomId),
    (sb() as any)
      .from("community_messenger_messages")
      .select("id, room_id, sender_id, message_type, content, metadata, created_at, is_hidden_by_admin")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(300),
    (sb() as any)
      .from("community_messenger_call_logs")
      .select("id, session_id, room_id, caller_user_id, peer_user_id, call_kind, status, duration_seconds, started_at, ended_at, created_at")
      .eq("room_id", roomId)
      .order("started_at", { ascending: false })
      .limit(80),
    (sb() as any)
      .from("community_messenger_reports")
      .select("id, report_type, room_id, message_id, reported_user_id, reporter_user_id, reason_type, reason_detail, status, admin_note, assigned_admin_id, handled_at, created_at, updated_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(120),
    (sb() as any)
      .from("community_messenger_call_sessions")
      .select("id, room_id, initiator_user_id, recipient_user_id, session_mode, call_kind, status, started_at, answered_at, ended_at, created_at")
      .eq("room_id", roomId)
      .in("status", ["ringing", "active"])
      .order("created_at", { ascending: false })
      .limit(20),
    (sb() as any)
      .from("community_messenger_call_session_participants")
      .select("id, session_id, room_id, user_id, participation_status, joined_at, left_at, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(80),
    (sb() as any)
      .from("audit_logs")
      .select("id, actor_type, actor_id, target_type, target_id, action, before_json, after_json, ip, created_at")
      .eq("target_type", "community_messenger_call_session")
      .eq("action", "admin.force_end_call_session")
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  const participants = (participantData ?? []) as ParticipantRow[];
  const messages = (messageData ?? []) as MessageRow[];
  const calls = (callData ?? []) as CallRow[];
  const reports = (reportData ?? []) as ReportRow[];
  const sessions = (sessionData ?? []) as CallSessionRow[];
  const sessionParticipants = (sessionParticipantData ?? []) as CallSessionParticipantRow[];
  const auditRows = ((auditData ?? []) as AuditRow[]).filter((row) => {
    const beforeRoomId = t(row.before_json?.roomId);
    const afterRoomId = t(row.after_json?.roomId);
    return beforeRoomId === roomId || afterRoomId === roomId;
  });
  const profileIds = [
    room.created_by ?? "",
    room.moderated_by ?? "",
    ...participants.map((participant) => participant.user_id),
    ...messages.map((message) => message.sender_id ?? ""),
    ...calls.flatMap((call) => [call.caller_user_id, call.peer_user_id ?? ""]),
    ...sessions.flatMap((session) => [session.initiator_user_id, session.recipient_user_id ?? ""]),
    ...sessionParticipants.map((participant) => participant.user_id),
    ...reports.flatMap((report) => [report.reported_user_id ?? "", report.reporter_user_id, report.assigned_admin_id ?? ""]),
    ...auditRows.map((row) => row.actor_id ?? ""),
  ];
  const profileMap = await getProfileMap(profileIds);
  const summary = mapRoomSummary(room, participants, profileMap);
  const roomMap = new Map([[room.id, summary]]);
  const sessionMap = new Map(sessions.map((session) => [session.id, session]));
  const participantsBySession = new Map<string, CallSessionParticipantRow[]>();
  for (const participant of sessionParticipants) {
    const list = participantsBySession.get(participant.session_id) ?? [];
    list.push(participant);
    participantsBySession.set(participant.session_id, list);
  }
  const reportCountByMessageId = new Map<string, number>();
  for (const report of reports) {
    if (!report.message_id) continue;
    reportCountByMessageId.set(report.message_id, (reportCountByMessageId.get(report.message_id) ?? 0) + 1);
  }

  return {
    room: {
      ...summary,
      moderatedByLabel: room.moderated_by
        ? labelForProfile(profileMap.get(room.moderated_by), room.moderated_by)
        : "-",
      moderatedAt: room.moderated_at ?? null,
    },
    participants: participants.map((participant) => ({
      id: participant.id,
      userId: participant.user_id,
      label: labelForProfile(profileMap.get(participant.user_id), participant.user_id),
      role: participant.role,
      unreadCount: Number(participant.unread_count ?? 0),
      joinedAt: participant.joined_at ?? null,
      lastReadAt: participant.last_read_at ?? null,
    })),
    messages: messages.map((message) => ({
      id: message.id,
      senderId: message.sender_id,
      senderLabel: message.sender_id
        ? labelForProfile(profileMap.get(message.sender_id), message.sender_id)
        : "시스템",
      messageType: message.message_type,
      content: t(message.content),
      createdAt: t(message.created_at),
      isHiddenByAdmin: message.is_hidden_by_admin === true,
      reportCount: reportCountByMessageId.get(message.id) ?? 0,
    })),
    calls: calls.map((call) => mapCallLog(call, roomMap, profileMap, sessionMap, participantsBySession)),
    activeCalls: sessions.map((session) =>
      mapActiveCallSession(session, roomMap, profileMap, participantsBySession.get(session.id) ?? [])
    ),
    callAudits: auditRows.map((row) => mapCallAuditLog(row, roomMap, profileMap)),
    reports: reports.map((report) => mapReport(report, roomMap, profileMap)),
  };
}

export async function runAdminCommunityMessengerRoomAction(input: {
  roomId: string;
  adminUserId: string;
  action: "block_room" | "unblock_room" | "archive_room" | "unarchive_room" | "readonly_on" | "readonly_off";
  note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const note = t(input.note);
  const patch: Record<string, unknown> = {
    moderated_by: input.adminUserId,
    moderated_at: now,
    admin_note: note,
    updated_at: now,
  };
  if (input.action === "block_room") patch.room_status = "blocked";
  if (input.action === "unblock_room") patch.room_status = "active";
  if (input.action === "archive_room") patch.room_status = "archived";
  if (input.action === "unarchive_room") patch.room_status = "active";
  if (input.action === "readonly_on") patch.is_readonly = true;
  if (input.action === "readonly_off") patch.is_readonly = false;

  const { error } = await (sb() as any)
    .from("community_messenger_rooms")
    .update(patch)
    .eq("id", input.roomId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function runAdminCommunityMessengerCallSessionAction(input: {
  sessionId: string;
  adminUserId: string;
  action: "force_end";
  reasonCode?: CommunityMessengerCallForceEndReasonCode;
  adminNote?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const note = t(input.adminNote);
  const reasonCode = t(input.reasonCode);
  if (!note) {
    return { ok: false, error: "admin_note_required" };
  }
  if (!isCommunityMessengerCallForceEndReasonCode(reasonCode)) {
    return { ok: false, error: "reason_code_required" };
  }
  const { data: sessionData, error: sessionError } = await (sb() as any)
    .from("community_messenger_call_sessions")
    .select("id, room_id, initiator_user_id, recipient_user_id, session_mode, call_kind, status, started_at, answered_at, ended_at, created_at")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (sessionError) return { ok: false, error: sessionError.message };
  if (!sessionData) return { ok: false, error: "session_not_found" };
  const session = sessionData as CallSessionRow;
  const { data: participantData } = await (sb() as any)
    .from("community_messenger_call_session_participants")
    .select("id, session_id, room_id, user_id, participation_status, joined_at, left_at, created_at")
    .eq("session_id", input.sessionId);
  const participants = (participantData ?? []) as CallSessionParticipantRow[];
  if (session.status === "ended" || session.status === "rejected" || session.status === "missed" || session.status === "cancelled") {
    return { ok: false, error: "already_finished" };
  }

  const { error: updateSessionError } = await (sb() as any)
    .from("community_messenger_call_sessions")
    .update({
      status: "ended",
      ended_at: now,
      updated_at: now,
    })
    .eq("id", input.sessionId);
  if (updateSessionError) return { ok: false, error: updateSessionError.message };

  const { error: participantError } = await (sb() as any)
    .from("community_messenger_call_session_participants")
    .update({
      participation_status: "left",
      left_at: now,
    })
    .eq("session_id", input.sessionId)
    .in("participation_status", ["invited", "joined"]);
  if (participantError) return { ok: false, error: participantError.message };

  const { data: existingLog } = await (sb() as any)
    .from("community_messenger_call_logs")
    .select("id")
    .eq("session_id", input.sessionId)
    .maybeSingle();
  if (!existingLog) {
    const logResult = await createCommunityMessengerCallLog({
      userId: session.initiator_user_id,
      roomId: session.room_id,
      sessionId: session.id,
      peerUserId: (session.session_mode ?? "direct") === "direct" ? session.recipient_user_id : null,
      callKind: session.call_kind,
      status: "ended",
      durationSeconds: 0,
    });
    if (!logResult.ok) return logResult;
  }

  if (note) {
    await (sb() as any)
      .from("community_messenger_rooms")
      .update({
        admin_note: note,
        moderated_by: input.adminUserId,
        moderated_at: now,
        updated_at: now,
      })
      .eq("id", session.room_id);
  }
  await appendAuditLog(sb() as any, {
    actor_type: "admin",
    actor_id: input.adminUserId,
    target_type: "community_messenger_call_session",
    target_id: session.id,
    action: "admin.force_end_call_session",
    before_json: {
      sessionId: session.id,
      roomId: session.room_id,
      status: session.status,
      callKind: session.call_kind,
      sessionMode: session.session_mode ?? "direct",
      participantCount: participants.length,
      participantStatuses: participants.map((item) => ({
        userId: item.user_id,
        status: item.participation_status,
      })),
      reasonCode,
      adminNote: note || null,
    },
    after_json: {
      sessionId: session.id,
      roomId: session.room_id,
      status: "ended",
      callKind: session.call_kind,
      sessionMode: session.session_mode ?? "direct",
      participantCount: participants.length,
      participantStatuses: participants.map((item) => ({
        userId: item.user_id,
        status: item.participation_status === "rejected" ? "rejected" : "left",
      })),
      reasonCode,
      reasonLabel: getCommunityMessengerCallForceEndReasonLabel(reasonCode),
      adminNote: note || null,
      forcedEndedAt: now,
    },
  });
  return { ok: true };
}

export async function runAdminCommunityMessengerFriendRequestAction(input: {
  requestId: string;
  adminUserId: string;
  status: CommunityMessengerFriendRequestStatus;
  adminNote?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await (sb() as any)
    .from("community_friend_requests")
    .update({
      status: input.status,
      admin_note: t(input.adminNote),
      handled_by_admin_id: input.adminUserId,
      handled_at: now,
      responded_at: input.status === "pending" ? null : now,
    })
    .eq("id", input.requestId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function runAdminCommunityMessengerMessageAction(input: {
  roomId: string;
  messageId: string;
  hidden: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await (sb() as any)
    .from("community_messenger_messages")
    .update({ is_hidden_by_admin: input.hidden })
    .eq("room_id", input.roomId)
    .eq("id", input.messageId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function runAdminCommunityMessengerReportAction(input: {
  reportId: string;
  adminUserId: string;
  action: "reviewing" | "resolved" | "rejected" | "sanction_message_hide" | "sanction_room_block";
  adminNote?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { data: reportData, error: reportError } = await (sb() as any)
    .from("community_messenger_reports")
    .select("id, report_type, room_id, message_id")
    .eq("id", input.reportId)
    .maybeSingle();
  if (reportError) return { ok: false, error: reportError.message };
  if (!reportData) return { ok: false, error: "report_not_found" };

  if (input.action === "sanction_message_hide" && reportData.message_id) {
    const msgResult = await runAdminCommunityMessengerMessageAction({
      roomId: reportData.room_id,
      messageId: reportData.message_id,
      hidden: true,
    });
    if (!msgResult.ok) return msgResult;
  }

  if (input.action === "sanction_room_block" && reportData.room_id) {
    const roomResult = await runAdminCommunityMessengerRoomAction({
      roomId: reportData.room_id,
      adminUserId: input.adminUserId,
      action: "block_room",
      note: input.adminNote,
    });
    if (!roomResult.ok) return roomResult;
  }

  const nextStatus =
    input.action === "reviewing"
      ? "reviewing"
      : input.action === "rejected"
        ? "rejected"
        : input.action === "resolved"
          ? "resolved"
          : "sanctioned";

  const { error } = await (sb() as any)
    .from("community_messenger_reports")
    .update({
      status: nextStatus,
      admin_note: t(input.adminNote),
      assigned_admin_id: input.adminUserId,
      handled_at: now,
      updated_at: now,
    })
    .eq("id", input.reportId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
