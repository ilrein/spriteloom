-- One agent token per user. Only the SHA-256 hash is stored; the token is
-- shown once at creation.

CREATE TABLE "agent_token" (
  "userId" TEXT PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "prefix" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL
);
