-- CreateEnum
CREATE TYPE "food_unit" AS ENUM ('g', 'ml', 'piece');

-- CreateTable
CREATE TABLE "foods" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "food_unit" NOT NULL,
    "piece_name" TEXT,
    "protein_g" DOUBLE PRECISION NOT NULL,
    "carbs_g" DOUBLE PRECISION NOT NULL,
    "fat_g" DOUBLE PRECISION NOT NULL,
    "kcal" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diet_plans" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "member_id" UUID,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "plan" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "diet_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diet_plan_versions" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "plan" JSONB NOT NULL,
    "saved_by_id" UUID NOT NULL,
    "saved_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "diet_plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "foods_gym_id_idx" ON "foods"("gym_id");

-- CreateIndex
CREATE UNIQUE INDEX "foods_gym_id_name_key" ON "foods"("gym_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "diet_plans_member_id_key" ON "diet_plans"("member_id");

-- CreateIndex
CREATE INDEX "diet_plans_gym_id_idx" ON "diet_plans"("gym_id");

-- CreateIndex
CREATE INDEX "diet_plan_versions_gym_id_idx" ON "diet_plan_versions"("gym_id");

-- CreateIndex
CREATE UNIQUE INDEX "diet_plan_versions_plan_id_version_key" ON "diet_plan_versions"("plan_id", "version");

-- AddForeignKey
ALTER TABLE "foods" ADD CONSTRAINT "foods_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_plans" ADD CONSTRAINT "diet_plans_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_plans" ADD CONSTRAINT "diet_plans_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_plans" ADD CONSTRAINT "diet_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_plans" ADD CONSTRAINT "diet_plans_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_plan_versions" ADD CONSTRAINT "diet_plan_versions_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_plan_versions" ADD CONSTRAINT "diet_plan_versions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "diet_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diet_plan_versions" ADD CONSTRAINT "diet_plan_versions_saved_by_id_fkey" FOREIGN KEY ("saved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

