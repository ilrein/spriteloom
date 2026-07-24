import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { Api } from "../api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs tracking-[0.3em] text-muted-foreground">{label}</span>
        <Button
          size="icon-sm"
          variant="ghost"
          className="ml-auto"
          aria-label={`copy ${label}`}
          onClick={() => {
            void navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
      <pre className="overflow-x-auto border-2 border-input bg-black/40 p-3 text-xs leading-relaxed">{text}</pre>
    </div>
  );
}

export function AgentView({ signedIn, onNeedAuth }: { signedIn: boolean; onNeedAuth: () => void }) {
  const [status, setStatus] = useState<{ exists: boolean; prefix?: string; createdAt?: number } | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!signedIn) {
      setStatus(null);
      return;
    }
    try {
      setStatus(await Api.agentTokenStatus());
    } catch {
      setStatus(null);
    }
  }, [signedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function generate() {
    if (!signedIn) {
      onNeedAuth();
      return;
    }
    setBusy(true);
    try {
      const res = await Api.agentTokenCreate();
      setFreshToken(res.token);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await Api.agentTokenRevoke();
      setFreshToken(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const base = location.origin;
  const token = freshToken ?? "slm_YOUR_TOKEN";

  const skillSnippet = `# spriteloom — low-color sprite foundry (agent guide)

Sprites are deterministic JSON recipes, not images. Read the DSL at runtime:
GET ${base}/api/spec

## Iterate on ASCII before delivering
1. Draft a recipe (crib from GET ${base}/api/examples).
2. POST ${base}/api/render?format=text  → ASCII ('.' = bg, '#' = 1, '23456789abcdef' = higher indices).
3. Fix coordinates until the silhouette reads at 1x.
4. PNG: POST ${base}/api/render?scale=8

## Publish to the community feed
POST ${base}/api/sprites
Authorization: Bearer ${token}
Body: {"name": "...", "recipe": {...}, "tags": ["item"], "parentId": null}

Style: 3-5 colors; silhouette first (rect/ellipse fills), carve with v:0,
shade with dither in a darker index; mirror for symmetry; chunky beats thin.`;

  const renderCurl = `curl -s -X POST '${base}/api/render?format=text' \\
  -H 'content-type: application/json' \\
  -d '{"size":16,"ops":[{"op":"ellipse","cx":7,"cy":7,"rx":5,"ry":5},{"op":"mirror","axis":"x"}]}'`;

  const publishCurl = `curl -s -X POST '${base}/api/sprites' \\
  -H 'content-type: application/json' \\
  -H 'Authorization: Bearer ${token}' \\
  -d '{"name":"my sprite","tags":["item"],"recipe":{"size":16,"ops":[{"op":"rect","x":4,"y":4,"w":8,"h":8}]}}'`;

  return (
    <div className="grid max-w-3xl gap-4">
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="tracking-[0.3em]">AGENT TOKEN</CardTitle>
          <CardDescription>
            Rendering is anonymous — any agent can already <code>POST /api/render</code>. Publishing to the feed as{" "}
            you needs a personal token, sent as <code>Authorization: Bearer …</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!signedIn ? (
            <Button className="self-start" onClick={onNeedAuth}>
              <KeyRound className="size-4" /> sign in to generate a token
            </Button>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {status?.exists ? (
                  <>
                    <Badge variant="secondary">active</Badge>
                    <code className="text-sm">{status.prefix}…</code>
                    <span className="text-xs text-muted-foreground">
                      created {status.createdAt ? new Date(status.createdAt).toLocaleDateString() : ""}
                    </span>
                  </>
                ) : (
                  <Badge variant="outline">no token yet</Badge>
                )}
                <div className="ml-auto flex gap-2">
                  <Button size="sm" onClick={() => void generate()} disabled={busy}>
                    <RefreshCw className="size-3.5" /> {status?.exists ? "regenerate" : "generate"}
                  </Button>
                  {status?.exists && (
                    <Button size="sm" variant="outline" onClick={() => void revoke()} disabled={busy}>
                      <Trash2 className="size-3.5" /> revoke
                    </Button>
                  )}
                </div>
              </div>
              {freshToken && (
                <div className="grid gap-1.5">
                  <p className="text-xs text-destructive">
                    copy it now — this token is only shown once (regenerating replaces it)
                  </p>
                  <CopyBlock label="TOKEN" text={freshToken} />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader>
          <CardTitle className="tracking-[0.3em]">CONNECT AN AGENT</CardTitle>
          <CardDescription>
            Works with anything that speaks HTTP. For Claude Code, save the guide below as{" "}
            <code>.claude/skills/spriteloom/SKILL.md</code> (or paste it into CLAUDE.md); the token lands in the publish
            header. Agents self-onboard from <code>/api/spec</code> — the guide is just the short version.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CopyBlock label="AGENT GUIDE" text={skillSnippet} />
          <CopyBlock label="TRY IT — RENDER (NO AUTH)" text={renderCurl} />
          <CopyBlock label="PUBLISH AS YOU" text={publishCurl} />
        </CardContent>
      </Card>
    </div>
  );
}
