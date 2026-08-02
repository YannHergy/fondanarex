import { Icon } from "@/components/ui/icon";

/**
 * Shown when the app cannot reach its database.
 *
 * In practice this means one thing on a fresh deployment: the environment
 * variables have not been filled in. Saying so beats a generic error page —
 * the previous behaviour was an uncaught throw, which Netlify renders as
 * "A server error occurred" with no further detail.
 */

const STEPS = [
  {
    title: "Créer la base Neon",
    body: "Sur neon.tech, créez un projet Postgres. Deux chaînes de connexion sont nécessaires : la version « pooled » (l'hôte contient -pooler) et la version directe.",
  },
  {
    title: "Renseigner les variables sur Netlify",
    body: "Site settings → Environment variables : DATABASE_URL (pooled) et DIRECT_URL (directe). Le build n'en a pas besoin, mais chaque requête si.",
  },
  {
    title: "Appliquer les migrations et les données de référence",
    body: "En local, avec le même .env : pnpm db:deploy puis pnpm db:seed. Cela crée les tables, les 8 devises, les 28 instruments et les données macro de départ.",
  },
  {
    title: "Redéployer",
    body: "Les variables d'environnement ne sont lues qu'au démarrage : un redéploiement est nécessaire après les avoir ajoutées.",
  },
] as const;

export function SetupRequired() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-16">
      <div className="flex items-center gap-3">
        <Icon name="database_off" size={28} className="text-brand-amber" />
        <h1 className="text-fg text-2xl font-bold tracking-tight">Base de données injoignable</h1>
      </div>

      <p className="text-muted mt-4 leading-relaxed">
        L&apos;application a démarré correctement mais ne parvient pas à contacter Postgres. Sur un
        déploiement neuf, c&apos;est presque toujours que les variables d&apos;environnement ne sont
        pas encore renseignées.
      </p>

      <ol className="mt-8 space-y-5">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span className="bg-panel text-brand-blue border-border-app flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold">
              {index + 1}
            </span>
            <div>
              <p className="text-fg text-sm font-semibold">{step.title}</p>
              <p className="text-muted mt-1 text-sm leading-relaxed">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="border-border-app mt-8 border-t pt-6">
        <p className="text-subtle text-xs leading-relaxed">
          Pour connaître la cause exacte, ouvrez{" "}
          <a
            href="/api/health"
            className="text-brand-blue font-mono underline underline-offset-2"
          >
            /api/health
          </a>{" "}
          : cette page indique quelles variables sont présentes et quelle erreur renvoie le pilote
          Postgres, sans jamais exposer d&apos;identifiants.
        </p>
      </div>
    </main>
  );
}
