-- CreateEnum
CREATE TYPE "lead_source" AS ENUM ('walk_in', 'phone_call', 'instagram', 'facebook', 'google', 'referral', 'other');

-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('new', 'contacted', 'trial', 'joined', 'lost');

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "source" "lead_source" NOT NULL,
    "interest" TEXT,
    "note" TEXT,
    "follow_up_on" DATE,
    "status" "lead_status" NOT NULL DEFAULT 'new',
    "lost_reason" TEXT,
    "member_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_gym_id_status_follow_up_on_idx" ON "leads"("gym_id", "status", "follow_up_on");

-- CreateIndex
CREATE INDEX "leads_gym_id_phone_idx" ON "leads"("gym_id", "phone");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Safety nets (hand-written).
ALTER TABLE "leads" ADD CONSTRAINT "leads_lost_has_reason" CHECK ("status" <> 'lost' OR "lost_reason" IS NOT NULL);
ALTER TABLE "leads" ADD CONSTRAINT "leads_joined_has_member" CHECK (("status" = 'joined') = ("member_id" IS NOT NULL));
