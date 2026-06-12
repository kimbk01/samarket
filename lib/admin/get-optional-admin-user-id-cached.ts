import { cache } from "react";
import { getOptionalAdminUserId } from "@/lib/admin/require-admin-api";

/** 동일 RSC 요청 안에서 layout·page가 중복 호출해도 auth·session·profiles 검증 1회만 */
export const getOptionalAdminUserIdCached = cache(getOptionalAdminUserId);
