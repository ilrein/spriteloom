import { expect, test } from "bun:test";
import { isScannerProbe } from "../src/worker/index";

test("blocks the probes actually seen in zone analytics", () => {
  const probes = [
    "/wp-admin/install.php",
    "/xmlrpc.php",
    "/test/wp-includes/wlwmanifest.xml",
    "/2019/wp-includes/wlwmanifest.xml",
    "/shop/wp-includes/wlwmanifest.xml",
    "/.git/config",
  ];
  for (const path of probes) expect(isScannerProbe(path)).toBe(true);
});

test("blocks secret-hunting dotfile paths", () => {
  for (const path of ["/.env", "/.env.production", "/.aws/credentials", "/.ssh/id_rsa", "/.vscode/sftp.json"]) {
    expect(isScannerProbe(path)).toBe(true);
  }
});

test("lets real routes through", () => {
  const real = [
    "/",
    "/forge",
    "/agent",
    "/collections",
    "/robots.txt",
    "/favicon.ico",
    "/assets/index-DSkRSyOK.css",
    "/assets/index-Gk67DNk6.js",
    "/api/sprites",
    "/api/collections",
    "/api/logo.png",
    "/api/og.png",
    "/api/sprites/9b6e6fa3-cc6c-42ba-acb0-7342e2ddbdaf.png",
    "/cdn-cgi/rum",
  ];
  for (const path of real) expect(isScannerProbe(path)).toBe(false);
});

test("keeps .well-known reachable so ACME and security.txt still work", () => {
  expect(isScannerProbe("/.well-known/acme-challenge/tokenvalue")).toBe(false);
  expect(isScannerProbe("/.well-known/security.txt")).toBe(false);
});
