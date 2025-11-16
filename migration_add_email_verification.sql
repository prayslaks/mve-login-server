-- Email Verification Migration Script
-- Adds email_verifications table and related functions to existing database
--
-- Usage:
-- psql -U postgres -d logindb -f migration_add_email_verification.sql

-- 1. Create email_verifications table if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'email_verifications') THEN
        CREATE TABLE email_verifications (
            id SERIAL PRIMARY KEY,
            email VARCHAR(100) NOT NULL,
            code VARCHAR(6) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            verified BOOLEAN DEFAULT FALSE,
            attempts INT DEFAULT 0,
            CONSTRAINT check_attempts CHECK (attempts <= 5)
        );

        RAISE NOTICE 'Table email_verifications created successfully';
    ELSE
        RAISE NOTICE 'Table email_verifications already exists, skipping';
    END IF;
END $$;

-- 2. Create indexes (will be skipped if already exist)
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);
CREATE INDEX IF NOT EXISTS idx_email_verifications_expires_at ON email_verifications(expires_at);

-- 3. Create or replace function to delete expired verifications
CREATE OR REPLACE FUNCTION delete_expired_verifications()
RETURNS void AS $$
BEGIN
    DELETE FROM email_verifications
    WHERE expires_at < CURRENT_TIMESTAMP
    AND verified = FALSE;
END;
$$ LANGUAGE plpgsql;

-- 4. Migration complete message
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Email verification migration completed!';
    RAISE NOTICE '========================================';
END $$;
