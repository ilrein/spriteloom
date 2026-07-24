ALTER TABLE "sprite" ADD COLUMN "tags" TEXT NOT NULL DEFAULT '[]';

CREATE TABLE "sprite_tag" (
  "tag" TEXT NOT NULL,
  "spriteId" TEXT NOT NULL REFERENCES "sprite" ("id") ON DELETE CASCADE,
  PRIMARY KEY ("tag", "spriteId")
);

CREATE INDEX "sprite_tag_tag" ON "sprite_tag" ("tag");
