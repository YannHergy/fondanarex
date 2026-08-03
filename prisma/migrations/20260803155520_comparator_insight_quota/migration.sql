-- CreateTable
CREATE TABLE "ComparatorInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pair" VARCHAR(8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComparatorInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComparatorInsight_userId_createdAt_idx" ON "ComparatorInsight"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ComparatorInsight" ADD CONSTRAINT "ComparatorInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
