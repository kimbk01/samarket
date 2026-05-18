import { NotFoundClient } from "@/components/app/NotFoundClient";

/**
 * Root layout still wraps this route (no raw html/body here).
 * See global-error.tsx when the root layout fails.
 */
export default function NotFound() {
  return <NotFoundClient />;
}
