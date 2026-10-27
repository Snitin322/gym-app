-- CreateEnum
CREATE TYPE "pt_ledger_reason" AS ENUM ('purchase', 'session_completed', 'late_cancel', 'no_show', 'dispute_refund', 'adjustment');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "pt_purchase_id" UUID;

-- CreateTable
CREATE TABLE "pt_packages" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "session_count" INTEGER NOT NULL,
    "validity_days" INTEGER NOT NULL,
    "price_paise" INTEGER NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pt_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pt_purchases" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "package_name" TEXT NOT NULL,
    "session_count" INTEGER NOT NULL,
    "validity_days" INTEGER NOT NULL,
    "price_paise" INTEGER NOT NULL,
    "list_price_paise" INTEGER NOT NULL,
    "discount_reason" TEXT,
    "start_date" DATE NOT NULL,
    "expires_on" DATE NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pt_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pt_session_ledger" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "session_id" UUID,
    "change" INTEGER NOT NULL,
    "reason" "pt_ledger_reason" NOT NULL,
    "note" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pt_session_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pt_packages_gym_id_idx" ON "pt_packages"("gym_id");

-- CreateIndex
CREATE UNIQUE INDEX "pt_packages_gym_id_name_key" ON "pt_packages"("gym_id", "name");

-- CreateIndex
CREATE INDEX "pt_purchases_gym_id_idx" ON "pt_purchases"("gym_id");

-- CreateIndex
CREATE INDEX "pt_purchases_member_id_idx" ON "pt_purchases"("member_id");

-- CreateIndex
CREATE INDEX "pt_purchases_trainer_id_idx" ON "pt_purchases"("trainer_id");

-- CreateIndex
CREATE INDEX "pt_session_ledger_gym_id_idx" ON "pt_session_ledger"("gym_id");

-- CreateIndex
CREATE INDEX "pt_session_ledger_purchase_id_idx" ON "pt_session_ledger"("purchase_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_pt_purchase_id_fkey" FOREIGN KEY ("pt_purchase_id") REFERENCES "pt_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_packages" ADD CONSTRAINT "pt_packages_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_purchases" ADD CONSTRAINT "pt_purchases_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_purchases" ADD CONSTRAINT "pt_purchases_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_purchases" ADD CONSTRAINT "pt_purchases_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_purchases" ADD CONSTRAINT "pt_purchases_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "pt_packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_purchases" ADD CONSTRAINT "pt_purchases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_session_ledger" ADD CONSTRAINT "pt_session_ledger_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_session_ledger" ADD CONSTRAINT "pt_session_ledger_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "pt_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pt_session_ledger" ADD CONSTRAINT "pt_session_ledger_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Safety nets (hand-written).
ALTER TABLE "pt_packages" ADD CONSTRAINT "pt_packages_positive" CHECK ("session_count" > 0 AND "validity_days" > 0 AND "price_paise" > 0);
ALTER TABLE "pt_purchases" ADD CONSTRAINT "pt_purchases_dates_ordered" CHECK ("expires_on" >= "start_date");
ALTER TABLE "pt_purchases" ADD CONSTRAINT "pt_purchases_discount_not_above_list" CHECK ("price_paise" >= 0 AND "price_paise" <= "list_price_paise");
ALTER TABLE "pt_session_ledger" ADD CONSTRAINT "pt_session_ledger_change_nonzero" CHECK ("change" <> 0);
-- A payment is for a membership or a PT package, never both.
ALTER TABLE "payments" ADD CONSTRAINT "payments_one_purpose" CHECK ("membership_id" IS NULL OR "pt_purchase_id" IS NULL);
