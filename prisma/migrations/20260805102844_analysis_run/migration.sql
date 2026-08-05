-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodLabel" VARCHAR(160) NOT NULL,
    "tradeCount" INTEGER NOT NULL,
    "netPnl" DECIMAL(14,2) NOT NULL,
    "winRate" INTEGER NOT NULL,
    "expectancy" DECIMAL(14,2) NOT NULL,
    "expectancyR" DECIMAL(8,3),
    "sqn" DECIMAL(8,3),
    "sharpe" DECIMAL(8,3),
    "sortino" DECIMAL(8,3),
    "payoffRatio" DECIMAL(8,3),
    "maxDrawdown" DECIMAL(14,2) NOT NULL,
    "targetEfficiency" DECIMAL(8,2),
    "stopCoverage" INTEGER NOT NULL,
    "verdict" JSONB NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisRun_userId_createdAt_idx" ON "AnalysisRun"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
