-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "isEntry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stagingKey" VARCHAR(16),
ADD COLUMN     "timeframe" VARCHAR(8);

-- CreateIndex
CREATE INDEX "Attachment_userId_stagingKey_idx" ON "Attachment"("userId", "stagingKey");
