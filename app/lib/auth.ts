import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import bcrypt from "bcryptjs";
import { db } from "./db";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: {
      hash: async (password: string) => bcrypt.hash(password, 12),
      verify: async ({ password, hash }: { password: string; hash: string }) =>
        bcrypt.compare(password, hash),
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 ngày
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", required: true, defaultValue: "CHUYEN_VIEN" },
      department: { type: "string", required: true, defaultValue: "TAI_CHINH_KE_HOACH" },
      position: { type: "string", required: true, defaultValue: "Chuyên viên" },
      fields: { type: "string[]", required: false, defaultValue: [] },
      areas: { type: "string[]", required: false, defaultValue: [] },
      teamGroupCode: { type: "string", required: false },
      isTeamLeader: { type: "boolean", defaultValue: false },
      responsibilities: { type: "string", required: false },
      isActive: { type: "boolean", defaultValue: true },
      phone: { type: "string", required: false },
    },
  },
  advanced: {
    cookiePrefix: "pkt",
    generateId: () => crypto.randomUUID(),
  },
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:4000",
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    ...(process.env.NEXT_PUBLIC_APP_URL ? [process.env.NEXT_PUBLIC_APP_URL] : []),
  ],
  plugins: [nextCookies()],
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
});

export type Session = typeof auth.$Infer.Session;
