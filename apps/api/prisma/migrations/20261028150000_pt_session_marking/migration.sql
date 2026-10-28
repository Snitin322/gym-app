-- CreateEnum
CREATE TYPE "pt_dispute_resolution" AS ENUM ('upheld', 'rejected');

-- DropIndex
DROP INDEX "pt_session_ledger_session_id_reason_key";

-- AlterTable
ALTER TABLE "pt_sessions" ADD COLUMN     "confirmed_at" TIMESTAMPTZ(3),
ADD COLUMN     "dispute_reason" TEXT,
ADD COLUMN     "disputed_at" TIMESTAMPTZ(3),
ADD COLUMN     "marked_at" TIMESTAMPTZ(3),
ADD COLUMN     "marked_by_id" UUID,
ADD COLUMN     "resolution" "pt_dispute_resolution",
ADD COLUMN     "resolution_note" TEXT,
ADD COLUMN     "resolved_at" TIMESTAMPTZ(3),
ADD COLUMN     "resolved_by_id" UUID;

-- CreateIndex
CREATE INDEX "pt_session_ledger_session_id_idx" ON "pt_session_ledger"("session_id");

-- CreateIndex
CREATE INDEX "pt_sessions_gym_id_disputed_at_idx" ON "pt_sessions"("gym_id", "disputed_at");

-- AddForeignKey
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_marked_by_id_fkey" FOREIGN KEY ("marked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Safety nets (hand-written). "Charged once" is now enforced by the session status (only a booked
-- session can be marked or cancelled, in a serializable transaction), because an undone mark may
-- be marked again.
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_marked_details" CHECK (
  ("status" IN ('completed', 'no_show')) = ("marked_at" IS NOT NULL AND "marked_by_id" IS NOT NULL)
);
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_dispute_details" CHECK (
  ("disputed_at" IS NULL) = ("dispute_reason" IS NULL)
  AND ("disputed_at" IS NULL OR "confirmed_at" IS NULL)
  AND (("resolved_at" IS NULL) = ("resolution" IS NULL))
  AND ("resolution" IS NULL OR "disputed_at" IS NOT NULL)
);
