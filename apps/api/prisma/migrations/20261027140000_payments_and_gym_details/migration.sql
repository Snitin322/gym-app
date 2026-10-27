-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('cash', 'upi', 'card', 'bank_transfer', 'razorpay');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('created', 'paid', 'failed');

-- AlterTable
ALTER TABLE "gyms" ADD COLUMN     "city" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "invoice_prefix" TEXT NOT NULL DEFAULT 'INV',
ADD COLUMN     "legal_name" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "sac_code" TEXT NOT NULL DEFAULT '999723',
ADD COLUMN     "state_code" TEXT;

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "discount_reason" TEXT,
ADD COLUMN     "list_price_paise" INTEGER,
ADD COLUMN     "paid_outside_app" BOOLEAN NOT NULL DEFAULT false;

-- Backfill (hand-written): existing memberships were sold at list price and paid before the app
-- recorded payments, so nothing is due on them.
UPDATE "memberships" SET "list_price_paise" = "price_paise", "paid_outside_app" = true;
ALTER TABLE "memberships" ALTER COLUMN "list_price_paise" SET NOT NULL;

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "membership_id" UUID,
    "amount_paise" INTEGER NOT NULL,
    "method" "payment_method" NOT NULL,
    "status" "payment_status" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "paid_at" TIMESTAMPTZ(3),
    "recorded_by_id" UUID,
    "razorpay_order_id" TEXT,
    "razorpay_payment_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_razorpay_order_id_key" ON "payments"("razorpay_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_razorpay_payment_id_key" ON "payments"("razorpay_payment_id");

-- CreateIndex
CREATE INDEX "payments_gym_id_idx" ON "payments"("gym_id");

-- CreateIndex
CREATE INDEX "payments_member_id_idx" ON "payments"("member_id");

-- CreateIndex
CREATE INDEX "payments_membership_id_idx" ON "payments"("membership_id");

-- CreateIndex
CREATE INDEX "payments_gym_id_paid_at_idx" ON "payments"("gym_id", "paid_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- Safety nets (hand-written).
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount_paise" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_paid_has_time" CHECK ("status" <> 'paid' OR "paid_at" IS NOT NULL);
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_discount_not_above_list" CHECK ("price_paise" <= "list_price_paise");
