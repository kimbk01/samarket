/** Push route navigation policy — shared by PushRouteListener. */

export function shouldReplaceRoute(path: string): boolean {
  return (
    /^\/community-messenger\/calls\/[^/?#]+/.test(path) &&
    (path.includes("action=accept") || path.includes("callAction=accept"))
  );
}
