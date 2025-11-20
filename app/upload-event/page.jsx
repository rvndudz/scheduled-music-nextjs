"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  convertSriLankaInputToUtc,
  formatSriLankaDateTime,
  formatUtcWithOffset,
} from "@/lib/timezone";

const initialFormState = {
  event_name: "",
  artist_name: "",
  start_time_utc: "",
};

const fieldClasses =
  "w-full rounded-2xl border border-red-700/60 bg-[#3d0c12]/80 px-4 py-3 text-slate-100 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/40 placeholder:text-slate-500";

const formatDuration = (totalSeconds) => {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts = [];
  if (hrs > 0) {
    parts.push(`${hrs} hr${hrs === 1 ? "" : "s"}`);
  }
  parts.push(`${mins} min${mins === 1 ? "" : "s"}`);
  parts.push(`${secs} sec${secs === 1 ? "" : "s"}`);
  return parts.join(" ");
};

export default function UploadEventPage() {
  const [formValues, setFormValues] = useState(initialFormState);
  const [tracks, setTracks] = useState([]);
  const [coverImage, setCoverImage] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [scheduledEvents, setScheduledEvents] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/events", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) return;
        if (active) {
          setScheduledEvents(Array.isArray(data.events) ? data.events : []);
        }
      } catch {
        // ignore fetch errors for the informational list
      }
    };
    load();
    const id = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(id);
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

const resetForm = () => {
  setFormValues(initialFormState);
  setTracks([]);
  if (coverPreview) {
    URL.revokeObjectURL(coverPreview);
  }
  setCoverImage(null);
  setCoverPreview(null);
  toast("Form cleared. No mixes are queued anymore.", { icon: "🧹" });
};

  const handleCoverChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (coverPreview) {
      URL.revokeObjectURL(coverPreview);
    }
    setCoverImage(file);
    setCoverPreview(URL.createObjectURL(file));
    toast.success("Cover image queued for upload.");
  };

  const removeCover = () => {
    if (coverPreview) {
      URL.revokeObjectURL(coverPreview);
    }
    setCoverImage(null);
    setCoverPreview(null);
  };

  const uploadTracksNow = async (event) => {
    const fileList = event.target.files;
    if (!fileList || !fileList.length) return;

    setIsUploading(true);

    const uploaded = [];
    for (const file of Array.from(fileList)) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/upload-track", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error ?? "Unable to upload track.");
        }
        uploaded.push(data);
        setTracks((prev) => [...prev, data]);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Track upload failed unexpectedly.",
        );
      }
    }

    if (uploaded.length) {
      toast.success(
        `Added ${uploaded.length} track${uploaded.length > 1 ? "s" : ""}.`,
      );
    }

    setIsUploading(false);
    event.target.value = "";
  };

  const removeTrack = (trackId) => {
    setTracks((prev) => prev.filter((track) => track.track_id !== trackId));
  };

  const submitEvent = async (event) => {
    event.preventDefault();

    if (!tracks.length) {
      toast.error("Please add at least one MP3 before publishing.");
      return;
    }

    let normalizedTimes;
    try {
      normalizedTimes = {
        start: convertSriLankaInputToUtc(
          formValues.start_time_utc,
          "Start time",
        ),
        end: null,
      };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid event data.");
      return;
    }

    if (!formValues.event_name.trim() || !formValues.artist_name.trim()) {
      toast.error("Event and artist names cannot be empty.");
      return;
    }

    setIsSubmitting(true);

    const startUtc = normalizedTimes.start;
    const totalSeconds = tracks.reduce(
      (sum, track) => sum + (track.track_duration_seconds || 0),
      0,
    );
    const endUtc = formatUtcWithOffset(
      new Date(new Date(startUtc).getTime() + totalSeconds * 1000),
    );

    let coverImageUrl;
    if (coverImage) {
      const formData = new FormData();
      formData.append("file", coverImage);
      try {
        const response = await fetch("/api/upload-cover", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error ?? "Unable to upload cover image.");
        }
        coverImageUrl = data.cover_image_url;
      } catch (error) {
        setIsSubmitting(false);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to upload cover image.",
        );
        return;
      }
    }

    try {
      const response = await fetch("/api/create-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_name: formValues.event_name.trim(),
          artist_name: formValues.artist_name.trim(),
          start_time_utc: startUtc,
          end_time_utc: endUtc,
          tracks,
          ...(coverImageUrl ? { cover_image_url: coverImageUrl } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to create event.");
      }

      toast.success(
        `"${data.event.event_name}" is now scheduled inside MixMaster VR.`,
      );
      setFormValues(initialFormState);
      setTracks([]);
      removeCover();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalTrackSeconds = tracks.reduce(
    (sum, track) => sum + (track.track_duration_seconds || 0),
    0,
  );

  const scheduledList = useMemo(
    () =>
      [...scheduledEvents].sort(
        (a, b) =>
          new Date(a.start_time_utc).getTime() -
          new Date(b.start_time_utc).getTime(),
      ),
    [scheduledEvents],
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-12 text-rose-50">
      <div className="rounded-[32px] border border-[#ff9a6b]/40 bg-[var(--panel)] p-10 shadow-[0_0_90px_rgba(255,70,70,0.4)] backdrop-blur">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-[#ffa6a6]">
            Create MixMaster VR event
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            Add new experiences to the MixMaster VR lineup
          </h1>
          <p className="mt-3 text-base text-[#ffd6d6]">
            Upload your mixes, preview the essentials, and publish the set on your
            schedule. We&apos;ll keep the timing in sync.
          </p>
        </header>

        <form className="space-y-8" onSubmit={submitEvent}>
          <section className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#ffd6d6]">
                Event name
              </label>
              <input
                className={fieldClasses}
                type="text"
                placeholder="Sunrise Session"
                name="event_name"
                value={formValues.event_name}
                onChange={handleInputChange}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#ffd6d6]">
                Artist / DJ name
              </label>
              <input
                className={fieldClasses}
                type="text"
                placeholder="Codex DJ"
                name="artist_name"
                value={formValues.artist_name}
                onChange={handleInputChange}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#ffd6d6]">
                Start time (Sri Lanka time)
              </label>
              <input
                className={fieldClasses}
                type="datetime-local"
                name="start_time_utc"
                value={formValues.start_time_utc}
                onChange={handleInputChange}
                required
              />
            </div>
          </section>

          <section>
            <label className="mb-1 block text-sm font-semibold text-[#ffd6d6]">
              Upload MP3 tracks
            </label>
            <input
              type="file"
              accept=".mp3,audio/mpeg"
              multiple
              className="block w-full cursor-pointer rounded-2xl border border-dashed border-red-700/50 bg-[#3d0c12]/70 px-4 py-6 text-center text-base font-medium text-rose-50 transition hover:border-rose-400/60 hover:text-white"
              onChange={uploadTracksNow}
              disabled={isSubmitting || isUploading}
            />
            <p className="mt-2 text-sm text-rose-50/80">
              Tracks upload immediately so we can show duration, bitrate, and size.
              Feel free to add multiple mixes.
            </p>
          </section>

          <section>
            <label className="mb-1 block text-sm font-semibold text-[#ffd6d6]">
              Cover image (PNG/JPEG/WebP)
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="block w-full cursor-pointer rounded-2xl border border-dashed border-red-700/50 bg-[#3d0c12]/70 px-4 py-5 text-center text-base font-medium text-slate-200 transition hover:border-rose-400/60 hover:text-white"
              onChange={handleCoverChange}
              disabled={isSubmitting}
            />
            {coverPreview ? (
              <div className="mt-3 flex items-center gap-4">
                <Image
                  src={coverPreview}
                  alt="Cover preview"
                  width={80}
                  height={80}
                  unoptimized
                  className="h-20 w-20 rounded-2xl border border-[#ff9a6b]/60 object-cover"
                />
                <button
                  type="button"
                  onClick={removeCover}
                  className="rounded-xl border border-[#ff4a4a]/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#ffd3d3] transition hover:bg-[#ff4a4a]/10"
                  disabled={isSubmitting}
                >
                  Remove cover
                </button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-rose-50/80">
                A cover image helps players identify events quickly in your in-game
                menus.
              </p>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {tracks.length ? "Queued mixes" : "No mixes added yet"}
              </h2>
              {tracks.length ? (
                <span className="text-sm text-[#ffd6d6]">
                  {tracks.length} file{tracks.length > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
            <div className="mb-4 rounded-2xl border border-[#ff9fb0]/50 bg-white/5 p-4 text-sm text-[#ffd6d6]">
              <p className="font-semibold text-white">
                Total playtime: {formatDuration(totalTrackSeconds)}
              </p>
              <p className="mt-1 text-[#ffd6d6]/80">
                Event length will be start time + total track duration.
              </p>
            </div>
            <div className="space-y-3">
              {tracks.map((track) => (
                <div
                  key={track.track_id}
                  className="flex items-center justify-between rounded-2xl border border-[#ff4a4a]/40 bg-[#2b050c]/75 px-5 py-4"
                >
                  <div>
                    <p className="text-base font-semibold text-white">
                      {track.track_name}
                    </p>
                    <p className="text-xs text-[#ffd6d6]">
                      {formatDuration(track.track_duration_seconds)}{" "}
                      {track.track_bitrate_kbps
                        ? `• ${track.track_bitrate_kbps} kbps`
                        : ""}{" "}
                      {track.track_size_bytes
                        ? `• ${(track.track_size_bytes / 1024 / 1024).toFixed(2)} MB`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTrack(track.track_id)}
                    className="rounded-xl border border-[#ff4a4a]/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#ffd3d3] transition hover:bg-[#ff4a4a]/10"
                    disabled={isSubmitting}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {!tracks.length ? (
                <p className="rounded-2xl border border-dashed border-[#ff7d7d]/50 bg-[#ff784f]/10 px-4 py-6 text-sm text-[#ffe1de]">
                  Drop your MP3 files here. They stay on your device until you hit
                  <em> Save event</em>, then we send everything up for playback
                  in-game.
                </p>
              ) : null}
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              className="flex-1 rounded-2xl bg-gradient-to-r from-rose-500 via-red-500 to-orange-500 px-6 py-3 text-lg font-semibold text-white shadow-[0_10px_35px_rgba(190,18,60,0.45)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:bg-slate-500"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving event..." : "Save event"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="flex-1 rounded-2xl border border-red-700/60 px-6 py-3 text-lg font-semibold text-slate-100 transition hover:border-rose-400/60 hover:text-white"
              disabled={isSubmitting}
            >
              Reset form
            </button>
          </div>
        </form>
      </div>

      <section className="rounded-[24px] border border-[#ff9fb0]/50 bg-[var(--panel)] p-6 shadow-[0_0_50px_rgba(255,70,70,0.25)]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            Scheduled events (Sri Lanka time)
          </h3>
          <span className="text-xs text-[#ffd6d6]">
            {scheduledList.length} total
          </span>
        </div>
        <div className="space-y-2">
              {scheduledList.length ? (
                scheduledList.map((event) => (
                  <div
                    key={event.event_id}
                    className="rounded-xl border border-[#ff4a4a]/20 bg-[#2b050c]/60 px-3 py-2"
                  >
                    <p className="text-sm font-semibold text-white">
                      {event.event_name} — {event.artist_name}
                    </p>
                    <p className="text-xs text-[#ffd6d6]">
                      {formatSriLankaDateTime(event.start_time_utc)} –{" "}
                      {formatSriLankaDateTime(event.end_time_utc)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#ffd6d6]">
                  No events scheduled yet. Create one to see it here.
                </p>
              )}
        </div>
      </section>
    </main>
  );
}
