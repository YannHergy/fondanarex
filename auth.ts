import NextAuth, { type DefaultSession } from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/prisma";
import { provisionUser } from "@/lib/bootstrap";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

/**
 * Comma-separated GitHub logins permitted to sign in.
 *
 * This app is single-tenant by design. Without an allowlist, anyone with a
 * GitHub account could sign in and get their own workspace — which is not a
 * data leak (every query is scoped by userId) but is an open invitation to
 * consume the owner's LLM and market-data quota.
 */
function allowedLogins(): string[] {
  return (process.env.AUTH_ALLOWED_LOGINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      // Auth.js reads AUTH_GITHUB_ID / AUTH_GITHUB_SECRET automatically, but
      // being explicit keeps the failure mode obvious when they are unset.
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],
  // Database sessions: revoking access means deleting a row, and Next 16 runs
  // proxy.ts on the Node runtime, so there is no edge constraint forcing JWTs.
  session: { strategy: "database" },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  callbacks: {
    signIn({ profile }) {
      const allowed = allowedLogins();
      // An empty allowlist means "first user wins" — see the check below.
      if (allowed.length === 0) return true;

      const login = typeof profile?.login === "string" ? profile.login.toLowerCase() : null;
      return login !== null && allowed.includes(login);
    },
    session({ session, user }) {
      // Expose the user id so server code can scope queries without a second
      // lookup. Every repository function takes a userId.
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    // Provision settings, trading accounts and alert preferences the moment a
    // user row exists, so no screen has to cope with a half-configured account.
    async createUser({ user }) {
      if (user.id) await provisionUser(user.id);
    },
  },
});
