import { useEffect } from "react";
import { CopyBlock } from "@/components/ui/CopyBlock";
import { GATEWAY_BASE } from "@/lib/api";

export function Settings() {
  useEffect(() => {
    localStorage.removeItem("thru.apiKeys.v1");
    localStorage.removeItem("forge.apiKeys.v1");
  }, []);

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-2xl border border-emerald/20 bg-raised p-5">
        <p className="label text-emerald">Public demo gateway</p>
        <h2 className="mt-3 text-lg font-semibold text-ink">API access is live</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Read-only demo skills are available without a customer key during the hackathon. Calls
          go to the real THRU gateway and execute the registered Webcmd workflow.
        </p>
        <div className="mt-4">
          <CopyBlock text={GATEWAY_BASE} ariaLabel="Copy THRU gateway URL" />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-raised p-5">
        <p className="label">Protected operations</p>
        <p className="mt-3 text-sm leading-6 text-muted">
          Teaching, importing, and administrative demo controls remain protected by the server-side
          THRU administrator key. The key is never generated or displayed in this browser.
        </p>
      </div>
    </div>
  );
}
