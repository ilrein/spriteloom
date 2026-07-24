-- System user for scheduled generation. No account row — cannot be signed into.
INSERT INTO "user" ("id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt", "username", "displayUsername")
VALUES ('seed-user-loombot', 'loombot', 'loombot@spriteloom.invalid', 1, NULL, '2026-07-24T00:00:00.000Z', '2026-07-24T00:00:00.000Z', 'loombot', 'loombot');
