import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { D1Dialect } from "kysely-d1";

// better-auth needs the D1 binding, which only exists per-request on Workers,
// so the instance is created per request (cheap: no I/O until a query runs).
export function createAuth(db: unknown, origin: string, secret: string) {
  return betterAuth({
    database: {
      dialect: new D1Dialect({ database: db as never }),
      type: "sqlite",
    },
    baseURL: origin,
    secret,
    emailAndPassword: { enabled: true },
    plugins: [username()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
