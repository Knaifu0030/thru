import { useEffect, useState } from "react";
import type { GatewayInfo } from "@/lib/types";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { CopyBlock } from "@/components/ui/CopyBlock";
import { Skeleton } from "@/components/ui/Skeleton";

export function ConnectAgent() {
  const [info, setInfo] = useState<GatewayInfo | null>(null);

  useEffect(() => {
    let stale = false;
    api
      .getGatewayInfo()
      .then((i) => !stale && setInfo(i))
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, []);

  if (!info) {
    return (
      <div className="max-w-2xl space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-raised p-5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-12 w-full rounded-xl" />
            <Skeleton className="mt-3 h-4 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-2xl border border-white/10 bg-raised p-5">
        <p className="label mb-3">REST gateway</p>
        <CopyBlock text={info.restBase} ariaLabel="Copy REST base URL" />
        <p className="mt-3 text-sm text-muted">
          Use this base URL for direct API calls —{" "}
          <span className="font-mono text-xs">POST /skills/&#123;id&#125;</span> with a JSON body of
          the skill's inputs.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-raised p-5">
        <p className="label mb-3">MCP endpoint</p>
        <CopyBlock text={info.mcpEndpoint} ariaLabel="Copy MCP endpoint URL" />
        <p className="mt-3 text-sm text-muted">
          Add this URL to your MCP client's server list. Every skill registers as a tool named{" "}
          <span className="font-mono text-xs">thru_&lt;skill_id&gt;</span>.
        </p>
      </div>

      {info.connectedAgents.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-raised">
          <p className="label px-5 pb-1 pt-5">Recently connected</p>
          {info.connectedAgents.map((agent) => (
            <div
              key={agent.name}
              className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-3.5 last:border-b-0"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="truncate text-sm text-ink">{agent.name}</span>
                <Badge>{agent.transport}</Badge>
              </span>
              <span className="shrink-0 text-xs text-faint">active {timeAgo(agent.lastActive)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="px-1 text-xs text-faint">
        Skills appear on both surfaces the moment they're ready — there's no publishing step.
      </p>
    </div>
  );
}
