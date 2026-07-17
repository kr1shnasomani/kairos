"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, SERIES, TONE_VAR, downsample, type ChartTone } from "../charts";
import { ChartTooltip } from "./chart-tooltip";
import { useReducedMotion } from "@/lib/motion";

export interface BarListItem {
  label: string;
  value: number;
  tone?: ChartTone;
}

/** Horizontal ranked bars — category labels left, values encoded as length.
 *  Long labels truncate on the axis; the tooltip shows the full label. */
export function BarList({
  data,
  height = 220,
  valueFormat,
}: {
  data: BarListItem[];
  height?: number;
  valueFormat?: (v: number) => string;
}) {
  const reduced = useReducedMotion();
  const rows = downsample(data);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%">
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={120}
          {...AXIS}
          tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
        />
        <Tooltip content={<ChartTooltip valueFormat={valueFormat} />} cursor={{ fill: "var(--surface-2)" }} />
        <Bar dataKey="value" name="Value" radius={[0, 4, 4, 0]} isAnimationActive={!reduced}>
          {rows.map((d) => (
            <Cell key={d.label} fill={d.tone ? TONE_VAR[d.tone] : SERIES[0]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
