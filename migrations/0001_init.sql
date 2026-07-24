-- better-auth core tables (email/password + username plugin), camelCase
-- column names as better-auth expects by default.

CREATE TABLE "user" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  "username" TEXT UNIQUE,
  "displayUsername" TEXT
);

CREATE TABLE "session" (
  "id" TEXT PRIMARY KEY,
  "expiresAt" DATE NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE "account" (
  "id" TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" DATE,
  "refreshTokenExpiresAt" DATE,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL
);

CREATE TABLE "verification" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" DATE NOT NULL,
  "createdAt" DATE,
  "updatedAt" DATE
);

CREATE INDEX "session_userId" ON "session" ("userId");
CREATE INDEX "account_userId" ON "account" ("userId");
CREATE INDEX "verification_identifier" ON "verification" ("identifier");

-- bitloom tables

CREATE TABLE "sprite" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "recipe" TEXT NOT NULL,
  "parentId" TEXT REFERENCES "sprite" ("id") ON DELETE SET NULL,
  "likeCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" INTEGER NOT NULL
);

CREATE INDEX "sprite_createdAt" ON "sprite" ("createdAt" DESC);
CREATE INDEX "sprite_likeCount" ON "sprite" ("likeCount" DESC, "createdAt" DESC);
CREATE INDEX "sprite_userId" ON "sprite" ("userId");

CREATE TABLE "sprite_like" (
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "spriteId" TEXT NOT NULL REFERENCES "sprite" ("id") ON DELETE CASCADE,
  "createdAt" INTEGER NOT NULL,
  PRIMARY KEY ("userId", "spriteId")
);
