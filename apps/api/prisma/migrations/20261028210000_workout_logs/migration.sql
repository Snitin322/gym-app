-- CreateTable
CREATE TABLE "workout_logs" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "plan_id" UUID,
    "plan_version" INTEGER,
    "day_title" TEXT,
    "items" JSONB NOT NULL,
    "note" TEXT,
    "saved_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_logs_gym_id_idx" ON "workout_logs"("gym_id");

-- CreateIndex
CREATE UNIQUE INDEX "workout_logs_member_id_date_key" ON "workout_logs"("member_id", "date");

-- AddForeignKey
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_saved_by_id_fkey" FOREIGN KEY ("saved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

