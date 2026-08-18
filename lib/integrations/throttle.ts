/**
 * Étrangleur de débit pour une source HTTP externe.
 *
 * Écrit pour FXMacroData après la mesure du 2026-08-18 : seize requêtes
 * ENVOYÉES UNE PAR UNE, espacées de 400 ms, ont tout de même essuyé trois
 * HTTP 429, et l'API refusait encore du trafic une minute plus tard. La limite
 * porte donc sur un volume par fenêtre, pas sur la concurrence instantanée —
 * un éventail parallèle la franchit à coup sûr.
 *
 * Deux garde-fous, dans cet ordre :
 *
 *   1. Au plus `maxConcurrent` tâches en vol. Ce plafond seul ne coûte rien
 *      quand tout va bien : une réponse servie par un cache libère sa place
 *      en une milliseconde.
 *   2. Un écart minimal entre départs, mais UNIQUEMENT après `engageBackoff()`,
 *      et pour une fenêtre limitée. Espacer en permanence pénaliserait chaque
 *      rendu, y compris ceux entièrement servis par le cache, pour un incident
 *      qui ne survient qu'au remplissage de celui-ci.
 *
 * Ce module ne connaît ni `fetch` ni HTTP : c'est ce qui le rend testable, là
 * où le module appelant importe `server-only` et ne peut pas l'être.
 */

export interface ThrottleOptions {
  /** Nombre maximal de tâches simultanées. */
  maxConcurrent: number;
  /** Écart imposé entre deux départs, une fois le ralentissement engagé. */
  throttledGapMs: number;
  /** Durée pendant laquelle `engageBackoff()` reste actif. */
  throttleWindowMs: number;
}

export interface Throttle {
  /** Exécute `fn` en respectant le plafond et l'espacement en vigueur. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** À appeler quand la source a signalé un excès de débit. */
  engageBackoff(): void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createThrottle(options: ThrottleOptions): Throttle {
  const { maxConcurrent, throttledGapMs, throttleWindowMs } = options;

  let inFlight = 0;
  const waiting: Array<() => void> = [];
  let throttledUntil = 0;
  let nextSlotAt = 0;

  async function acquire(): Promise<void> {
    if (inFlight >= maxConcurrent) {
      // Réveillé par `release`, qui lui a TRANSMIS son créneau sans le rendre
      // au compteur : il est donc déjà comptabilisé, ne pas incrémenter.
      await new Promise<void>((resolve) => waiting.push(resolve));
    } else {
      inFlight += 1;
    }

    if (Date.now() >= throttledUntil) return;

    // Le créneau est réservé de façon SYNCHRONE avant l'attente. Deux appels
    // concurrents calculeraient sinon le même écart et repartiraient ensemble,
    // ce qui annulerait l'espacement au moment précis où il sert.
    const now = Date.now();
    const slot = Math.max(now, nextSlotAt);
    nextSlotAt = slot + throttledGapMs;
    if (slot > now) await sleep(slot - now);
  }

  /**
   * Le créneau passe DIRECTEMENT au suivant de la file, sans repasser par le
   * compteur.
   *
   * La forme naïve — décrémenter, puis réveiller un attendant — laisse en
   * théorie une fenêtre : le réveil est une micro-tâche, et un appelant dont
   * la propre micro-tâche était déjà en file verrait la place libre et la
   * prendrait, mettant deux tâches sur un même créneau.
   *
   * Honnêteté sur ce point : la course n'a PAS pu être reproduite. Les
   * appelants réels partent tous d'un même `Promise.all`, donc ils sont en
   * file d'attente avant la première libération, et l'entrelacement requis ne
   * se produit jamais. La transmission directe est conservée parce qu'elle
   * rend le plafond vrai par construction plutôt que par circonstance, à coût
   * de lecture nul — pas parce qu'elle réparerait un défaut observé.
   */
  function release(): void {
    const next = waiting.shift();
    if (next) next();
    else inFlight -= 1;
  }

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },

    engageBackoff(): void {
      throttledUntil = Date.now() + throttleWindowMs;
    },
  };
}
