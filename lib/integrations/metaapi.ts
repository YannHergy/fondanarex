import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * MetaApi — connexion directe à un compte MetaTrader.
 *
 * Deux API distinctes, deux hôtes :
 *   · provisioning — crée le compte chez MetaApi à partir des identifiants
 *     du broker, et rend un identifiant de compte. Appelée UNE fois.
 *   · client       — lit l'historique, régionalisée. Appelée à chaque synchro.
 *
 * LE MOT DE PASSE NE TRAVERSE QUE LA PREMIÈRE. Il n'est ni stocké, ni journalisé,
 * ni renvoyé au client : il sert à provisionner puis disparaît de la mémoire du
 * processus. Ce que nous conservons — l'identifiant MetaApi — ne permet pas de
 * trader, seulement de relire ce compte via NOTRE token.
 */

const PROVISIONING = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
const CLIENT_HOST = (region: string) => `https://mt-client-api-v1.${region}.agiliumtrade.ai`;

/** Régions proposées, telles que MetaApi les nomme. */
export const METAAPI_REGIONS = ["new-york", "london", "singapore"] as const;
export type MetaApiRegion = (typeof METAAPI_REGIONS)[number];

export const METAAPI_PLATFORMS = ["mt5", "mt4"] as const;
export type MetaApiPlatform = (typeof METAAPI_PLATFORMS)[number];

export function metaApiConfigured(): boolean {
  return serverEnv().METAAPI_TOKEN.length > 0;
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    /** Vrai quand réessayer plus tard a une chance d'aboutir. */
    readonly retryable = false,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

/** Identifiant de transaction exigé par l'API de provisioning : 32 caractères. */
function transactionId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Message lisible à partir d'une réponse en erreur.
 *
 * Le corps est lu et inspecté plutôt que résumé par le seul code HTTP : un 400
 * de MetaApi dit précisément ce qui cloche (« Invalid account credentials »,
 * « Specified server not found »), et c'est exactement ce dont l'utilisateur a
 * besoin pour corriger sa saisie.
 */
async function readError(response: Response): Promise<string> {
  const raw = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw) as { message?: string; error?: string; details?: unknown };
    const detail = parsed.message ?? parsed.error;
    if (detail) return `${detail} (HTTP ${response.status})`;
  } catch {
    /* corps non JSON : on retombe sur le texte brut */
  }
  return raw.slice(0, 200) || `HTTP ${response.status}`;
}

export interface ProvisionInput {
  name: string;
  login: string;
  password: string;
  server: string;
  platform: MetaApiPlatform;
  region: MetaApiRegion;
}

/**
 * Crée le compte chez MetaApi et rend son identifiant.
 *
 * Un 202 n'est PAS un succès : MetaApi détecte encore les réglages du broker
 * et n'a pas d'identifiant à donner. Il est remonté comme réessayable, pour
 * que l'interface invite à recommencer dans un instant au lieu d'afficher une
 * erreur définitive sur une opération qui va aboutir.
 */
export async function provisionMetaApiAccount(input: ProvisionInput): Promise<string> {
  if (!metaApiConfigured()) {
    throw new MetaApiError("MetaApi n'est pas configuré sur ce serveur (METAAPI_TOKEN absent).");
  }

  const response = await fetch(`${PROVISIONING}/users/current/accounts`, {
    method: "POST",
    headers: {
      "auth-token": serverEnv().METAAPI_TOKEN,
      "transaction-id": transactionId(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: input.name,
      login: input.login,
      password: input.password,
      server: input.server,
      platform: input.platform,
      region: input.region,
      // Le compte ne sert qu'à LIRE l'historique. `magic: 0` et l'absence de
      // toute intention de trading gardent l'usage aligné sur un mot de passe
      // investisseur, qui ne peut de toute façon pas passer d'ordre.
      magic: 0,
      type: "cloud-g2",
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (response.status === 202) {
    throw new MetaApiError(
      "MetaApi détecte encore les réglages du broker. Réessayez dans une minute.",
      true,
    );
  }

  if (!response.ok) {
    // Le 403 sur createAccount ne veut PAS dire que les identifiants sont
    // faux : il dit que le token du serveur est restreint à la lecture. Un tel
    // token sait parfaitement lire un compte existant et son historique, donc
    // le message oriente vers le rattachement d'un compte déjà créé plutôt que
    // de laisser croire à une erreur de saisie.
    if (response.status === 403) {
      throw new MetaApiError(
        "Le token MetaApi du serveur n'a pas le droit de CRÉER un compte (lecture seule). " +
          "Créez le compte dans le tableau de bord MetaApi, puis rattachez-le ici avec son identifiant.",
      );
    }
    throw new MetaApiError(await readError(response));
  }

  const payload = (await response.json()) as { id?: string };
  if (!payload.id) {
    throw new MetaApiError("MetaApi n'a pas renvoyé d'identifiant de compte.");
  }
  return payload.id;
}

export interface MetaApiAccountState {
  /** DEPLOYED | UNDEPLOYED | DRAFT… — l'état de la machine chez MetaApi. */
  state: string;
  /** CONNECTED | DISCONNECTED | CONNECTING… — l'état du lien avec le broker. */
  connectionStatus: string;
}

/**
 * État réel du compte chez MetaApi.
 *
 * Indispensable, et pas un simple confort : un compte peut être CRÉÉ avec
 * succès puis rester indéfiniment DISCONNECTED, sans message d'erreur, quand
 * le broker refuse les terminaux tiers — c'est exactement ce qui s'est produit
 * ici avec une prop firm (voir l'en-tête de lib/journal-import.ts). Annoncer
 * « connecté » sur la seule réussite du provisioning mentirait à
 * l'utilisateur ; il faut lire l'état.
 */
export async function fetchMetaApiAccountState(accountId: string): Promise<MetaApiAccountState> {
  if (!metaApiConfigured()) {
    throw new MetaApiError("MetaApi n'est pas configuré sur ce serveur (METAAPI_TOKEN absent).");
  }

  const response = await fetch(
    `${PROVISIONING}/users/current/accounts/${encodeURIComponent(accountId)}`,
    {
      headers: { "auth-token": serverEnv().METAAPI_TOKEN },
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!response.ok) throw new MetaApiError(await readError(response));

  const payload = (await response.json()) as {
    state?: string;
    connectionStatus?: string;
  };
  return {
    state: payload.state ?? "UNKNOWN",
    connectionStatus: payload.connectionStatus ?? "UNKNOWN",
  };
}

/** Une opération d'historique, telle que MetaApi la renvoie. */
export interface MetaApiDeal {
  id?: string;
  positionId?: string;
  symbol?: string;
  type?: string;
  entryType?: string;
  volume?: number;
  price?: number;
  profit?: number;
  commission?: number;
  swap?: number;
  time?: string;
}

/**
 * Historique des opérations sur une fenêtre de temps.
 *
 * Paginé : MetaApi plafonne à 1000 par appel et un compte actif dépasse
 * largement ce chiffre sur plusieurs mois. La boucle s'arrête sur une page
 * incomplète, et un plafond dur évite qu'une réponse inattendue la fasse
 * tourner indéfiniment.
 */
export async function fetchMetaApiDeals(
  accountId: string,
  region: string,
  since: Date,
): Promise<MetaApiDeal[]> {
  if (!metaApiConfigured()) {
    throw new MetaApiError("MetaApi n'est pas configuré sur ce serveur (METAAPI_TOKEN absent).");
  }

  const PAGE = 1000;
  const MAX_PAGES = 20;
  const start = since.toISOString();
  const end = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const deals: MetaApiDeal[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url =
      `${CLIENT_HOST(region)}/users/current/accounts/${encodeURIComponent(accountId)}` +
      `/history-deals/time/${encodeURIComponent(start)}/${encodeURIComponent(end)}` +
      `?offset=${page * PAGE}&limit=${PAGE}`;

    const response = await fetch(url, {
      headers: { "auth-token": serverEnv().METAAPI_TOKEN },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new MetaApiError(await readError(response), response.status >= 500);
    }

    const batch = (await response.json()) as MetaApiDeal[];
    if (!Array.isArray(batch)) {
      throw new MetaApiError("Réponse MetaApi inattendue (tableau attendu).");
    }

    deals.push(...batch);
    if (batch.length < PAGE) break;
  }

  return deals;
}
