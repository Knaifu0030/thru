import { useEffect, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import type { ApiKey } from "@/lib/types";
import { api } from "@/lib/api";
import { fmtDate, timeAgo } from "@/lib/format";
import { inputClass } from "@/components/ui/Field";
import { PillButton } from "@/components/ui/PillButton";
import { CopyBlock } from "@/components/ui/CopyBlock";
import { SkeletonRow } from "@/components/ui/Skeleton";

interface Revealed {
  name: string;
  value: string;
}

export function Settings() {
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = () => {
    api
      .getApiKeys()
      .then(setKeys)
      .catch(() => setKeys([]));
  };

  useEffect(load, []);

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setNameError("Give the key a name you'll recognise later.");
      return;
    }
    setNameError(null);
    setGenerating(true);
    try {
      const created = await api.generateApiKey(name.trim());
      setRevealed({ name: name.trim(), value: created.value });
      setName("");
      load();
    } finally {
      setGenerating(false);
    }
  };

  const revoke = async (id: string) => {
    setConfirming(null);
    setKeys((k) => (k ? k.filter((key) => key.id !== id) : k)); // optimistic
    await api.revokeApiKey(id);
    load();
  };

  return (
    <div className="max-w-2xl space-y-5">
      <p className="text-sm text-muted">
        Keys authenticate programmatic calls into your THRU gateway. This is not a credential
        vault — THRU never stores passwords or OTPs for the sites your skills automate; sensitive
        steps always pause for a person instead.
      </p>

      {/* Generate */}
      <div className="rounded-2xl border border-white/10 bg-raised p-5">
        <p className="label mb-3">Generate a new key</p>
        <form onSubmit={generate} noValidate className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What's this key for? e.g. staging deploys"
              aria-label="Key name"
              className={`${inputClass} ${nameError ? "border-rose/50" : ""}`}
            />
            {nameError && <p className="mt-1.5 text-xs text-rose">{nameError}</p>}
          </div>
          <PillButton type="submit" variant="accent" disabled={generating}>
            {generating ? "Generating…" : "Generate key"}
          </PillButton>
        </form>

        {revealed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="key-reveal mt-4 rounded-xl border p-4">
                <p className="text-sm text-ink">
                  Copy it now — THRU shows a key exactly once.
                </p>
                <div className="mt-3">
                  <CopyBlock text={revealed.value} ariaLabel={`Copy key ${revealed.name}`} />
                </div>
                <PillButton
                  variant="subtle"
                  size="sm"
                  className="mt-3"
                  onClick={() => setRevealed(null)}
                >
                  I've copied it
                </PillButton>
            </div>
          </motion.div>
        )}
      </div>

      {/* Existing keys */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-raised">
        <p className="label px-5 pb-1 pt-5">Active keys</p>
        {keys === null ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : keys.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted">
            No keys yet — generate one above to call the gateway from code.
          </p>
        ) : (
          keys.map((key) => (
            <div
              key={key.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4 last:border-b-0"
            >
              {confirming === key.id ? (
                <>
                  <p className="text-sm text-ink">
                    Revoke '{key.name}'? Calls using it fail immediately.
                  </p>
                  <span className="flex gap-2">
                    <PillButton variant="danger" size="sm" onClick={() => void revoke(key.id)}>
                      Revoke
                    </PillButton>
                    <PillButton variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                      Keep
                    </PillButton>
                  </span>
                </>
              ) : (
                <>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{key.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-faint">{key.maskedValue}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-xs text-muted">
                      <p>Created {fmtDate(key.createdAt)}</p>
                      <p className="mt-0.5 text-faint">
                        {key.lastUsedAt ? `Last used ${timeAgo(key.lastUsedAt)}` : "Never used"}
                      </p>
                    </div>
                    <PillButton variant="danger" size="sm" onClick={() => setConfirming(key.id)}>
                      Revoke
                    </PillButton>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      <p className="px-1 text-xs text-faint">
        Keys live in this browser until the gateway's auth release ships enforcement. Per-skill
        permissions and usage-based billing land with it.
      </p>
    </div>
  );
}
