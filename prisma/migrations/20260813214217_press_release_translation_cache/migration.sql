-- CreateTable
CREATE TABLE "PressReleaseTranslation" (
    "id" TEXT NOT NULL,
    "titleHash" VARCHAR(64) NOT NULL,
    "title" TEXT NOT NULL,
    "titleFr" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PressReleaseTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PressReleaseTranslation_titleHash_key" ON "PressReleaseTranslation"("titleHash");
