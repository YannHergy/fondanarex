-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "dashboardCurrencies" TEXT[] DEFAULT ARRAY[]::TEXT[];
