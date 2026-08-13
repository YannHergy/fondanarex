-- AlterTable
ALTER TABLE "TradingAccount" ADD COLUMN     "alertThresholdPct" DECIMAL(6,3),
ADD COLUMN     "allowedSetups" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Reprise des comptes existants : allowedEntries (enum) -> allowedSetups
-- (texte), au format déjà utilisé dans le journal — « M2_ENTRY » devient
-- « M2 ENTRY ». Sans cela un compte créé avant cette migration se
-- retrouverait sans aucun setup autorisé, donc sans statistiques, sans que
-- son propriétaire ait rien changé.
UPDATE "TradingAccount"
SET "allowedSetups" = ARRAY(
  SELECT REPLACE(entry::text, '_', ' ')
  FROM UNNEST("allowedEntries") AS entry
)
WHERE array_length("allowedEntries", 1) > 0;
