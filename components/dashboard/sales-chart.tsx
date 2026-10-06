"use client";

import { cn } from "cn";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Segmented } from "@/components/pos/segmented";
import { Card, CardContent } from "@/components/ui/card";
import { formatAxisINR, formatLongDay, formatShortDay, formatWeekdayDay, niceTicks } from "@/lib/chart";
import { formatINR, plural } from "@/lib/format";

export type ChartDay = { day: string; amount: string; bills: number };

// Colour roles for this chart (light only — the app has no dark mode). Validated with the dataviz skill's
// validate_palette.js against the white card surface: series slot 1 blue passes every check (≥ 3:1).
const VIZ_ROLES = {
  "--viz-series": "#2a78d6",
  "--viz-series-hover": "#3987e5",
  "--viz-grid": "#e1e0d9",
  "--viz-axis": "#c3c2b7",
  "--viz-muted": "#898781",
  "--viz-text-secondary": "#52514e",
} as CSSProperties;

const PLOT_HEIGHT = 200;
const TOP = 22; // room for the value label above the tallest bar
const X_AXIS = 26; // x-axis label band — part of the fixed height, so the card never scrolls
const LEFT = 52;
const RIGHT = 8;
const MAX_BAR = 24;
const MIN_GAP = 2;
// Bars take ~60% of their day's column; the rest is air, so 30 bars don't merge into a block.
const BAR_SHARE = 0.6;

/** Daily sales as columns: one series (no legend box — the title names it), per-bar hover/focus, table view. */
export function SalesChart({ days }: { days: ChartDay[] }) {
  const [range, setRange] = useState<"7" | "30">("30");
  const [view, setView] = useState<"chart" | "table">("chart");
  const shown = range === "7" ? days.slice(-7) : days;
  const total = shown.reduce((sum, d) => sum + Number(d.amount), 0);
  const bills = shown.reduce((sum, d) => sum + d.bills, 0);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="daily-sales-title">
      {/* Controls sit above the card they scope, never inside it. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="daily-sales-title" className="font-heading text-base font-semibold">
            Daily sales
          </h2>
          <p className="text-sm text-muted-foreground">
            Last {range} days · {formatINR(total)} from {bills} {plural("bill", bills)}
          </p>
        </div>
        <div className="flex gap-2">
          <Segmented
            label="Days shown"
            value={range}
            onChange={setRange}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
            ]}
          />
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "chart", label: "Chart" },
              { value: "table", label: "Table" },
            ]}
          />
        </div>
      </div>
      <Card>
        <CardContent>{view === "chart" ? <ResponsiveChart days={shown} /> : <ChartTable days={shown} />}</CardContent>
      </Card>
    </section>
  );
}

/** ColumnChart that fits its container's width (also used by the Sales report). */
export function ResponsiveChart({ days }: { days: ChartDay[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      <ColumnChart days={days} width={width} active={active} onActive={setActive} />
    </div>
  );
}

/** The chart itself, at a given width. Pure, so it can also be rendered to a static image for checking. */
export function ColumnChart({
  days,
  width,
  active = null,
  onActive,
}: {
  days: ChartDay[];
  width: number;
  active?: number | null;
  onActive?: (index: number | null) => void;
}) {
  const values = days.map((d) => Number(d.amount));
  const max = Math.max(0, ...values);
  // No sales: just the baseline and a message, not a made-up ₹0–100 scale.
  const ticks = max > 0 ? niceTicks(max) : [0];
  const top = max > 0 ? ticks.at(-1)! : 1;
  const plotWidth = width - LEFT - RIGHT;
  const band = plotWidth / days.length;
  const barWidth = Math.max(2, Math.min(MAX_BAR, band * BAR_SHARE, band - MIN_GAP));
  const height = TOP + PLOT_HEIGHT + X_AXIS;
  const y = (value: number) => TOP + PLOT_HEIGHT - (value / top) * PLOT_HEIGHT;
  const maxIndex = max > 0 ? values.lastIndexOf(max) : -1;
  // Label every day on the 7-day view, about every fifth day on 30 days (counting back from today), and never closer
  // than ~52px apart so narrow screens don't collide.
  const labelEvery = Math.max(days.length <= 7 ? 1 : Math.ceil(days.length / 6), Math.ceil(52 / band));

  const activeDay = active === null ? null : days[active];
  const activeX = active === null ? 0 : LEFT + active * band + band / 2;

  return (
    <div className="relative" style={VIZ_ROLES}>
      <svg width={width} height={height} role="img" aria-label={`Daily sales, ${days.length} days. Use the Table view for exact values.`} className="block overflow-visible">
        {/* Gridlines + y-axis labels: solid hairlines, recessive. */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={width - RIGHT} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} shapeRendering="crispEdges" />
            <text x={LEFT - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--viz-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatAxisINR(tick)}
            </text>
          </g>
        ))}

        {days.map((day, i) => {
          const value = values[i];
          const x = LEFT + i * band + (band - barWidth) / 2;
          const barHeight = (value / top) * PLOT_HEIGHT;
          const radius = Math.min(4, barHeight, barWidth / 2);
          const fromEnd = days.length - 1 - i;
          return (
            <g key={day.day}>
              {barHeight > 0 && (
                // 4px rounded data-end, square at the baseline.
                <path
                  d={`M${x},${TOP + PLOT_HEIGHT} V${y(value) + radius} Q${x},${y(value)} ${x + radius},${y(value)} H${x + barWidth - radius} Q${x + barWidth},${y(value)} ${x + barWidth},${y(value) + radius} V${TOP + PLOT_HEIGHT} Z`}
                  fill={active === i ? "var(--viz-series-hover)" : "var(--viz-series)"}
                />
              )}
              {fromEnd % labelEvery === 0 && (
                // The last label lines up with the right edge instead of overflowing it.
                <text
                  x={fromEnd === 0 ? Math.min(x + barWidth / 2 + 16, width - RIGHT) : x + barWidth / 2}
                  y={TOP + PLOT_HEIGHT + 17}
                  textAnchor={fromEnd === 0 && x + barWidth / 2 + 16 > width - RIGHT ? "end" : "middle"}
                  fontSize={11}
                  fill="var(--viz-muted)"
                >
                  {days.length <= 7 ? formatWeekdayDay(day.day) : formatShortDay(day.day)}
                </text>
              )}
              {i === maxIndex && active === null && (
                // Selective direct label: only the best day's value, on its cap.
                <text x={x + barWidth / 2} y={y(value) - 6} textAnchor="middle" fontSize={11} fontWeight={500} fill="var(--viz-text-secondary)">
                  {value < 1000 ? formatINR(value) : formatAxisINR(value)}
                </text>
              )}
              {onActive && (
                // The whole day column is the hit target (bigger than the bar), for pointer and keyboard.
                <rect
                  x={LEFT + i * band}
                  y={TOP}
                  width={band}
                  height={PLOT_HEIGHT}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${formatLongDay(day.day)}: ${formatINR(day.amount)}, ${day.bills} ${plural("bill", day.bills)}`}
                  onPointerEnter={() => onActive(i)}
                  onPointerLeave={() => onActive(null)}
                  onFocus={() => onActive(i)}
                  onBlur={() => onActive(null)}
                  className="outline-none focus-visible:stroke-[var(--viz-series)] focus-visible:stroke-2"
                />
              )}
            </g>
          );
        })}
      </svg>

      {max === 0 && (
        <p className="pointer-events-none absolute inset-x-0 text-center text-sm text-muted-foreground" style={{ top: TOP + PLOT_HEIGHT / 2 - 10 }}>
          No sales in these {days.length} days.
        </p>
      )}

      {activeDay && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 rounded-md border bg-popover px-3 py-2 text-sm shadow-md"
          style={{
            left: Math.min(Math.max(activeX, 70), width - 70),
            top: Math.max(0, y(Number(activeDay.amount)) - 64),
            transform: "translateX(-50%)",
          }}
        >
          {/* Value leads, label follows. */}
          <div className="font-semibold">{formatINR(activeDay.amount)}</div>
          <div className="text-xs whitespace-nowrap text-muted-foreground">
            {formatLongDay(activeDay.day)} · {activeDay.bills} {plural("bill", activeDay.bills)}
          </div>
        </div>
      )}
    </div>
  );
}

/** The chart's accessible twin: every value without hovering. */
function ChartTable({ days }: { days: ChartDay[] }) {
  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card text-left text-muted-foreground">
          <tr>
            <th className="py-1.5 font-medium">Date</th>
            <th className="py-1.5 text-right font-medium">Bills</th>
            <th className="py-1.5 text-right font-medium">Sales</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {[...days].reverse().map((day) => (
            <tr key={day.day} className={cn("border-t", day.bills === 0 && "text-muted-foreground")}>
              <td className="py-1.5">{formatLongDay(day.day)}</td>
              <td className="py-1.5 text-right">{day.bills}</td>
              <td className="py-1.5 text-right">{formatINR(day.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
