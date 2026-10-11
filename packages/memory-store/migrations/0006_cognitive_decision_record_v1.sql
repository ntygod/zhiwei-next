-- Legal proposals and deterministic termination retain immutable protected versions.
CREATE TABLE cognitive_decision_v1 (
  boundary_id TEXT NOT NULL REFERENCES cognitive_boundary_v1(id),
  revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 3),
  capsule_id TEXT NOT NULL REFERENCES context_capsule_v1(id),
  call_count INTEGER NOT NULL CHECK(call_count BETWEEN 0 AND 2),
  origin TEXT NOT NULL CHECK(origin IN ('model-proposal','coordinator-stop')),
  action TEXT NOT NULL CHECK(action IN ('respond','clarify','retrieve','execute','wait','stop')),
  content_id TEXT NOT NULL,
  content_version INTEGER NOT NULL CHECK(content_version > 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY(boundary_id,revision),
  UNIQUE(content_id,content_version),
  FOREIGN KEY(content_id,content_version) REFERENCES content_object(content_id,content_version)
) STRICT;
CREATE TRIGGER cognitive_decision_v1_reject_update
BEFORE UPDATE ON cognitive_decision_v1 BEGIN
  SELECT RAISE(ABORT, 'cognitive_decision_v1 is append-only');
END;
CREATE TRIGGER cognitive_decision_v1_reject_delete
BEFORE DELETE ON cognitive_decision_v1 BEGIN
  SELECT RAISE(ABORT, 'cognitive_decision_v1 is append-only');
END;
CREATE TRIGGER cognitive_decision_v1_reject_replace
BEFORE INSERT ON cognitive_decision_v1
WHEN EXISTS(SELECT 1 FROM cognitive_decision_v1 WHERE boundary_id=NEW.boundary_id AND revision=NEW.revision)
  OR EXISTS(SELECT 1 FROM cognitive_decision_v1 WHERE content_id=NEW.content_id AND content_version=NEW.content_version)
BEGIN
  SELECT RAISE(ABORT, 'cognitive_decision_v1 is append-only');
END;
