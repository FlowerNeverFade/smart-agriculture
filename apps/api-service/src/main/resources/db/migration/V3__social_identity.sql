CREATE TABLE IF NOT EXISTS external_identity (
    provider_code VARCHAR(32) NOT NULL,
    provider_subject VARCHAR(255) NOT NULL,
    user_id VARCHAR(120) NOT NULL,
    display_name VARCHAR(100),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (provider_code, provider_subject),
    CONSTRAINT fk_external_identity_user
        FOREIGN KEY (user_id) REFERENCES user_account(user_id)
);

CREATE INDEX IF NOT EXISTS idx_external_identity_user
    ON external_identity(user_id);
