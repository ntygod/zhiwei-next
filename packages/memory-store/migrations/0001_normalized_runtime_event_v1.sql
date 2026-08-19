CREATE TABLE runtime_events (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_fingerprint TEXT NOT NULL CHECK (length(event_fingerprint) = 64),
  protocol_version INTEGER NOT NULL CHECK (protocol_version = 1),
  workspace_id TEXT NOT NULL CHECK (length(trim(workspace_id)) > 0),
  runtime_session_id TEXT NOT NULL CHECK (length(trim(runtime_session_id)) > 0),
  runtime_instance_id TEXT NOT NULL CHECK (length(trim(runtime_instance_id)) > 0),
  source_adapter TEXT NOT NULL CHECK (length(trim(source_adapter)) > 0),
  runtime_implementation TEXT NOT NULL CHECK (length(trim(runtime_implementation)) > 0),
  runtime_version TEXT NOT NULL CHECK (length(trim(runtime_version)) > 0),
  source_surface TEXT NOT NULL CHECK (
    source_surface IN ('sdk', 'extension', 'rpc', 'host')
  ),
  source_event_type TEXT NOT NULL CHECK (length(trim(source_event_type)) > 0),
  sequence_domain TEXT NOT NULL CHECK (length(trim(sequence_domain)) > 0),
  source_sequence INTEGER NOT NULL CHECK (source_sequence > 0),
  observed_at TEXT NOT NULL CHECK (length(trim(observed_at)) > 0),
  provenance TEXT NOT NULL CHECK (
    provenance IN ('observed', 'host-synthesized')
  ),
  persistence TEXT NOT NULL CHECK (persistence IN ('durable', 'ephemeral')),
  stability TEXT NOT NULL CHECK (stability IN ('update', 'boundary', 'settled')),
  compatibility TEXT NOT NULL CHECK (compatibility IN ('required', 'ignorable')),
  correlation_json TEXT NOT NULL CHECK (json_valid(correlation_json)),
  links_json TEXT CHECK (links_json IS NULL OR json_valid(links_json)),
  data_kind TEXT NOT NULL CHECK (length(trim(data_kind)) > 0),
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  event_json TEXT NOT NULL CHECK (json_valid(event_json)),
  UNIQUE (
    workspace_id,
    runtime_session_id,
    runtime_instance_id,
    source_adapter,
    runtime_implementation,
    runtime_version,
    source_surface,
    sequence_domain,
    source_sequence
  )
) STRICT;

CREATE INDEX idx_runtime_events_session_row
  ON runtime_events (workspace_id, runtime_session_id, row_id);

CREATE INDEX idx_runtime_events_workspace_row
  ON runtime_events (workspace_id, row_id);

CREATE INDEX idx_runtime_events_source_stream
  ON runtime_events (
    workspace_id,
    runtime_session_id,
    runtime_instance_id,
    source_adapter,
    runtime_implementation,
    runtime_version,
    source_surface,
    sequence_domain,
    source_sequence
  );

CREATE TRIGGER runtime_events_reject_update
BEFORE UPDATE ON runtime_events
BEGIN
  SELECT RAISE(ABORT, 'runtime_events is append-only');
END;

CREATE TRIGGER runtime_events_reject_delete
BEFORE DELETE ON runtime_events
BEGIN
  SELECT RAISE(ABORT, 'runtime_events is append-only');
END;
