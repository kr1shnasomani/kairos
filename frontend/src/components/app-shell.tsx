"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "./theme-toggle";
import { getMe } from "@/lib/auth";
import type { Role, User } from "@/lib/types";
import { cn } from "@/lib/utils";

// Staff surfaces (Assure group + RCA) are hidden from field workers. Dev-bypass (no session)
// defaults to engineer, so an unauthenticated demo still sees everything.
const STAFF: Role[] = ["engineer", "reliability", "admin"];

type IconName =
  | "briefs" | "copilot" | "assets" | "rca" | "compliance"
  | "management" | "governance" | "documents" | "search" | "menu" | "close";

function Icon({ name, className = "size-[18px]" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    briefs: <path d="M4 6h16M4 12h16M4 18h10" />,
    copilot: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
    assets: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
    rca: <path d="M3 12h4l3 8 4-16 3 8h4" />,
    compliance: <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />,
    management: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
    governance: <><path d="M12 3v18M5 7l7-2 7 2" /><path d="M5 7l-2 6a3 3 0 0 0 6 0L7 7M19 7l-2 6a3 3 0 0 0 6 0l-2-6" /></>,
    documents: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="M6 6l12 12M18 6L6 18" />,
  };
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

type NavItem = { href: string; label: string; icon: IconName; roles?: Role[] };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Operate",
    items: [
      { href: "/briefs", label: "Briefs", icon: "briefs" },
      { href: "/copilot", label: "Copilot", icon: "copilot" },
      { href: "/assets", label: "Assets", icon: "assets" },
      { href: "/rca", label: "RCA", icon: "rca", roles: STAFF },
    ],
  },
  {
    group: "Assure",
    items: [
      { href: "/compliance", label: "Compliance", icon: "compliance", roles: STAFF },
      { href: "/governance", label: "Governance", icon: "governance", roles: STAFF },
      { href: "/documents", label: "Documents", icon: "documents", roles: STAFF },
      { href: "/management", label: "Overview", icon: "management", roles: STAFF },
    ],
  },
];

function KairosMark({ size = 30 }: { size?: number }) {
  return (
    <span className="grid place-items-center rounded-lg bg-accent" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 26 26" fill="none">
        <path d="M4 15.5 L9 20 L22 5" stroke="var(--on-accent)" strokeWidth="3.4" strokeLinecap="square" />
        <path d="M13 20 L18.5 8 L21.5 20 Z" fill="var(--on-accent)" />
      </svg>
    </span>
  );
}

function SidebarContent({ onNavigate, role, user }: { onNavigate?: () => void; role: Role; user: User | null }) {
  const pathname = usePathname();
  const sections = NAV
    .map((s) => ({ ...s, items: s.items.filter((it) => !it.roles || it.roles.includes(role)) }))
    .filter((s) => s.items.length > 0);

  const email = user?.email ?? null;
  const name = email ? email.split("@")[0] : "Dev user";
  const initials = (email ? email.slice(0, 2) : "DV").toUpperCase();
  const roleLine = user ? `${user.role[0].toUpperCase()}${user.role.slice(1)} · ${user.site_id}` : "Engineer · dev";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <KairosMark />
        <span className="text-[15px] font-semibold tracking-tight">Kairos</span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {sections.map((section) => (
          <div key={section.group}>
            <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              {section.group}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13.5px] transition-colors",
                        active
                          ? "bg-accent-soft font-semibold text-accent"
                          : "text-muted hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      <Icon name={item.icon} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-3">
        <div className="flex min-w-0 items-center gap-2 px-1">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-on-accent">
            {initials}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs font-semibold">{name}</p>
            <p className="truncate text-[11px] text-muted">{roleLine}</p>
          </div>
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    getMe().then(setUser);
  }, []);

  const role: Role = user?.role ?? "engineer";

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-[244px] shrink-0 border-r border-line bg-surface md:block">
        <div className="sticky top-0 h-screen">
          <SidebarContent role={role} user={user} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setDrawer(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[244px] border-r border-line bg-surface">
            <SidebarContent onNavigate={() => setDrawer(false)} role={role} user={user} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
          <button
            className="grid size-9 place-items-center rounded-lg border border-line text-muted"
            aria-label="Open menu"
            onClick={() => setDrawer(true)}
          >
            <Icon name="menu" />
          </button>
          <div className="flex items-center gap-2">
            <KairosMark size={26} />
            <span className="text-sm font-semibold">Kairos</span>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
