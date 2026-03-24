/**
 * 어드민 인증 모듈 (분리 관리)
 * - constants: 스토리지 키 등
 * - storage: 로그인 ID 읽기/쓰기
 * - role: 역할·권한 해석
 */

export { ADMIN_STORAGE_KEY, LOGIN_ID_MAX_LENGTH } from "./constants";
export {
  getCurrentAdminLoginId,
  setAdminTestLoginAndReload,
} from "./storage";
export {
  getAdminRole,
  getCurrentAdminStaff,
  getRoleLevel,
} from "./role";
