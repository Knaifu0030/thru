import { useEffect, useState } from "react";
import { CopyBlock } from "@/components/ui/CopyBlock";
import { GATEWAY_BASE, api } from "@/lib/api";
import type { ApiKey } from "@/lib/types";

const TOKEN_KEY = "thru.operatorToken";

export function Settings() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? "");
  const [name, setName] = useState("");
  const [manage, setManage] = useState(false);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newValue, setNewValue] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sessionMode, setSessionMode] = useState(false);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);

  const refresh = async (value = token) => {
    if (!value) { setKeys([]); return; }
    try { setKeys(await api.getApiKeys(value)); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not load keys."); }
  };

  useEffect(() => { void refresh(); }, []);

  const saveToken = (value: string) => {
    setToken(value); setSessionMode(false); setSessionExpiresAt(null);
    sessionStorage.setItem(TOKEN_KEY, value); void refresh(value);
  };

  const startSession = async () => {
    try {
      const created = await api.createBrowserSession(token);
      setToken(created.token); sessionStorage.setItem(TOKEN_KEY, created.token);
      setSessionMode(true); setSessionExpiresAt(created.expiresAt);
      setMessage("Short-lived browser session active. Re-enter the API key after it expires.");
      await refresh(created.token);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start a browser session."); }
  };

  const endSession = async () => {
    try { if (sessionMode && token) await api.revokeBrowserSession(token); } catch { /* Local cleanup still removes the browser token. */ }
    setToken(""); setSessionMode(false); setSessionExpiresAt(null); sessionStorage.removeItem(TOKEN_KEY); setKeys([]); setMessage("Browser session ended.");
  };

  const create = async () => {
    try { const created = await api.generateApiKey(token, name, manage ? ["run", "manage"] : ["run"]); setNewValue(created.value); setName(""); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not create key."); }
  };

  const revoke = async (id: string) => {
    try { await api.revokeApiKey(token, id); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not revoke key."); }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-2xl border border-emerald/20 bg-raised p-5">
        <p className="label text-emerald">THRU gateway</p><h2 className="mt-3 text-lg font-semibold text-ink">API access</h2>
        <p className="mt-2 text-sm leading-6 text-muted">Skills execute through the live gateway. Keep operator and API tokens out of public builds.</p>
        <div className="mt-4"><CopyBlock text={GATEWAY_BASE} ariaLabel="Copy THRU gateway URL" /></div>
      </div>
      <div className="space-y-4 rounded-2xl border border-white/10 bg-raised p-5">
        <p className="label">Authenticated access</p>
        <input aria-label="Bearer token" value={token} onChange={(event) => saveToken(event.target.value)} placeholder="Paste a THRU API key" type="password" className="w-full rounded border border-white/10 bg-black/25 px-3 py-2 text-sm text-ink" />
        <div className="flex flex-wrap items-center gap-2">
          {!sessionMode ? <button type="button" disabled={!token} onClick={() => void startSession()} className="rounded bg-accent px-4 py-2 text-sm text-white disabled:opacity-40">Start browser session</button> : <button type="button" onClick={() => void endSession()} className="rounded border border-white/15 px-4 py-2 text-sm text-ink">End session</button>}
          {sessionMode && sessionExpiresAt && <span className="text-xs text-muted">Session expires {new Date(sessionExpiresAt).toLocaleString()}</span>}
        </div>
        {message && <p role="status" className="text-sm text-muted">{message}</p>}
      </div>
      <div className="space-y-4 rounded-2xl border border-white/10 bg-raised p-5">
        <p className="label">API key management</p>
        {newValue && <div className="rounded border border-emerald/30 bg-emerald/10 p-3"><p className="text-xs text-emerald">Copy this key now. It will not be shown again.</p><CopyBlock text={newValue} ariaLabel="Copy new API key" /></div>}
        <div className="flex flex-wrap items-center gap-2"><input aria-label="Key name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Key name" className="min-w-0 flex-1 rounded border border-white/10 bg-black/25 px-3 py-2 text-sm text-ink" /><label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={manage} onChange={(event) => setManage(event.target.checked)} /> management scope</label><button type="button" disabled={!token} onClick={() => void create()} className="rounded bg-accent px-4 py-2 text-sm text-white disabled:opacity-40">Create key</button></div>
        <div className="space-y-2">{keys.map((key) => <div key={key.id} className="flex items-center justify-between rounded border border-white/10 px-3 py-2"><div><p className="text-sm text-ink">{key.name}</p><p className="text-xs text-muted">{key.maskedValue} · {(key.scopes ?? ["run", "manage"]).join(", ")}</p><p className="text-[11px] text-faint">Created {new Date(key.createdAt).toLocaleString()} · {key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleString()}` : "Never used"}</p></div><button type="button" onClick={() => void revoke(key.id)} className="text-xs text-rose-300">Revoke</button></div>)}</div>
      </div>
    </div>
  );
}
