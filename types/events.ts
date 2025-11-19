export interface TrackRecord {
  track_id: string;
  track_name: string;
  track_url: string;
  track_duration_seconds: number;
}

export interface EventRecord {
  event_id: string;
  event_name: string;
  artist_name: string;
  start_time_utc: string;
  end_time_utc: string;
  tracks: TrackRecord[];
  cover_image_url?: string;
}
