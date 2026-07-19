"use client";

import Link from "next/link";
import { useRole, ADMIN_ROLES } from "@/components/use-role";

// MDM identity confirmation is an admin-only action (Layer 1). Hidden for
// engineers/reliability/field_worker so a field worker never sees a bootstrap
// action they can't perform.
export function IdentityConfirmAction() {
  const role = useRole();
  if (!ADMIN_ROLES.includes(role)) return null;
  return (
    <Link
      href="/assets/bootstrap"
      className="inline-flex h-9 items-center rounded-lg border border-line px-3.5 text-body font-semibold text-ink transition-colors hover:bg-surface-2"
    >
      Identity confirmation
    </Link>
  );
}
