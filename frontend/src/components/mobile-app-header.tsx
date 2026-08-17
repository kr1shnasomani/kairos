type MobileAppHeaderProps = {
  onOpenMenu: () => void;
  onOpenSearch: () => void;
  onOpenCalendar: () => void;
  calendarOpen: boolean;
  onCreate: () => void;
  onOpenBriefs: () => void;
  onOpenUser: () => void;
  userInitial: string;
  notificationCount?: number;
};

export function MobileAppHeader({ onOpenMenu, onOpenSearch, onOpenCalendar, calendarOpen, onCreate, onOpenBriefs, onOpenUser, userInitial, notificationCount }: MobileAppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-1.5 border-b border-line bg-surface px-2 shadow-sm sm:gap-3 sm:px-4 md:hidden print:hidden">
      <button type="button" onClick={onOpenMenu} aria-label="Open menu" className="grid size-10 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      <button type="button" onClick={onOpenSearch} aria-label="Search workspace" className="flex h-10 min-w-10 flex-1 items-center gap-2 overflow-hidden rounded-lg border border-line bg-page px-2 text-sm text-muted shadow-sm transition-colors hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] hover:text-ink sm:h-11 sm:min-w-0 sm:rounded-xl sm:px-3">
        <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
        <span className="min-w-0 truncate">Search…</span>
      </button>
      <button type="button" onClick={onOpenCalendar} aria-label="Open calendar" aria-haspopup="dialog" aria-expanded={calendarOpen} className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-page text-ink shadow-sm sm:size-11"><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 4v4m8-4v4M6 10h12M7 20h10a2 2 0 0 0 2 2Z" /><path d="m9 14 2 2 4-4" /></svg></button>
      <button type="button" onClick={onCreate} aria-label="Create asset" className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-page text-ink shadow-sm sm:size-11"><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
      <button type="button" onClick={onOpenBriefs} aria-label="Open briefs" className="relative grid size-10 shrink-0 place-items-center rounded-lg text-ink"><svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>{notificationCount ? <span className="absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-micro font-bold text-white">{notificationCount}</span> : null}</button>
      <button type="button" onClick={onOpenUser} aria-label="Open user menu" className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-label font-bold text-muted">{userInitial}</button>
    </header>
  );
}
