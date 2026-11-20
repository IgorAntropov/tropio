export type EditorPosition = { lon: number; lat: number };
export type EditorTransportMode = 'car' | 'bicycle' | 'foot';
export type EditorBuildMode = 'automatic' | 'straight';
export type EditorMode = 'view' | 'draw' | 'poi' | 'split' | 'move';
export type EditorSelection = { type: 'point' | 'track'; id: string };
export type EditorStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'conflict' | 'error';

export type EditorPoint = {
  point_id: string;
  position: EditorPosition;
  requested_position?: EditorPosition;
  poi_id?: string;
  name?: string;
  description?: string;
};

export type EditorTrack = {
  track_id: string;
  start_point_id: string;
  end_point_id: string;
  transport_mode: EditorTransportMode;
  build_mode: EditorBuildMode;
  status?: 'ready' | 'needs_rebuild';
  distance_m?: number;
  ascent_m?: number | null;
  descent_m?: number | null;
  name?: string;
  description?: string;
};

export type EditorDraft = {
  points: readonly EditorPoint[];
  tracks: readonly EditorTrack[];
  trip_type?: EditorTransportMode | 'combined' | null;
};

export type EditorDay = { id: string; label: string; to: string };

export type EditorConflict = {
  status: 'idle' | 'loading' | 'error' | 'ready';
  server?: EditorDraft | null;
  local?: EditorDraft | null;
  error?: string | null;
};

export type EditorPreviewEnd = {
  requested: EditorPosition;
  snapped: EditorPosition | null;
  distance_m: number | null;
};

export type EditorPreview = {
  status: 'available' | 'unavailable';
  label?: string;
  canKeepUnbuilt?: boolean;
  reason?: 'outside_coverage' | 'disconnected' | 'no_edge';
  from: EditorPreviewEnd;
  to: EditorPreviewEnd;
  distance_m: number | null;
  elevation_profile?: { ascent_m: number | null; descent_m: number | null };
  alternatives: readonly {
    build_mode: EditorBuildMode;
    transport_mode: EditorTransportMode;
    distance_m: number;
    connection?: 'snapped_finish';
    warning?: 'unverified_passability';
  }[];
};

export type EditorPointChange = { id: string; position: EditorPosition; name: string; description: string };
export type EditorTrackChange = { id: string; name: string; description: string; transport_mode: EditorTransportMode; build_mode: EditorBuildMode };

export type EditorPoi = { name: string; description?: string; media?: readonly { href: string; media_id: string }[] };
export type EditorPoiInput = {
  position: EditorPosition;
  categories: readonly { category_id: string; label: string }[];
};
export type EditorPoiChange = { name: string; description: string; category_id: string };

export type EditorObject = { type: 'point'; point: EditorPoint } | { type: 'track'; track: EditorTrack };

export type EditorProps = {
  title: string;
  dayLabel: string;
  dayId?: string;
  backTo?: string;
  backLabel?: string;
  otherDays?: readonly EditorDay[];
  draft: EditorDraft;
  mode: EditorMode;
  modeHelp?: string;
  transportMode: EditorTransportMode;
  buildMode: EditorBuildMode;
  selection?: EditorSelection | null;
  editing?: boolean;
  status: EditorStatus;
  issue?: string | null;
  signInRequired?: boolean;
  loading?: boolean;
  readOnly?: boolean;
  busy?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  canClear?: boolean;
  hasLocalVersion?: boolean;
  viewingLocal?: boolean;
  preview?: EditorPreview | null;
  conflict?: EditorConflict | null;
  pendingPoi?: EditorPoiInput | null;
  activePoi?: EditorPoi | null;
};
