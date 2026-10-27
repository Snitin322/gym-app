-- CreateEnum
CREATE TYPE "invoice_kind" AS ENUM ('tax_invoice', 'receipt');

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "kind" "invoice_kind" NOT NULL,
    "number" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "issued_on" DATE NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_paise" INTEGER NOT NULL,
    "taxable_paise" INTEGER NOT NULL,
    "cgst_paise" INTEGER NOT NULL,
    "sgst_paise" INTEGER NOT NULL,
    "gst_rate_percent" INTEGER NOT NULL,
    "sac_code" TEXT,
    "description" TEXT NOT NULL,
    "seller" JSONB NOT NULL,
    "buyer" JSONB NOT NULL,
    "payment_method" TEXT NOT NULL,
    "payment_ref" TEXT,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_sequences" (
    "gym_id" UUID NOT NULL,
    "financial_year" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL,

    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("gym_id","financial_year")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_payment_id_key" ON "invoices"("payment_id");

-- CreateIndex
CREATE INDEX "invoices_gym_id_idx" ON "invoices"("gym_id");

-- CreateIndex
CREATE INDEX "invoices_member_id_idx" ON "invoices"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_gym_id_financial_year_sequence_key" ON "invoices"("gym_id", "financial_year", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_gym_id_number_key" ON "invoices"("gym_id", "number");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Safety nets (hand-written).
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_add_up" CHECK ("taxable_paise" + "cgst_paise" + "sgst_paise" = "total_paise");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sequence_positive" CHECK ("sequence" > 0);
