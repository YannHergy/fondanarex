-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('MATCH', 'MISMATCH');

-- CreateTable
CREATE TABLE "IndicatorCheck" (
    "id" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "indicatorKey" VARCHAR(48) NOT NULL,
    "status" "CheckStatus" NOT NULL,
    "reference" VARCHAR(64),
    "checkedOn" DATE NOT NULL,

    CONSTRAINT "IndicatorCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IndicatorCheck_currencyCode_idx" ON "IndicatorCheck"("currencyCode");

-- CreateIndex
CREATE UNIQUE INDEX "IndicatorCheck_currencyCode_indicatorKey_key" ON "IndicatorCheck"("currencyCode", "indicatorKey");

-- AddForeignKey
ALTER TABLE "IndicatorCheck" ADD CONSTRAINT "IndicatorCheck_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE CASCADE ON UPDATE CASCADE;
