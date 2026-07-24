import { useState } from "react";
import { Api } from "../api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthDialog({
  open,
  onOpenChange,
  onSignedIn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignedIn: () => void;
}) {
  const [signup, setSignup] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (signup) {
        await Api.signUp(username, email, password);
      } else {
        await Api.signIn(username, password);
      }
      onOpenChange(false);
      setPassword("");
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-2">
        <DialogHeader>
          <DialogTitle className="tracking-[0.3em]">{signup ? "SIGN UP" : "SIGN IN"}</DialogTitle>
          <DialogDescription>
            {signup ? "claim a username, start forging" : "welcome back to the foundry"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="auth-username">username</Label>
            <Input
              id="auth-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={20}
              pattern="[a-zA-Z0-9_\-]+"
              autoComplete="username"
            />
          </div>
          {signup && (
            <div className="grid gap-2">
              <Label htmlFor="auth-email">email</Label>
              <Input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="auth-password">password</Label>
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={signup ? "new-password" : "current-password"}
            />
          </div>
          {error && <p className="border-2 border-destructive p-2 text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={busy}>
              {signup ? "SIGN UP" : "SIGN IN"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSignup(!signup)}>
              {signup ? "have an account?" : "need an account?"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
