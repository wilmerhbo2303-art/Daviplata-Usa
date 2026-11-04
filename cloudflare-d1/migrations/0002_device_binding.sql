ALTER TABLE davi_profiles ADD COLUMN device_token_hash TEXT;
ALTER TABLE davi_profiles ADD COLUMN device_generation INTEGER NOT NULL DEFAULT 0;
