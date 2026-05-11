import { createAuthClient } from "better-auth/react";

// Không set baseURL → Better Auth dùng same-origin (relative URL)
// Tránh lỗi CORS khi chạy trên port khác với BETTER_AUTH_URL
export const authClient = createAuthClient();

export const { signIn, signOut, signUp, useSession, getSession } = authClient;
