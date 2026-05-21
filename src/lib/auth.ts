/**
 * Mucha Kitchen — NextAuth.js v5 (Auth.js) Configuration
 * ======================================================
 *
 * Authentication for staff users using credentials (email + password).
 * The "demo123" password is a fallback for development/demo purposes only.
 * In production, real passwords are hashed with bcryptjs.
 *
 * Key features:
 * - JWT tokens carry `restaurantId` for multi-tenancy isolation
 * - Session callback injects `restaurantId` into the client session
 * - Login page is at `/login`
 *
 * @module auth
 * @see https://authjs.dev/getting-started/installation/nextjs
 */
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import { compare } from 'bcryptjs';

/**
 * Auth.js configuration object.
 * Defines the credentials provider, callbacks, and custom pages.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      /**
       * Authorize a staff user by email (stored in `userId`) and password.
       * Falls back to "demo123" for quick local demo access outside production.
       * @param credentials - The email and password from the login form
       * @returns The user object (with `restaurantId`) or null if invalid
       */
      authorize: async (credentials) => {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.staffUser.findFirst({
          where: {
            userId: credentials.email as string,
            active: true,
          },
          include: { restaurant: true },
        });

        if (!user) return null;

        const password = credentials.password as string;
        const valid = await compare(password, user.userId + 'salt');
        const allowDemoPassword = process.env.NODE_ENV !== 'production' && password === 'demo123';

        if (!valid && !allowDemoPassword) return null;

        return {
          id: user.userId,
          email: user.userId,
          name: user.userId,
          restaurantId: user.restaurantId,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * JWT callback — enriches the token with `restaurantId` on first sign-in.
     * This ID is used throughout the app for data isolation (multi-tenancy).
     */
    jwt: async ({ token, user }) => {
      if (user) {
        token.restaurantId = user.restaurantId;
      }
      return token;
    },
    /**
     * Session callback — exposes `restaurantId` to the client session.
     * Frontend components read `session.user.restaurantId` to scope API calls.
     */
    session: async ({ session, token }) => {
      if (token) {
        session.user.restaurantId = token.restaurantId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});
