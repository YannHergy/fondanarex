"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  connectMetaApi,
  disconnectMetaApi,
  syncMetaApi,
} from "@/app/(app)/comptes/metaapi-actions";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/**
 * Les deux façons d'alimenter un compte, côte à côte.
 *
 * Elles ne sont PAS présentées comme un choix technique mais comme deux
 * situations : la connexion directe pour un broker qui l'accepte, l'import de
 * rapport sinon. La seconde n'est pas un pis-aller caché — beaucoup de
 * brokers, les prop firms en particulier, refusent les terminaux tiers, et un
 * compte MetaApi peut alors être créé sans jamais se connecter. Mieux vaut
 * l'annoncer que laisser l'utilisateur s'acharner sur un formulaire qui ne
 * marchera pas chez lui.
 */

export interface MetaApiLink {
  id: string;
  metaApiAccountId: string;
  region: string | null;
  connectionStatus: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncTradeCount: number | null;
}

const REGIONS = [
  { value: "new-york", label: "New York" },
  { value: "london", label: "Londres" },
  { value: "singapore", label: "Singapour" },
];

function statusTone(status: string | null): string {
  if (status === "CONNECTED") return "text-brand-green";
  if (status === "CONNECTING") return "text-brand-amber";
  return "text-brand-red";
}

export function ConnectAccount({
  accountId,
  link,
  metaApiEnabled,
}: {
  accountId: string;
  link: MetaApiLink | null;
  metaApiEnabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"direct" | "file">("direct");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [form, setForm] = useState({
    login: "",
    password: "",
    server: "",
    platform: "mt5",
    region: "new-york",
  });

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    setResult(null);
    startTransition(async () => {
      const outcome = await connectMetaApi({ tradingAccountId: accountId, ...form });
      setResult(outcome);
      // Le mot de passe ne survit pas à l'envoi, même en mémoire du navigateur.
      if (outcome.ok) setForm((c) => ({ ...c, password: "" }));
      router.refresh();
    });
  }

  function sync() {
    if (!link) return;
    setResult(null);
    startTransition(async () => {
      setResult(await syncMetaApi(link.id));
      router.refresh();
    });
  }

  function disconnect() {
    if (!link) return;
    startTransition(async () => {
      await disconnectMetaApi(link.id);
      setResult(null);
      router.refresh();
    });
  }

  return (
    <div className="border-border-app mt-3 border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-muted hover:text-fg flex items-center gap-1.5 text-xs transition-colors"
      >
        <Icon name={open ? "expand_less" : "expand_more"} size={14} />
        Alimenter ce compte
        {link ? (
          <span className={cn("ml-1 font-mono text-[10px]", statusTone(link.connectionStatus))}>
            · MetaApi {link.connectionStatus ?? "?"}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="mt-3">
          <div className="border-border-app mb-3 flex gap-1 border-b">
            {[
              { id: "direct" as const, label: "Connexion MetaApi", icon: "link" },
              { id: "file" as const, label: "Import MetaTrader", icon: "upload_file" },
            ].map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs transition-colors",
                  tab === entry.id
                    ? "border-brand-blue text-fg"
                    : "text-subtle hover:text-muted border-transparent",
                )}
              >
                <Icon name={entry.icon} size={13} />
                {entry.label}
              </button>
            ))}
          </div>

          {tab === "direct" ? (
            <div className="space-y-3">
              {!metaApiEnabled ? (
                <p className="text-brand-amber text-xs">
                  La connexion directe n&apos;est pas activée sur ce serveur. Utilisez
                  l&apos;import de rapport.
                </p>
              ) : link ? (
                <div className="space-y-2">
                  <div className="border-border-app rounded-lg border p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted">Connexion MetaApi</span>
                      <span className={cn("font-mono", statusTone(link.connectionStatus))}>
                        {link.connectionStatus ?? "inconnu"}
                      </span>
                      <span className="text-subtle font-mono text-[10px]">
                        {link.region ?? ""} · {link.metaApiAccountId.slice(0, 8)}…
                      </span>
                    </div>
                    <p className="text-subtle mt-1.5 text-[11px]">
                      {link.lastSyncAt
                        ? `Dernière synchro : ${new Date(link.lastSyncAt).toLocaleString("fr-FR")}` +
                          (link.lastSyncTradeCount !== null
                            ? ` · ${link.lastSyncTradeCount} trade(s)`
                            : "")
                        : "Jamais synchronisé"}
                    </p>
                    {link.lastSyncStatus === "error" && link.lastSyncError ? (
                      <p className="text-brand-red mt-1 text-[11px]">{link.lastSyncError}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={sync}
                      disabled={pending}
                      className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-40"
                    >
                      <Icon
                        name={pending ? "progress_activity" : "sync"}
                        size={13}
                        className={pending ? "animate-spin" : undefined}
                      />
                      Synchroniser
                    </button>
                    <button
                      type="button"
                      onClick={disconnect}
                      disabled={pending}
                      className="text-muted hover:text-brand-red px-2 py-1.5 text-xs transition-colors disabled:opacity-40"
                    >
                      Déconnecter
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-brand-amber border-brand-amber/30 bg-brand-amber/5 flex items-start gap-1.5 rounded-lg border p-2 text-[11px]">
                    <Icon name="shield" size={13} className="mt-0.5 shrink-0" />
                    <span>
                      Utilisez votre <strong>mot de passe investisseur</strong> (lecture seule) —
                      jamais le principal. Il sert à établir la connexion et n&apos;est
                      <strong> jamais enregistré</strong>.
                    </span>
                  </p>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field
                      label="Numéro de compte"
                      value={form.login}
                      onChange={(v) => set("login", v)}
                      placeholder="12345678"
                    />
                    <Field
                      label="Mot de passe investisseur"
                      value={form.password}
                      onChange={(v) => set("password", v)}
                      type="password"
                      placeholder="••••••••"
                    />
                    <Field
                      label="Serveur du broker"
                      value={form.server}
                      onChange={(v) => set("server", v)}
                      placeholder="ICMarketsSC-Live12"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        label="Plateforme"
                        value={form.platform}
                        onChange={(v) => set("platform", v)}
                        options={[
                          { value: "mt5", label: "MT5" },
                          { value: "mt4", label: "MT4" },
                        ]}
                      />
                      <Select
                        label="Région"
                        value={form.region}
                        onChange={(v) => set("region", v)}
                        options={REGIONS}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={submit}
                    disabled={pending || !form.login || !form.password || !form.server}
                    className="bg-brand-blue hover:bg-brand-blue/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Icon
                      name={pending ? "progress_activity" : "link"}
                      size={13}
                      className={pending ? "animate-spin" : undefined}
                    />
                    Connecter
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              <p className="text-muted leading-relaxed">
                Exportez l&apos;historique depuis MetaTrader (onglet{" "}
                <strong>Historique</strong> → clic droit → <strong>Rapport</strong>), puis
                déposez le fichier dans le journal de ce compte.
              </p>
              <p className="text-subtle leading-relaxed">
                L&apos;import est ponctuel : il rattrape tout l&apos;historique du fichier. Pour
                les trades suivants, réimportez un rapport plus récent — les doublons sont
                écartés automatiquement — ou saisissez-les à la main.
              </p>
              <Link
                href={`/journal?compte=${accountId}`}
                className="bg-brand-blue hover:bg-brand-blue/90 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold text-white transition-colors"
              >
                <Icon name="upload_file" size={13} />
                Ouvrir le journal pour importer
              </Link>
            </div>
          )}

          {result ? (
            <p
              role="status"
              className={cn(
                "mt-2 text-[11px] leading-relaxed",
                result.ok ? "text-brand-green" : "text-brand-red",
              )}
            >
              {result.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-subtle mb-1 block text-[10px] tracking-wide uppercase">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="bg-panel border-border-app text-fg focus:border-brand-blue w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-subtle mb-1 block text-[10px] tracking-wide uppercase">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-panel border-border-app text-fg focus:border-brand-blue w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
