-- CreateEnum
CREATE TYPE "CurrencyCategory" AS ENUM ('SAFE_HAVEN', 'RISK_ON', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "IndicatorSource" AS ENUM ('OECD', 'FRED', 'MANUAL', 'DERIVED');

-- CreateEnum
CREATE TYPE "Stance" AS ENUM ('VERY_HAWKISH', 'HAWKISH', 'NEUTRAL', 'DOVISH', 'VERY_DOVISH');

-- CreateEnum
CREATE TYPE "AccountStyle" AS ENUM ('SCALPING', 'DAY_SWING');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('M1_ENTRY', 'M2_ENTRY', 'A11_ENTRY', 'A12_ENTRY', 'A2_ENTRY', 'A21_ENTRY', 'A22_ENTRY', 'GOLDEN_ENTRY');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "TradeSource" AS ENUM ('MANUAL', 'METAAPI');

-- CreateEnum
CREATE TYPE "TechnicalBias" AS ENUM ('BULLISH', 'BEARISH', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "Importance" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "EventImpact" AS ENUM ('BULLISH_STRONG', 'BULLISH', 'NEUTRAL', 'BEARISH', 'BEARISH_STRONG');

-- CreateEnum
CREATE TYPE "PredictionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CONTRADICTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PredictionDirection" AS ENUM ('UP', 'DOWN', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "AIName" AS ENUM ('PERPLEXITY', 'CLAUDE', 'GROQ');

-- CreateEnum
CREATE TYPE "ConsensusStrength" AS ENUM ('STRONG', 'MEDIUM', 'MIXED');

-- CreateEnum
CREATE TYPE "AlertPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('SURPRISE_CRITICAL', 'SURPRISE_HIGH', 'SCORE_CHANGE_MAJOR', 'SCORE_CHANGE', 'PAIR_STRONG_CONVICTION', 'PAIR_DIRECTION_CHANGE', 'NEWS_MAJOR', 'CENTRAL_BANK_DECISION', 'TRADE_DIVERGENCE', 'DAILY_RECAP', 'PREDICTIVE', 'DIVERGENCE', 'CONFIRMATION', 'ESCALATION', 'TEST');

-- CreateEnum
CREATE TYPE "PineConfigKind" AS ENUM ('NEWS_LINES', 'EVENT_JOURNAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("sessionToken")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "userId" TEXT NOT NULL,
    "riskCapital" DECIMAL(14,2) NOT NULL DEFAULT 5000,
    "riskPct" DECIMAL(7,4) NOT NULL DEFAULT 0.4,
    "riskRR" DECIMAL(7,2) NOT NULL DEFAULT 2,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "sidebarCollapsed" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "alertSoundsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dndEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dndFrom" VARCHAR(5),
    "dndTo" VARCHAR(5),
    "extra" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Currency" (
    "code" VARCHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" VARCHAR(2) NOT NULL,
    "category" "CurrencyCategory" NOT NULL,
    "centralBank" TEXT,
    "cbTarget" DECIMAL(5,2),
    "nairu" DECIMAL(5,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "symbol" VARCHAR(16) NOT NULL,
    "baseCurrency" VARCHAR(3) NOT NULL,
    "quoteCurrency" VARCHAR(3) NOT NULL,
    "pipSize" DECIMAL(12,8) NOT NULL DEFAULT 0.0001,
    "contractSize" DECIMAL(14,2) NOT NULL DEFAULT 100000,
    "pricePrecision" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "inForecastSet" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "IndicatorValue" (
    "id" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "indicatorKey" VARCHAR(48) NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "unit" VARCHAR(16),
    "source" "IndicatorSource" NOT NULL,
    "period" VARCHAR(8) NOT NULL,
    "periodEnd" DATE NOT NULL,
    "nextRelease" DATE,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndicatorValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndicatorOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "indicatorKey" VARCHAR(48) NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndicatorOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrencyNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "stance" "Stance",
    "geopoliticalRisks" TEXT,
    "qualitativeAnalysis" TEXT,
    "eventsToWatch" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurrencyNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketContextValue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" VARCHAR(48) NOT NULL,
    "value" DECIMAL(18,6),
    "textValue" VARCHAR(64),
    "observedOn" DATE NOT NULL,
    "source" "IndicatorSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketContextValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "total" DECIMAL(6,2) NOT NULL,
    "rawTotal" DECIMAL(6,3) NOT NULL,
    "realRate" DECIMAL(8,4),
    "axes" JSONB NOT NULL,
    "breakdown" JSONB,
    "weightUsed" DECIMAL(6,2),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "color" VARCHAR(9) NOT NULL,
    "initialCapital" DECIMAL(14,2) NOT NULL,
    "currentCapital" DECIMAL(14,2) NOT NULL,
    "tradingCapital" DECIMAL(14,2) NOT NULL,
    "useRealCapital" BOOLEAN NOT NULL DEFAULT true,
    "maxDDPct" DECIMAL(6,3) NOT NULL,
    "targetPct" DECIMAL(6,3),
    "riskPct" DECIMAL(6,3) NOT NULL,
    "style" "AccountStyle" NOT NULL,
    "allowedEntries" "EntryType"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaApiAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metaApiAccountId" VARCHAR(64) NOT NULL,
    "label" TEXT,
    "region" VARCHAR(32),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" VARCHAR(32),
    "lastSyncError" TEXT,
    "lastSyncTradeCount" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaApiAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "instrument" VARCHAR(16) NOT NULL,
    "direction" "Direction" NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "entryPrice" DECIMAL(18,8) NOT NULL,
    "exitPrice" DECIMAL(18,8),
    "stopLoss" DECIMAL(18,8),
    "takeProfit" DECIMAL(18,8),
    "lotSize" DECIMAL(12,4) NOT NULL,
    "pips" DECIMAL(12,2),
    "pnl" DECIMAL(14,2),
    "commission" DECIMAL(14,2),
    "swap" DECIMAL(14,2),
    "strategy" VARCHAR(64),
    "entryType" "EntryType",
    "session" VARCHAR(32),
    "closeType" VARCHAR(32),
    "emotionBefore" VARCHAR(32),
    "emotionAfter" VARCHAR(32),
    "notes" TEXT,
    "tags" TEXT[],
    "source" "TradeSource" NOT NULL DEFAULT 'MANUAL',
    "positionId" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomStrategy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "blobPath" TEXT NOT NULL,
    "mimeType" VARCHAR(64) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "tradeId" TEXT,
    "planSetupId" TEXT,
    "setupReviewId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeekPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "fundamentalContext" TEXT,
    "generalConclusions" TEXT,
    "lessons" TEXT,
    "nextWeekObjectives" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeekPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanSetup" (
    "id" TEXT NOT NULL,
    "weekPlanId" TEXT NOT NULL,
    "instrument" VARCHAR(16) NOT NULL,
    "technicalBias" "TechnicalBias" NOT NULL,
    "entryZone" VARCHAR(64),
    "tp" VARCHAR(64),
    "sl" VARCHAR(64),
    "notes" TEXT,
    "fundamentalNotes" TEXT,
    "tailwinds" TEXT,
    "headwinds" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupReview" (
    "id" TEXT NOT NULL,
    "setupId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetupReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanNewsImpact" (
    "id" TEXT NOT NULL,
    "weekPlanId" TEXT NOT NULL,
    "eventKey" VARCHAR(48) NOT NULL,
    "impactNote" TEXT NOT NULL,

    CONSTRAINT "PlanNewsImpact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "weekKey" VARCHAR(8) NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "importance" "Importance" NOT NULL,
    "forecast" VARCHAR(32),
    "previous" VARCHAR(32),
    "actual" VARCHAR(32),
    "impact" "EventImpact",
    "pipsVariation" DECIMAL(10,1),
    "notes" TEXT,
    "fromCalendar" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundamentalEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "indicatorId" VARCHAR(48) NOT NULL,
    "indicatorName" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "unit" VARCHAR(16),
    "previous" DECIMAL(18,6),
    "forecast" DECIMAL(18,6),
    "actual" DECIMAL(18,6),
    "surpriseRaw" DECIMAL(18,6),
    "surpriseNormalized" DECIMAL(6,3),
    "cascadeImpacts" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundamentalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "sourceIndicatorId" VARCHAR(48) NOT NULL,
    "sourceIndicatorName" TEXT NOT NULL,
    "sourceCurrency" VARCHAR(3) NOT NULL,
    "sourceDirection" "PredictionDirection" NOT NULL,
    "targetIndicatorId" VARCHAR(48) NOT NULL,
    "targetIndicatorName" TEXT NOT NULL,
    "targetCurrency" VARCHAR(3) NOT NULL,
    "predictedDirection" "PredictionDirection" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "delayLabel" VARCHAR(32) NOT NULL,
    "status" "PredictionStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedEventId" TEXT,
    "resolvedDirection" "PredictionDirection",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefingSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "consensus" JSONB,
    "totalInputTokens" INTEGER,
    "totalOutputTokens" INTEGER,
    "costUsd" DECIMAL(10,4),
    "errorMessage" TEXT,

    CONSTRAINT "BriefingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefingMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "ai" "AIName" NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "round" INTEGER NOT NULL,
    "roundLabel" VARCHAR(64) NOT NULL,
    "groupCodes" TEXT[],
    "content" TEXT NOT NULL,
    "researchText" TEXT,
    "biases" JSONB,
    "changedOpinion" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "errorMessage" TEXT,
    "stopReason" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BriefingMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AlertKind" NOT NULL,
    "priority" "AlertPriority" NOT NULL,
    "currencyCode" VARCHAR(3),
    "instrument" VARCHAR(16),
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "minPriority" "AlertPriority" NOT NULL DEFAULT 'NORMAL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoritePair" (
    "userId" TEXT NOT NULL,
    "instrument" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoritePair_pkey" PRIMARY KEY ("userId","instrument")
);

-- CreateTable
CREATE TABLE "PineConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PineConfigKind" NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "rows" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PineConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Instrument_isActive_idx" ON "Instrument"("isActive");

-- CreateIndex
CREATE INDEX "IndicatorValue_currencyCode_indicatorKey_periodEnd_idx" ON "IndicatorValue"("currencyCode", "indicatorKey", "periodEnd" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "IndicatorValue_currencyCode_indicatorKey_period_source_key" ON "IndicatorValue"("currencyCode", "indicatorKey", "period", "source");

-- CreateIndex
CREATE INDEX "IndicatorOverride_userId_idx" ON "IndicatorOverride"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IndicatorOverride_userId_currencyCode_indicatorKey_key" ON "IndicatorOverride"("userId", "currencyCode", "indicatorKey");

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyNote_userId_currencyCode_key" ON "CurrencyNote"("userId", "currencyCode");

-- CreateIndex
CREATE INDEX "MarketContextValue_userId_key_observedOn_idx" ON "MarketContextValue"("userId", "key", "observedOn" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MarketContextValue_userId_key_observedOn_key" ON "MarketContextValue"("userId", "key", "observedOn");

-- CreateIndex
CREATE INDEX "ScoreSnapshot_userId_currencyCode_computedAt_idx" ON "ScoreSnapshot"("userId", "currencyCode", "computedAt" DESC);

-- CreateIndex
CREATE INDEX "TradingAccount_userId_idx" ON "TradingAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TradingAccount_userId_slot_key" ON "TradingAccount"("userId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "MetaApiAccount_userId_metaApiAccountId_key" ON "MetaApiAccount"("userId", "metaApiAccountId");

-- CreateIndex
CREATE INDEX "Trade_userId_openedAt_idx" ON "Trade"("userId", "openedAt" DESC);

-- CreateIndex
CREATE INDEX "Trade_userId_instrument_idx" ON "Trade"("userId", "instrument");

-- CreateIndex
CREATE INDEX "Trade_accountId_idx" ON "Trade"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_userId_positionId_key" ON "Trade"("userId", "positionId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomStrategy_userId_name_key" ON "CustomStrategy"("userId", "name");

-- CreateIndex
CREATE INDEX "Attachment_userId_idx" ON "Attachment"("userId");

-- CreateIndex
CREATE INDEX "Attachment_tradeId_idx" ON "Attachment"("tradeId");

-- CreateIndex
CREATE INDEX "Attachment_planSetupId_idx" ON "Attachment"("planSetupId");

-- CreateIndex
CREATE INDEX "Attachment_setupReviewId_idx" ON "Attachment"("setupReviewId");

-- CreateIndex
CREATE INDEX "WeekPlan_userId_weekStart_idx" ON "WeekPlan"("userId", "weekStart" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "WeekPlan_userId_weekStart_key" ON "WeekPlan"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "PlanSetup_weekPlanId_idx" ON "PlanSetup"("weekPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "SetupReview_setupId_key" ON "SetupReview"("setupId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanNewsImpact_weekPlanId_eventKey_key" ON "PlanNewsImpact"("weekPlanId", "eventKey");

-- CreateIndex
CREATE INDEX "WeeklyEvent_userId_weekKey_idx" ON "WeeklyEvent"("userId", "weekKey");

-- CreateIndex
CREATE INDEX "WeeklyEvent_userId_scheduledAt_idx" ON "WeeklyEvent"("userId", "scheduledAt");

-- CreateIndex
CREATE INDEX "FundamentalEvent_userId_occurredAt_idx" ON "FundamentalEvent"("userId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "FundamentalEvent_userId_currencyCode_idx" ON "FundamentalEvent"("userId", "currencyCode");

-- CreateIndex
CREATE INDEX "Prediction_userId_status_idx" ON "Prediction"("userId", "status");

-- CreateIndex
CREATE INDEX "Prediction_userId_targetCurrency_status_idx" ON "Prediction"("userId", "targetCurrency", "status");

-- CreateIndex
CREATE INDEX "Prediction_expiresAt_idx" ON "Prediction"("expiresAt");

-- CreateIndex
CREATE INDEX "BriefingSession_userId_startedAt_idx" ON "BriefingSession"("userId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "BriefingMessage_sessionId_round_idx" ON "BriefingMessage"("sessionId", "round");

-- CreateIndex
CREATE INDEX "Alert_userId_createdAt_idx" ON "Alert"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Alert_userId_read_dismissed_idx" ON "Alert"("userId", "read", "dismissed");

-- CreateIndex
CREATE UNIQUE INDEX "AlertPreference_userId_currencyCode_key" ON "AlertPreference"("userId", "currencyCode");

-- CreateIndex
CREATE INDEX "PineConfig_userId_kind_idx" ON "PineConfig"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "PineConfig_userId_kind_name_key" ON "PineConfig"("userId", "kind", "name");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorValue" ADD CONSTRAINT "IndicatorValue_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorOverride" ADD CONSTRAINT "IndicatorOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndicatorOverride" ADD CONSTRAINT "IndicatorOverride_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyNote" ADD CONSTRAINT "CurrencyNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyNote" ADD CONSTRAINT "CurrencyNote_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketContextValue" ADD CONSTRAINT "MarketContextValue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSnapshot" ADD CONSTRAINT "ScoreSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreSnapshot" ADD CONSTRAINT "ScoreSnapshot_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingAccount" ADD CONSTRAINT "TradingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaApiAccount" ADD CONSTRAINT "MetaApiAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TradingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_instrument_fkey" FOREIGN KEY ("instrument") REFERENCES "Instrument"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomStrategy" ADD CONSTRAINT "CustomStrategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_planSetupId_fkey" FOREIGN KEY ("planSetupId") REFERENCES "PlanSetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_setupReviewId_fkey" FOREIGN KEY ("setupReviewId") REFERENCES "SetupReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeekPlan" ADD CONSTRAINT "WeekPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSetup" ADD CONSTRAINT "PlanSetup_weekPlanId_fkey" FOREIGN KEY ("weekPlanId") REFERENCES "WeekPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSetup" ADD CONSTRAINT "PlanSetup_instrument_fkey" FOREIGN KEY ("instrument") REFERENCES "Instrument"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupReview" ADD CONSTRAINT "SetupReview_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "PlanSetup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanNewsImpact" ADD CONSTRAINT "PlanNewsImpact_weekPlanId_fkey" FOREIGN KEY ("weekPlanId") REFERENCES "WeekPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyEvent" ADD CONSTRAINT "WeeklyEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyEvent" ADD CONSTRAINT "WeeklyEvent_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundamentalEvent" ADD CONSTRAINT "FundamentalEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundamentalEvent" ADD CONSTRAINT "FundamentalEvent_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "FundamentalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_resolvedEventId_fkey" FOREIGN KEY ("resolvedEventId") REFERENCES "FundamentalEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingSession" ADD CONSTRAINT "BriefingSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingMessage" ADD CONSTRAINT "BriefingMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BriefingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertPreference" ADD CONSTRAINT "AlertPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertPreference" ADD CONSTRAINT "AlertPreference_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoritePair" ADD CONSTRAINT "FavoritePair_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PineConfig" ADD CONSTRAINT "PineConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
