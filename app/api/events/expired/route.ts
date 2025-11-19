import { NextResponse } from "next/server";

import { isEventExpired, persistEvents, readEventsFile } from "@/lib/events";
import { deleteObjectsForUrls } from "@/lib/r2Client";

export const runtime = "nodejs";

export async function DELETE() {
  try {
    const events = await readEventsFile();
    const now = new Date();
    const expiredEvents = events.filter((event) => isEventExpired(event, now));
    const activeEvents = events.filter((event) => !isEventExpired(event, now));
    const deleted = events.length - activeEvents.length;

    if (deleted === 0) {
      return NextResponse.json(
        { deleted: 0, remaining: events.length },
        { status: 200 },
      );
    }

    try {
      await deleteObjectsForUrls(
        expiredEvents.flatMap((event) => [
          ...event.tracks.map((track) => track.track_url),
          ...(event.cover_image_url ? [event.cover_image_url] : []),
        ]),
      );
    } catch (error) {
      console.error("Failed to delete track files for expired events:", error);
      return NextResponse.json(
        { error: "Unable to delete expired event assets from storage." },
        { status: 502 },
      );
    }

    await persistEvents(activeEvents);
    return NextResponse.json(
      { deleted, remaining: activeEvents.length },
      { status: 200 },
    );
  } catch (error) {
    console.error("Failed to delete expired events:", error);
    return NextResponse.json(
      { error: "Unable to delete expired events." },
      { status: 500 },
    );
  }
}
