-- CreateEnum
CREATE TYPE "sex" AS ENUM ('female', 'male', 'other');

-- CreateEnum
CREATE TYPE "diet_preference" AS ENUM ('veg', 'eggetarian', 'non_veg', 'vegan');

-- AlterEnum
ALTER TYPE "consent_purpose" ADD VALUE 'health';

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "coach_id" UUID;

-- CreateTable
CREATE TABLE "client_profiles" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "date_of_birth" DATE,
    "sex" "sex",
    "height_cm" INTEGER,
    "start_weight_kg" DOUBLE PRECISION,
    "body_fat_pct" DOUBLE PRECISION,
    "goal" TEXT,
    "diet_preference" "diet_preference",
    "medical_conditions" TEXT,
    "injuries" TEXT,
    "food_allergies" TEXT,
    "medicines" TEXT,
    "lifestyle" TEXT,
    "training_experience" TEXT,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_profiles_member_id_key" ON "client_profiles"("member_id");

-- CreateIndex
CREATE INDEX "client_profiles_gym_id_idx" ON "client_profiles"("gym_id");

-- CreateIndex
CREATE INDEX "members_coach_id_idx" ON "members"("coach_id");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

