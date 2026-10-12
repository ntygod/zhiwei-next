-- Only immutable coordinates are indexed here. Check definitions and result bodies are managed content.
CREATE TABLE outcome_plan_v1 (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  task_revision INTEGER NOT NULL CHECK(task_revision > 0),
  intent_revision INTEGER NOT NULL CHECK(intent_revision > 0),
  owner_epoch INTEGER NOT NULL CHECK(owner_epoch > 0),
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  content_id TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK(content_version > 0),
  created_at TEXT NOT NULL,
  UNIQUE(task_id,attempt_id,intent_revision),
  UNIQUE(principal_id,idempotency_key),
  UNIQUE(principal_id,command_id),
  FOREIGN KEY(task_id,task_revision,attempt_id) REFERENCES task_snapshot_v1(task_id,revision,attempt_id),
  FOREIGN KEY(scope_key,content_id,content_version) REFERENCES content_object(scope_key,content_id,content_version)
) STRICT;
CREATE TABLE outcome_verification_v1 (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  command_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('verify','feedback')),
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  task_revision INTEGER NOT NULL CHECK(task_revision > 0),
  intent_revision INTEGER NOT NULL CHECK(intent_revision > 0),
  plan_id TEXT NOT NULL REFERENCES outcome_plan_v1(id),
  owner_epoch INTEGER NOT NULL CHECK(owner_epoch > 0),
  recovery_epoch INTEGER NOT NULL CHECK(recovery_epoch >= 0),
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  content_id TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK(content_version > 0),
  created_at TEXT NOT NULL,
  not_after TEXT NOT NULL CHECK(not_after > created_at),
  UNIQUE(principal_id,operation,idempotency_key),
  UNIQUE(principal_id,command_id),
  FOREIGN KEY(task_id,task_revision,attempt_id) REFERENCES task_snapshot_v1(task_id,revision,attempt_id),
  FOREIGN KEY(scope_key,content_id,content_version) REFERENCES content_object(scope_key,content_id,content_version)
) STRICT;
CREATE TABLE outcome_observation_v1 (
  verification_id TEXT NOT NULL REFERENCES outcome_verification_v1(id),
  criterion_id TEXT NOT NULL,
  observation_id TEXT NOT NULL REFERENCES observation_v2(id),
  input_observation_id TEXT REFERENCES observation_v2(id),
  method TEXT NOT NULL CHECK(method IN ('artifact','deterministic-test','tool-receipt','user-confirmation','model-assisted')),
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  content_id TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK(content_version > 0),
  observed_at TEXT NOT NULL,
  not_after TEXT NOT NULL CHECK(not_after > observed_at),
  PRIMARY KEY(verification_id,criterion_id),
  FOREIGN KEY(scope_key,content_id,content_version) REFERENCES content_object(scope_key,content_id,content_version)
) STRICT;
-- A prepared model input remains uncertain until this actual receiving observation exists.
CREATE TABLE outcome_request_receipt_v1 (
  binding_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  receipt_id TEXT NOT NULL UNIQUE,
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  content_id TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK(content_version > 0),
  observed_at TEXT NOT NULL,
  PRIMARY KEY(binding_id,request_id),
  FOREIGN KEY(binding_id,request_id) REFERENCES task_model_request_v1(binding_id,request_id),
  FOREIGN KEY(task_id,attempt_id) REFERENCES task_attempt_v1(task_id,id),
  FOREIGN KEY(scope_key,content_id,content_version) REFERENCES content_object(scope_key,content_id,content_version)
) STRICT;
CREATE TABLE task_result_v1 (
  verification_id TEXT PRIMARY KEY REFERENCES outcome_verification_v1(id),
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  task_revision INTEGER NOT NULL CHECK(task_revision > 0),
  outcome_id TEXT NOT NULL,
  outcome_revision INTEGER NOT NULL CHECK(outcome_revision > 0),
  episode_id TEXT NOT NULL,
  episode_version INTEGER NOT NULL CHECK(episode_version > 0),
  scope_key TEXT NOT NULL REFERENCES scope_catalog(scope_key),
  content_id TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK(content_version > 0),
  commit_cursor INTEGER NOT NULL UNIQUE REFERENCES task_outbox_v1(cursor),
  created_at TEXT NOT NULL,
  UNIQUE(outcome_id,outcome_revision),
  UNIQUE(task_id,attempt_id,episode_version),
  UNIQUE(episode_id,episode_version),
  FOREIGN KEY(task_id,task_revision,attempt_id) REFERENCES task_snapshot_v1(task_id,revision,attempt_id),
  FOREIGN KEY(outcome_id,outcome_revision) REFERENCES task_outcome_v1(id,revision),
  FOREIGN KEY(scope_key,content_id,content_version) REFERENCES content_object(scope_key,content_id,content_version)
) STRICT;
CREATE INDEX task_result_v1_task ON task_result_v1(workspace_id,task_id,task_revision);

CREATE TRIGGER outcome_plan_v1_no_update BEFORE UPDATE ON outcome_plan_v1 BEGIN SELECT RAISE(ABORT,'immutable outcome plan'); END;
CREATE TRIGGER outcome_plan_v1_no_delete BEFORE DELETE ON outcome_plan_v1 BEGIN SELECT RAISE(ABORT,'immutable outcome plan'); END;
CREATE TRIGGER outcome_plan_v1_no_replace BEFORE INSERT ON outcome_plan_v1
  WHEN EXISTS(SELECT 1 FROM outcome_plan_v1 WHERE id=NEW.id OR principal_id=NEW.principal_id AND (idempotency_key=NEW.idempotency_key OR command_id=NEW.command_id) OR task_id=NEW.task_id AND attempt_id=NEW.attempt_id AND intent_revision=NEW.intent_revision)
  BEGIN SELECT RAISE(ABORT,'immutable outcome plan'); END;
CREATE TRIGGER outcome_verification_v1_no_update BEFORE UPDATE ON outcome_verification_v1 BEGIN SELECT RAISE(ABORT,'immutable verification'); END;
CREATE TRIGGER outcome_verification_v1_no_delete BEFORE DELETE ON outcome_verification_v1 BEGIN SELECT RAISE(ABORT,'immutable verification'); END;
CREATE TRIGGER outcome_verification_v1_no_replace BEFORE INSERT ON outcome_verification_v1
  WHEN EXISTS(SELECT 1 FROM outcome_verification_v1 WHERE id=NEW.id OR principal_id=NEW.principal_id AND (command_id=NEW.command_id OR operation=NEW.operation AND idempotency_key=NEW.idempotency_key))
  BEGIN SELECT RAISE(ABORT,'immutable verification'); END;
CREATE TRIGGER outcome_observation_v1_no_update BEFORE UPDATE ON outcome_observation_v1 BEGIN SELECT RAISE(ABORT,'immutable criterion observation'); END;
CREATE TRIGGER outcome_observation_v1_no_delete BEFORE DELETE ON outcome_observation_v1 BEGIN SELECT RAISE(ABORT,'immutable criterion observation'); END;
CREATE TRIGGER outcome_observation_v1_no_replace BEFORE INSERT ON outcome_observation_v1
  WHEN EXISTS(SELECT 1 FROM outcome_observation_v1 WHERE verification_id=NEW.verification_id AND criterion_id=NEW.criterion_id)
  BEGIN SELECT RAISE(ABORT,'immutable criterion observation'); END;
CREATE TRIGGER outcome_request_receipt_v1_no_update BEFORE UPDATE ON outcome_request_receipt_v1 BEGIN SELECT RAISE(ABORT,'immutable receiving observation'); END;
CREATE TRIGGER outcome_request_receipt_v1_no_delete BEFORE DELETE ON outcome_request_receipt_v1 BEGIN SELECT RAISE(ABORT,'immutable receiving observation'); END;
CREATE TRIGGER outcome_request_receipt_v1_no_replace BEFORE INSERT ON outcome_request_receipt_v1
  WHEN EXISTS(SELECT 1 FROM outcome_request_receipt_v1 WHERE binding_id=NEW.binding_id AND request_id=NEW.request_id OR receipt_id=NEW.receipt_id)
  BEGIN SELECT RAISE(ABORT,'immutable receiving observation'); END;
CREATE TRIGGER task_result_v1_no_update BEFORE UPDATE ON task_result_v1 BEGIN SELECT RAISE(ABORT,'immutable task result'); END;
CREATE TRIGGER task_result_v1_no_delete BEFORE DELETE ON task_result_v1 BEGIN SELECT RAISE(ABORT,'immutable task result'); END;
CREATE TRIGGER task_result_v1_no_replace BEFORE INSERT ON task_result_v1
  WHEN EXISTS(SELECT 1 FROM task_result_v1 WHERE verification_id=NEW.verification_id OR outcome_id=NEW.outcome_id AND outcome_revision=NEW.outcome_revision OR task_id=NEW.task_id AND attempt_id=NEW.attempt_id AND episode_version=NEW.episode_version OR episode_id=NEW.episode_id AND episode_version=NEW.episode_version OR commit_cursor=NEW.commit_cursor)
  BEGIN SELECT RAISE(ABORT,'immutable task result'); END;
