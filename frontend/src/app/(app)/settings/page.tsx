"use client";

import { PageHeader } from "@/components/ui";
import { ThemeToggle, ContrastToggle } from "@/components/theme-toggle";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Account"
        title="Preferences"
        lede="Display settings for this browser. Stored locally — they follow the device, not the account."
      />

      <section className="mt-6 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Appearance</h2>
        <div className="mt-1 divide-y divide-line">
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-body font-medium">Theme</p>
              <p className="mt-0.5 text-caption text-muted">
                Light or dark palette. Colors only — layout and graph structure never change.
              </p>
            </div>
            <ThemeToggle />
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
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
  );
}
