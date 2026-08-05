-- CreateEnum
CREATE TYPE "NewsLean" AS ENUM ('BULLISH', 'BEARISH', 'NEUTRAL');

-- CreateTable
CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL,
    "urlHash" VARCHAR(64) NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source" VARCHAR(64) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsTag" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "lean" "NewsLean" NOT NULL,

    CONSTRAINT "NewsTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_urlHash_key" ON "NewsArticle"("urlHash");

-- CreateIndex
CREATE INDEX "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "NewsTag_currencyCode_idx" ON "NewsTag"("currencyCode");

-- CreateIndex
CREATE UNIQUE INDEX "NewsTag_articleId_currencyCode_key" ON "NewsTag"("articleId", "currencyCode");

-- AddForeignKey
ALTER TABLE "NewsTag" ADD CONSTRAINT "NewsTag_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "NewsArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
