-- Preserve whether an observation came from the live hardware adapter or the
-- deterministic simulator.  Nullable columns keep existing installations
-- migratable; new events always populate all three fields.
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS source_mode VARCHAR(32);
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS provenance VARCHAR(32);
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS data_origin VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_telemetry_plot_metric_source_ts
    ON telemetry(plot_id, metric, source_mode, event_ts);
