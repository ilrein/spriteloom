CREATE TABLE "collection" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" INTEGER NOT NULL
);
CREATE INDEX "collection_userId" ON "collection" ("userId");
CREATE INDEX "collection_createdAt" ON "collection" ("createdAt" DESC);

CREATE TABLE "collection_sprite" (
  "collectionId" TEXT NOT NULL REFERENCES "collection" ("id") ON DELETE CASCADE,
  "spriteId" TEXT NOT NULL REFERENCES "sprite" ("id") ON DELETE CASCADE,
  "addedAt" INTEGER NOT NULL,
  PRIMARY KEY ("collectionId", "spriteId")
);
CREATE INDEX "collection_sprite_sprite" ON "collection_sprite" ("spriteId");

-- backfill: the original examples become the "starter set"
INSERT INTO "collection" ("id", "userId", "name", "description", "createdAt")
VALUES ('seed-col-starter', 'seed-user-bitloom', 'starter set', 'the original example sprites', 1753372800000);

INSERT INTO "collection_sprite" ("collectionId", "spriteId", "addedAt")
SELECT 'seed-col-starter', "id", "createdAt" FROM "sprite" WHERE "userId" = 'seed-user-bitloom';

-- backfill: existing loombot theme batches become "<theme> set" collections
INSERT INTO "collection" ("id", "userId", "name", "description", "createdAt")
SELECT 'seed-col-' || t."tag", 'seed-user-loombot', t."tag" || ' set', 'generated biome set', MIN(s."createdAt")
FROM "sprite_tag" t JOIN "sprite" s ON s."id" = t."spriteId"
WHERE s."userId" = 'seed-user-loombot'
  AND t."tag" IN ('swamp','crypt','arctic','desert','volcano','abyss','meadow','ruins','cavern','harbor')
GROUP BY t."tag";

INSERT INTO "collection_sprite" ("collectionId", "spriteId", "addedAt")
SELECT 'seed-col-' || t."tag", t."spriteId", s."createdAt"
FROM "sprite_tag" t JOIN "sprite" s ON s."id" = t."spriteId"
WHERE s."userId" = 'seed-user-loombot'
  AND t."tag" IN ('swamp','crypt','arctic','desert','volcano','abyss','meadow','ruins','cavern','harbor');
