/**
 * 설계 v4 §7 「기술 정보」 — 원시 ID·UUID 표시(복사 버튼)·접이식 기술 정보 블록 문구.
 * admin.ts 와 별도(타입 직렬화 한계 TS7056 회피).
 */
export const adminTechInfoMessages = {
  ko: {
    admin_tech_info_title: "기술 정보",
    admin_tech_id_copy: "복사",
    admin_tech_id_copied: "복사됨",
    admin_tech_id_copy_failed: "복사 실패",
    admin_tech_id_copy_aria: "ID 복사: {id}",
  },
  en: {
    admin_tech_info_title: "Technical details",
    admin_tech_id_copy: "Copy",
    admin_tech_id_copied: "Copied",
    admin_tech_id_copy_failed: "Copy failed",
    admin_tech_id_copy_aria: "Copy ID: {id}",
  },
} as const;
