/**
 * Route Handler에서 현재 사용자 UUID.
 * `getOptionalAuthenticatedUserId` 와 동일 — JWT·인플라이트 dedupe 단일 경로.
 *
 * Kasama: `get-optional-authenticated-user-id` — api-route 그래프 미포함.
 */
export { getOptionalAuthenticatedUserId as getRouteUserId } from "@/lib/auth/get-optional-authenticated-user-id";
