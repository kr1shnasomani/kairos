"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { SERIES, TONE_VAR, type ChartTone } from "../charts";
import { ChartTooltip } from "./chart-tooltip";
import { fmtCompact } from "@/lib/format";
import { useReducedMotion } from "@/lib/motion";

export interface DonutSlice {
  label: string;
  value: number;
  tone?: ChartTone;
}

/** Part-of-whole donut with a centered total. Zero/invalid total → renders
 *  nothing (parent shows its EmptyState). */
export function Donut({
  data,
  centerLabel,
  height = 240,
}: {
  data: DonutSlice[];
  centerLabel?: string;
  height?: number;
}) {
  const reduced = useReducedMotion();
  const total = data.reduce((sum, d) => sum + (Number.isFinite(d.value) ? d.value : 0), 0);
  if (data.length === 0 || total <= 0) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          cy="45%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
          stroke="none"
          isAnimationActive={!reduced}
        >
          {/* ponytail: palette cycles past 4 slices — fold small slices into "Other" upstream if a page ever sends more. */}
          {data.map((d, i) => (
            <Cell key={d.label} fill={d.tone ? TONE_VAR[d.tone] : SERIES[i % SERIES.length]} />
          ))}
        </Pie>
        <text x="50%" y="45%" dy={centerLabel ? -4 : 0} textAnchor="middle" dominantBaseline="middle" className="tabular" style={{ fill: "var(--ink)", fontSize: 22, fontWeight: 600 }}>
          {fmtCompact(total)}
        </text>
        {centerLabel && (
          <text x="50%" y="45%" dy={16} textAnchor="middle" dominantBaseline="middle" style={{ fill: "var(--muted)", fontSize: 11 }}>
            {centerLabel}
          </text>
        )}
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
        <Tooltip content={<ChartTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
