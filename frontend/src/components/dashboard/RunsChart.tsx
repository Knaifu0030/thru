import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartRange, SeriesPoint } from "@/lib/types";
import { Chip } from "@/components/ui/Chip";

const RANGES: ChartRange[] = ["1D", "1W", "1M", "6M", "1Y"];

interface TipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function ChartTip({ active, payload, label }: TipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-[2px] border border-white/15 bg-overlay px-3 py-2">
      <p className="font-mono text-xs text-faint">{label}</p>
      <p className="text-sm font-medium text-ink">
        {payload[0].value.toLocaleString("en-IN")} {payload[0].value === 1 ? "run" : "runs"}
      </p>
    </div>
  );
}

interface Props {
  series: Record<ChartRange, SeriesPoint[]>;
  estimated: boolean;
}

/**
 * The Runs Over Time chart — one accent line with a soft fill fading to
 * transparent (the chart's specified exception to the flat-color rule).
 */
export function RunsChart({ series, estimated }: Props) {
  const [range, setRange] = useState<ChartRange>("1W");
  const data = series[range];

  return (
    <div className="rounded-3xl border border-white/10 bg-raised p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-medium">Runs over time</h3>
          {estimated && (
            <p className="mt-0.5 text-xs text-faint">
              estimated — no persisted runs are available for this range yet
            </p>
          )}
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <Chip key={r} selected={range === r} onClick={() => setRange(r)}>
              {r}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-5 h-60">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: "#635e55", fontSize: 12, fontFamily: "ui-monospace, monospace" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis hide domain={[0, "auto"]} />
            <Tooltip
              content={<ChartTip />}
              cursor={{ stroke: "#6380ff", strokeOpacity: 0.5, strokeDasharray: "4 4" }}
            />
            {/* flat low-opacity fill — no gradients anywhere in this UI */}
            <Area
              type="monotone"
              dataKey="runs"
              stroke="#6380ff"
              strokeWidth={2}
              fill="#6380ff"
              fillOpacity={0.06}
              dot={false}
              activeDot={{ r: 4, fill: "#6380ff", stroke: "#071022", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
