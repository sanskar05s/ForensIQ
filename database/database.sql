--01_create_tables
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Cases ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cases (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title               TEXT NOT NULL,
    description         TEXT,
    investigator_name   TEXT NOT NULL,
    priority            TEXT NOT NULL CHECK (priority IN ('Low','Medium','High','Critical')),
    status              TEXT NOT NULL CHECK (status IN ('Open','Active','Pending Review','Closed')),
    created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evidence_count      INT NOT NULL DEFAULT 0,
    witness_count       INT NOT NULL DEFAULT 0,
    -- Tracks when dependent outputs were last built (for incremental processing)
    build_state         JSONB NOT NULL DEFAULT '{
        "last_contradiction_run": null,
        "last_timeline_build": null,
        "last_graph_build": null
    }'::jsonb
);

-- ─── Evidence ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id               UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    type                  TEXT NOT NULL CHECK (type IN ('image','document','video','audio')),
    filename              TEXT NOT NULL,
    storage_path          TEXT NOT NULL,
    file_size             BIGINT,
    mime_type             TEXT,
    status                TEXT NOT NULL DEFAULT 'uploaded'
                              CHECK (status IN ('uploaded','analyzing','analyzed','failed')),
    uploaded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    analyzed_at           TIMESTAMPTZ,  -- NULL until first analysis completes

    -- Module 6: Blockchain
    file_hash             TEXT,
    blockchain_tx_hash    TEXT,

    -- Module 1: Image analysis (null for non-image types)
    object_detections     JSONB,   -- [{label, confidence, bbox, xai_reason}]
    scene_classification  JSONB,   -- {label, confidence, xai_reason}
    ocr_text              JSONB,   -- [{text, confidence}]
    cross_image_notes     JSONB,   -- [{category, other_evidence_ids:[]}]

    -- Module 2: Document analysis
    extracted_text        TEXT,
    exif_metadata         JSONB,   -- {capture_timestamp, gps_coords, device, software}
    integrity_flag        JSONB,   -- {flagged: bool, note: string}

    -- Multimodal: video/audio
    duration_seconds      FLOAT,
    media_metadata        JSONB,   -- {resolution, codec, bitrate, sample_rate, channels}

    -- XAI: top-level explanation for this evidence item
    xai_summary           TEXT,
    analysis_confidence   FLOAT    -- overall confidence across all detections (0.0-1.0)
);

-- ─── Witness Statements ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS witness_statements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id             UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    witness_label       TEXT NOT NULL,
    raw_text            TEXT NOT NULL,
    source_evidence_id  UUID REFERENCES evidence(id) ON DELETE SET NULL,
    entities            JSONB,   -- [{text, type, confidence}]
    temporal_sequence   JSONB,   -- [{event_text, relative_order, absolute_time}]
    hedge_marker_count  INT NOT NULL DEFAULT 0,
    analysis_status     TEXT NOT NULL DEFAULT 'pending'
                            CHECK (analysis_status IN ('pending','analyzed','failed')),
    analyzed_at         TIMESTAMPTZ,  -- NULL until Module 3 processes it
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Contradictions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contradictions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    tier            INT NOT NULL CHECK (tier IN (1,2)),
    type            TEXT NOT NULL CHECK (type IN ('time','color','quantity','direction','nli')),
    witness_a_id    UUID NOT NULL REFERENCES witness_statements(id) ON DELETE CASCADE,
    witness_b_id    UUID NOT NULL REFERENCES witness_statements(id) ON DELETE CASCADE,
    claim_a         TEXT NOT NULL,
    claim_b         TEXT NOT NULL,
    severity        TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH')),
    nli_confidence  FLOAT,       -- tier 2 only (0.0-1.0)
    xai_explanation TEXT NOT NULL,  -- human-readable reason this pair was flagged
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Timeline Events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timeline_events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id           UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    description       TEXT NOT NULL,
    timestamp_hard    TIMESTAMPTZ,     -- null if time is relative/unknown
    relative_order    INT,             -- ordering integer when no hard timestamp
    source            TEXT NOT NULL
                          CHECK (source IN ('metadata','witness-direct','witness-relative')),
    confidence_state  TEXT NOT NULL
                          CHECK (confidence_state IN ('confirmed','high','low-conflict')),
    conflicts_with    UUID[],          -- array of other timeline_event IDs
    source_ids        JSONB,           -- [{type: 'evidence'|'statement', id: UUID}]
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Knowledge Graphs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_graphs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE UNIQUE,
    nodes           JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- [{id, type, label, mention_count, centrality_score, degree, community_id}]
    edges           JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- [{source, target, relation, weight}]
    sna_metrics     JSONB,
    -- {density, top_central_nodes:[...], community_count, avg_degree}
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Reports ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id         UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE UNIQUE,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','generating','ready','failed')),
    storage_path    TEXT,
    sections        JSONB,   -- structured content for all 8 sections
    ai_next_steps   TEXT,    -- Gemini-generated suggested next investigation steps
    generated_at    TIMESTAMPTZ,
    error_message   TEXT     -- populated if status = 'failed'
);

-- ─── Activity Logs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,
    description TEXT NOT NULL,
    actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AI Assistant Interactions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assistant_interactions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id          UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    query            TEXT NOT NULL,
    response         TEXT NOT NULL,
    functions_called JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- list of function names Gemini's context assembly called to answer
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--02_rls_policies
-- Enable RLS on every table
ALTER TABLE cases                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence               ENABLE ROW LEVEL SECURITY;
ALTER TABLE witness_statements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contradictions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_graphs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports                ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_interactions ENABLE ROW LEVEL SECURITY;

-- Cases: owner-only access
CREATE POLICY "cases_owner_select" ON cases FOR SELECT
    USING (created_by = auth.uid());
CREATE POLICY "cases_owner_insert" ON cases FOR INSERT
    WITH CHECK (created_by = auth.uid());
CREATE POLICY "cases_owner_update" ON cases FOR UPDATE
    USING (created_by = auth.uid());
CREATE POLICY "cases_owner_delete" ON cases FOR DELETE
    USING (created_by = auth.uid());

-- Helper function: check case ownership
CREATE OR REPLACE FUNCTION user_owns_case(p_case_id UUID) RETURNS BOOLEAN AS $$
    SELECT EXISTS (SELECT 1 FROM cases WHERE id = p_case_id AND created_by = auth.uid())
$$ LANGUAGE sql SECURITY DEFINER;

-- All child tables: access via case ownership
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'evidence','witness_statements','contradictions','timeline_events',
        'knowledge_graphs','reports','activity_logs','assistant_interactions'
    ]
    LOOP
        EXECUTE format('
            CREATE POLICY "%s_via_case" ON %I FOR ALL
            USING (user_owns_case(case_id))
            WITH CHECK (user_owns_case(case_id));
        ', t, t);
    END LOOP;
END $$;

--03_indexes
-- Performance indexes for the most common query patterns
CREATE INDEX idx_cases_created_by    ON cases (created_by);
CREATE INDEX idx_cases_status        ON cases (status);
CREATE INDEX idx_evidence_case_id    ON evidence (case_id);
CREATE INDEX idx_evidence_status     ON evidence (status);
CREATE INDEX idx_evidence_analyzed   ON evidence (case_id, analyzed_at);
CREATE INDEX idx_statements_case_id  ON witness_statements (case_id);
CREATE INDEX idx_statements_analyzed ON witness_statements (case_id, analyzed_at);
CREATE INDEX idx_contradictions_case ON contradictions (case_id);
CREATE INDEX idx_timeline_case       ON timeline_events (case_id, relative_order);
CREATE INDEX idx_activity_case_date  ON activity_logs (case_id, created_at DESC);
CREATE INDEX idx_assistant_case      ON assistant_interactions (case_id, created_at DESC);

--from here dont know any particular names
GRANT SELECT, INSERT, UPDATE, DELETE
ON public.cases
TO authenticated;





ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own cases"
ON public.cases
FOR SELECT
USING (created_by = auth.uid());

CREATE POLICY "Users can create their own cases"
ON public.cases
FOR INSERT
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own cases"
ON public.cases
FOR UPDATE
USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own cases"
ON public.cases
FOR DELETE
USING (created_by = auth.uid());




ALTER TABLE public.cases
ADD COLUMN case_id TEXT UNIQUE;

UPDATE public.cases
SET case_id =
  'CASE-' ||
  TO_CHAR(created_at, 'YYYY') ||
  '-' ||
  UPPER(SUBSTRING(id::text, 1, 4))
WHERE case_id IS NULL;





SELECT
    case_id,
    title
FROM public.cases;





SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'evidence'
ORDER BY ordinal_position;





SELECT *
FROM pg_policies
WHERE tablename = 'evidence';





SELECT *
FROM storage.buckets;





SELECT *
FROM pg_policies
WHERE schemaname='storage';





GRANT SELECT, INSERT, UPDATE, DELETE
ON public.evidence
TO authenticated;






SELECT relrowsecurity
FROM pg_class
WHERE relname = 'objects'
AND relnamespace = (
    SELECT oid
    FROM pg_namespace
    WHERE nspname = 'storage'
);





CREATE POLICY "Authenticated users can upload evidence"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'evidence');

CREATE POLICY "Authenticated users can read evidence"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'evidence');

CREATE POLICY "Authenticated users can update evidence"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'evidence');

CREATE POLICY "Authenticated users can delete evidence"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'evidence');




SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'evidence_type_check';




GRANT SELECT, INSERT, UPDATE, DELETE
ON public.evidence
TO service_role;





GRANT SELECT, INSERT, UPDATE, DELETE
ON public.evidence
TO authenticated;





ALTER TABLE evidence
ADD COLUMN char_count INTEGER;

CREATE INDEX idx_evidence_char_count
ON evidence (case_id, char_count);





GRANT SELECT, INSERT, UPDATE, DELETE
ON public.witness_statements TO service_role;





CREATE OR REPLACE FUNCTION increment_witness_count(case_id_input UUID)
RETURNS void AS $$
  UPDATE cases
  SET witness_count = witness_count + 1,
      updated_at = NOW()
  WHERE id = case_id_input;
$$ LANGUAGE sql SECURITY DEFINER;





CREATE OR REPLACE FUNCTION decrement_witness_count(case_id_input UUID)
RETURNS void AS $$
  UPDATE cases
  SET witness_count = GREATEST(witness_count - 1, 0),
      updated_at = NOW()
  WHERE id = case_id_input;
$$ LANGUAGE sql SECURITY DEFINER;





ALTER TABLE witness_statements
ADD COLUMN hedge_words_found JSONB,
ADD COLUMN hedge_words_xai TEXT;





GRANT SELECT, INSERT, UPDATE, DELETE
ON public.contradictions
TO service_role;




GRANT SELECT ON public.cases TO service_role;

GRANT SELECT ON public.witness_statements TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.contradictions
TO service_role;





GRANT SELECT, INSERT, UPDATE, DELETE
ON public.cases
TO service_role;




GRANT SELECT, INSERT, UPDATE, DELETE
ON public.timeline_events TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.knowledge_graphs TO service_role;

-- Ensure named UNIQUE constraint exists on knowledge_graphs.case_id.
-- Supabase upsert with on_conflict="case_id" requires this.
-- The column-level UNIQUE in 01_create_tables.sql creates an unnamed constraint
-- which may not work reliably with PostgREST upsert. This named version is safe.
ALTER TABLE knowledge_graphs
DROP CONSTRAINT IF EXISTS knowledge_graphs_case_id_unique;

ALTER TABLE knowledge_graphs
ADD CONSTRAINT knowledge_graphs_case_id_unique UNIQUE (case_id);









