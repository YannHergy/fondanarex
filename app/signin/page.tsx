import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = {
  title: "Sign in",
};

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "That GitHub account is not on the allowlist for this instance.",
  Configuration:
    "Authentication is not configured. AUTH_GITHUB_ID and AUTH_GITHUB_SECRET must be set.",
  Verification: "That sign-in link has expired. Try again.",
};

export default async function SignInPage({
  searchParams,
}: {
  // Next 16: searchParams is async and must be awaited.
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const { callbackUrl, error } = await searchParams;
  const message = error ? (ERROR_MESSAGES[error] ?? "Sign-in failed. Try again.") : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <p className="text-brand-cyan font-mono text-xs tracking-[0.2em] uppercase">
            Forex macro workstation
          </p>
          <h1 className="text-fg mt-3 text-3xl font-bold tracking-tight">Fondanarex</h1>
          <p className="text-muted mt-2 text-sm">Sign in to continue.</p>
        </div>

        {message ? (
          <p
            role="alert"
            className="border-brand-red/40 bg-brand-red/10 text-brand-red mt-6 rounded-lg border px-4 py-3 text-sm"
          >
            {message}
          </p>
        ) : null}

        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: callbackUrl ?? "/" });
          }}
        >
          <button
            type="submit"
            className="border-border-strong bg-surface text-fg hover:bg-panel focus-visible:outline-brand-blue flex w-full items-center justify-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Icon name="code" size={18} />
            Continue with GitHub
          </button>
        </form>

        <p className="text-subtle mt-6 text-center text-xs leading-relaxed">
          Access is restricted to allowlisted accounts. Every request is scoped to the signed-in
          user.
        </p>
      </div>
    </main>
  );
}
