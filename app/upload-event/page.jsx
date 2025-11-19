"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { convertSriLankaInputToUtc } from "@/lib/timezone";

const initialFormState = {
  event_name: "",
  artist_name: "",
  start_time_utc: "",
  end_time_utc: "",
};

const fieldClasses =
  "w-full rounded-2xl border border-slate-700/70 bg-slate-900/60 px-4 py-3 text-slate-100 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-600/40 placeholder:text-slate-500";

const createClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function UploadEventPage() {
  const [formValues, setFormValues] = useState(initialFormState);
  const [queuedTracks, setQueuedTracks] = useState([]);
  const [coverImage, setCoverImage] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    return () => {
      if (coverPreview) {
        URL.revokeObjectURL(coverPreview);
      }
    };
  }, [coverPreview]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormValues(initialFormState);
    setQueuedTracks([]);
    if (coverPreview) {
      URL.revokeObjectURL(coverPreview);
    }
    setCoverImage(null);
    setCoverPreview(null);
    setStatus({
      type: "info",
      text: "Form cleared. No mixes are queued anymore.",
    });
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
    setStatus({
      type: "success",
      text: "Cover image queued for upload.",
    });
  };

  const removeCover = () => {
    if (coverPreview) {
      URL.revokeObjectURL(coverPreview);
    }
    setCoverImage(null);
    setCoverPreview(null);
  };

  const queueTracks = (event) => {
    const fileList = event.target.files;
    if (!fileList || !fileList.length) {
      return;
    }

    const additions = Array.from(fileList).map((file) => ({
      id: createClientId(),
      file,
    }));

    setQueuedTracks((prev) => [...prev, ...additions]);
    setStatus({
      type: "success",
      text: `Added ${additions.length} file${
        additions.length > 1 ? "s" : ""
      } to the queue.`,
    });
    event.target.value = "";
  };

  const removeQueuedTrack = (queuedId) => {
    setQueuedTracks((prev) => prev.filter((item) => item.id !== queuedId));
  };

  const uploadQueuedTracks = async () => {
    const uploaded = [];
    for (const item of queuedTracks) {
      const formData = new FormData();
      formData.append("file", item.file);

      const response = await fetch("/api/upload-track", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to upload track.");
      }
      uploaded.push(payload);
    }
    return uploaded;
  };

  const submitEvent = async (event) => {
    event.preventDefault();
    setStatus(null);

    if (!queuedTracks.length) {
      setStatus({
        type: "error",
        text: "Please add at least one MP3 before publishing.",
      });
      return;
    }

    let normalizedTimes;
    try {
      normalizedTimes = {
        start: convertSriLankaInputToUtc(
          formValues.start_time_utc,
          "Start time",
        ),
        end: convertSriLankaInputToUtc(formValues.end_time_utc, "End time"),
      };
    } catch (error) {
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Invalid event data.",
      });
      return;
    }

    if (!formValues.event_name.trim() || !formValues.artist_name.trim()) {
      setStatus({
        type: "error",
        text: "Event and artist names cannot be empty.",
      });
      return;
    }

    if (
      new Date(normalizedTimes.end).getTime() <=
      new Date(normalizedTimes.start).getTime()
    ) {
      setStatus({
        type: "error",
        text: "End time must be after start time.",
      });
      return;
    }

    setIsSubmitting(true);
    setStatus({
      type: "info",
      text: "Uploading mixes to MixMaster VR...",
    });

    let uploadedTracks = [];
    try {
      uploadedTracks = await uploadQueuedTracks();
    } catch (error) {
      setIsSubmitting(false);
      setStatus({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to upload one of the mixes.",
      });
      return;
    }

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
        setStatus({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Failed to upload cover image.",
        });
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
          start_time_utc: normalizedTimes.start,
          end_time_utc: normalizedTimes.end,
          tracks: uploadedTracks,
          ...(coverImageUrl ? { cover_image_url: coverImageUrl } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "Failed to create event.");
      }

      setStatus({
        type: "success",
        text: `“${data.event.event_name}” is now scheduled inside MixMaster VR.`,
      });
      setFormValues(initialFormState);
      setQueuedTracks([]);
      removeCover();
    } catch (error) {
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Unexpected error.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-12 text-slate-100">
      <div className="rounded-[32px] border border-slate-800/70 bg-[var(--panel)] p-10 shadow-[0_0_80px_rgba(79,70,229,0.25)] backdrop-blur">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">
            Create MixMaster VR event
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            Add new experiences to the MixMaster VR lineup
          </h1>
          <p className="mt-3 text-base text-slate-400">
            Upload your mixes, preview the essential info, and publish the set so
            partygoers inside MixMaster VR can enjoy it right on schedule.
          </p>
        </header>

        {status ? (
          <div
            className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-medium ${
              status.type === "error"
                ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                : status.type === "success"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "border-sky-500/40 bg-sky-500/10 text-sky-200"
            }`}
          >
            {status.text}
          </div>
        ) : null}

        <form className="space-y-8" onSubmit={submitEvent}>
          <section className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm	font-semibold text-slate-300">
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
              <label className="mb-1 block text-sm	font-semibold text-slate-300">
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
              <label className="mb-1 block text-sm	font-semibold text-slate-300">
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
            <div>
              <label className="mb-1 block text-sm	font-semibold text-slate-300">
                End time (Sri Lanka time)
              </label>
              <input
                className={fieldClasses}
                type="datetime-local"
                name="end_time_utc"
                value={formValues.end_time_utc}
                onChange={handleInputChange}
                required
              />
            </div>
          </section>

          <section>
            <label className="mb-1 block text-sm font-semibold text-slate-300">
              Upload MP3 tracks
            </label>
            <input
              type="file"
              accept=".mp3,audio/mpeg"
              multiple
              className="block w-full cursor-pointer rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/60 px-4 py-6 text-center text-base font-medium text-slate-200 transition hover:border-indigo-500/60 hover:text-white"
              onChange={queueTracks}
              disabled={isSubmitting}
            />
            <p className="mt-2 text-sm text-slate-400">
              We will upload the queued files after you hit “Save event.” Feel
              free to add multiple mixes before publishing.
            </p>
          </section>

          <section>
            <label className="mb-1 block text-sm font-semibold text-slate-300">
              Cover image (PNG/JPEG/WebP)
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="block w-full cursor-pointer rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/60 px-4 py-5 text-center text-base font-medium text-slate-200 transition hover:border-indigo-500/60 hover:text-white"
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
                  className="h-20 w-20 rounded-2xl border border-slate-700/70 object-cover"
                />
                <button
                  type="button"
                  onClick={removeCover}
                  className="rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-rose-200 transition hover:bg-rose-500/10"
                  disabled={isSubmitting}
                >
                  Remove cover
                </button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">
                A cover image helps players identify events quickly in your
                in-game menus.
              </p>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {queuedTracks.length ? "Queued mixes" : "No mixes added yet"}
              </h2>
              {queuedTracks.length ? (
                <span className="text-sm text-slate-400">
                  {queuedTracks.length} file
                  {queuedTracks.length > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
            <div className="space-y-3">
              {queuedTracks.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-700/70 bg-slate-900/60 px-5 py-4"
                >
                  <div>
                    <p className="text-base font-semibold text-white">
                      {item.file.name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {(item.file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeQueuedTrack(item.id)}
                    className="rounded-xl border border-rose-500/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-200 transition hover:bg-rose-500/10"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {!queuedTracks.length ? (
                <p className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
                  Add your MP3 files here. We will upload them to MixMaster VR
                  after you save the event.
                </p>
              ) : null}
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              className="flex-1 rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-600 to-fuchsia-500 px-6 py-3 text-lg font-semibold text-white shadow-[0_10px_35px_rgba(99,102,241,0.35)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:bg-slate-500"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving event..." : "Save event"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="flex-1 rounded-2xl border border-slate-700/70 px-6 py-3 text-lg font-semibold text-slate-100 transition hover:border-indigo-500/60 hover:text-white"
              disabled={isSubmitting}
            >
              Reset form
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
