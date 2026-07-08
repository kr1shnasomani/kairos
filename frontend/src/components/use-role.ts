"use client";

import { useEffect, useState } from "react";
import { getMe } from "@/lib/auth";
import type { Role } from "@/lib/types";

// Dev-bypass default: with no token the backend treats the caller as an engineer,
// so an unauthenticated demo session still sees engineer-level actions.
export function useRole(): Role {
  const [role, setRole] = useState<Role>("engineer");
  useEffect(() => {
    getMe().then((u) => {
      if (u?.role) setRole(u.role);
    });
  }, []);
  return role;
}

/** Roles allowed to promote a quarantine item. */
export const PROMOTE_ROLES: Role[] = ["reliability", "admin", "engineer"];
/** Roles allowed to resolve conflicts and deviation flags. */
export const RESOLVE_ROLES: Role[] = ["engineer", "reliability", "admin"];
/** Roles with admin-level access (model gate, plant state, MDM bootstrap). */
export const ADMIN_ROLES: Role[] = ["admin"];
/** Field worker personas — mobile-first, read-only on staff surfaces. */
export const FIELD_ROLES: Role[] = ["field_worker"];
