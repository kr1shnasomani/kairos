"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS, GRID, downsample } from "../charts";
import { ChartTooltip } from "./chart-tooltip";
import { useReducedMotion } from "@/lib/motion";

type ForecastDatum = Record<string, string | number | null | undefined>;

/** Actual-vs-projected trend: solid actual, dashed projection, optional
 *  "today" reference line and confidence band. */
export function ForecastLine({
  data,
  xKey,
  actualKey,
  projectedKey,
  bandKeys,
  todayX,
  height = 260,
  yFormat,
}: {
  data: ForecastDatum[];
  xKey: string;
  actualKey: string;
  projectedKey?: string;
  /** [lowKey, highKey] confidence band around the projection. */
  bandKeys?: [string, string];
  /** X value where actuals end — draws a reference line. */
  todayX?: string | number;
  height?: number;
  yFormat?: (v: number) => string;
}) {
  const reduced = useReducedMotion();
  const rows = downsample(data);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} {...AXIS} minTickGap={24} />
        <YAxis {...AXIS} width={44} tickFormatter={yFormat} />
        <Tooltip content={<ChartTooltip valueFormat={yFormat} />} />
        {bandKeys && (
          <Area
            dataKey={(d: ForecastDatum) => [d[bandKeys[0]] ?? null, d[bandKeys[1]] ?? null]}
            name="Confidence"
            stroke="none"
            fill="var(--accent)"
            fillOpacity={0.06}
            isAnimationActive={!reduced}
            legendType="none"
            tooltipType="none"
          />
        )}
        {todayX !== undefined && (
          <ReferenceLine
            x={todayX}
            stroke="var(--muted)"
            strokeDasharray="3 3"
            label={{ value: "Today", position: "top", fill: "var(--muted)", fontSize: 10 }}
          />
        )}
        <Line type="monotone" dataKey={actualKey} name="Actual" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={!reduced} />
        {projectedKey && (
          <Line
            type="monotone"
            dataKey={projectedKey}
            name="Projected"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={!reduced}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
