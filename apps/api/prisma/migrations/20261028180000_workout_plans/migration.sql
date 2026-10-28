-- CreateEnum
CREATE TYPE "workout_exercise_kind" AS ENUM ('strength', 'cardio');

-- CreateTable
CREATE TABLE "workout_exercises" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "muscle_group" TEXT,
    "kind" "workout_exercise_kind" NOT NULL,
    "description" TEXT,
    "video_url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workout_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_plans" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "member_id" UUID,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "week" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workout_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_plan_versions" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "week" JSONB NOT NULL,
    "saved_by_id" UUID NOT NULL,
    "saved_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workout_plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_exercises_gym_id_idx" ON "workout_exercises"("gym_id");

-- CreateIndex
CREATE UNIQUE INDEX "workout_exercises_gym_id_name_key" ON "workout_exercises"("gym_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "workout_plans_member_id_key" ON "workout_plans"("member_id");

-- CreateIndex
CREATE INDEX "workout_plans_gym_id_idx" ON "workout_plans"("gym_id");

-- CreateIndex
CREATE INDEX "workout_plan_versions_gym_id_idx" ON "workout_plan_versions"("gym_id");

-- CreateIndex
CREATE UNIQUE INDEX "workout_plan_versions_plan_id_version_key" ON "workout_plan_versions"("plan_id", "version");

-- AddForeignKey
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plan_versions" ADD CONSTRAINT "workout_plan_versions_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plan_versions" ADD CONSTRAINT "workout_plan_versions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "workout_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_plan_versions" ADD CONSTRAINT "workout_plan_versions_saved_by_id_fkey" FOREIGN KEY ("saved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Safety nets (hand-written).
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_version_positive" CHECK ("version" >= 1);
ALTER TABLE "workout_plan_versions" ADD CONSTRAINT "workout_plan_versions_positive" CHECK ("version" >= 1);
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_name_not_blank" CHECK (length(trim("name")) > 0);
