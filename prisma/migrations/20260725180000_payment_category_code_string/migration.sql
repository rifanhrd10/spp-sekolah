-- Allow custom payment category codes while keeping each code unique.
DROP INDEX IF EXISTS "PaymentCategory_code_key";

ALTER TABLE "PaymentCategory"
  ALTER COLUMN "code" TYPE TEXT USING "code"::TEXT;

CREATE UNIQUE INDEX "PaymentCategory_code_key" ON "PaymentCategory"("code");
