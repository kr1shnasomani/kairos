"use client";

import { useState } from "react";
import type { AuthorityLevel, QuarantineItem } from "@/lib/types";
import { promoteQuarantine, disputeQuarantine, requestQuarantineInfo } from "@/lib/api";
import { Button, Modal } from "@/components/ui";

export type ActionMode = "promote" | "dispute" | "request-info";

const AUTH_LEVELS: AuthorityLevel[] = [1, 2, 3, 4, 5];

/** Hosts the existing Modal flows; assembles the frozen api.ts payloads — byte-identical to pre-redesign. */
export function ActionModals({
  item,
  mode,
  busy,
  onClose,
  run,
}: {
  item: QuarantineItem;
  mode: ActionMode;
  busy: boolean;
  onClose: () => void;
  /** Page-owned mutation runner: busy/notice/error/refetch lifecycle. */
  run: (mutate: () => Promise<unknown>, success: string, failure: string) => void;
}) {
  const id = item.item_id;
  if (mode === "promote") {
    return (
      <Modal title={`Promote ${id} to canonical graph`} onClose={onClose}>
        <PromoteForm
          busy={busy}
          onCancel={onClose}
          onSubmit={(authority_level, relationship_type, notes) =>
            run(
              () =>
                promoteQuarantine(id, {
                  authority_level,
                  relationship_type: relationship_type || "DOCUMENTED_BY",
                  document_type: "procedure",
                  notes: notes || undefined,
                }), // frozen payload — do not reshape
              `Promoted ${id} to the canonical graph.`,
              `Could not promote ${id} — backend offline or rejected.`,
            )
          }
        />
      </Modal>
    );
  }
  if (mode === "dispute") {
    return (
      <Modal title={`Dispute ${id}`} onClose={onClose}>
        <DisputeForm
          busy={busy}
          onCancel={onClose}
          onSubmit={(reason) =>
            run(() => disputeQuarantine(id, reason || "Disputed by reviewer"), `Dispute recorded for ${id}.`, `Could not dispute ${id} — backend offline or rejected.`)
          }
        />
      </Modal>
    );
  }
  return (
    <Modal title={`Request information for ${id}`} onClose={onClose}>
      <RequestInfoForm
        busy={busy}
        onCancel={onClose}
        onSubmit={(note) =>
          run(() => requestQuarantineInfo(id, note), `Request for more information recorded for ${id}.`, `Could not record a request for ${id} — backend offline or rejected.`)
        }
      />
    </Modal>
  );
}

function PromoteForm({ busy, onCancel, onSubmit }: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (authority: AuthorityLevel, relationship: string, notes: string) => void;
}) {
  const [authority, setAuthority] = useState<AuthorityLevel>(4);
  const [relationship, setRelationship] = useState("DOCUMENTED_BY");
  const [notes, setNotes] = useState("");

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(authority, relationship, notes); }}
      className="flex flex-col gap-3"
    >
      <p className="text-caption text-muted">
        Promotion is a one-way gate — this becomes human-verified canonical truth (confidence 1.0).
      </p>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-label font-semibold uppercase tracking-[0.1em] text-muted">Authority level</span>
          <select
            value={authority}
            onChange={(e) => setAuthority(Number(e.target.value) as AuthorityLevel)}
            className="tabular h-8 rounded-lg border border-line bg-surface px-2 text-caption outline-none focus:border-accent"
          >
            {AUTH_LEVELS.map((l) => <option key={l} value={l}>L{l}</option>)}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-label font-semibold uppercase tracking-[0.1em] text-muted">Relationship type</span>
          <input
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            className="tabular h-8 rounded-lg border border-line bg-surface px-2 text-caption outline-none focus:border-accent"
          />
        </label>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        aria-label="Notes"
        className="h-8 rounded-lg border border-line bg-surface px-2 text-caption outline-none focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Promoting…" : "Confirm promote"}
        </Button>
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DisputeForm({ busy, onCancel, onSubmit }: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(reason); }}
      className="flex flex-col gap-2.5"
    >
      <p className="text-caption text-muted">
        Flags the input as incorrect — it is kept for the record, not deleted.
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for dispute"
        aria-label="Reason for dispute"
        className="h-8 rounded-lg border border-line bg-surface px-2 text-caption outline-none focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <Button variant="danger" type="submit" disabled={busy}>
          {busy ? "Submitting…" : "Confirm dispute"}
        </Button>
        <Button variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RequestInfoForm({ busy, onCancel, onSubmit }: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(note); }} className="flex flex-col gap-2.5">
      <p className="text-caption text-muted">
        This follow-up is recorded in the audit trail and leaves the item pending for review.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What evidence or clarification is needed?"
        aria-label="Requested information"
        required
        rows={4}
        className="resize-y rounded-lg border border-line bg-surface px-2 py-1.5 text-caption outline-none focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <Button variant="primary" type="submit" disabled={busy || !note.trim()}>
          {busy ? "Saving…" : "Record request"}
        </Button>
        <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
