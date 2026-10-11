-- Protected content contains commands; this projection retains only identifiers and receipts.
CREATE TABLE memory_command_v1 (
  principal_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('memory.input','memory.remember','memory.correct','memory.dispute','memory.forget')),
  content_id TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK(content_version > 0),
  observation_id TEXT NOT NULL REFERENCES observation_v2(id),
  operation_id TEXT NOT NULL UNIQUE,
  at TEXT NOT NULL,
  result_json TEXT,
  commit_cursor INTEGER REFERENCES outbox(cursor),
  CHECK((result_json IS NULL) = (commit_cursor IS NULL)),
  CHECK(operation_kind = 'memory.forget' OR result_json IS NOT NULL),
  PRIMARY KEY(principal_id,workspace_id,idempotency_key),
  FOREIGN KEY(content_id,content_version) REFERENCES content_object(content_id,content_version)
) STRICT;
CREATE INDEX memory_command_v1_scope ON memory_command_v1(scope_key,commit_cursor);
CREATE TABLE memory_content_dependency_v1 (
  source_id TEXT NOT NULL,
  source_version INTEGER NOT NULL CHECK(source_version > 0),
  target_id TEXT NOT NULL,
  target_version INTEGER NOT NULL CHECK(target_version > 0),
  PRIMARY KEY(source_id,source_version,target_id,target_version),
  FOREIGN KEY(source_id,source_version) REFERENCES content_object(content_id,content_version),
  FOREIGN KEY(target_id,target_version) REFERENCES content_object(content_id,content_version),
  CHECK(source_id <> target_id OR source_version <> target_version)
) STRICT;
