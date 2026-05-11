/**
 * Route / Server Component 공통 세션 헬퍼.
 * - optional 경로: `get-optional-authenticated-user-id` (api-route/Redis 그래프 없음)
 * - require 경로: `api-session-require` (jsonError → api-route)
 */
export {
  getOptionalAuthenticatedUserId,
  getOptionalAuthenticatedUserIdPreferSession,
  getOptionalAuthenticatedUserIdStrict,
} from "@/lib/auth/get-optional-authenticated-user-id";
export {
  requireAuthenticatedUserId,
  requireAuthenticatedUserIdPreferSession,
  requireAuthenticatedUserIdStrict,
} from "@/lib/auth/api-session-require";
