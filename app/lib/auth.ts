import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { hashPassword, verifyPassword } from "./crypto/password";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "./crypto/password-policy";

const IS_PROD = process.env.NODE_ENV === "production";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    password: {
      hash: hashPassword,
      verify: async ({ password, hash }: { password: string; hash: string }) => {
        const r = await verifyPassword(password, hash);
        // KHÔNG rehash ở đây - lúc verify chưa biết accountId.
        // Việc rehash bcrypt → argon2 làm sau qua post-login hook (xem actions/auth.ts).
        return r.valid;
      },
    },
  },
  session: {
    // Absolute lifetime 8 giờ (1 ca làm việc). Sau đó bắt re-login.
    expiresIn: 60 * 60 * 8,
    // Sliding refresh 30 phút (mỗi request hợp lệ extend session).
    updateAge: 60 * 30,
    cookieCache: {
      enabled: true,
      // 60 giây để revoke nhanh (đổi role / force logout có hiệu lực trong 1 phút).
      maxAge: 60,
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
    // Cookie hardening (P1.4):
    //  - HttpOnly, SameSite=Strict, Path=/
    //  - Secure khi production HTTPS (auto-detect qua BETTER_AUTH_URL)
    //  - Không set Domain → host-only cookie, chống sub-domain hijack
    cookiePrefix: "pkt",
    useSecureCookies: IS_PROD,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "strict",
      secure: IS_PROD,
      path: "/",
    },
    generateId: () => crypto.randomUUID(),
  },
  trustedOrigins: IS_PROD
    ? [
        ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
        ...(process.env.NEXT_PUBLIC_APP_URL ? [process.env.NEXT_PUBLIC_APP_URL] : []),
      ]
    : [
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
