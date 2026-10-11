-- Immutable protected capsules are derived inputs, never send authorization.
CREATE TABLE context_capsule_v1 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES task_v1(id),
  attempt_id TEXT NOT NULL REFERENCES task_attempt_v1(id),
  task_revision INTEGER NOT NULL CHECK(task_revision > 0),
  intent_revision INTEGER NOT NULL CHECK(intent_revision > 0),
  owner_epoch INTEGER NOT NULL CHECK(owner_epoch > 0),
  runtime_input_id TEXT UNIQUE REFERENCES task_input_v1(id),
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  content_id TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK(content_version > 0),
  compiled_at TEXT NOT NULL,
  FOREIGN KEY(task_id,task_revision) REFERENCES task_snapshot_v1(task_id,revision),
  FOREIGN KEY(content_id,content_version) REFERENCES content_object(content_id,content_version)
) STRICT;
CREATE INDEX context_capsule_v1_task ON context_capsule_v1(workspace_id,task_id,attempt_id);

-- A boundary survives retries and restarts. Reservation precedes every model call.
CREATE TABLE cognitive_boundary_v1 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES task_v1(id),
  attempt_id TEXT NOT NULL REFERENCES task_attempt_v1(id),
  task_revision INTEGER NOT NULL CHECK(task_revision > 0),
  intent_revision INTEGER NOT NULL CHECK(intent_revision > 0),
  owner_epoch INTEGER NOT NULL CHECK(owner_epoch > 0),
  capsule_id TEXT NOT NULL REFERENCES context_capsule_v1(id),
  status TEXT NOT NULL CHECK(status IN ('open','decided','stopped')),
  call_count INTEGER NOT NULL CHECK(call_count BETWEEN 0 AND 2),
  decision_content_id TEXT,
  decision_content_version INTEGER,
  CHECK((decision_content_id IS NULL) = (decision_content_version IS NULL)),
  CHECK((status='open') = (decision_content_id IS NULL)),
  UNIQUE(task_id,attempt_id,task_revision),
  FOREIGN KEY(task_id,task_revision) REFERENCES task_snapshot_v1(task_id,revision),
  FOREIGN KEY(decision_content_id,decision_content_version) REFERENCES content_object(content_id,content_version)
) STRICT;
CREATE TABLE cognitive_call_v1 (
  boundary_id TEXT NOT NULL REFERENCES cognitive_boundary_v1(id),
  ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 2),
  capsule_id TEXT NOT NULL REFERENCES context_capsule_v1(id),
  request_id TEXT NOT NULL UNIQUE,
  input_content_id TEXT NOT NULL,
  input_content_version INTEGER NOT NULL CHECK(input_content_version > 0),
  received_content_id TEXT,
  received_content_version INTEGER,
  CHECK((received_content_id IS NULL) = (received_content_version IS NULL)),
  PRIMARY KEY(boundary_id,ordinal),
  FOREIGN KEY(input_content_id,input_content_version) REFERENCES content_object(content_id,content_version),
  FOREIGN KEY(received_content_id,received_content_version) REFERENCES content_object(content_id,content_version)
) STRICT;
CREATE TABLE context_model_request_v1 (
  binding_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  capsule_id TEXT NOT NULL REFERENCES context_capsule_v1(id),
  PRIMARY KEY(binding_id,request_id),
  FOREIGN KEY(binding_id,request_id) REFERENCES task_model_request_v1(binding_id,request_id)
) STRICT;
