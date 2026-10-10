-- Independent product persistence. Runtime v1 remains an immutable audit history.
CREATE TRIGGER runtime_events_reject_insert_v2
BEFORE INSERT ON runtime_events
BEGIN
  SELECT RAISE(ABORT, 'runtime_events is read-only after v2 migration');
END;

CREATE TABLE store_state (
  singleton INTEGER NOT NULL PRIMARY KEY CHECK (singleton = 1),
  installation_id TEXT NOT NULL CHECK (length(trim(installation_id)) > 0),
  applied_control_sequence INTEGER NOT NULL CHECK (applied_control_sequence BETWEEN 0 AND 9007199254740991),
  applied_control_checksum TEXT NOT NULL CHECK (length(applied_control_checksum) = 64),
  recovery_epoch INTEGER NOT NULL CHECK (recovery_epoch BETWEEN 0 AND 9007199254740991)
) STRICT;

CREATE TABLE scope_catalog (
  scope_key TEXT NOT NULL PRIMARY KEY CHECK (length(trim(scope_key)) > 0),
  scope_json TEXT NOT NULL UNIQUE CHECK (json_valid(scope_json)),
  cognition_epoch INTEGER NOT NULL CHECK (cognition_epoch BETWEEN 0 AND 9007199254740991),
  policy_epoch INTEGER NOT NULL CHECK (policy_epoch BETWEEN 0 AND 9007199254740991)
) STRICT;

CREATE TABLE content_object (
  content_id TEXT NOT NULL CHECK (length(trim(content_id)) > 0),
  content_version INTEGER NOT NULL CHECK (content_version BETWEEN 1 AND 9007199254740991),
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  privacy TEXT NOT NULL CHECK (privacy IN ('model-allowed', 'local-only')),
  state TEXT NOT NULL CHECK (state IN ('staged', 'available', 'revoked', 'purged')),
  purpose TEXT NOT NULL CHECK (purpose IN ('observation', 'claim', 'evidence', 'artifact', 'cognition')),
  retention_until TEXT NOT NULL CHECK (length(trim(retention_until)) > 0),
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
  reservation_id TEXT NOT NULL UNIQUE CHECK (length(trim(reservation_id)) > 0),
  digest TEXT CHECK (digest IS NULL OR (length(digest) = 64 AND digest NOT GLOB '*[^0-9a-f]*')),
  byte_count INTEGER CHECK (byte_count IS NULL OR byte_count BETWEEN 0 AND 9007199254740991),
  fence_json TEXT NOT NULL CHECK (json_valid(fence_json)),
  PRIMARY KEY (content_id, content_version),
  UNIQUE (scope_key, content_id, content_version),
  CHECK (state != 'available' OR (digest IS NOT NULL AND byte_count IS NOT NULL)),
  CHECK (state != 'purged' OR (digest IS NULL AND byte_count IS NULL))
) STRICT;
CREATE INDEX idx_content_object_scope_state ON content_object(scope_key, state, retention_until);

CREATE TABLE source_stream (
  stream_id TEXT NOT NULL PRIMARY KEY CHECK (length(trim(stream_id)) > 0),
  identity_json TEXT NOT NULL CHECK (json_valid(identity_json)),
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  last_sequence INTEGER NOT NULL CHECK (last_sequence BETWEEN 0 AND 9007199254740991),
  state TEXT NOT NULL CHECK (state IN ('complete', 'incomplete')),
  UNIQUE (scope_key, stream_id)
) STRICT;

CREATE TABLE observation_v2 (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT CHECK (row_id BETWEEN 1 AND 9007199254740991),
  id TEXT NOT NULL UNIQUE CHECK (length(trim(id)) > 0),
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  stream_id TEXT NOT NULL,
  source_sequence INTEGER NOT NULL CHECK (source_sequence BETWEEN 1 AND 9007199254740991),
  content_id TEXT,
  content_version INTEGER CHECK (content_version IS NULL OR content_version BETWEEN 1 AND 9007199254740991),
  event_json TEXT NOT NULL CHECK (json_valid(event_json)),
  availability TEXT NOT NULL CHECK (availability IN ('available', 'unavailable', 'revoked', 'purged')),
  UNIQUE (stream_id, source_sequence),
  UNIQUE (scope_key, id),
  FOREIGN KEY (scope_key, stream_id) REFERENCES source_stream(scope_key, stream_id),
  FOREIGN KEY (scope_key, content_id, content_version) REFERENCES content_object(scope_key, content_id, content_version),
  CHECK ((content_id IS NULL) = (content_version IS NULL)),
  CHECK (availability != 'available' OR content_id IS NOT NULL)
) STRICT;
CREATE INDEX idx_observation_v2_scope_row ON observation_v2(scope_key, row_id);
CREATE INDEX idx_observation_v2_scope_source ON observation_v2(scope_key, stream_id, source_sequence);
CREATE INDEX idx_observation_v2_content ON observation_v2(content_id, content_version);

CREATE TABLE claim (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(trim(id)) > 0),
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  current_version INTEGER NOT NULL CHECK (current_version BETWEEN 1 AND 9007199254740991),
  revision INTEGER NOT NULL CHECK (revision BETWEEN current_version AND 9007199254740991),
  UNIQUE (scope_key, id),
  FOREIGN KEY (scope_key, id, current_version) REFERENCES claim_version(scope_key, claim_id, version)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE claim_version (
  claim_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  revision INTEGER NOT NULL CHECK (revision BETWEEN version AND 9007199254740991),
  initial_revision INTEGER NOT NULL CHECK (initial_revision BETWEEN version AND revision),
  initial_updated_at TEXT NOT NULL CHECK (length(trim(initial_updated_at)) > 0),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'DISPUTED', 'EXPIRED', 'FORGOTTEN')),
  content_id TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK (content_version BETWEEN 1 AND 9007199254740991),
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json) AND json_type(metadata_json, '$.statement') IS NULL),
  superseded_by_version INTEGER CHECK (superseded_by_version IS NULL OR superseded_by_version > version),
  updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0),
  PRIMARY KEY (claim_id, version),
  UNIQUE (scope_key, claim_id, version),
  FOREIGN KEY (scope_key, claim_id) REFERENCES claim(scope_key, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (scope_key, content_id, content_version) REFERENCES content_object(scope_key, content_id, content_version)
) STRICT;
CREATE INDEX idx_claim_version_scope_status ON claim_version(scope_key, status, claim_id, version);
CREATE INDEX idx_claim_version_content ON claim_version(content_id, content_version);

CREATE TABLE evidence_edge (
  claim_id TEXT NOT NULL,
  claim_version INTEGER NOT NULL CHECK (claim_version BETWEEN 1 AND 9007199254740991),
  observation_id TEXT NOT NULL REFERENCES observation_v2(id),
  role TEXT NOT NULL CHECK (role IN ('supports', 'refutes')),
  PRIMARY KEY (claim_id, claim_version, observation_id, role),
  FOREIGN KEY (claim_id, claim_version) REFERENCES claim_version(claim_id, version)
) STRICT;
CREATE INDEX idx_evidence_edge_source ON evidence_edge(observation_id, claim_id, claim_version);

CREATE TABLE dependency_edge (
  source_kind TEXT NOT NULL CHECK (source_kind IN ('observation', 'claim', 'content')),
  source_id TEXT NOT NULL CHECK (length(trim(source_id)) > 0),
  source_version INTEGER NOT NULL CHECK (source_version BETWEEN 1 AND 9007199254740991),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('observation', 'claim', 'content')),
  target_id TEXT NOT NULL CHECK (length(trim(target_id)) > 0),
  target_version INTEGER NOT NULL CHECK (target_version BETWEEN 1 AND 9007199254740991),
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  PRIMARY KEY (source_kind, source_id, source_version, target_kind, target_id, target_version)
) STRICT;
CREATE INDEX idx_dependency_edge_target ON dependency_edge(target_kind, target_id, target_version);

CREATE TABLE outbox (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT CHECK (cursor > 0 AND cursor <= 9007199254740991),
  event_id TEXT NOT NULL UNIQUE CHECK (length(trim(event_id)) > 0),
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  type TEXT NOT NULL CHECK (length(trim(type)) > 0),
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('observation', 'claim', 'candidate', 'hypothesis', 'goal', 'content', 'source', 'control')),
  entity_id TEXT NOT NULL CHECK (length(trim(entity_id)) > 0),
  version INTEGER NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
  cognition_epoch INTEGER NOT NULL CHECK (cognition_epoch BETWEEN 0 AND 9007199254740991),
  recovery_epoch INTEGER NOT NULL CHECK (recovery_epoch BETWEEN 0 AND 9007199254740991),
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
  publish_state TEXT NOT NULL CHECK (publish_state IN ('pending', 'published', 'quarantined'))
) STRICT;
CREATE INDEX idx_outbox_scope_cursor ON outbox(scope_key, cursor);
CREATE INDEX idx_outbox_publication ON outbox(publish_state, cursor);

CREATE TABLE consumer_cursor (
  consumer_id TEXT NOT NULL CHECK (length(trim(consumer_id)) > 0),
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  cursor INTEGER NOT NULL CHECK (cursor BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY (consumer_id, scope_key)
) STRICT;

CREATE TABLE lifecycle_change (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(trim(id)) > 0),
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  kind TEXT NOT NULL CHECK (kind IN ('claim', 'content', 'observation')),
  entity_id TEXT NOT NULL CHECK (length(trim(entity_id)) > 0),
  version INTEGER NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
  from_state TEXT NOT NULL CHECK (length(trim(from_state)) > 0),
  to_state TEXT NOT NULL CHECK (length(trim(to_state)) > 0),
  reason_code TEXT NOT NULL CHECK (length(trim(reason_code)) > 0),
  at TEXT NOT NULL CHECK (length(trim(at)) > 0),
  cursor INTEGER NOT NULL REFERENCES outbox(cursor)
) STRICT;
CREATE INDEX idx_lifecycle_change_entity ON lifecycle_change(scope_key, kind, entity_id, version, cursor);

CREATE TABLE deletion_projection (
  control_sequence INTEGER NOT NULL PRIMARY KEY CHECK (control_sequence BETWEEN 1 AND 9007199254740991),
  control_checksum TEXT NOT NULL CHECK (length(control_checksum) = 64 AND control_checksum NOT GLOB '*[^0-9a-f]*'),
  operation_id TEXT NOT NULL UNIQUE CHECK (length(trim(operation_id)) > 0),
  applied_at TEXT NOT NULL CHECK (length(trim(applied_at)) > 0)
) STRICT;

CREATE TABLE managed_copy (
  content_id TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK (content_version BETWEEN 1 AND 9007199254740991),
  copy_kind TEXT NOT NULL CHECK (copy_kind IN ('file', 'staging', 'database', 'wal', 'projection', 'cache', 'artifact', 'backup')),
  state TEXT NOT NULL CHECK (state IN ('pending', 'purged', 'failed', 'expired', 'outside')),
  updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0),
  PRIMARY KEY (content_id, content_version, copy_kind),
  FOREIGN KEY (content_id, content_version) REFERENCES content_object(content_id, content_version)
) STRICT;
CREATE INDEX idx_managed_copy_state ON managed_copy(state, content_id, content_version);

-- Identity, append-only evidence and monotonic lifecycle guards apply to every writer.

CREATE TRIGGER store_state_reject_replacement
BEFORE INSERT ON store_state
WHEN EXISTS (SELECT 1 FROM store_state WHERE singleton = NEW.singleton)
BEGIN
  SELECT RAISE(ABORT, 'store_state replacement is forbidden');
END;

CREATE TRIGGER store_state_reject_delete
BEFORE DELETE ON store_state
BEGIN
  SELECT RAISE(ABORT, 'store_state deletion is forbidden');
END;

CREATE TRIGGER scope_catalog_reject_replacement
BEFORE INSERT ON scope_catalog
WHEN EXISTS (SELECT 1 FROM scope_catalog WHERE scope_key = NEW.scope_key OR scope_json = NEW.scope_json)
BEGIN
  SELECT RAISE(ABORT, 'scope_catalog replacement is forbidden');
END;

CREATE TRIGGER scope_catalog_reject_delete
BEFORE DELETE ON scope_catalog
BEGIN
  SELECT RAISE(ABORT, 'scope_catalog deletion is forbidden');
END;

CREATE TRIGGER content_object_reject_replacement
BEFORE INSERT ON content_object
WHEN EXISTS (SELECT 1 FROM content_object WHERE (content_id = NEW.content_id AND content_version = NEW.content_version) OR reservation_id = NEW.reservation_id)
BEGIN
  SELECT RAISE(ABORT, 'content_object replacement is forbidden');
END;

CREATE TRIGGER content_object_reject_delete
BEFORE DELETE ON content_object
BEGIN
  SELECT RAISE(ABORT, 'content_object deletion is forbidden');
END;

CREATE TRIGGER source_stream_reject_replacement
BEFORE INSERT ON source_stream
WHEN EXISTS (SELECT 1 FROM source_stream WHERE stream_id = NEW.stream_id)
BEGIN
  SELECT RAISE(ABORT, 'source_stream replacement is forbidden');
END;

CREATE TRIGGER source_stream_reject_delete
BEFORE DELETE ON source_stream
BEGIN
  SELECT RAISE(ABORT, 'source_stream deletion is forbidden');
END;

CREATE TRIGGER observation_v2_reject_replacement
BEFORE INSERT ON observation_v2
WHEN EXISTS (SELECT 1 FROM observation_v2 WHERE id = NEW.id OR row_id = NEW.row_id OR (stream_id = NEW.stream_id AND source_sequence = NEW.source_sequence))
BEGIN
  SELECT RAISE(ABORT, 'observation_v2 replacement is forbidden');
END;

CREATE TRIGGER observation_v2_reject_delete
BEFORE DELETE ON observation_v2
BEGIN
  SELECT RAISE(ABORT, 'observation_v2 deletion is forbidden');
END;

CREATE TRIGGER claim_reject_replacement
BEFORE INSERT ON claim
WHEN EXISTS (SELECT 1 FROM claim WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'claim replacement is forbidden');
END;

CREATE TRIGGER claim_reject_delete
BEFORE DELETE ON claim
BEGIN
  SELECT RAISE(ABORT, 'claim deletion is forbidden');
END;

CREATE TRIGGER claim_version_reject_replacement
BEFORE INSERT ON claim_version
WHEN EXISTS (SELECT 1 FROM claim_version WHERE claim_id = NEW.claim_id AND version = NEW.version)
BEGIN
  SELECT RAISE(ABORT, 'claim_version replacement is forbidden');
END;

CREATE TRIGGER claim_version_reject_delete
BEFORE DELETE ON claim_version
BEGIN
  SELECT RAISE(ABORT, 'claim_version deletion is forbidden');
END;

CREATE TRIGGER evidence_edge_reject_replacement
BEFORE INSERT ON evidence_edge
WHEN EXISTS (SELECT 1 FROM evidence_edge WHERE claim_id = NEW.claim_id AND claim_version = NEW.claim_version AND observation_id = NEW.observation_id AND role = NEW.role)
BEGIN
  SELECT RAISE(ABORT, 'evidence_edge replacement is forbidden');
END;

CREATE TRIGGER evidence_edge_reject_delete
BEFORE DELETE ON evidence_edge
BEGIN
  SELECT RAISE(ABORT, 'evidence_edge deletion is forbidden');
END;

CREATE TRIGGER evidence_edge_reject_update
BEFORE UPDATE ON evidence_edge
BEGIN
  SELECT RAISE(ABORT, 'evidence_edge is immutable');
END;

CREATE TRIGGER dependency_edge_reject_replacement
BEFORE INSERT ON dependency_edge
WHEN EXISTS (SELECT 1 FROM dependency_edge WHERE source_kind = NEW.source_kind AND source_id = NEW.source_id AND source_version = NEW.source_version AND target_kind = NEW.target_kind AND target_id = NEW.target_id AND target_version = NEW.target_version)
BEGIN
  SELECT RAISE(ABORT, 'dependency_edge replacement is forbidden');
END;

CREATE TRIGGER dependency_edge_reject_delete
BEFORE DELETE ON dependency_edge
BEGIN
  SELECT RAISE(ABORT, 'dependency_edge deletion is forbidden');
END;

CREATE TRIGGER dependency_edge_reject_update
BEFORE UPDATE ON dependency_edge
BEGIN
  SELECT RAISE(ABORT, 'dependency_edge is immutable');
END;

CREATE TRIGGER outbox_reject_replacement
BEFORE INSERT ON outbox
WHEN EXISTS (SELECT 1 FROM outbox WHERE cursor = NEW.cursor OR event_id = NEW.event_id)
BEGIN
  SELECT RAISE(ABORT, 'outbox replacement is forbidden');
END;

CREATE TRIGGER outbox_reject_delete
BEFORE DELETE ON outbox
BEGIN
  SELECT RAISE(ABORT, 'outbox deletion is forbidden');
END;

CREATE TRIGGER consumer_cursor_reject_replacement
BEFORE INSERT ON consumer_cursor
WHEN EXISTS (SELECT 1 FROM consumer_cursor WHERE consumer_id = NEW.consumer_id AND scope_key = NEW.scope_key)
BEGIN
  SELECT RAISE(ABORT, 'consumer_cursor replacement is forbidden');
END;

CREATE TRIGGER consumer_cursor_reject_delete
BEFORE DELETE ON consumer_cursor
BEGIN
  SELECT RAISE(ABORT, 'consumer_cursor deletion is forbidden');
END;

CREATE TRIGGER lifecycle_change_reject_replacement
BEFORE INSERT ON lifecycle_change
WHEN EXISTS (SELECT 1 FROM lifecycle_change WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'lifecycle_change replacement is forbidden');
END;

CREATE TRIGGER lifecycle_change_reject_delete
BEFORE DELETE ON lifecycle_change
BEGIN
  SELECT RAISE(ABORT, 'lifecycle_change deletion is forbidden');
END;

CREATE TRIGGER lifecycle_change_reject_update
BEFORE UPDATE ON lifecycle_change
BEGIN
  SELECT RAISE(ABORT, 'lifecycle_change is immutable');
END;

CREATE TRIGGER deletion_projection_reject_replacement
BEFORE INSERT ON deletion_projection
WHEN EXISTS (SELECT 1 FROM deletion_projection WHERE control_sequence = NEW.control_sequence OR operation_id = NEW.operation_id)
BEGIN
  SELECT RAISE(ABORT, 'deletion_projection replacement is forbidden');
END;

CREATE TRIGGER deletion_projection_reject_delete
BEFORE DELETE ON deletion_projection
BEGIN
  SELECT RAISE(ABORT, 'deletion_projection deletion is forbidden');
END;

CREATE TRIGGER deletion_projection_reject_update
BEFORE UPDATE ON deletion_projection
BEGIN
  SELECT RAISE(ABORT, 'deletion_projection is immutable');
END;

CREATE TRIGGER managed_copy_reject_replacement
BEFORE INSERT ON managed_copy
WHEN EXISTS (SELECT 1 FROM managed_copy WHERE content_id = NEW.content_id AND content_version = NEW.content_version AND copy_kind = NEW.copy_kind)
BEGIN
  SELECT RAISE(ABORT, 'managed_copy replacement is forbidden');
END;

CREATE TRIGGER managed_copy_reject_delete
BEFORE DELETE ON managed_copy
BEGIN
  SELECT RAISE(ABORT, 'managed_copy deletion is forbidden');
END;

CREATE TRIGGER store_state_guard_update
BEFORE UPDATE ON store_state
WHEN NEW.singleton IS NOT OLD.singleton
  OR NEW.installation_id IS NOT OLD.installation_id
  OR NEW.applied_control_sequence < OLD.applied_control_sequence
  OR NEW.recovery_epoch < OLD.recovery_epoch
  OR (NEW.applied_control_sequence = OLD.applied_control_sequence AND NEW.applied_control_checksum IS NOT OLD.applied_control_checksum)
BEGIN
  SELECT RAISE(ABORT, 'store_state immutable identity or monotonic state violated');
END;

CREATE TRIGGER scope_catalog_guard_update
BEFORE UPDATE ON scope_catalog
WHEN NEW.scope_key IS NOT OLD.scope_key
  OR NEW.scope_json IS NOT OLD.scope_json
  OR NEW.cognition_epoch < OLD.cognition_epoch
  OR NEW.policy_epoch < OLD.policy_epoch
BEGIN
  SELECT RAISE(ABORT, 'scope_catalog immutable identity or monotonic state violated');
END;

CREATE TRIGGER content_object_guard_update
BEFORE UPDATE ON content_object
WHEN NEW.content_id IS NOT OLD.content_id
  OR NEW.content_version IS NOT OLD.content_version
  OR NEW.scope_key IS NOT OLD.scope_key
  OR NEW.purpose IS NOT OLD.purpose
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.reservation_id IS NOT OLD.reservation_id
  OR NEW.fence_json IS NOT OLD.fence_json
  OR (OLD.privacy = 'local-only' AND NEW.privacy != 'local-only')
  OR NEW.retention_until > OLD.retention_until
  OR (OLD.state = 'available' AND NEW.state NOT IN ('available', 'revoked', 'purged'))
  OR (OLD.state = 'revoked' AND NEW.state NOT IN ('revoked', 'purged'))
  OR (OLD.state = 'purged' AND NEW.state != 'purged')
  OR (OLD.state != 'staged' AND NEW.state != 'purged' AND (NEW.digest IS NOT OLD.digest OR NEW.byte_count IS NOT OLD.byte_count))
BEGIN
  SELECT RAISE(ABORT, 'content_object immutable identity or monotonic state violated');
END;

CREATE TRIGGER source_stream_guard_update
BEFORE UPDATE ON source_stream
WHEN NEW.stream_id IS NOT OLD.stream_id
  OR NEW.identity_json IS NOT OLD.identity_json
  OR NEW.scope_key IS NOT OLD.scope_key
  OR NEW.last_sequence < OLD.last_sequence
BEGIN
  SELECT RAISE(ABORT, 'source_stream immutable identity or monotonic state violated');
END;

CREATE TRIGGER observation_v2_guard_update
BEFORE UPDATE ON observation_v2
WHEN NEW.row_id IS NOT OLD.row_id
  OR NEW.id IS NOT OLD.id
  OR NEW.scope_key IS NOT OLD.scope_key
  OR NEW.stream_id IS NOT OLD.stream_id
  OR NEW.source_sequence IS NOT OLD.source_sequence
  OR NEW.content_id IS NOT OLD.content_id
  OR NEW.content_version IS NOT OLD.content_version
  OR NEW.event_json IS NOT OLD.event_json
  OR (OLD.availability IN ('revoked', 'purged') AND NEW.availability NOT IN ('revoked', 'purged'))
  OR (OLD.availability = 'purged' AND NEW.availability != 'purged')
  OR (OLD.availability = 'unavailable' AND NEW.availability = 'available')
BEGIN
  SELECT RAISE(ABORT, 'observation_v2 immutable identity or monotonic state violated');
END;

CREATE TRIGGER claim_guard_update
BEFORE UPDATE ON claim
WHEN NEW.id IS NOT OLD.id
  OR NEW.scope_key IS NOT OLD.scope_key
  OR NEW.current_version < OLD.current_version
  OR NEW.revision < OLD.revision
BEGIN
  SELECT RAISE(ABORT, 'claim immutable identity or monotonic state violated');
END;

CREATE TRIGGER claim_version_guard_update
BEFORE UPDATE ON claim_version
WHEN NEW.claim_id IS NOT OLD.claim_id
  OR NEW.initial_revision IS NOT OLD.initial_revision
  OR NEW.initial_updated_at IS NOT OLD.initial_updated_at
  OR NEW.version IS NOT OLD.version
  OR NEW.scope_key IS NOT OLD.scope_key
  OR NEW.content_id IS NOT OLD.content_id
  OR NEW.content_version IS NOT OLD.content_version
  OR NEW.metadata_json IS NOT OLD.metadata_json
  OR NEW.revision < OLD.revision
  OR NEW.updated_at < OLD.updated_at
  OR (OLD.status != 'ACTIVE' AND NEW.status = 'ACTIVE')
  OR (OLD.superseded_by_version IS NOT NULL AND NEW.superseded_by_version IS NOT OLD.superseded_by_version)
BEGIN
  SELECT RAISE(ABORT, 'claim_version immutable identity or monotonic state violated');
END;

CREATE TRIGGER outbox_guard_update
BEFORE UPDATE ON outbox
WHEN NEW.cursor IS NOT OLD.cursor
  OR NEW.entity_kind IS NOT OLD.entity_kind
  OR NEW.event_id IS NOT OLD.event_id
  OR NEW.scope_key IS NOT OLD.scope_key
  OR NEW.type IS NOT OLD.type
  OR NEW.entity_id IS NOT OLD.entity_id
  OR NEW.version IS NOT OLD.version
  OR NEW.cognition_epoch IS NOT OLD.cognition_epoch
  OR NEW.recovery_epoch IS NOT OLD.recovery_epoch
  OR NEW.created_at IS NOT OLD.created_at
  OR (OLD.publish_state = 'quarantined' AND NEW.publish_state != 'quarantined')
BEGIN
  SELECT RAISE(ABORT, 'outbox immutable identity or monotonic state violated');
END;

CREATE TRIGGER consumer_cursor_guard_update
BEFORE UPDATE ON consumer_cursor
WHEN NEW.consumer_id IS NOT OLD.consumer_id
  OR NEW.scope_key IS NOT OLD.scope_key
  OR NEW.cursor < OLD.cursor
BEGIN
  SELECT RAISE(ABORT, 'consumer_cursor immutable identity or monotonic state violated');
END;

CREATE TRIGGER managed_copy_guard_update
BEFORE UPDATE ON managed_copy
WHEN NEW.content_id IS NOT OLD.content_id
  OR NEW.content_version IS NOT OLD.content_version
  OR NEW.copy_kind IS NOT OLD.copy_kind
BEGIN
  SELECT RAISE(ABORT, 'managed_copy immutable identity or monotonic state violated');
END;

CREATE TABLE source_suppression (
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  binding_id TEXT NOT NULL CHECK (length(trim(binding_id)) > 0),
  resource_id TEXT NOT NULL CHECK (length(trim(resource_id)) > 0),
  control_sequence INTEGER NOT NULL REFERENCES deletion_projection(control_sequence) DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY (scope_key, binding_id, resource_id)
) STRICT;
CREATE INDEX idx_source_suppression_binding ON source_suppression(scope_key, binding_id);

CREATE TRIGGER source_suppression_reject_update
BEFORE UPDATE ON source_suppression
BEGIN
  SELECT RAISE(ABORT, 'source_suppression is immutable');
END;

CREATE TRIGGER source_suppression_reject_delete
BEFORE DELETE ON source_suppression
BEGIN
  SELECT RAISE(ABORT, 'source_suppression deletion is forbidden');
END;

CREATE TRIGGER source_suppression_reject_replacement
BEFORE INSERT ON source_suppression
WHEN EXISTS (SELECT 1 FROM source_suppression WHERE scope_key = NEW.scope_key AND binding_id = NEW.binding_id AND resource_id = NEW.resource_id)
BEGIN
  SELECT RAISE(ABORT, 'source_suppression replacement is forbidden');
END;

-- Only the exact delivered P1 domain kinds have a snapshot consumer.
-- Their complete canonical domain DTO lives in the revocable content object.
CREATE TABLE cognitive_record (
  kind TEXT NOT NULL CHECK (kind IN ('candidate', 'hypothesis', 'goal', 'episode', 'working-state')),
  id TEXT NOT NULL CHECK (length(trim(id)) > 0),
  current_revision INTEGER NOT NULL CHECK (current_revision BETWEEN 1 AND 9007199254740991),
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  PRIMARY KEY (kind, id),
  UNIQUE (scope_key, kind, id),
  FOREIGN KEY (scope_key, kind, id, current_revision)
    REFERENCES cognitive_snapshot(scope_key, kind, id, revision) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE INDEX idx_cognitive_record_scope ON cognitive_record(scope_key, kind, id);

CREATE TABLE cognitive_snapshot (
  kind TEXT NOT NULL CHECK (kind IN ('candidate', 'hypothesis', 'goal', 'episode', 'working-state')),
  id TEXT NOT NULL CHECK (length(trim(id)) > 0),
  revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  version INTEGER CHECK (version IS NULL OR version BETWEEN 1 AND revision),
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  status TEXT,
  content_id TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK (content_version BETWEEN 1 AND 9007199254740991),
  metadata_json TEXT NOT NULL CHECK (
    json_valid(metadata_json)
    AND json_type(metadata_json, '$.statement') IS NULL
    AND json_type(metadata_json, '$.proposition') IS NULL
    AND json_type(metadata_json, '$.intent') IS NULL
    AND json_type(metadata_json, '$.summary') IS NULL
    AND json_type(metadata_json, '$.currentStep') IS NULL
  ),
  availability TEXT NOT NULL CHECK (availability IN ('available', 'revoked', 'purged')),
  PRIMARY KEY (kind, id, revision),
  UNIQUE (scope_key, kind, id, revision),
  FOREIGN KEY (scope_key, kind, id) REFERENCES cognitive_record(scope_key, kind, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (scope_key, content_id, content_version) REFERENCES content_object(scope_key, content_id, content_version),
  CHECK (
    (kind = 'candidate' AND version IS NULL AND status IS NOT NULL AND status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'))
    OR (kind = 'hypothesis' AND version IS NOT NULL AND status IS NOT NULL AND status IN ('OPEN', 'SUPPORTED', 'REFUTED', 'EXPIRED', 'WITHDRAWN'))
    OR (kind = 'goal' AND version IS NULL AND status IS NOT NULL AND status IN ('PROPOSED', 'ACTIVE', 'PAUSED', 'ACHIEVED', 'ABANDONED'))
    OR (kind = 'episode' AND version IS NOT NULL AND status IS NULL)
    OR (kind = 'working-state' AND version IS NULL AND status IS NULL)
  )
) STRICT;
CREATE INDEX idx_cognitive_snapshot_scope ON cognitive_snapshot(scope_key, kind, availability, id, revision);
CREATE INDEX idx_cognitive_snapshot_content ON cognitive_snapshot(content_id, content_version);

CREATE TABLE snapshot_dependency (
  source_kind TEXT NOT NULL CHECK (source_kind IN ('observation', 'claim', 'content')),
  source_id TEXT NOT NULL CHECK (length(trim(source_id)) > 0),
  source_version INTEGER NOT NULL CHECK (source_version BETWEEN 1 AND 9007199254740991),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('candidate', 'hypothesis', 'goal', 'episode', 'working-state')),
  target_id TEXT NOT NULL CHECK (length(trim(target_id)) > 0),
  target_revision INTEGER NOT NULL CHECK (target_revision BETWEEN 1 AND 9007199254740991),
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  PRIMARY KEY (source_kind, source_id, source_version, target_kind, target_id, target_revision),
  FOREIGN KEY (target_kind, target_id, target_revision) REFERENCES cognitive_snapshot(kind, id, revision)
) STRICT;
CREATE INDEX idx_snapshot_dependency_target ON snapshot_dependency(target_kind, target_id, target_revision);

CREATE TRIGGER cognitive_record_reject_replacement
BEFORE INSERT ON cognitive_record
WHEN EXISTS (SELECT 1 FROM cognitive_record WHERE kind = NEW.kind AND id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'cognitive_record replacement is forbidden');
END;

CREATE TRIGGER cognitive_record_reject_delete
BEFORE DELETE ON cognitive_record
BEGIN
  SELECT RAISE(ABORT, 'cognitive_record deletion is forbidden');
END;

CREATE TRIGGER cognitive_record_guard_update
BEFORE UPDATE ON cognitive_record
WHEN NEW.kind IS NOT OLD.kind OR NEW.id IS NOT OLD.id OR NEW.scope_key IS NOT OLD.scope_key
  OR NEW.current_revision < OLD.current_revision
BEGIN
  SELECT RAISE(ABORT, 'cognitive_record immutable identity or monotonic state violated');
END;

CREATE TRIGGER cognitive_snapshot_reject_replacement
BEFORE INSERT ON cognitive_snapshot
WHEN EXISTS (SELECT 1 FROM cognitive_snapshot WHERE kind = NEW.kind AND id = NEW.id AND revision = NEW.revision)
BEGIN
  SELECT RAISE(ABORT, 'cognitive_snapshot replacement is forbidden');
END;

CREATE TRIGGER cognitive_snapshot_reject_delete
BEFORE DELETE ON cognitive_snapshot
BEGIN
  SELECT RAISE(ABORT, 'cognitive_snapshot deletion is forbidden');
END;

CREATE TRIGGER cognitive_snapshot_guard_update
BEFORE UPDATE ON cognitive_snapshot
WHEN NEW.kind IS NOT OLD.kind OR NEW.id IS NOT OLD.id OR NEW.revision IS NOT OLD.revision
  OR NEW.version IS NOT OLD.version OR NEW.scope_key IS NOT OLD.scope_key OR NEW.status IS NOT OLD.status
  OR NEW.content_id IS NOT OLD.content_id OR NEW.content_version IS NOT OLD.content_version
  OR NEW.metadata_json IS NOT OLD.metadata_json
  OR (OLD.availability = 'revoked' AND NEW.availability NOT IN ('revoked', 'purged'))
  OR (OLD.availability = 'purged' AND NEW.availability != 'purged')
BEGIN
  SELECT RAISE(ABORT, 'cognitive_snapshot immutable identity or monotonic state violated');
END;

CREATE TRIGGER snapshot_dependency_reject_update
BEFORE UPDATE ON snapshot_dependency
BEGIN
  SELECT RAISE(ABORT, 'snapshot_dependency is immutable');
END;

CREATE TRIGGER snapshot_dependency_reject_delete
BEFORE DELETE ON snapshot_dependency
BEGIN
  SELECT RAISE(ABORT, 'snapshot_dependency deletion is forbidden');
END;

CREATE TRIGGER snapshot_dependency_reject_replacement
BEFORE INSERT ON snapshot_dependency
WHEN EXISTS (SELECT 1 FROM snapshot_dependency WHERE source_kind = NEW.source_kind AND source_id = NEW.source_id
  AND source_version = NEW.source_version AND target_kind = NEW.target_kind AND target_id = NEW.target_id
  AND target_revision = NEW.target_revision)
BEGIN
  SELECT RAISE(ABORT, 'snapshot_dependency replacement is forbidden');
END;
