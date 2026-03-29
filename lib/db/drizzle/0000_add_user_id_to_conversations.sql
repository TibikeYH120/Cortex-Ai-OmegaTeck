-- Additive migration: add user_id and guest_session_id to conversations table.
-- Safe for existing databases: uses IF NOT EXISTS so running against an already-updated DB is a no-op.
-- Note: tables (users, conversations, messages) pre-exist; this only adds the two new columns.

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "user_id" integer;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "guest_session_id" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'conversations_user_id_users_id_fk'
      AND table_name = 'conversations'
  ) THEN
    ALTER TABLE "conversations"
      ADD CONSTRAINT "conversations_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
