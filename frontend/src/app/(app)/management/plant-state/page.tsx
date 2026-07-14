"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PlantOperatingState, PlantState } from "@/lib/types";
import { getPlantState, setPlantState } from "@/lib/api";
import { getMe } from "@/lib/auth";
import { ADMIN_ROLES } from "@/components/use-role";
import { Modal, StatusBadge, Button, DemoChip, PageHeader } from "@/components/ui";
import { relativeTime } from "@/lib/utils";

const STATE_META: Record<PlantOperatingState, { label: string; tone: "verified" | "caution" | "danger" | "neutral"; desc: string }> = {
  normal:      { label: "Normal",      tone: "verified", desc: "Full operations. All ingestion, briefs, and governors active." },
  turnaround:  { label: "Turnaround",  tone: "caution",  desc: "Planned maintenance. Brief cadence reduced; PTW governor exempt." },
  shutdown:    { label: "Shutdown",    tone: "caution",  desc: "Operations suspended. Safety interlocks remain active." },
  emergency:   { label: "Emergency",   tone: "danger",   desc: "Emergency state. Critical-only briefs; all non-safety automation paused." },
};

const STATES: PlantOperatingState[] = ["normal", "turnaround", "shutdown", "emergency"];

export default function PlantStatePage() {
  const [current, setCurrent] = useState<PlantState | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [selected, setSelected] = useState<PlantOperatingState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let alive = true;
    getMe().then((u) => {
      if (!alive || !u) return;
      setSiteId(u.site_id);
      setIsAdmin(ADMIN_ROLES.includes(u.role));
      getPlantState(u.site_id).then(({ data, source }) => {
        if (!alive) return;
        setCurrent(data);
        setIsDemo(source === "demo" || !data);
      });
    });
    return () => { alive = false; };
  }, []);

  async function handleConfirm() {
    if (!selected || !siteId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await setPlantState({ site_id: siteId, state: selected });
      setCurrent(updated);
      setSuccess(true);
      setConfirming(false);
    } catch {
      setError("Failed to update plant state — backend offline or permission denied.");
    } finally {
      setBusy(false);
    }
  }

  const activeMeta = current ? STATE_META[current.state] : null;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
      <Link href="/management" className="inline-flex items-center gap-1.5 text-body text-muted hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Overview
      </Link>

      <PageHeader className="mt-4" eyebrow="Plant control" title="Plant operating state" lede="Sets the operating mode for the whole site. Affects brief cadence, governor ceilings, and automation behaviour. Changes are logged and irreversible without an explicit transition." />

      {/* Current state */}
      <section className="mt-5 rounded-xl border border-line bg-surface p-5">
        <p className="text-label font-bold uppercase tracking-[0.1em] text-muted">Current state</p>
        {current ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <StatusBadge tone={activeMeta!.tone}>{activeMeta!.label}</StatusBadge>
            <span className="text-body text-ink">{activeMeta!.desc}</span>
            <span className="tabular ml-auto text-label text-muted">
              Set by {current.set_by} · {relativeTime(current.set_at)}
            </span>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            {isDemo
              ? <span className="text-body text-muted">No live state — demo mode</span>
              : <span className="inline-flex gap-1.5">{[0,1,2].map((i) => <span key={i} className="size-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>
            }
          </div>
        )}
        {isDemo && <DemoChip />}
      </section>

      {/* State selector — admin only */}
      {!isAdmin && (
        <div className="mt-5 rounded-xl border border-line bg-surface p-5 text-body text-muted">
          Plant state changes require the <span className="font-semibold text-ink">admin</span> role.
          Contact your site administrator to request a state transition.
        </div>
      )}

      {isAdmin && (
        <section className="mt-5">
          <p className="text-label font-bold uppercase tracking-[0.1em] text-muted">Transition to</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {STATES.map((s) => {
              const m = STATE_META[s];
              const isCurrent = current?.state === s;
              const isSelected = selected === s;
              return (
                <button
                  key={s}
                  onClick={() => { setSelected(s); setSuccess(false); }}
                  disabled={isCurrent}
                  aria-pressed={isSelected}
                  className={[
                    "rounded-xl border p-4 text-left transition-colors",
                    isCurrent
                      ? "cursor-default border-line bg-surface-2 opacity-50"
                      : isSelected
                      ? "border-accent bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))]"
                      : "border-line bg-surface hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))]",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={m.tone}>{m.label}</StatusBadge>
                    {isCurrent && <span className="text-micro text-muted">(current)</span>}
                  </div>
                  <p className="mt-1.5 text-caption leading-snug text-muted">{m.desc}</p>
                </button>
              );
            })}
          </div>

          {selected && selected !== current?.state && (
            <div className="mt-4 flex items-center gap-3">
              <Button
                variant="danger"
                onClick={() => { setConfirming(true); setError(null); }}
              >
                Set to {STATE_META[selected].label}
              </Button>
              <button
                onClick={() => { setSelected(null); setSuccess(false); }}
                className="text-body text-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          )}

          {success && (
            <p className="mt-3 text-body text-verified">
              State updated to <span className="font-semibold">{current ? STATE_META[current.state].label : "—"}</span>. Change logged.
            </p>
          )}
          {error && <p className="mt-3 text-body text-danger">{error}</p>}
        </section>
      )}

      {/* Confirm modal */}
      {confirming && selected && (
        <Modal title={`Confirm: set to ${STATE_META[selected].label}`} onClose={() => setConfirming(false)}>
          <p className="text-body text-muted leading-relaxed">
            This will immediately transition <span className="font-semibold text-ink">{siteId}</span> to{" "}
            <span className="font-semibold" style={{ color: `var(--${STATE_META[selected].tone === "neutral" ? "muted" : STATE_META[selected].tone})` }}>
              {STATE_META[selected].label}
            </span>{" "}
            mode. The transition is logged and visible to all site users. Are you sure?
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="danger" disabled={busy} onClick={handleConfirm}>
              {busy ? "Updating…" : `Confirm — ${STATE_META[selected].label}`}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
