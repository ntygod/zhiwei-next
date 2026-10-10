-- Forward-only fixed v3 schema. Task text lives in scoped, revocable content objects.
-- Runtime audit and cognitive v1/v2 definitions are unchanged.

CREATE TABLE session_v1 (
  id TEXT NOT NULL CHECK (length(trim(id)) > 0) PRIMARY KEY,
  workspace_id TEXT NOT NULL CHECK (length(trim(workspace_id)) > 0),
  scope_key TEXT NOT NULL CHECK (length(trim(scope_key)) > 0) REFERENCES scope_catalog(scope_key),
  revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  owner_epoch INTEGER NOT NULL CHECK (owner_epoch BETWEEN 1 AND 9007199254740991),
  owner_instance_id TEXT NOT NULL CHECK (length(trim(owner_instance_id)) > 0),
  requires_reauthorization INTEGER NOT NULL CHECK (requires_reauthorization IN (0, 1)),
  contract_revision INTEGER NOT NULL CHECK (contract_revision BETWEEN 1 AND 9007199254740991),
  content_id TEXT NOT NULL CHECK (length(trim(content_id)) > 0),
  content_version INTEGER NOT NULL CHECK (content_version BETWEEN 1 AND 9007199254740991),
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
  updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0),
  UNIQUE (workspace_id, id),
  UNIQUE (scope_key, id),
  FOREIGN KEY (scope_key, content_id, content_version) REFERENCES content_object(scope_key, content_id, content_version),
  CHECK (updated_at >= created_at)
) STRICT;

CREATE TABLE task_v1 (
  id TEXT NOT NULL CHECK (length(trim(id)) > 0) PRIMARY KEY,
  workspace_id TEXT NOT NULL CHECK (length(trim(workspace_id)) > 0),
  session_id TEXT NOT NULL CHECK (length(trim(session_id)) > 0),
  scope_key TEXT NOT NULL CHECK (length(trim(scope_key)) > 0) REFERENCES scope_catalog(scope_key),
  current_revision INTEGER NOT NULL CHECK (current_revision BETWEEN 1 AND 9007199254740991),
  UNIQUE (scope_key, id),
  FOREIGN KEY (workspace_id, session_id) REFERENCES session_v1(workspace_id, id),
  FOREIGN KEY (id, current_revision) REFERENCES task_snapshot_v1(task_id, revision) DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE task_snapshot_v1 (
  task_id TEXT NOT NULL CHECK (length(trim(task_id)) > 0),
  revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  scope_key TEXT NOT NULL CHECK (length(trim(scope_key)) > 0),
  state TEXT NOT NULL CHECK (state IN ('CREATED', 'READY', 'RUNNING', 'VERIFYING', 'WAITING_INPUT', 'WAITING_APPROVAL', 'PAUSED', 'CANCELLING', 'NEEDS_RECONCILIATION', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED', 'UNVERIFIABLE')),
  intent_revision INTEGER NOT NULL CHECK (intent_revision BETWEEN 1 AND 9007199254740991),
  attempt_id TEXT NOT NULL CHECK (length(trim(attempt_id)) > 0),
  owner_epoch INTEGER NOT NULL CHECK (owner_epoch BETWEEN 1 AND 9007199254740991),
  content_id TEXT NOT NULL CHECK (length(trim(content_id)) > 0),
  content_version INTEGER NOT NULL CHECK (content_version BETWEEN 1 AND 9007199254740991),
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
  PRIMARY KEY (task_id, revision),
  UNIQUE (task_id, revision, attempt_id),
  FOREIGN KEY (scope_key, task_id) REFERENCES task_v1(scope_key, id),
  FOREIGN KEY (task_id, attempt_id) REFERENCES task_attempt_v1(task_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (scope_key, content_id, content_version) REFERENCES content_object(scope_key, content_id, content_version)
) STRICT;

CREATE TABLE task_attempt_v1 (
  id TEXT NOT NULL CHECK (length(trim(id)) > 0) PRIMARY KEY,
  task_id TEXT NOT NULL CHECK (length(trim(task_id)) > 0) REFERENCES task_v1(id),
  attempt_no INTEGER NOT NULL CHECK (attempt_no BETWEEN 1 AND 9007199254740991),
  intent_revision INTEGER NOT NULL CHECK (intent_revision BETWEEN 1 AND 9007199254740991),
  state TEXT NOT NULL CHECK (state IN ('CREATED', 'READY', 'RUNNING', 'VERIFYING', 'WAITING_INPUT', 'WAITING_APPROVAL', 'PAUSED', 'CANCELLING', 'NEEDS_RECONCILIATION', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED', 'UNVERIFIABLE')),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
  updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0),
  UNIQUE (task_id, attempt_no),
  UNIQUE (task_id, id),
  CHECK (updated_at >= created_at)
) STRICT;

CREATE UNIQUE INDEX idx_task_attempt_v1_active ON task_attempt_v1(task_id) WHERE active = 1;

CREATE TABLE task_outcome_v1 (
  id TEXT NOT NULL CHECK (length(trim(id)) > 0),
  revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  task_id TEXT NOT NULL CHECK (length(trim(task_id)) > 0),
  attempt_id TEXT NOT NULL CHECK (length(trim(attempt_id)) > 0),
  intent_revision INTEGER NOT NULL CHECK (intent_revision BETWEEN 1 AND 9007199254740991),
  status TEXT NOT NULL CHECK (status IN ('completed', 'partial', 'failed', 'cancelled', 'unverifiable')),
  snapshot_revision INTEGER NOT NULL CHECK (snapshot_revision BETWEEN 1 AND 9007199254740991),
  recorded_at TEXT NOT NULL CHECK (length(trim(recorded_at)) > 0),
  PRIMARY KEY (id, revision),
  FOREIGN KEY (task_id, attempt_id) REFERENCES task_attempt_v1(task_id, id),
  FOREIGN KEY (task_id, snapshot_revision, attempt_id) REFERENCES task_snapshot_v1(task_id, revision, attempt_id)
) STRICT;

CREATE TABLE task_input_v1 (
  id TEXT NOT NULL CHECK (length(trim(id)) > 0) PRIMARY KEY,
  task_id TEXT NOT NULL CHECK (length(trim(task_id)) > 0),
  attempt_id TEXT NOT NULL CHECK (length(trim(attempt_id)) > 0),
  task_revision INTEGER NOT NULL CHECK (task_revision BETWEEN 1 AND 9007199254740991),
  intent_revision INTEGER NOT NULL CHECK (intent_revision BETWEEN 1 AND 9007199254740991),
  kind TEXT NOT NULL CHECK (kind IN ('user_command', 'runtime_input', 'internal_command')),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 9007199254740991),
  owner_epoch INTEGER NOT NULL CHECK (owner_epoch BETWEEN 1 AND 9007199254740991),
  content_id TEXT NOT NULL CHECK (length(trim(content_id)) > 0),
  content_version INTEGER NOT NULL CHECK (content_version BETWEEN 1 AND 9007199254740991),
  scope_key TEXT NOT NULL CHECK (length(trim(scope_key)) > 0),
  UNIQUE (attempt_id, ordinal),
  FOREIGN KEY (task_id, attempt_id) REFERENCES task_attempt_v1(task_id, id),
  FOREIGN KEY (task_id, task_revision, attempt_id) REFERENCES task_snapshot_v1(task_id, revision, attempt_id),
  FOREIGN KEY (scope_key, task_id) REFERENCES task_v1(scope_key, id),
  FOREIGN KEY (scope_key, content_id, content_version) REFERENCES content_object(scope_key, content_id, content_version)
) STRICT;

CREATE TABLE working_state_v1 (
  task_id TEXT NOT NULL CHECK (length(trim(task_id)) > 0),
  task_revision INTEGER NOT NULL CHECK (task_revision BETWEEN 1 AND 9007199254740991),
  attempt_id TEXT NOT NULL CHECK (length(trim(attempt_id)) > 0),
  content_id TEXT NOT NULL CHECK (length(trim(content_id)) > 0),
  content_version INTEGER NOT NULL CHECK (content_version BETWEEN 1 AND 9007199254740991),
  scope_key TEXT NOT NULL CHECK (length(trim(scope_key)) > 0),
  PRIMARY KEY (task_id, task_revision),
  FOREIGN KEY (task_id, attempt_id) REFERENCES task_attempt_v1(task_id, id),
  FOREIGN KEY (task_id, task_revision, attempt_id) REFERENCES task_snapshot_v1(task_id, revision, attempt_id),
  FOREIGN KEY (scope_key, task_id) REFERENCES task_v1(scope_key, id),
  FOREIGN KEY (scope_key, content_id, content_version) REFERENCES content_object(scope_key, content_id, content_version)
) STRICT;

CREATE TABLE task_receipt_v1 (
  principal_id TEXT NOT NULL CHECK (length(trim(principal_id)) > 0),
  command_kind TEXT NOT NULL CHECK (length(trim(command_kind)) > 0),
  idempotency_key TEXT NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  command_id TEXT NOT NULL CHECK (length(trim(command_id)) > 0),
  workspace_id TEXT NOT NULL CHECK (length(trim(workspace_id)) > 0),
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('session', 'task')),
  entity_id TEXT NOT NULL CHECK (length(trim(entity_id)) > 0),
  revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  commit_cursor INTEGER NOT NULL CHECK (commit_cursor BETWEEN 1 AND 9007199254740991) UNIQUE REFERENCES task_outbox_v1(cursor),
  content_id TEXT NOT NULL CHECK (length(trim(content_id)) > 0),
  content_version INTEGER NOT NULL CHECK (content_version BETWEEN 1 AND 9007199254740991),
  scope_key TEXT NOT NULL CHECK (length(trim(scope_key)) > 0),
  PRIMARY KEY (principal_id, command_kind, idempotency_key),
  UNIQUE (principal_id, command_id),
  FOREIGN KEY (scope_key, content_id, content_version) REFERENCES content_object(scope_key, content_id, content_version)
) STRICT;

CREATE TABLE task_content_dependency_v1 (
  source_id TEXT NOT NULL CHECK (length(trim(source_id)) > 0),
  source_version INTEGER NOT NULL CHECK (source_version BETWEEN 1 AND 9007199254740991),
  target_id TEXT NOT NULL CHECK (length(trim(target_id)) > 0),
  target_version INTEGER NOT NULL CHECK (target_version BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY (source_id, source_version, target_id, target_version),
  FOREIGN KEY (source_id, source_version) REFERENCES content_object(content_id, content_version),
  FOREIGN KEY (target_id, target_version) REFERENCES content_object(content_id, content_version)
) STRICT;

CREATE TABLE task_outbox_v1 (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT CHECK (cursor BETWEEN 1 AND 9007199254740991),
  event_id TEXT NOT NULL CHECK (length(trim(event_id)) > 0) UNIQUE,
  workspace_id TEXT NOT NULL CHECK (length(trim(workspace_id)) > 0),
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('session', 'task')),
  entity_id TEXT NOT NULL CHECK (length(trim(entity_id)) > 0),
  revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  event_type TEXT NOT NULL CHECK (event_type IN ('session.created', 'session.owner_fenced', 'task.created', 'task.state_changed', 'task.input_committed', 'task.progress')),
  owner_epoch INTEGER NOT NULL CHECK (owner_epoch BETWEEN 1 AND 9007199254740991),
  recovery_epoch INTEGER NOT NULL CHECK (recovery_epoch BETWEEN 0 AND 9007199254740991),
  occurred_at TEXT NOT NULL CHECK (length(trim(occurred_at)) > 0),
  publish_state TEXT NOT NULL CHECK (publish_state IN ('pending', 'published', 'quarantined')),
  event_json TEXT NOT NULL CHECK (json_valid(event_json))
) STRICT;

CREATE TABLE task_consumer_v1 (
  consumer_id TEXT NOT NULL CHECK (length(trim(consumer_id)) > 0),
  workspace_id TEXT NOT NULL CHECK (length(trim(workspace_id)) > 0),
  cursor INTEGER NOT NULL CHECK (cursor BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY (consumer_id, workspace_id)
) STRICT;

CREATE INDEX idx_session_v1_workspace ON session_v1(workspace_id, id);

CREATE INDEX idx_task_v1_workspace ON task_v1(workspace_id, session_id, id);

CREATE INDEX idx_task_outbox_v1_workspace ON task_outbox_v1(workspace_id, cursor);

CREATE INDEX idx_task_content_dependency_v1_target ON task_content_dependency_v1(target_id, target_version);

CREATE TRIGGER session_v1_reject_replacement
BEFORE INSERT ON session_v1
WHEN EXISTS (SELECT 1 FROM session_v1 WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'session_v1 reject replacement');
END;

CREATE TRIGGER session_v1_reject_delete
BEFORE DELETE ON session_v1
BEGIN
  SELECT RAISE(ABORT, 'session_v1 reject delete');
END;

CREATE TRIGGER task_v1_reject_replacement
BEFORE INSERT ON task_v1
WHEN EXISTS (SELECT 1 FROM task_v1 WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'task_v1 reject replacement');
END;

CREATE TRIGGER task_v1_reject_delete
BEFORE DELETE ON task_v1
BEGIN
  SELECT RAISE(ABORT, 'task_v1 reject delete');
END;

CREATE TRIGGER task_snapshot_v1_reject_replacement
BEFORE INSERT ON task_snapshot_v1
WHEN EXISTS (SELECT 1 FROM task_snapshot_v1 WHERE task_id = NEW.task_id AND revision = NEW.revision)
BEGIN
  SELECT RAISE(ABORT, 'task_snapshot_v1 reject replacement');
END;

CREATE TRIGGER task_snapshot_v1_reject_delete
BEFORE DELETE ON task_snapshot_v1
BEGIN
  SELECT RAISE(ABORT, 'task_snapshot_v1 reject delete');
END;

CREATE TRIGGER task_snapshot_v1_reject_update
BEFORE UPDATE ON task_snapshot_v1
BEGIN
  SELECT RAISE(ABORT, 'task_snapshot_v1 reject update');
END;

CREATE TRIGGER task_attempt_v1_reject_replacement
BEFORE INSERT ON task_attempt_v1
WHEN EXISTS (SELECT 1 FROM task_attempt_v1 WHERE id = NEW.id OR (task_id = NEW.task_id AND attempt_no = NEW.attempt_no) OR (task_id = NEW.task_id AND active = 1 AND NEW.active = 1))
BEGIN
  SELECT RAISE(ABORT, 'task_attempt_v1 reject replacement');
END;

CREATE TRIGGER task_attempt_v1_reject_delete
BEFORE DELETE ON task_attempt_v1
BEGIN
  SELECT RAISE(ABORT, 'task_attempt_v1 reject delete');
END;

CREATE TRIGGER task_outcome_v1_reject_replacement
BEFORE INSERT ON task_outcome_v1
WHEN EXISTS (SELECT 1 FROM task_outcome_v1 WHERE id = NEW.id AND revision = NEW.revision)
BEGIN
  SELECT RAISE(ABORT, 'task_outcome_v1 reject replacement');
END;

CREATE TRIGGER task_outcome_v1_reject_delete
BEFORE DELETE ON task_outcome_v1
BEGIN
  SELECT RAISE(ABORT, 'task_outcome_v1 reject delete');
END;

CREATE TRIGGER task_outcome_v1_reject_update
BEFORE UPDATE ON task_outcome_v1
BEGIN
  SELECT RAISE(ABORT, 'task_outcome_v1 reject update');
END;

CREATE TRIGGER task_input_v1_reject_replacement
BEFORE INSERT ON task_input_v1
WHEN EXISTS (SELECT 1 FROM task_input_v1 WHERE id = NEW.id OR (attempt_id = NEW.attempt_id AND ordinal = NEW.ordinal))
BEGIN
  SELECT RAISE(ABORT, 'task_input_v1 reject replacement');
END;

CREATE TRIGGER task_input_v1_reject_delete
BEFORE DELETE ON task_input_v1
BEGIN
  SELECT RAISE(ABORT, 'task_input_v1 reject delete');
END;

CREATE TRIGGER task_input_v1_reject_update
BEFORE UPDATE ON task_input_v1
BEGIN
  SELECT RAISE(ABORT, 'task_input_v1 reject update');
END;

CREATE TRIGGER working_state_v1_reject_replacement
BEFORE INSERT ON working_state_v1
WHEN EXISTS (SELECT 1 FROM working_state_v1 WHERE task_id = NEW.task_id AND task_revision = NEW.task_revision)
BEGIN
  SELECT RAISE(ABORT, 'working_state_v1 reject replacement');
END;

CREATE TRIGGER working_state_v1_reject_delete
BEFORE DELETE ON working_state_v1
BEGIN
  SELECT RAISE(ABORT, 'working_state_v1 reject delete');
END;

CREATE TRIGGER working_state_v1_reject_update
BEFORE UPDATE ON working_state_v1
BEGIN
  SELECT RAISE(ABORT, 'working_state_v1 reject update');
END;

CREATE TRIGGER task_receipt_v1_reject_replacement
BEFORE INSERT ON task_receipt_v1
WHEN EXISTS (SELECT 1 FROM task_receipt_v1 WHERE (principal_id = NEW.principal_id AND command_kind = NEW.command_kind AND idempotency_key = NEW.idempotency_key) OR (principal_id = NEW.principal_id AND command_id = NEW.command_id) OR commit_cursor = NEW.commit_cursor)
BEGIN
  SELECT RAISE(ABORT, 'task_receipt_v1 reject replacement');
END;

CREATE TRIGGER task_receipt_v1_reject_delete
BEFORE DELETE ON task_receipt_v1
BEGIN
  SELECT RAISE(ABORT, 'task_receipt_v1 reject delete');
END;

CREATE TRIGGER task_receipt_v1_reject_update
BEFORE UPDATE ON task_receipt_v1
BEGIN
  SELECT RAISE(ABORT, 'task_receipt_v1 reject update');
END;

CREATE TRIGGER task_content_dependency_v1_reject_replacement
BEFORE INSERT ON task_content_dependency_v1
WHEN EXISTS (SELECT 1 FROM task_content_dependency_v1 WHERE source_id = NEW.source_id AND source_version = NEW.source_version AND target_id = NEW.target_id AND target_version = NEW.target_version)
BEGIN
  SELECT RAISE(ABORT, 'task_content_dependency_v1 reject replacement');
END;

CREATE TRIGGER task_content_dependency_v1_reject_delete
BEFORE DELETE ON task_content_dependency_v1
BEGIN
  SELECT RAISE(ABORT, 'task_content_dependency_v1 reject delete');
END;

CREATE TRIGGER task_content_dependency_v1_reject_update
BEFORE UPDATE ON task_content_dependency_v1
BEGIN
  SELECT RAISE(ABORT, 'task_content_dependency_v1 reject update');
END;

CREATE TRIGGER task_outbox_v1_reject_replacement
BEFORE INSERT ON task_outbox_v1
WHEN EXISTS (SELECT 1 FROM task_outbox_v1 WHERE cursor = NEW.cursor OR event_id = NEW.event_id)
BEGIN
  SELECT RAISE(ABORT, 'task_outbox_v1 reject replacement');
END;

CREATE TRIGGER task_outbox_v1_reject_delete
BEFORE DELETE ON task_outbox_v1
BEGIN
  SELECT RAISE(ABORT, 'task_outbox_v1 reject delete');
END;

CREATE TRIGGER task_consumer_v1_reject_replacement
BEFORE INSERT ON task_consumer_v1
WHEN EXISTS (SELECT 1 FROM task_consumer_v1 WHERE consumer_id = NEW.consumer_id AND workspace_id = NEW.workspace_id)
BEGIN
  SELECT RAISE(ABORT, 'task_consumer_v1 reject replacement');
END;

CREATE TRIGGER task_consumer_v1_reject_delete
BEFORE DELETE ON task_consumer_v1
BEGIN
  SELECT RAISE(ABORT, 'task_consumer_v1 reject delete');
END;

CREATE TRIGGER session_v1_guard_update
BEFORE UPDATE ON session_v1
WHEN NEW.id IS NOT OLD.id
  OR NEW.workspace_id IS NOT OLD.workspace_id
  OR NEW.scope_key IS NOT OLD.scope_key
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.revision != OLD.revision + 1
  OR NEW.owner_epoch < OLD.owner_epoch
  OR NEW.owner_epoch > OLD.owner_epoch + 1
  OR NEW.contract_revision < OLD.contract_revision
  OR NEW.updated_at < OLD.updated_at
  OR (NEW.owner_instance_id IS NOT OLD.owner_instance_id AND NEW.owner_epoch != OLD.owner_epoch + 1)
BEGIN
  SELECT RAISE(ABORT, 'session_v1 guard update');
END;

CREATE TRIGGER task_v1_guard_update
BEFORE UPDATE ON task_v1
WHEN NEW.id IS NOT OLD.id
  OR NEW.workspace_id IS NOT OLD.workspace_id
  OR NEW.session_id IS NOT OLD.session_id
  OR NEW.scope_key IS NOT OLD.scope_key
  OR NEW.current_revision != OLD.current_revision + 1
BEGIN
  SELECT RAISE(ABORT, 'task_v1 guard update');
END;

CREATE TRIGGER task_attempt_v1_guard_update
BEFORE UPDATE ON task_attempt_v1
WHEN NEW.id IS NOT OLD.id
  OR NEW.task_id IS NOT OLD.task_id
  OR NEW.attempt_no IS NOT OLD.attempt_no
  OR NEW.intent_revision IS NOT OLD.intent_revision
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.active > OLD.active
  OR NEW.updated_at < OLD.updated_at
  OR (OLD.state IN ('COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED', 'UNVERIFIABLE') AND NEW.state IS NOT OLD.state)
BEGIN
  SELECT RAISE(ABORT, 'task_attempt_v1 guard update');
END;

CREATE TRIGGER task_outbox_v1_guard_update
BEFORE UPDATE ON task_outbox_v1
WHEN NEW.cursor IS NOT OLD.cursor
  OR NEW.event_id IS NOT OLD.event_id
  OR NEW.workspace_id IS NOT OLD.workspace_id
  OR NEW.entity_kind IS NOT OLD.entity_kind
  OR NEW.entity_id IS NOT OLD.entity_id
  OR NEW.revision IS NOT OLD.revision
  OR NEW.event_type IS NOT OLD.event_type
  OR NEW.owner_epoch IS NOT OLD.owner_epoch
  OR NEW.recovery_epoch IS NOT OLD.recovery_epoch
  OR NEW.occurred_at IS NOT OLD.occurred_at
  OR NEW.event_json IS NOT OLD.event_json
  OR NOT (
    NEW.publish_state IS OLD.publish_state
    OR (OLD.publish_state = 'pending' AND NEW.publish_state IN ('published', 'quarantined'))
    OR (OLD.publish_state = 'published' AND NEW.publish_state = 'quarantined')
  )
BEGIN
  SELECT RAISE(ABORT, 'task_outbox_v1 guard update');
END;

CREATE TRIGGER task_consumer_v1_guard_update
BEFORE UPDATE ON task_consumer_v1
WHEN NEW.consumer_id IS NOT OLD.consumer_id
  OR NEW.workspace_id IS NOT OLD.workspace_id
  OR NEW.cursor < OLD.cursor
BEGIN
  SELECT RAISE(ABORT, 'task_consumer_v1 guard update');
END;

-- Execution identities and journals are durable metadata, never evidence of dispatch by themselves.

CREATE TABLE task_execution_v1 (
  binding_id TEXT NOT NULL CHECK (length(trim(binding_id)) > 0) PRIMARY KEY,
  execution_unit_id TEXT NOT NULL CHECK (length(trim(execution_unit_id)) > 0) UNIQUE,
  workspace_id TEXT NOT NULL CHECK (length(trim(workspace_id)) > 0),
  task_id TEXT NOT NULL CHECK (length(trim(task_id)) > 0),
  attempt_id TEXT NOT NULL CHECK (length(trim(attempt_id)) > 0),
  task_revision INTEGER NOT NULL CHECK (task_revision BETWEEN 1 AND 9007199254740991),
  intent_revision INTEGER NOT NULL CHECK (intent_revision BETWEEN 1 AND 9007199254740991),
  owner_epoch INTEGER NOT NULL CHECK (owner_epoch BETWEEN 1 AND 9007199254740991),
  recovery_epoch INTEGER NOT NULL CHECK (recovery_epoch BETWEEN 0 AND 9007199254740991),
  scope_key TEXT NOT NULL CHECK (length(trim(scope_key)) > 0),
  current_revision INTEGER NOT NULL CHECK (current_revision BETWEEN 1 AND 9007199254740991),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
  updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0),
  UNIQUE (task_id, binding_id),
  UNIQUE (scope_key, binding_id),
  FOREIGN KEY (scope_key, task_id) REFERENCES task_v1(scope_key, id),
  FOREIGN KEY (task_id, task_revision, attempt_id) REFERENCES task_snapshot_v1(task_id, revision, attempt_id),
  FOREIGN KEY (binding_id, current_revision) REFERENCES task_execution_snapshot_v1(binding_id, revision) DEFERRABLE INITIALLY DEFERRED,
  CHECK (updated_at >= created_at)
) STRICT;

CREATE UNIQUE INDEX idx_task_execution_v1_active ON task_execution_v1(task_id, owner_epoch) WHERE active = 1;

CREATE TABLE task_execution_snapshot_v1 (
  binding_id TEXT NOT NULL CHECK (length(trim(binding_id)) > 0),
  revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  task_id TEXT NOT NULL CHECK (length(trim(task_id)) > 0),
  task_revision INTEGER NOT NULL CHECK (task_revision BETWEEN 1 AND 9007199254740991),
  attempt_id TEXT NOT NULL CHECK (length(trim(attempt_id)) > 0),
  intent_revision INTEGER NOT NULL CHECK (intent_revision BETWEEN 1 AND 9007199254740991),
  owner_epoch INTEGER NOT NULL CHECK (owner_epoch BETWEEN 1 AND 9007199254740991),
  recovery_epoch INTEGER NOT NULL CHECK (recovery_epoch BETWEEN 0 AND 9007199254740991),
  scope_key TEXT NOT NULL CHECK (length(trim(scope_key)) > 0),
  state TEXT NOT NULL CHECK (state IN ('ALLOCATED', 'READY', 'BUSY', 'DRAINING', 'STOPPED')),
  dispatched INTEGER NOT NULL CHECK (dispatched IN (0, 1)),
  closed INTEGER NOT NULL CHECK (closed IN (0, 1)),
  content_id TEXT NOT NULL CHECK (length(trim(content_id)) > 0),
  content_version INTEGER NOT NULL CHECK (content_version BETWEEN 1 AND 9007199254740991),
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
  PRIMARY KEY (binding_id, revision),
  FOREIGN KEY (scope_key, binding_id) REFERENCES task_execution_v1(scope_key, binding_id),
  FOREIGN KEY (task_id, binding_id) REFERENCES task_execution_v1(task_id, binding_id),
  FOREIGN KEY (task_id, task_revision, attempt_id) REFERENCES task_snapshot_v1(task_id, revision, attempt_id),
  FOREIGN KEY (scope_key, content_id, content_version) REFERENCES content_object(scope_key, content_id, content_version),
  CHECK (closed = (state = 'STOPPED')),
  CHECK (state NOT IN ('BUSY', 'DRAINING') OR dispatched = 1),
  CHECK (state NOT IN ('ALLOCATED', 'READY') OR dispatched = 0)
) STRICT;

CREATE TABLE task_execution_stream_v1 (
  binding_id TEXT NOT NULL CHECK (length(trim(binding_id)) > 0) REFERENCES task_execution_v1(binding_id),
  source_key TEXT NOT NULL CHECK (length(trim(source_key)) > 0),
  source_stream_id TEXT NOT NULL CHECK (length(trim(source_stream_id)) > 0),
  last_sequence INTEGER NOT NULL CHECK (last_sequence BETWEEN 1 AND 9007199254740991),
  last_event_id TEXT NOT NULL CHECK (length(trim(last_event_id)) > 0) REFERENCES task_execution_event_v1(event_id) DEFERRABLE INITIALLY DEFERRED,
  PRIMARY KEY (binding_id, source_key)
) STRICT;

CREATE TABLE task_execution_event_v1 (
  row_id INTEGER PRIMARY KEY AUTOINCREMENT CHECK (row_id BETWEEN 1 AND 9007199254740991),
  event_id TEXT NOT NULL CHECK (length(trim(event_id)) > 0) UNIQUE,
  idempotency_key TEXT NOT NULL CHECK (length(trim(idempotency_key)) > 0) UNIQUE,
  binding_id TEXT NOT NULL CHECK (length(trim(binding_id)) > 0),
  task_id TEXT NOT NULL CHECK (length(trim(task_id)) > 0),
  attempt_id TEXT NOT NULL CHECK (length(trim(attempt_id)) > 0),
  task_revision INTEGER NOT NULL CHECK (task_revision BETWEEN 1 AND 9007199254740991),
  intent_revision INTEGER NOT NULL CHECK (intent_revision BETWEEN 1 AND 9007199254740991),
  owner_epoch INTEGER NOT NULL CHECK (owner_epoch BETWEEN 1 AND 9007199254740991),
  recovery_epoch INTEGER NOT NULL CHECK (recovery_epoch BETWEEN 0 AND 9007199254740991),
  scope_key TEXT NOT NULL CHECK (length(trim(scope_key)) > 0),
  source_stream_id TEXT NOT NULL CHECK (length(trim(source_stream_id)) > 0),
  source_key TEXT NOT NULL CHECK (length(trim(source_key)) > 0),
  source_sequence INTEGER NOT NULL CHECK (source_sequence BETWEEN 1 AND 9007199254740991),
  content_id TEXT NOT NULL CHECK (length(trim(content_id)) > 0),
  content_version INTEGER NOT NULL CHECK (content_version BETWEEN 1 AND 9007199254740991),
  commit_cursor INTEGER NOT NULL CHECK (commit_cursor BETWEEN 1 AND 9007199254740991) UNIQUE REFERENCES task_outbox_v1(cursor),
  recorded_at TEXT NOT NULL CHECK (length(trim(recorded_at)) > 0),
  UNIQUE (source_key, source_sequence),
  FOREIGN KEY (task_id, binding_id) REFERENCES task_execution_v1(task_id, binding_id),
  FOREIGN KEY (scope_key, binding_id) REFERENCES task_execution_v1(scope_key, binding_id),
  FOREIGN KEY (task_id, task_revision, attempt_id) REFERENCES task_snapshot_v1(task_id, revision, attempt_id),
  FOREIGN KEY (scope_key, content_id, content_version) REFERENCES content_object(scope_key, content_id, content_version)
) STRICT;

CREATE TABLE task_model_request_v1 (
  binding_id TEXT NOT NULL CHECK (length(trim(binding_id)) > 0),
  request_id TEXT NOT NULL CHECK (length(trim(request_id)) > 0),
  task_id TEXT NOT NULL CHECK (length(trim(task_id)) > 0),
  attempt_id TEXT NOT NULL CHECK (length(trim(attempt_id)) > 0),
  task_revision INTEGER NOT NULL CHECK (task_revision BETWEEN 1 AND 9007199254740991),
  intent_revision INTEGER NOT NULL CHECK (intent_revision BETWEEN 1 AND 9007199254740991),
  owner_epoch INTEGER NOT NULL CHECK (owner_epoch BETWEEN 1 AND 9007199254740991),
  recovery_epoch INTEGER NOT NULL CHECK (recovery_epoch BETWEEN 0 AND 9007199254740991),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 9007199254740991),
  max_tokens INTEGER NOT NULL CHECK (max_tokens BETWEEN 1 AND 9007199254740991),
  scope_key TEXT NOT NULL CHECK (length(trim(scope_key)) > 0),
  content_id TEXT NOT NULL CHECK (length(trim(content_id)) > 0),
  content_version INTEGER NOT NULL CHECK (content_version BETWEEN 1 AND 9007199254740991),
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
  PRIMARY KEY (binding_id, request_id),
  UNIQUE (binding_id, ordinal),
  FOREIGN KEY (task_id, binding_id) REFERENCES task_execution_v1(task_id, binding_id),
  FOREIGN KEY (scope_key, binding_id) REFERENCES task_execution_v1(scope_key, binding_id),
  FOREIGN KEY (task_id, task_revision, attempt_id) REFERENCES task_snapshot_v1(task_id, revision, attempt_id),
  FOREIGN KEY (scope_key, content_id, content_version) REFERENCES content_object(scope_key, content_id, content_version)
) STRICT;

CREATE TABLE task_execution_ack_v1 (
  event_id TEXT NOT NULL CHECK (length(trim(event_id)) > 0) PRIMARY KEY REFERENCES task_execution_event_v1(event_id),
  commit_cursor INTEGER NOT NULL CHECK (commit_cursor BETWEEN 1 AND 9007199254740991) REFERENCES task_outbox_v1(cursor)
) STRICT;

CREATE INDEX idx_task_execution_event_v1_binding ON task_execution_event_v1(binding_id, row_id);

CREATE TRIGGER task_execution_v1_reject_replacement
BEFORE INSERT ON task_execution_v1
WHEN EXISTS (SELECT 1 FROM task_execution_v1 WHERE binding_id = NEW.binding_id OR execution_unit_id = NEW.execution_unit_id OR (task_id = NEW.task_id AND owner_epoch = NEW.owner_epoch AND active = 1 AND NEW.active = 1))
BEGIN
  SELECT RAISE(ABORT, 'task_execution_v1 reject replacement');
END;

CREATE TRIGGER task_execution_v1_reject_delete
BEFORE DELETE ON task_execution_v1
BEGIN
  SELECT RAISE(ABORT, 'task_execution_v1 reject delete');
END;

CREATE TRIGGER task_execution_snapshot_v1_reject_replacement
BEFORE INSERT ON task_execution_snapshot_v1
WHEN EXISTS (SELECT 1 FROM task_execution_snapshot_v1 WHERE binding_id = NEW.binding_id AND revision = NEW.revision)
BEGIN
  SELECT RAISE(ABORT, 'task_execution_snapshot_v1 reject replacement');
END;

CREATE TRIGGER task_execution_snapshot_v1_reject_delete
BEFORE DELETE ON task_execution_snapshot_v1
BEGIN
  SELECT RAISE(ABORT, 'task_execution_snapshot_v1 reject delete');
END;

CREATE TRIGGER task_execution_snapshot_v1_reject_update
BEFORE UPDATE ON task_execution_snapshot_v1
BEGIN
  SELECT RAISE(ABORT, 'task_execution_snapshot_v1 reject update');
END;

CREATE TRIGGER task_execution_stream_v1_reject_replacement
BEFORE INSERT ON task_execution_stream_v1
WHEN EXISTS (SELECT 1 FROM task_execution_stream_v1 WHERE binding_id = NEW.binding_id AND source_key = NEW.source_key)
BEGIN
  SELECT RAISE(ABORT, 'task_execution_stream_v1 reject replacement');
END;

CREATE TRIGGER task_execution_stream_v1_reject_delete
BEFORE DELETE ON task_execution_stream_v1
BEGIN
  SELECT RAISE(ABORT, 'task_execution_stream_v1 reject delete');
END;

CREATE TRIGGER task_execution_event_v1_reject_replacement
BEFORE INSERT ON task_execution_event_v1
WHEN EXISTS (SELECT 1 FROM task_execution_event_v1 WHERE row_id = NEW.row_id OR event_id = NEW.event_id OR idempotency_key = NEW.idempotency_key OR (source_key = NEW.source_key AND source_sequence = NEW.source_sequence) OR commit_cursor = NEW.commit_cursor)
BEGIN
  SELECT RAISE(ABORT, 'task_execution_event_v1 reject replacement');
END;

CREATE TRIGGER task_execution_event_v1_reject_delete
BEFORE DELETE ON task_execution_event_v1
BEGIN
  SELECT RAISE(ABORT, 'task_execution_event_v1 reject delete');
END;

CREATE TRIGGER task_execution_event_v1_reject_update
BEFORE UPDATE ON task_execution_event_v1
BEGIN
  SELECT RAISE(ABORT, 'task_execution_event_v1 reject update');
END;

CREATE TRIGGER task_model_request_v1_reject_replacement
BEFORE INSERT ON task_model_request_v1
WHEN EXISTS (SELECT 1 FROM task_model_request_v1 WHERE (binding_id = NEW.binding_id AND request_id = NEW.request_id) OR (binding_id = NEW.binding_id AND ordinal = NEW.ordinal))
BEGIN
  SELECT RAISE(ABORT, 'task_model_request_v1 reject replacement');
END;

CREATE TRIGGER task_model_request_v1_reject_delete
BEFORE DELETE ON task_model_request_v1
BEGIN
  SELECT RAISE(ABORT, 'task_model_request_v1 reject delete');
END;

CREATE TRIGGER task_model_request_v1_reject_update
BEFORE UPDATE ON task_model_request_v1
BEGIN
  SELECT RAISE(ABORT, 'task_model_request_v1 reject update');
END;

CREATE TRIGGER task_execution_ack_v1_reject_replacement
BEFORE INSERT ON task_execution_ack_v1
WHEN EXISTS (SELECT 1 FROM task_execution_ack_v1 WHERE event_id = NEW.event_id)
BEGIN
  SELECT RAISE(ABORT, 'task_execution_ack_v1 reject replacement');
END;

CREATE TRIGGER task_execution_ack_v1_reject_delete
BEFORE DELETE ON task_execution_ack_v1
BEGIN
  SELECT RAISE(ABORT, 'task_execution_ack_v1 reject delete');
END;

CREATE TRIGGER task_execution_ack_v1_reject_update
BEFORE UPDATE ON task_execution_ack_v1
BEGIN
  SELECT RAISE(ABORT, 'task_execution_ack_v1 reject update');
END;

CREATE TRIGGER task_execution_v1_guard_update
BEFORE UPDATE ON task_execution_v1
WHEN NEW.binding_id IS NOT OLD.binding_id
  OR NEW.execution_unit_id IS NOT OLD.execution_unit_id
  OR NEW.workspace_id IS NOT OLD.workspace_id
  OR NEW.task_id IS NOT OLD.task_id
  OR NEW.attempt_id IS NOT OLD.attempt_id
  OR NEW.task_revision IS NOT OLD.task_revision
  OR NEW.intent_revision IS NOT OLD.intent_revision
  OR NEW.owner_epoch IS NOT OLD.owner_epoch
  OR NEW.recovery_epoch IS NOT OLD.recovery_epoch
  OR NEW.scope_key IS NOT OLD.scope_key
  OR NEW.created_at IS NOT OLD.created_at
  OR NEW.current_revision != OLD.current_revision + 1
  OR NEW.active > OLD.active
  OR NEW.updated_at < OLD.updated_at
BEGIN
  SELECT RAISE(ABORT, 'task_execution_v1 guard update');
END;

CREATE TRIGGER task_execution_stream_v1_guard_update
BEFORE UPDATE ON task_execution_stream_v1
WHEN NEW.binding_id IS NOT OLD.binding_id
  OR NEW.source_key IS NOT OLD.source_key
  OR NEW.source_stream_id IS NOT OLD.source_stream_id
  OR NEW.last_sequence <= OLD.last_sequence
  OR NEW.last_event_id IS OLD.last_event_id
BEGIN
  SELECT RAISE(ABORT, 'task_execution_stream_v1 guard update');
END;
