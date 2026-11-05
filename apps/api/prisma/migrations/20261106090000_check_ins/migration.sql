-- CreateTable
CREATE TABLE "check_ins" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "week_of" DATE NOT NULL,
    "weight_kg" DOUBLE PRECISION NOT NULL,
    "body_fat_pct" DOUBLE PRECISION,
    "waist_cm" DOUBLE PRECISION,
    "chest_cm" DOUBLE PRECISION,
    "hips_cm" DOUBLE PRECISION,
    "arm_cm" DOUBLE PRECISION,
    "thigh_cm" DOUBLE PRECISION,
    "note" TEXT,
    "front_photo" TEXT,
    "left_photo" TEXT,
    "right_photo" TEXT,
    "coach_reply" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "check_ins_gym_id_reviewed_at_idx" ON "check_ins"("gym_id", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "check_ins_member_id_week_of_key" ON "check_ins"("member_id", "week_of");

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

