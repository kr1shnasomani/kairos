type AppHeaderProps = {
  name: string;
  role: string;
  onOpenSearch: () => void;
  onOpenCalendar: () => void;
  calendarOpen: boolean;
  onCreate: () => void;
  onOpenBriefs: () => void;
  onOpenUser: () => void;
  userInitial: string;
  notificationCount?: number;
};

export function AppHeader({ name, role, onOpenSearch, onOpenCalendar, calendarOpen, onCreate, onOpenBriefs, onOpenUser, userInitial, notificationCount }: AppHeaderProps) {
  const roleLabel = capitalize(role).replace(/_/g, " ");
  const shortcut = getSearchShortcut(typeof navigator === "undefined" ? undefined : navigator.platform);

  return (
    <header className="sticky top-0 z-30 hidden h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-8 shadow-sm lg:flex print:hidden">
      <button type="button" onClick={onOpenSearch} aria-label="Search workspace" className="flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-line bg-page px-3 text-sm text-muted transition-colors hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] hover:text-ink">
        <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
        <span>Search workspace</span>
        <kbd className="ml-auto rounded border border-line bg-surface-2 px-1.5 py-0.5 text-micro">{shortcut}</kbd>
      </button>
      <div className="ml-auto flex items-center gap-3">
        {/* Layer 12: which trust phase the backend is actually enforcing. Operators should be
            able to see whether synthesis and proactive push are live without asking. */}
        <PhaseBadge />
        <button type="button" onClick={onOpenCalendar} aria-label="Open calendar" aria-haspopup="dialog" aria-expanded={calendarOpen} className="grid size-11 place-items-center rounded-xl border border-line bg-page text-ink shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-surface-2"><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 4v4m8-4v4M6 10h12M7 20h10a2 2 0 0 0 2-2V8H5v10a2 2 0 0 0 2 2Z" /><path d="m9 14 2 2 4-4" /></svg></button>
        <button type="button" onClick={onCreate} aria-label="Ingest document" className="grid size-11 place-items-center rounded-xl border border-line bg-page text-ink shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-surface-2"><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
        <button type="button" onClick={onOpenBriefs} aria-label="Open briefs" className="relative grid size-10 place-items-center rounded-lg text-ink transition-colors hover:bg-surface-2"><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>{notificationCount ? <span className="absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-micro font-bold text-white">{notificationCount}</span> : null}</button>
        <button type="button" onClick={onOpenUser} aria-label="Open user menu" className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-surface-2"><span className="grid size-8 place-items-center rounded-full bg-surface-2 text-label font-bold text-muted xl:hidden">{userInitial}</span><span data-testid="account-profile-icon" className="hidden size-8 place-items-center rounded-full bg-surface-2 text-muted xl:grid"><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="3.25" /><path d="M5.5 21a6.5 6.5 0 0 1 13 0" /></svg></span><span className="hidden leading-tight xl:block"><span className="block text-sm font-medium">{name}</span><span className="block text-micro text-muted">{roleLabel}</span></span><svg className="size-3.5 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>
      </div>
    </header>
  );
}
import { PhaseBadge } from "@/components/ui";
import { getSearchShortcut } from "@/lib/search-shortcut";
import { capitalize } from "@/lib/utils";
