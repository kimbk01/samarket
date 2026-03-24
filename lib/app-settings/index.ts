/**
 * 앱 전역에서 사용하는 운영설정 (어드민 설정 관리와 연동)
 * - 어드민에서 변경한 값이 웹(글쓰기, 상세, 채팅 등)에 반영됨
 */
export { getAppSettings } from "@/lib/admin-settings/mock-app-settings";
export type { AppSettings } from "@/lib/types/admin-settings";
