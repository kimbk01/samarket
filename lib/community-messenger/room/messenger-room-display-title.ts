/**
 * 메신저 방 제목 — 서버가 채운 대체 제목(저장·응답 언어 고정)을 보는 사람 언어로 다시 그린다.
 * 설계 `docs/audit/i18n-postmerge-fix-design-2026-11-27.md` §2 E4③·M2.
 *
 * 사람이 정한 제목은 그대로 둔다. 대체 제목은 **방 종류와 정확한 틀**이 모두 맞을 때만 키로 바꾼다.
 * - 1:1: 「새 대화」(`cm_ui_new_conversation`) · 「회원 {6자}」(`cm_svc_member_fallback`)
 * - 비공개 그룹: 「그룹 N명」(`cm_svc_group_members`, N 은 저장 값)
 *   · 「A, B 외 N명」(`cm_svc_group_and_more`, 이름 목록·N 은 저장 값 — 이름은 그대로)
 * - 공개 그룹(오픈채팅): 「오픈채팅」(`cm_svc_open_group_room`) · 예전 「공개 그룹방」(`cm_svc_open_group_room_legacy`)
 * 그룹 방에 사람이 「새 대화」라고 이름을 붙였으면 그대로다(1:1 만 대응).
 */
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { CommunityMessengerRoomType } from "@/lib/community-messenger/types";

export type MessengerRoomTitleDisplayKey = {
  key: MessageKey;
  vars?: Record<string, string | number>;
};

type TitleTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const LANGS = ["ko", "en"] as const;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 카탈로그 틀(ko·en)에서 정확한 정규식 — 치환값 자리만 `valuePattern` */
function templatePatterns(key: MessageKey, varName: string, valuePattern: string): RegExp[] {
  const marker = "\u0000VALUE\u0000";
  return LANGS.map((lang) => {
    const filled = translate(lang, key, { [varName]: marker });
    const source = escapeRegExp(filled).replace(escapeRegExp(marker), `(${valuePattern})`);
    return new RegExp(`^${source}$`, "i");
  });
}

/** 치환값 2개 틀 — `{labels}`(이름 목록)·`{extra}`(숫자). 그룹(1)=labels, 그룹(2)=extra */
function andMorePatterns(): RegExp[] {
  const labelsMarker = "\u0000LABELS\u0000";
  const extraMarker = "\u0000EXTRA\u0000";
  return LANGS.map((lang) => {
    const filled = translate(lang, "cm_svc_group_and_more", { labels: labelsMarker, extra: extraMarker });
    const source = escapeRegExp(filled)
      .replace(escapeRegExp(labelsMarker), "(.+?)")
      .replace(escapeRegExp(extraMarker), "(\\d{1,4})");
    return new RegExp(`^${source}$`, "i");
  });
}

type Matchers = {
  directDefault: Set<string>;
  openGroup: Set<string>;
  member: RegExp[];
  groupMembers: RegExp[];
  groupAndMore: RegExp[];
};

let matchers: Matchers | null = null;

function fixedTitles(...keys: MessageKey[]): Set<string> {
  return new Set(
    keys.flatMap((key) => [...LANGS.map((lang) => translate(lang, key)), key]).map((v) => v.trim().toLowerCase())
  );
}

function getMatchers(): Matchers {
  if (!matchers) {
    matchers = {
      directDefault: fixedTitles("cm_ui_new_conversation"),
      /** 예전 대체 제목 「공개 그룹방」·「Open group」(이미 저장된 방)도 알아본다 — 이름을 「오픈채팅」으로 바꿈 (모임 R4 §1) */
      openGroup: fixedTitles("cm_svc_open_group_room", "cm_svc_open_group_room_legacy"),
      member: templatePatterns("cm_svc_member_fallback", "id", "[0-9a-f]{6}"),
      groupMembers: templatePatterns("cm_svc_group_members", "count", "\\d{1,4}"),
      groupAndMore: andMorePatterns(),
    };
  }
  return matchers;
}

function firstCapture(patterns: RegExp[], text: string): string | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** 대체 제목이면 키·값, 사람이 정한 제목·빈 제목이면 null */
export function messengerRoomTitleDisplayKey(room: {
  title?: string | null;
  roomType?: CommunityMessengerRoomType | string | null;
}): MessengerRoomTitleDisplayKey | null {
  const text = typeof room.title === "string" ? room.title.trim() : "";
  if (!text) return null;
  const m = getMatchers();
  if (room.roomType === "direct") {
    if (m.directDefault.has(text.toLowerCase())) return { key: "cm_ui_new_conversation" };
    const id = firstCapture(m.member, text);
    return id ? { key: "cm_svc_member_fallback", vars: { id: id.toLowerCase() } } : null;
  }
  if (room.roomType === "open_group") {
    return m.openGroup.has(text.toLowerCase()) ? { key: "cm_svc_open_group_room" } : null;
  }
  if (room.roomType === "private_group") {
    const count = firstCapture(m.groupMembers, text);
    if (count) return { key: "cm_svc_group_members", vars: { count: Number(count) } };
    for (const re of m.groupAndMore) {
      const hit = re.exec(text);
      if (hit?.[1] && hit[2]) return { key: "cm_svc_group_and_more", vars: { labels: hit[1], extra: Number(hit[2]) } };
    }
    return null;
  }
  return null;
}

/** 화면 표시 제목 — 대체 제목은 보는 사람 언어 키, 그 외는 저장 제목 그대로 */
export function resolveMessengerRoomDisplayTitle(
  room: { title?: string | null; roomType?: CommunityMessengerRoomType | string | null },
  t: TitleTranslate
): string {
  const display = messengerRoomTitleDisplayKey(room);
  if (display) return t(display.key, display.vars);
  return typeof room.title === "string" ? room.title : "";
}
