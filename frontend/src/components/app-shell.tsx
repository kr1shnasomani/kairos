"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle, ContrastToggle } from "./theme-toggle";
import { getMe, logout } from "@/lib/auth";
import { getToken, getGovernorState, getPlantState } from "@/lib/api";
import { flushQueue, getQueueLength } from "@/lib/idb";
import type { Role, User, GovernorEventState, PlantState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PhaseBadge } from "./ui";

// Staff surfaces (Assure group + RCA) are hidden from field workers. Dev-bypass (no session)
// defaults to engineer, so an unauthenticated demo still sees everything.
const STAFF: Role[] = ["engineer", "reliability", "admin"];

type IconName =
  | "briefs" | "copilot" | "assets" | "rca" | "compliance"
  | "management" | "governance" | "documents" | "search" | "menu" | "close" | "graph" | "audit";

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
    graph: <><circle cx="5" cy="12" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><path d="M7 11.5l10-5M7 12.5l10 5" /></>,
    audit: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M10 13h4M10 17h4M8 9h.01" /></>,
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
      { href: "/graph", label: "Graph", icon: "graph", roles: STAFF },
    ],
  },
  {
    group: "Assure",
    items: [
      { href: "/compliance", label: "Compliance", icon: "compliance", roles: STAFF },
      { href: "/governance", label: "Governance", icon: "governance", roles: STAFF },
      { href: "/audit", label: "Audit trail", icon: "audit", roles: STAFF },
      { href: "/documents", label: "Documents", icon: "documents", roles: STAFF },
      { href: "/management", label: "Overview", icon: "management", roles: STAFF },
    ],
  },
];

function KairosMark({ size = 30 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.jpeg" alt="Kairos" className="rounded-lg object-cover" style={{ width: size, height: size }} aria-hidden="true" />
  );
}

function GovernorPill({ userId }: { userId: string }) {
  const [gov, setGov] = useState<GovernorEventState | null>(null);
  useEffect(() => {
    let alive = true;
    getGovernorState(userId).then((r) => { if (alive && r.data) setGov(r.data); });
    return () => { alive = false; };
  }, [userId]);
  if (!gov) return null;
  const suppressed = gov.state === "suppressed";
  return (
    <div
      title={`Governor: ${gov.push_count_last_hour}/${gov.ceiling} briefs/hr`}
      className={cn(
        "mx-3 my-1 flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px]",
        suppressed
          ? "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-danger"
          : "bg-surface-2 text-muted",
      )}
    >
      <span className="font-semibold">{suppressed ? "Governor · suppressed" : "Governor · active"}</span>
      <span className="tabular font-medium">{gov.push_count_last_hour}/{gov.ceiling}</span>
    </div>
  );
}

function SidebarContent({ onNavigate, role, user, onSignOut, queueCount }: { onNavigate?: () => void; role: Role; user: User | null; onSignOut: () => void; queueCount: number }) {
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
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <KairosMark />
          <span className="text-[15px] font-semibold tracking-tight">Kairos</span>
        </div>
        <PhaseBadge />
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

      {user && <GovernorPill userId={user.user_id} />}

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
        <div className="flex items-center gap-1">
          {queueCount > 0 && (
            <span
              title={`${queueCount} write${queueCount !== 1 ? "s" : ""} queued offline`}
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--caution)_18%,transparent)] px-1 text-[10px] font-bold text-caution"
              aria-label={`${queueCount} pending sync`}
            >
              {queueCount}
            </span>
          )}
          <ContrastToggle />
          <ThemeToggle />
          <button
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Bottom tab bar for field workers — thumb-reachable, ≥44px targets. */
function FieldBottomTabs({ pathname, onSignOut }: { pathname: string; onSignOut: () => void }) {
  const tabs = [
    { href: "/briefs", label: "Briefs", icon: "briefs" as IconName },
    { href: "/copilot", label: "Copilot", icon: "copilot" as IconName },
    { href: "/assets", label: "Assets", icon: "assets" as IconName },
    { href: "/field/voice", label: "Voice", icon: "search" as IconName },
  ] as const;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface"
      aria-label="Field navigation"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors",
              active ? "text-accent" : "text-muted hover:text-ink",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon name={tab.icon} className="size-5" />
            {tab.label}
          </Link>
        );
      })}
      {/* Me tab */}
      <button
        onClick={onSignOut}
        className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold text-muted transition-colors hover:text-ink"
        aria-label="Sign out"
      >
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
        Me
      </button>
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [plantState, setPlantState] = useState<PlantState | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setAuthed(true);
    getMe().then(setUser);
    // Service worker registration
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // Queue length on load
    getQueueLength().then(setQueueCount);
    // Flush write queue on reconnect
    async function onOnline() {
      await flushQueue();
      const n = await getQueueLength();
      setQueueCount(n);
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [router]);

  useEffect(() => {
    if (user?.site_id) {
      getPlantState(user.site_id).then((r) => {
        if (r.data && r.data.state !== "normal") setPlantState(r.data);
        else setPlantState(null);
      });
    }
  }, [user]);

  const role: Role = user?.role ?? "engineer";
  const isField = role === "field_worker";

  function signOut() {
    logout();
    setUser(null);
    router.replace("/login");
  }

  if (authed !== true) return null;

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar — all roles */}
      <aside className="hidden w-[244px] shrink-0 border-r border-line bg-surface md:block">
        <div className="sticky top-0 h-dvh">
          <SidebarContent role={role} user={user} onSignOut={signOut} queueCount={queueCount} />
        </div>
      </aside>

      {/* Mobile: field workers get a bottom tab bar, others get a hamburger drawer */}
      {!isField && drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setDrawer(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[244px] border-r border-line bg-surface">
            <SidebarContent onNavigate={() => setDrawer(false)} role={role} user={user} onSignOut={signOut} queueCount={queueCount} />
          </div>
        </div>
      )}

      <div className={cn("flex min-w-0 flex-1 flex-col", isField && "pb-[56px] md:pb-0")}>
        {/* Non-field mobile top bar */}
        {!isField && (
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
        )}

        {/* Plant operating state banner */}
        {plantState && (
          <div
            role="alert"
            className={cn(
              "flex items-center gap-3 px-5 py-2.5 text-[13px] font-semibold",
              plantState.state === "emergency"
                ? "bg-danger text-white"
                : "bg-[color-mix(in_srgb,var(--caution)_18%,var(--surface))] text-caution",
            )}
          >
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-current" aria-hidden="true" />
            {plantState.state.charAt(0).toUpperCase() + plantState.state.slice(1)} mode active
            {" — only critical briefs are being delivered"}
          </div>
        )}
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Field bottom tab bar — mobile only */}
      {isField && (
        <div className="md:hidden">
          <FieldBottomTabs pathname={pathname} onSignOut={signOut} />
        </div>
      )}
    </div>
  );
}
