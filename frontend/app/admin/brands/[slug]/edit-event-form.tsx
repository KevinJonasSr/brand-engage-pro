"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormSave, SaveStatusIndicator } from "@/lib/use-form-save";
import { updateEventAction } from "../actions";

/**
 * Subset of the brand_events row that the edit form needs to pre-fill.
 * Imported by both this form and the EditableEventRow wrapper so the row's
 * server-side query and the form's expected props stay in sync.
 */
export interface EditableEvent {
  id: string;
  title: string;
  detail: string | null;
  event_date: string | null;
  starts_at: string | null;
  location: string | null;
  url: string | null;
  capacity: number | null;
  sort_order: number;
  active: boolean;
  founder_early_rsvp_hours?: number | null;
  rsvp_opens_at?: string | null;
}

/**
 * Inline edit form rendered below an event row in /admin/brands/[slug].
 * Mirrors CreateEventForm's field layout and adds an `active` toggle so
 * admins can hide an event without deleting. Wrapped in useFormSave for
 * retry-on-503 + visible status; refreshes the page on success and
 * collapses back to the read-only row via onCancel.
 */
export default function EditEventForm({
  event,
  brandSlug,
  brandEarlyHours,
  onCancel,
}: {
  event: EditableEvent;
  brandSlug: string;
  brandEarlyHours: number;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [businessError, setBusinessError] = useState<string | null>(null);
  const { status, submit, submitting } = useFormSave({
    onSuccess: () => {
      router.refresh();
      // Collapse the form once the row has saved + the page has refreshed
      // so admins see the updated read-only row in place.
      onCancel();
    },
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusinessError(null);
    const fd = new FormData(e.currentTarget);
    const result = await submit(updateEventAction, fd);
    if (result?.error) {
      setBusinessError(result.error);
    }
  }

  // <input type="datetime-local"> needs `YYYY-MM-DDTHH:mm` (no seconds, no
  // timezone suffix). The DB stores starts_at as a full ISO timestamptz,
  // so we slice it down. If starts_at is null, leave the field empty.
  const startsAtLocal = event.starts_at
    ? new Date(event.starts_at).toISOString().slice(0, 16)
    : "";

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 grid gap-2 rounded-lg border border-iron/10 bg-parchment/30 p-3 md:grid-cols-2"
    >
      <input type="hidden" name="event_id" value={event.id} />
      <input type="hidden" name="brand_slug" value={brandSlug} />

      <input
        name="title"
        required
        defaultValue={event.title}
        placeholder="Event title"
        className="rounded-lg border border-iron/10 bg-parchment/40 px-3 py-2 text-sm md:col-span-2"
      />
      <input
        name="starts_at"
        type="datetime-local"
        defaultValue={startsAtLocal}
        className="rounded-lg border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
      />
      <input
        name="event_date"
        defaultValue={event.event_date ?? ""}
        placeholder="Display date (Mar 14 · 7 PM)"
        className="rounded-lg border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
      />
      <input
        name="location"
        defaultValue={event.location ?? ""}
        placeholder="Location (Nashville, TN)"
        className="rounded-lg border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
      />
      <input
        name="detail"
        defaultValue={event.detail ?? ""}
        placeholder="Detail (Brand Engage Pro members only)"
        className="rounded-lg border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
      />
      <input
        name="url"
        defaultValue={event.url ?? ""}
        placeholder="URL (ticket link / livestream)"
        className="rounded-lg border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
      />
      <input
        name="capacity"
        type="number"
        defaultValue={event.capacity ?? ""}
        placeholder="Capacity (blank = unlimited)"
        className="rounded-lg border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
      />
      <input
        name="sort_order"
        type="number"
        defaultValue={event.sort_order}
        placeholder="Sort order"
        className="rounded-lg border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
      />
      <label className="text-xs text-iron/70 md:col-span-2">
        Founder early RSVP hours
        <input
          name="founder_early_rsvp_hours"
          type="number"
          min={0}
          max={168}
          defaultValue={event.founder_early_rsvp_hours ?? ""}
          placeholder="Blank keeps the current window"
          className="mt-1 w-full rounded-lg border border-iron/10 bg-parchment/40 px-3 py-2 text-sm"
        />
        <span className="mt-1 block">
          Blank keeps this event&apos;s current RSVP time. 0 opens it to everyone
          now. A number counts from when the event was created. New events use
          the brand default ({brandEarlyHours} hours) unless you set one here.
        </span>
      </label>
      <label className="flex items-center gap-2 text-xs text-iron/80 md:col-span-2">
        <input
          type="checkbox"
          name="active"
          value="true"
          defaultChecked={event.active}
        />
        Active (visible to members)
      </label>

      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-ember px-4 py-2 text-sm font-semibold text-linen disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-iron/70 hover:text-iron"
        >
          Cancel
        </button>
        <SaveStatusIndicator status={status} />
        {businessError && (
          <span className="text-xs text-ember" title={businessError}>
            ✗ {businessError}
          </span>
        )}
      </div>
    </form>
  );
}
