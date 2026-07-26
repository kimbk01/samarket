/**
 * Legacy `/my/business/**` — redirect-only subtree.
 * DO NOT mount StoreBusinessGuard / BusinessAdminShell here (Owner shell lives under `/stores/owner`).
 */
export default function MyBusinessLegacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
