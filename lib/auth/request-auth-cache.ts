/**
 * 동일 서버 요청 수명 내 `getOptionalRouteHandlerCookieAuth` 단일 비행.
 * 구현은 `get-optional-authenticated-user-id` 의 `React.cache()` 래핑에 위임한다.
 */
export {
  getOptionalRouteHandlerCookieAuth as getRequestScopedRouteHandlerCookieAuth,
} from "@/lib/auth/get-optional-authenticated-user-id";
