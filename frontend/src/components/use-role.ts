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

/** Roles allowed to promote a quarantine item (backend require_role). */
export const PROMOTE_ROLES: Role[] = ["reliability", "admin", "engineer"];
