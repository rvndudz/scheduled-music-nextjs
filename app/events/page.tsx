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
import { parseBuffer } from "music-metadata-browser";
import type { EventRecord } from "@/types/events";
import {
  convertSriLankaInputToUtc,
  formatSriLankaDateTime,
  formatUtcWithOffset,
  toSriLankaInputValue,
} from "@/lib/timezone";

type FormState = {
  event_name: string;
  artist_name: string;
  start_time_utc: string;
};

type StatusMessage = {
  type: "success" | "error" | "info";
  text: string;
};

const initialFormState: FormState = {
  event_name: "",
  artist_name: "",
  start_time_utc: "",
};

const fieldClasses =
  "w-full rounded-2xl border border-red-700/60 bg-[#3d0c12]/80 px-4 py-3 text-slate-100 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/40 placeholder:text-slate-500";

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const isDefaultEvent = (event: { event_name: string; artist_name: string }) =>
  event.event_name.trim().toLowerCase() === "default" &&
  event.artist_name.trim().toLowerCase() === "default";

const ManageEventsPage = () => {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<FormState>(initialFormState);
  const [formTracks, setFormTracks] = useState<EventRecord["tracks"]>([]);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
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
    });
    setFormTracks(event.tracks);
    setCoverPreview(event.cover_image_url ?? null);
    setCoverFile(null);
    setStatus({
      type: "info",
      text: `Editing "${event.event_name}"`,
    });
  };

const cancelEditing = () => {
  setEditingId(null);
  setFormValues(initialFormState);
  setFormTracks([]);
  setCoverPreview(null);
  setCoverFile(null);
};

  const handleFormChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const uploadTracksNow = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || !fileList.length) {
      return;
    }
    setStatus(null);
    for (const file of Array.from(fileList)) {
      let duration: number | null = null;
      let bitrate: number | null = null;
      let title: string | null = null;
      try {
        const buffer = await file.arrayBuffer();
        const meta = await parseBuffer(
          new Uint8Array(buffer),
          file.type || "audio/mpeg",
        );
        duration =
          typeof meta.format.duration === "number"
            ? Math.round(meta.format.duration)
            : null;
        bitrate =
          typeof meta.format.bitrate === "number"
            ? Math.round(meta.format.bitrate / 1000)
            : null;
        title = meta.common.title ?? null;
      } catch {
        setStatus({
          type: "error",
          text: `Could not read metadata for ${file.name}.`,
        });
        continue;
      }

      if (!duration) {
        setStatus({
          type: "error",
          text: `Track duration missing for ${file.name}.`,
        });
        continue;
      }

      let presign;
      try {
        const res = await fetch("/api/upload-track-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || "audio/mpeg",
          }),
        });
        presign = await res.json();
        if (!res.ok) {
          throw new Error(presign?.error ?? "Unable to create upload URL.");
        }
      } catch (error) {
        setStatus({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Failed to prepare upload URL.",
        });
        continue;
      }

      try {
        await fetch(presign.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "audio/mpeg" },
          body: file,
        });
      } catch (error) {
        setStatus({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Upload to storage failed.",
        });
        continue;
      }

      setFormTracks((prev) => [
        ...prev,
        {
          track_id: presign.track_id,
          track_name: title?.trim() || file.name.replace(/\.[^.]+$/, ""),
          track_url: presign.objectUrl,
          track_duration_seconds: duration,
          ...(bitrate ? { track_bitrate_kbps: bitrate } : {}),
          track_size_bytes: file.size,
        },
      ]);
      setStatus({
        type: "success",
        text: `Added ${title?.trim() || file.name}.`,
      });
    }
    event.target.value = "";
  };

  const removeTrackFromForm = (trackId: string) => {
    setFormTracks((prev) => prev.filter((track) => track.track_id !== trackId));
  };

  const handleCoverChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setCoverFile(file);
    setCoverPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleUpdateEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) {
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    try {
      if (!formTracks.length) {
        throw new Error("Please ensure at least one track is attached.");
      }

      const startUtc = convertSriLankaInputToUtc(
        formValues.start_time_utc,
        "Start time",
      );

      if (!formValues.event_name.trim() || !formValues.artist_name.trim()) {
        throw new Error("Event and artist names cannot be empty.");
      }

      const totalSeconds = formTracks.reduce(
        (sum, track) => sum + (track.track_duration_seconds || 0),
        0,
      );
      const endUtc = formatUtcWithOffset(
        new Date(new Date(startUtc).getTime() + totalSeconds * 1000),
      );

      let coverUrl = coverPreview ?? undefined;
      if (coverFile) {
        const formData = new FormData();
        formData.append("file", coverFile);
        const res = await fetch("/api/upload-cover", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error ?? "Unable to upload cover image.");
        }
        coverUrl = data.cover_image_url;
      }

      const payload = {
        event_name: formValues.event_name.trim(),
        artist_name: formValues.artist_name.trim(),
        start_time_utc: startUtc,
        end_time_utc: endUtc,
        tracks: formTracks,
        ...(coverUrl ? { cover_image_url: coverUrl } : {}),
      };

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
      <div className="rounded-[32px] border border-rose-100/50 bg-[var(--panel)] p-8 shadow-[0_0_70px_rgba(190,18,60,0.35)] backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-rose-100/70">
              MixMaster VR lineup
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Review, edit, and fine-tune upcoming sets.
            </h1>
            <p className="mt-3 text-base text-rose-50/80">
              See every scheduled experience for MixMaster VR listeners, play the
              tracks from here, and tidy things up before they go live.
            </p>
          </div>
        </div>

        {status ? (
          <p
            className={`mt-6 rounded-2xl border px-4 py-3 text-sm font-medium ${
              status.type === "success"
                ? "border-amber-300/70 bg-amber-300/15 text-amber-50/90"
                : status.type === "error"
                  ? "border-rose-400/70 bg-rose-400/15 text-rose-100"
                  : "border-rose-200/70 bg-white/10 text-rose-50/90"
            }`}
          >
            {status.text}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            className="rounded-2xl border border-red-700/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-rose-400/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={fetchEvents}
            disabled={isLoading}
          >
            Refresh list
          </button>
          <button
            className="rounded-2xl border border-orange-500/40 bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-200 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={deleteExpiredEvents}
            disabled={isLoading}
          >
            Delete expired
          </button>
          <button
            className="rounded-2xl border border-rose-600/50 bg-rose-600/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-600/20 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={deleteAllEvents}
            disabled={isLoading || events.length === 0}
          >
            Delete all events
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <section className="rounded-[32px] border border-rose-100/50 bg-[var(--panel)] p-6 shadow-[0_0_50px_rgba(190,18,60,0.25)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">
              Event queue
            </h2>
            <span className="text-sm text-rose-50/80">
              {isLoading
                ? "Loading..."
                : `${events.length} event${events.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {isLoading ? (
            <p className="rounded-2xl border border-dashed border-rose-100/60 bg-white/5 px-4 py-6 text-sm text-rose-100/90">
              Loading events...
            </p>
          ) : events.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-red-100/60 bg-white/5 px-4 py-6 text-sm text-rose-100/90">
              Nothing scheduled yet. Head to <strong>Create Event</strong> and drop
              in the next mix when you&apos;re ready.
            </p>
          ) : (
            <div className="space-y-4">
              {events.map((eventRecord) => (
                <article
                  key={eventRecord.event_id}
                  className={`rounded-2xl border p-4 shadow-[0_0_35px_rgba(44,5,15,0.5)] ${
                    expiredEventIds.has(eventRecord.event_id)
                      ? "border-orange-200/70 bg-orange-50/10"
                      : "border-red-100/50 bg-[#3d0c12]/70"
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
                          className="h-28 w-28 rounded-2xl border border-red-100/60 object-cover"
                        />
                      ) : null}
                      <h3 className="text-lg font-semibold text-white">
                        {eventRecord.event_name}
                      </h3>
                      <p className="text-sm text-rose-50/80">
                        {eventRecord.artist_name}
                      </p>
                      {isDefaultEvent(eventRecord) ? (
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">
                          Default mix — plays all day whenever nothing else is scheduled.
                        </p>
                      ) : (
                        <>
                          <p className="text-sm text-rose-50/80">
                            {formatSriLankaDateTime(eventRecord.start_time_utc)} &rarr;{" "}
                            {formatSriLankaDateTime(eventRecord.end_time_utc)}
                          </p>
                          {expiredEventIds.has(eventRecord.event_id) ? (
                            <span className="mt-2 inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-200">
                              Expired
                            </span>
                          ) : null}
                        </>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="rounded-xl border border-red-700/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-rose-400/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
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
                        className="rounded-2xl border border-red-700/40 bg-[#3d0c12]/70 p-3"
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {track.track_name}
                            </p>
                            <p className="text-xs text-rose-50/80">
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

        <section className="rounded-[32px] border border-rose-100/50 bg-[var(--panel)] p-6 shadow-[0_0_50px_rgba(190,18,60,0.25)]">
          <h2 className="text-xl font-semibold text-white">
            {editingId ? "Edit event" : "Select an event to edit"}
          </h2>
          <p className="mt-2 text-sm text-rose-50/80">
            Pick a set from the left to tweak its details. Enter start time in Sri
            Lanka time—the end time is auto-calculated from track duration.
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
              <div className="rounded-2xl border border-[#ff9fb0]/50 bg-white/5 p-4 text-sm text-[#ffd6d6]">
                <p className="font-semibold text-white">
                  Total playtime:{" "}
                  {formatDuration(
                    formTracks.reduce(
                      (sum, t) => sum + (t.track_duration_seconds || 0),
                      0,
                    ),
                  )}
                </p>
                <p className="mt-1 text-[#ffd6d6]/80">
                  Event end time will be start time + total track duration.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-300">
                  Replace or upload cover image
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="block w-full cursor-pointer rounded-2xl border border-dashed border-red-700/50 bg-[#3d0c12]/70 px-4 py-5 text-center text-base font-medium text-slate-200 transition hover:border-rose-400/60 hover:text-white"
                  onChange={handleCoverChange}
                  disabled={isSubmitting}
                />
                {coverPreview ? (
                  <div className="mt-3 flex items-center gap-3">
                    <Image
                      src={coverPreview}
                      alt="Cover preview"
                      width={64}
                      height={64}
                      unoptimized
                      className="h-16 w-16 rounded-xl border border-[#ff9a6b]/60 object-cover"
                    />
                    <p className="text-xs text-[#ffd6d6]">New cover will replace the existing one on save.</p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[#ffd6d6]/80">
                    If left empty, the current cover remains.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-300">
                  Upload or replace tracks (uploads immediately)
                </label>
                <input
                  type="file"
                  accept=".mp3,audio/mpeg"
                  multiple
                  className="block w-full cursor-pointer rounded-2xl border border-dashed border-red-700/50 bg-[#3d0c12]/70 px-4 py-5 text-center text-base font-medium text-slate-200 transition hover:border-rose-400/60 hover:text-white"
                  onChange={uploadTracksNow}
                  disabled={isSubmitting}
                />
                <div className="mt-3 space-y-3">
                  {formTracks.map((track) => (
                    <div
                      key={track.track_id}
                      className="rounded-2xl border border-[#ff4a4a]/30 bg-[#2b050c]/70 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {track.track_name}
                          </p>
                          <p className="text-xs text-[#ffd6d6]">
                            {[
                              formatDuration(track.track_duration_seconds || 0),
                              track.track_bitrate_kbps
                                ? `${track.track_bitrate_kbps} kbps`
                                : null,
                              (track.track_size_bytes ?? 0) > 0
                                ? `${((track.track_size_bytes ?? 0) / 1024 / 1024).toFixed(2)} MB`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" • ")}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="rounded-xl border border-rose-500/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100 transition hover:bg-rose-500/10"
                          onClick={() => removeTrackFromForm(track.track_id)}
                          disabled={isSubmitting}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {!formTracks.length ? (
                    <p className="text-xs text-[#ffd6d6]/80">Upload at least one track to save changes.</p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-gradient-to-r from-rose-500 via-red-500 to-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_35px_rgba(190,18,60,0.45)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:bg-slate-500"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-2xl border border-red-700/60 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-rose-400/60 hover:text-white"
                  onClick={cancelEditing}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-red-100/60 bg-white/5 px-4 py-6 text-sm text-rose-100/90">
              Pick any event in the list to load its details here for quick edits.
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default ManageEventsPage;
