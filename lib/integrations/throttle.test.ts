import { describe, expect, it } from "vitest";

import { createThrottle } from "./throttle";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Compteur de tâches réellement simultanées, avec mémoire du pic atteint. */
function tracker() {
  let current = 0;
  let peak = 0;
  return {
    get peak() {
      return peak;
    },
    async task(ms = 5) {
      current += 1;
      peak = Math.max(peak, current);
      await sleep(ms);
      current -= 1;
    },
  };
}

describe("createThrottle", () => {
  const options = { maxConcurrent: 3, throttledGapMs: 20, throttleWindowMs: 1_000 };

  it("ne dépasse jamais le plafond de concurrence", async () => {
    const throttle = createThrottle(options);
    const t = tracker();

    await Promise.all(Array.from({ length: 20 }, () => throttle.run(() => t.task())));

    expect(t.peak).toBe(3);
  });

  it("ne dépasse pas le plafond quand des appelants arrivent EN COURS de file", async () => {
    // Cas réel de l'application : la file n'est pas remplie d'un coup, des
    // appelants se présentent pendant que d'autres sont déjà servis.
    //
    // Ce test ne distingue PAS la transmission directe du créneau de la forme
    // naïve — vérifié en réintroduisant celle-ci, les six tests passaient
    // encore. Il vérifie le plafond sous arrivées échelonnées, ce qui est déjà
    // ce qui compte ici ; la course théorique entre libération et réveil n'a
    // pas pu être reproduite.
    const throttle = createThrottle(options);
    const t = tracker();

    const running = Array.from({ length: 6 }, () => throttle.run(() => t.task(30)));
    for (let i = 0; i < 12; i += 1) {
      await sleep(3);
      running.push(throttle.run(() => t.task(30)));
    }
    await Promise.all(running);

    expect(t.peak).toBe(3);
  });

  it("libère le créneau même quand la tâche échoue", async () => {
    const throttle = createThrottle(options);
    const t = tracker();

    const jobs = Array.from({ length: 10 }, (_, i) =>
      throttle
        .run(async () => {
          await t.task();
          if (i % 2 === 0) throw new Error("échec volontaire");
        })
        .catch(() => "rattrapé"),
    );
    const results = await Promise.all(jobs);

    expect(results.filter((r) => r === "rattrapé")).toHaveLength(5);
    // Un créneau retenu par une tâche en échec bloquerait la suite : le fait
    // que les dix se terminent prouve qu'il a bien été rendu.
    expect(t.peak).toBe(3);
  });

  it("n'impose aucun espacement tant que le ralentissement n'est pas engagé", async () => {
    const throttle = createThrottle(options);
    const started: number[] = [];
    const t0 = Date.now();

    await Promise.all(
      Array.from({ length: 3 }, () =>
        throttle.run(async () => {
          started.push(Date.now() - t0);
        }),
      ),
    );

    // Trois tâches sous un plafond de trois : elles doivent partir ensemble.
    expect(Math.max(...started)).toBeLessThan(20);
  });

  it("espace les départs une fois le ralentissement engagé", async () => {
    const throttle = createThrottle(options);
    const started: number[] = [];
    const t0 = Date.now();

    throttle.engageBackoff();
    await Promise.all(
      Array.from({ length: 3 }, () =>
        throttle.run(async () => {
          started.push(Date.now() - t0);
        }),
      ),
    );

    started.sort((a, b) => a - b);
    // Trois départs espacés de 20 ms : le dernier ne peut pas partir avant 40 ms.
    // La marge absorbe l'imprécision des minuteries sans rendre le test vide.
    expect(started[2]).toBeGreaterThanOrEqual(30);
  });

  it("cesse d'espacer une fois la fenêtre écoulée", async () => {
    const throttle = createThrottle({ ...options, throttleWindowMs: 30 });
    throttle.engageBackoff();
    await sleep(50);

    const started: number[] = [];
    const t0 = Date.now();
    await Promise.all(
      Array.from({ length: 3 }, () =>
        throttle.run(async () => {
          started.push(Date.now() - t0);
        }),
      ),
    );

    expect(Math.max(...started)).toBeLessThan(20);
  });
});
