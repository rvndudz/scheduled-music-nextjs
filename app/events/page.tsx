"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Image from "next/image";
import type { EventRecord } from "@/types/events";
import {
  convertSriLankaInputToUtc,
  formatSriLankaDateTime,
  toSriLankaInputValue,
} from "@/lib/timezone";

type FormState = {
  event_name: string;
  artist_name: string;
  start_time_utc: string;
  end_time_utc: string;
};

type StatusMessage = {
  type: "success" | "error" | "info";
  text: string;
};

const initialFormState: FormState = {
  event_name: "",
  artist_name: "",
  start_time_utc: "",
  end_time_utc: "",
};

const fieldClasses =
  "w-full rounded-2xl border border-slate-700/70 bg-slate-900/60 px-4 py-3 text-slate-100 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600/40 placeholder:text-slate-500";

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const ManageEventsPage = () => {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<FormState>(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    setStatus(null);
    try {
      const response = await fetch("/api/events", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to load events.");
      }
      setEvents(payload.events ?? []);
      if ((payload.events ?? []).length === 0) {
        setStatus({
          type: "info",
          text: "No events have been scheduled yet.",
        });
      }
    } catch (error) {
      setStatus({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to load events. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const startEditing = (event: EventRecord) => {
    setEditingId(event.event_id);
    setFormValues({
      event_name: event.event_name,
      artist_name: event.artist_name,
      start_time_utc: toSriLankaInputValue(event.start_time_utc),
      end_time_utc: toSriLankaInputValue(event.end_time_utc),
    });
    setStatus({
      type: "info",
      text: `Editing "${event.event_name}"`,
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setFormValues(initialFormState);
  };

  const handleFormChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdateEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) {
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    try {
      const payload = {
        event_name: formValues.event_name.trim(),
        artist_name: formValues.artist_name.trim(),
        start_time_utc: convertSriLankaInputToUtc(
          formValues.start_time_utc,
          "Start time",
        ),
        end_time_utc: convertSriLankaInputToUtc(
          formValues.end_time_utc,
          "End time",
        ),
      };

      if (!payload.event_name || !payload.artist_name) {
        throw new Error("Event and artist names cannot be empty.");
      }

      const response = await fetch(`/api/events/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Unable to update event.");
      }

      setStatus({
        type: "success",
        text: `Updated "${data.event.event_name}".`,
      });
      await fetchEvents();
      cancelEditing();
    } catch (error) {
      setStatus({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to update the event.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteEvent = async (eventId: string) => {
    const target = events.find((event) => event.event_id === eventId);
    if (
      !target ||
      !window.confirm(`Delete "${target.event_name}" permanently?`)
    ) {
      return;
    }

    setStatus(null);

    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to delete event.");
      }
      setStatus({
        type: "success",
        text: `Deleted "${target.event_name}".`,
      });
      await fetchEvents();
      if (editingId === eventId) {
        cancelEditing();
      }
    } catch (error) {
      setStatus({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to delete the event.",
      });
    }
  };

  const deleteAllEvents = async () => {
    if (
      !events.length ||
      !window.confirm("Delete ALL events? This cannot be undone.")
    ) {
      return;
    }
    setStatus(null);
    try {
      const response = await fetch("/api/events", { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to delete events.");
      }
      setStatus({
        type: "success",
        text: "All events were deleted.",
      });
      await fetchEvents();
      cancelEditing();
    } catch (error) {
      setStatus({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to delete events.",
      });
    }
  };

  const deleteExpiredEvents = async () => {
    if (
      !events.some(
        (event) => new Date(event.end_time_utc).getTime() <= Date.now(),
      )
    ) {
      setStatus({
        type: "info",
        text: "No expired events detected.",
      });
      return;
    }

    if (
      !window.confirm(
        "Delete all events that ended in the past? This cannot be undone.",
      )
    ) {
      return;
    }

    setStatus(null);
    try {
      const response = await fetch("/api/events/expired", {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload?.error ?? "Unable to delete expired events.",
        );
      }
      if (payload.deleted === 0) {
        setStatus({
          type: "info",
          text: "No expired events needed removal.",
        });
      } else {
        setStatus({
          type: "success",
          text: `Deleted ${payload.deleted} expired event${payload.deleted > 1 ? "s" : ""}.`,
        });
      }
      await fetchEvents();
      cancelEditing();
    } catch (error) {
      setStatus({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to delete expired events.",
      });
    }
  };

  const expiredEventIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      events
        .filter(
          (event) => new Date(event.end_time_utc).getTime() <= now,
        )
        .map((event) => event.event_id),
    );
  }, [events]);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-12 text-slate-100">
      <div className="rounded-[32px] border border-slate-800/70 bg-[var(--panel)] p-8 shadow-[0_0_80px_rgba(79,70,229,0.25)] backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">
              MixMaster VR lineup
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Review, edit, and fine-tune upcoming sets.
            </h1>
            <p className="mt-3 text-base text-slate-400">
              See every scheduled experience for MixMaster VR listeners, play the
              tracks from here, and tidy things up before they go live.
            </p>
          </div>
        </div>

        {status ? (
          <p
            className={`mt-6 rounded-2xl border px-4 py-3 text-sm font-medium ${
              status.type === "success"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                : status.type === "error"
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                  : "border-sky-500/40 bg-sky-500/10 text-sky-200"
            }`}
          >
            {status.text}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="rounded-2xl border border-slate-700/70 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-indigo-500/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={fetchEvents}
            disabled={isLoading}
          >
            Refresh list
          </button>
          <button
            className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={deleteExpiredEvents}
            disabled={isLoading}
          >
            Delete expired
          </button>
          <button
            className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={deleteAllEvents}
            disabled={isLoading || events.length === 0}
          >
            Delete all events
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <section className="rounded-[32px] border border-slate-800/70 bg-[var(--panel)] p-6 shadow-[0_0_50px_rgba(2,6,23,0.6)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">
              Event queue
            </h2>
            <span className="text-sm text-slate-400">
              {isLoading
                ? "Loading..."
                : `${events.length} event${events.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {isLoading ? (
            <p className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/50 px-4 py-6 text-sm text-slate-400">
              Loading events...
            </p>
          ) : events.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/50 px-4 py-6 text-sm text-slate-400">
              No experiences are queued yet. Use the Create Event button to add a
              new mix for MixMaster VR.
            </p>
          ) : (
            <div className="space-y-4">
              {events.map((eventRecord) => (
                <article
                  key={eventRecord.event_id}
                  className={`rounded-2xl border p-4 shadow-[0_0_35px_rgba(2,6,23,0.55)] ${
                    expiredEventIds.has(eventRecord.event_id)
                      ? "border-amber-500/40 bg-amber-500/5"
                      : "border-slate-700/70 bg-slate-900/60"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex flex-col gap-3">
                      {eventRecord.cover_image_url ? (
                        <Image
                          src={eventRecord.cover_image_url}
                          alt={`${eventRecord.event_name} cover`}
                          width={112}
                          height={112}
                          unoptimized
                          className="h-28 w-28 rounded-2xl border border-slate-700/70 object-cover"
                        />
                      ) : null}
                      <h3 className="text-lg font-semibold text-white">
                        {eventRecord.event_name}
                      </h3>
                      <p className="text-sm text-slate-400">
                        {eventRecord.artist_name}
                      </p>
                      <p className="text-sm text-slate-400">
                        {formatSriLankaDateTime(eventRecord.start_time_utc)} &rarr;{" "}
                        {formatSriLankaDateTime(eventRecord.end_time_utc)}
                      </p>
                      {expiredEventIds.has(eventRecord.event_id) ? (
                        <span className="mt-2 inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-200">
                          Expired
                        </span>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="rounded-xl border border-slate-600/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-indigo-500/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => startEditing(eventRecord)}
                        disabled={isLoading}
                      >
                        {editingId === eventRecord.event_id
                          ? "Editing"
                          : "Edit"}
                      </button>
                      <button
                        className="rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-rose-200 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => deleteEvent(eventRecord.event_id)}
                        disabled={isLoading}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {eventRecord.tracks.map((track) => (
                      <div
                        key={track.track_id}
                        className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3"
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {track.track_name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {track.track_url}
                            </p>
                          </div>
                          <span className="text-xs font-semibold text-slate-300">
                            {formatDuration(track.track_duration_seconds)}
                          </span>
                        </div>
                        <audio
                          controls
                          preload="none"
                          src={track.track_url}
                          className="mt-2 w-full"
                        >
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[32px] border border-slate-800/70 bg-[var(--panel)] p-6 shadow-[0_0_50px_rgba(2,6,23,0.6)]">
          <h2 className="text-xl font-semibold text-white">
            {editingId ? "Edit event" : "Select an event to edit"}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Pick a set from the left to tweak its details. Enter times in Sri
            Lanka time—the schedule will keep everything in sync for MixMaster VR.
          </p>

          {editingId ? (
            <form className="mt-6 space-y-4" onSubmit={handleUpdateEvent}>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-300">
                  Event name
                </label>
                <input
                  className={fieldClasses}
                  type="text"
                  name="event_name"
                  value={formValues.event_name}
                  onChange={handleFormChange}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-300">
                  Artist / DJ name
                </label>
                <input
                  className={fieldClasses}
                  type="text"
                  name="artist_name"
                  value={formValues.artist_name}
                  onChange={handleFormChange}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-300">
                  Start time (Sri Lanka time)
                </label>
                <input
                  className={fieldClasses}
                  type="datetime-local"
                  name="start_time_utc"
                  value={formValues.start_time_utc}
                  onChange={handleFormChange}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-300">
                  End time (Sri Lanka time)
                </label>
                <input
                  className={fieldClasses}
                  type="datetime-local"
                  name="end_time_utc"
                  value={formValues.end_time_utc}
                  onChange={handleFormChange}
                  required
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-600 to-fuchsia-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_35px_rgba(99,102,241,0.35)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:bg-slate-500"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-2xl border border-slate-700/70 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-indigo-500/60 hover:text-white"
                  onClick={cancelEditing}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/50 px-4 py-6 text-sm text-slate-400">
              Select an event from the left-hand column to populate the editing
              form.
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default ManageEventsPage;
