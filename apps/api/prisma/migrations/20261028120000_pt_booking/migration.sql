-- CreateEnum
CREATE TYPE "pt_session_status" AS ENUM ('booked', 'cancelled', 'completed', 'no_show');

-- CreateTable
CREATE TABLE "trainers" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_minutes" INTEGER NOT NULL DEFAULT 60,
    "specialisation" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trainers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_availability" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_time_off" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pt_sessions" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "pt_session_status" NOT NULL DEFAULT 'booked',
    "booked_by_id" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "cancel_reason" TEXT,
    "late_cancel" BOOLEAN NOT NULL DEFAULT false,
    "trainer_notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pt_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trainers_user_id_key" ON "trainers"("user_id");

-- CreateIndex
CREATE INDEX "trainers_gym_id_idx" ON "trainers"("gym_id");

-- CreateIndex
CREATE INDEX "trainer_availability_gym_id_idx" ON "trainer_availability"("gym_id");

-- CreateIndex
CREATE INDEX "trainer_availability_trainer_id_idx" ON "trainer_availability"("trainer_id");

-- CreateIndex
CREATE INDEX "trainer_time_off_gym_id_idx" ON "trainer_time_off"("gym_id");

-- CreateIndex
CREATE INDEX "trainer_time_off_trainer_id_starts_at_idx" ON "trainer_time_off"("trainer_id", "starts_at");

-- CreateIndex
CREATE INDEX "pt_sessions_gym_id_idx" ON "pt_sessions"("gym_id");

-- CreateIndex
CREATE INDEX "pt_sessions_purchase_id_idx" ON "pt_sessions"("purchase_id");

-- CreateIndex
CREATE INDEX "pt_sessions_member_id_starts_at_idx" ON "pt_sessions"("member_id", "starts_at");

-- CreateIndex
CREATE INDEX "pt_sessions_trainer_id_starts_at_idx" ON "pt_sessions"("trainer_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "pt_session_ledger_session_id_reason_key" ON "pt_session_ledger"("session_id", "reason");

-- AddForeignKey
ALTER TABLE "pt_session_ledger" ADD CONSTRAINT "pt_session_ledger_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "pt_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_availability" ADD CONSTRAINT "trainer_availability_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_availability" ADD CONSTRAINT "trainer_availability_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_time_off" ADD CONSTRAINT "trainer_time_off_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_time_off" ADD CONSTRAINT "trainer_time_off_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_time_off" ADD CONSTRAINT "trainer_time_off_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "pt_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_booked_by_id_fkey" FOREIGN KEY ("booked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Safety nets (hand-written).
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_session_minutes_range" CHECK ("session_minutes" BETWEEN 15 AND 240);
ALTER TABLE "trainer_availability" ADD CONSTRAINT "trainer_availability_valid" CHECK (
  "weekday" BETWEEN 1 AND 7 AND "start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute"
);
ALTER TABLE "trainer_time_off" ADD CONSTRAINT "trainer_time_off_ordered" CHECK ("ends_at" > "starts_at");
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_ordered" CHECK ("ends_at" > "starts_at");
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_cancel_details" CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL));

-- No trainer and no member can have two booked sessions that overlap, even if two bookings race.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_no_trainer_overlap"
  EXCLUDE USING gist ("trainer_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&) WHERE ("status" = 'booked');
ALTER TABLE "pt_sessions" ADD CONSTRAINT "pt_sessions_no_member_overlap"
  EXCLUDE USING gist ("member_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&) WHERE ("status" = 'booked');
