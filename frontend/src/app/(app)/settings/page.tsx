"use client";

import { PageHeader } from "@/components/ui";
import { SystemTabs } from "@/components/system-tabs";
import { ThemeToggle, ContrastToggle } from "@/components/theme-toggle";

export default function SettingsPage() {
  return (
    <div data-testid="settings-workspace" className="mx-auto max-w-[1100px]">
      <SystemTabs />
      <PageHeader
        eyebrow="Account"
        title="System settings"
        lede="Display settings for this browser. Stored locally, so they follow the device, not the account."
      />

      <div data-testid="settings-layout" className="mt-6 grid items-start gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
      <nav data-testid="settings-navigation" aria-label="Preference sections" className="rounded-xl border border-line bg-surface p-2 shadow-sm md:sticky md:top-20">
        <span className="flex min-h-11 items-center rounded-lg bg-accent-soft px-3 text-body font-semibold text-accent">Appearance</span>
        <span className="flex min-h-11 items-center px-3 text-body text-muted">Notifications</span>
        <span className="flex min-h-11 items-center px-3 text-body text-muted">Accessibility</span>
        <p className="border-t border-line px-3 pt-3 text-caption text-muted">Additional preferences will appear here as account-level controls become available.</p>
      </nav>

      <section data-testid="settings-panel" className="rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5">
        <p className="text-label font-bold uppercase tracking-[0.1em] text-accent">Appearance</p>
        <h2 className="mt-1 text-title font-semibold">Display</h2>
        <p className="mt-1 text-caption text-muted">Tune this browser for your working environment.</p>
        <div className="mt-1 divide-y divide-line">
          <div className="flex min-h-11 items-center justify-between gap-4 py-4">
            <div>
              <p className="text-body font-medium">Theme</p>
              <p className="mt-0.5 text-caption text-muted">
                Light or dark palette. Colors only — layout and graph structure never change.
              </p>
            </div>
            <ThemeToggle />
          </div>
          <div className="flex min-h-11 items-center justify-between gap-4 py-4">
            <div>
              <p className="text-body font-medium">High contrast</p>
              <p className="mt-0.5 text-caption text-muted">
                Stronger borders and text for bright field conditions or low-visibility screens.
              </p>
            </div>
            <ContrastToggle />
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}
