import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import type { EventRecord } from "@/types/events";
import {
  ensureIsoDate,
  ensureTracks,
  persistEvents,
  readEventsFile,
  ValidationError,
} from "@/lib/events";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    let payload: Record<string, unknown>;
    try {
      payload = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new ValidationError("Invalid JSON payload.");
    }
    const {
      event_name,
      artist_name,
      start_time_utc,
      end_time_utc,
      tracks,
      cover_image_url,
    } = payload;

    if (typeof event_name !== "string" || !event_name.trim()) {
      throw new ValidationError("event_name is required.");
    }

    if (typeof artist_name !== "string" || !artist_name.trim()) {
      throw new ValidationError("artist_name is required.");
    }

    const startIso = ensureIsoDate(start_time_utc, "start_time_utc");
    const endIso = ensureIsoDate(end_time_utc, "end_time_utc");

    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      throw new ValidationError("end_time_utc must be after start_time_utc.");
    }

    const normalizedTracks = ensureTracks(tracks);

    let coverUrl: string | undefined;
    if (typeof cover_image_url === "string" && cover_image_url.trim()) {
      coverUrl = cover_image_url.trim();
    }

    const newEvent: EventRecord = {
      event_id: randomUUID(),
      event_name: event_name.trim(),
      artist_name: artist_name.trim(),
      start_time_utc: startIso,
      end_time_utc: endIso,
      tracks: normalizedTracks,
      ...(coverUrl ? { cover_image_url: coverUrl } : {}),
    };

    const existingEvents = await readEventsFile();
    existingEvents.push(newEvent);

    try {
      await persistEvents(existingEvents);
    } catch (persistError) {
      console.error("Failed to write events file:", persistError);
      return NextResponse.json(
        { error: "Failed to save the event to disk." },
        { status: 500 },
      );
    }

    return NextResponse.json({ event: newEvent }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Unexpected create-event error:", error);
    return NextResponse.json(
      { error: "Unexpected error while creating the event." },
      { status: 500 },
    );
  }
}
