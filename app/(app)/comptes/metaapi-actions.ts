"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  METAAPI_PLATFORMS,
  METAAPI_REGIONS,
  MetaApiError,
  fetchMetaApiAccountState,
  metaApiConfigured,
  provisionMetaApiAccount,
} from "@/lib/integrations/metaapi";
import { syncMetaApiAccount, type SyncSummary } from "@/lib/metaapi-sync";
import { prisma } from "@/lib/prisma";
import { requireUserIdOrThrow } from "@/lib/session";

/**
 * Connexion directe d'un compte MetaTrader, en libre-service.
 *
 * LE MOT DE PASSE N'EST NI STOCKÉ NI JOURNALISÉ. Il sert à provisionner le
 * compte chez MetaApi puis disparaît : ce qui reste en base est l'identifiant
 * MetaApi, qui ne permet pas de trader. Aucun message d'erreur renvoyé au
 * client ne le contient — les erreurs remontées viennent de MetaApi et
 * portent sur le serveur ou les identifiants, jamais sur leur valeur.
 *
 * Chaque utilisateur branche SON compte lui-même : toutes les actions
 * re-résolvent la session plutôt que d'accepter un userId du client.
 */

const connectSchema = z.object({
  tradingAccountId: z.string().min(1).max(32),
  login: z.string().min(1).max(32).regex(/^\d+$/, "Le numéro de compte ne contient que des chiffres"),
  password: z.string().min(1).max(128),
  server: z.string().min(1).max(64),
  platform: z.enum(METAAPI_PLATFORMS),
  region: z.enum(METAAPI_REGIONS),
});

export interface ConnectResult {
  ok: boolean;
  message: string;
  /** Vrai quand réessayer plus tard a une chance d'aboutir. */
  retryable?: boolean;
  connectionStatus?: string;
}

export async function connectMetaApi(input: unknown): Promise<ConnectResult> {
  const userId = await requireUserIdOrThrow();

  if (!metaApiConfigured()) {
    return { ok: false, message: "La connexion directe n'est pas activée sur ce serveur." };
  }

  const parsed = connectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  const data = parsed.data;

  const account = await prisma.tradingAccount.findFirst({
    where: { id: data.tradingAccountId, userId },
    select: { id: true, name: true },
  });
  if (!account) return { ok: false, message: "Compte introuvable." };

  try {
    const metaApiAccountId = await provisionMetaApiAccount({
      name: `Fondanarex — ${account.name}`,
      login: data.login,
      password: data.password,
      server: data.server,
      platform: data.platform,
      region: data.region,
    });

    // L'état est LU, jamais supposé. Un provisioning réussi ne veut pas dire
    // que le broker accepte la connexion : une prop firm qui refuse les
    // terminaux tiers laisse le compte DISCONNECTED sans erreur.
    let connectionStatus = "UNKNOWN";
    try {
      connectionStatus = (await fetchMetaApiAccountState(metaApiAccountId)).connectionStatus;
    } catch {
      /* l'état viendra à la première synchro */
    }

    await prisma.metaApiAccount.upsert({
      where: { userId_metaApiAccountId: { userId, metaApiAccountId } },
      create: {
        userId,
        metaApiAccountId,
        tradingAccountId: account.id,
        region: data.region,
        label: account.name,
        connectionStatus,
      },
      update: { tradingAccountId: account.id, region: data.region, connectionStatus },
    });

    revalidatePath("/comptes");

    if (connectionStatus === "CONNECTED") {
      return { ok: true, message: "Compte connecté. Lancez une synchronisation.", connectionStatus };
    }
    return {
      ok: true,
      connectionStatus,
      message:
        `Compte créé chez MetaApi, mais le lien avec le broker est « ${connectionStatus} ». ` +
        "La connexion peut mettre une minute — sinon votre broker refuse probablement les terminaux tiers, et il faut passer par l'import de rapport.",
    };
  } catch (error) {
    const message =
      error instanceof MetaApiError ? error.message : "Connexion à MetaApi impossible.";
    return { ok: false, message, retryable: error instanceof MetaApiError && error.retryable };
  }
}

const linkSchema = z.object({
  tradingAccountId: z.string().min(1).max(32),
  metaApiAccountId: z.string().min(8).max(64),
  region: z.enum(METAAPI_REGIONS),
});

/**
 * Rattache un compte DÉJÀ créé dans le tableau de bord MetaApi.
 *
 * Voie indispensable, pas un raccourci : créer un compte par l'API exige la
 * permission `createAccount`, que les tokens en lecture seule n'ont pas — un
 * token restreint répond alors 403 sur le provisioning tout en pouvant
 * parfaitement LIRE le compte et son historique. Coller l'identifiant
 * contourne entièrement cette permission.
 *
 * L'identifiant est vérifié auprès de MetaApi avant d'être enregistré : une
 * faute de frappe doit échouer ici, pas six heures plus tard à la première
 * synchronisation silencieuse.
 */
export async function linkExistingMetaApi(input: unknown): Promise<ConnectResult> {
  const userId = await requireUserIdOrThrow();

  if (!metaApiConfigured()) {
    return { ok: false, message: "La connexion directe n'est pas activée sur ce serveur." };
  }

  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  }
  const data = parsed.data;

  const account = await prisma.tradingAccount.findFirst({
    where: { id: data.tradingAccountId, userId },
    select: { id: true, name: true },
  });
  if (!account) return { ok: false, message: "Compte introuvable." };

  try {
    const state = await fetchMetaApiAccountState(data.metaApiAccountId);

    await prisma.metaApiAccount.upsert({
      where: { userId_metaApiAccountId: { userId, metaApiAccountId: data.metaApiAccountId } },
      create: {
        userId,
        metaApiAccountId: data.metaApiAccountId,
        tradingAccountId: account.id,
        region: data.region,
        label: account.name,
        connectionStatus: state.connectionStatus,
      },
      update: {
        tradingAccountId: account.id,
        region: data.region,
        connectionStatus: state.connectionStatus,
      },
    });

    revalidatePath("/comptes");

    if (state.connectionStatus === "CONNECTED") {
      return {
        ok: true,
        connectionStatus: state.connectionStatus,
        message: "Compte rattaché et connecté. Lancez une synchronisation.",
      };
    }
    return {
      ok: true,
      connectionStatus: state.connectionStatus,
      message:
        `Compte rattaché, mais le lien avec le broker est « ${state.connectionStatus} » ` +
        `(état MetaApi : ${state.state}). La synchronisation ne rapportera rien tant qu'il n'est pas CONNECTED.`,
    };
  } catch (error) {
    const message =
      error instanceof MetaApiError ? error.message : "Vérification auprès de MetaApi impossible.";
    return { ok: false, message };
  }
}

export async function syncMetaApi(input: unknown): Promise<ConnectResult & { summary?: SyncSummary }> {
  const userId = await requireUserIdOrThrow();
  const linkId = z.string().min(1).max(64).safeParse(input);
  if (!linkId.success) return { ok: false, message: "Lien invalide." };

  const link = await prisma.metaApiAccount.findFirst({
    where: { id: linkId.data, userId },
  });
  if (!link) return { ok: false, message: "Connexion introuvable." };

  try {
    const summary = await syncMetaApiAccount(userId, link, link.tradingAccountId);

    await prisma.metaApiAccount.update({
      where: { id: link.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: "ok",
        lastSyncError: null,
        lastSyncTradeCount: summary.imported,
      },
    });

    revalidatePath("/comptes");
    revalidatePath("/journal");

    const parts = [`${summary.imported} trade(s) importé(s)`];
    if (summary.duplicates > 0) parts.push(`${summary.duplicates} déjà présent(s)`);
    if (summary.skippedInstruments.length > 0) {
      parts.push(
        `ignorés : ${summary.skippedInstruments.map((s) => `${s.symbol} (${s.count})`).join(", ")}`,
      );
    }
    if (summary.seen === 0) parts.push("aucune position clôturée sur la période");

    return { ok: true, message: parts.join(" · "), summary };
  } catch (error) {
    const message =
      error instanceof MetaApiError ? error.message : "Synchronisation impossible.";
    await prisma.metaApiAccount.update({
      where: { id: link.id },
      data: { lastSyncAt: new Date(), lastSyncStatus: "error", lastSyncError: message.slice(0, 500) },
    });
    revalidatePath("/comptes");
    return { ok: false, message };
  }
}

export async function disconnectMetaApi(input: unknown): Promise<void> {
  const userId = await requireUserIdOrThrow();
  const linkId = z.string().min(1).max(64).parse(input);

  // deleteMany et pas delete : filtre sur userId dans la même requête, donc
  // l'identifiant d'un autre utilisateur ne supprime rien.
  await prisma.metaApiAccount.deleteMany({ where: { id: linkId, userId } });
  revalidatePath("/comptes");
}
