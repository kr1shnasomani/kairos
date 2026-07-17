"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, GRID, SERIES, TONE_VAR, downsample, type ChartTone } from "../charts";
import { ChartTooltip } from "./chart-tooltip";
import { useReducedMotion } from "@/lib/motion";

export interface TrendSeries {
  key: string;
  label?: string;
  tone?: ChartTone;
}

/** Multi-series time/ordinal trend — monotone lines, no dots, shared grid. */
export function TrendLine({
  data,
  xKey,
  series,
  height = 260,
  yFormat,
  xFormat,
}: {
  data: Array<Record<string, string | number | null | undefined>>;
  xKey: string;
  series: TrendSeries[];
  height?: number;
  yFormat?: (v: number) => string;
  xFormat?: (v: string | number) => string;
}) {
  const reduced = useReducedMotion();
  const rows = downsample(data);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} {...AXIS} tickFormatter={xFormat} minTickGap={24} />
        <YAxis {...AXIS} width={44} tickFormatter={yFormat} />
        <Tooltip content={<ChartTooltip valueFormat={yFormat} />} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label ?? s.key}
            stroke={s.tone ? TONE_VAR[s.tone] : SERIES[i % SERIES.length]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={!reduced}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
