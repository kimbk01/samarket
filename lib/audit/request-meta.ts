/** 프록시 뒤 클라이언트 IP·UA (감사 로그용) */
export function getAuditRequestMeta(req: Request): {
  ip: string | null;
  userAgent: string | null;
} {
  const xff = req.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  const real = req.headers.get("x-real-ip")?.trim();
  const ip = first || real || null;
  const userAgent = req.headers.get("user-agent")?.trim().slice(0, 500) || null;
  return { ip, userAgent };
}
