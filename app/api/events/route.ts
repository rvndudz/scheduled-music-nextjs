import { NextResponse } from "next/server";

import { persistEvents, readEventsFile } from "@/lib/events";
import { deleteObjectsForUrls } from "@/lib/r2Client";

export const runtime = "nodejs";

export async function GET() {
  try {
    const events = await readEventsFile();
    const sorted = [...events].sort(
      (a, b) =>
        new Date(a.start_time_utc).getTime() -
        new Date(b.start_time_utc).getTime(),
    );

    return NextResponse.json({ events: sorted }, { status: 200 });
  } catch (error) {
    console.error("Failed to read events file:", error);
    return NextResponse.json(
      { error: "Unable to read events from disk." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const existing = await readEventsFile();
    if (existing.length) {
      try {
        await deleteObjectsForUrls(
          existing.flatMap((event) => [
            ...event.tracks.map((track) => track.track_url),
            ...(event.cover_image_url ? [event.cover_image_url] : []),
          ]),
        );
      } catch (error) {
        console.error("Failed to delete track files while clearing events:", error);
        return NextResponse.json(
          { error: "Unable to delete event assets from storage." },
          { status: 502 },
        );
      }
    }
    await persistEvents([]);
    return NextResponse.json(
      { deleted: existing.length, remaining: 0 },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to delete events file:", error);
    return NextResponse.json(
      { error: "Unable to delete events." },
      { status: 500 },
    );
  }
}
