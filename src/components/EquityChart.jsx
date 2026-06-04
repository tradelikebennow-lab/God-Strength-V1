// src/components/EquityChart.jsx
import React, { useMemo } from 'react';
import { AreaChart, ComposedChart, Area, Line, Legend, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

/**
 * Props:
 *   data: [{ date, value }, ...]
 *   color?: 'auto' | string  — auto picks success/danger based on final value
 *   height?: number
 *   yFormat?: fn(value) -> string
 *   xFormat?: fn(date) -> string
 *   showZeroLine?: boolean
 *   compact?: boolean — hide axes for small inline use
 *   benchmark?: { data: [{date, value}], label: string, color?: string } — optional overlay line
 *   primaryLabel?: string — legend label for the primary series (only shown if benchmark is set)
 */
function EquityChart({
  data = [],
  color = 'auto',
  height = 200,
  yFormat,
  xFormat,
  showZeroLine = false,
  compact = false,
  benchmark = null,
  primaryLabel = 'Portfolio',
}) {
  const finalValue = data.length ? data[data.length - 1].value : 0;
  const resolvedColor =
    color === 'auto' ? (finalValue >= 0 ? 'var(--success)' : 'var(--danger)') : color;

  const formattedData = useMemo(() => {
    if (!benchmark || !benchmark.data || benchmark.data.length === 0) {
      return data.map((d) => ({ ...d, date: d.date, value: d.value }));
    }
    // Build a date → benchmark value lookup, then attach to each primary point.
    // Both series are produced from the same TWR curve dates upstream, so direct
    // key lookup is exact.
    const bMap = new Map(benchmark.data.map((b) => [b.date, b.value]));
    return data.map((d) => ({
      ...d,
      date: d.date,
      value: d.value,
      benchmark: bMap.has(d.date) ? bMap.get(d.date) : null,
    }));
  }, [data, benchmark]);

  // Multiple trades can close on the same date, producing several points with
  // identical date labels — feed the axis only the first occurrence of each
  // date so labels don't repeat (e.g. "11-12, 11-12, 11-13, 11-13").
  const xTicks = useMemo(() => {
    const seen = new Set();
    const ticks = [];
    for (const d of formattedData) {
      if (!seen.has(d.date)) {
        seen.add(d.date);
        ticks.push(d.date);
      }
    }
    return ticks;
  }, [formattedData]);

  if (!data.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-dim)' }}>
        No data
      </div>
    );
  }

  const gradientId = `eq-grad-${Math.random().toString(36).slice(2, 9)}`;

  // Use ComposedChart when a benchmark Line needs to overlay the Area;
  // AreaChart alone won't render Line children.
  const ChartImpl = benchmark ? ComposedChart : AreaChart;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ChartImpl data={formattedData} margin={{ top: 8, right: 8, left: compact ? 0 : 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={resolvedColor} stopOpacity={0.35} />
            <stop offset="100%" stopColor={resolvedColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        {!compact && (
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--fg-dim)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tickFormatter={xFormat}
            ticks={xTicks}
            interval="preserveStartEnd"
            minTickGap={40}
          />
        )}
        {!compact && (
          <YAxis
            tick={{ fill: 'var(--fg-dim)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={yFormat}
            width={60}
          />
        )}
        <Tooltip
          contentStyle={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border-strong)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--fg)',
          }}
          formatter={(v, name) => {
            const label = name === 'benchmark' ? (benchmark?.label || 'Benchmark') : primaryLabel;
            return [yFormat ? yFormat(v) : v, label];
          }}
          labelFormatter={(d) => xFormat ? xFormat(d) : d}
        />
        {benchmark && !compact && (
          <Legend
            verticalAlign="top"
            align="right"
            iconType="line"
            wrapperStyle={{ fontSize: 11, color: 'var(--fg-dim)', paddingBottom: 6 }}
            formatter={(value) =>
              value === 'benchmark' ? (benchmark.label || 'Benchmark') : primaryLabel
            }
          />
        )}
        {showZeroLine && <ReferenceLine y={0} stroke="var(--fg-dim)" strokeDasharray="3 3" />}
        <Area
          type="monotone"
          dataKey="value"
          name={primaryLabel}
          stroke={resolvedColor}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
        />
        {benchmark && (
          <Line
            type="monotone"
            dataKey="benchmark"
            name="benchmark"
            stroke={benchmark.color || 'var(--fg-dim)'}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        )}
      </ChartImpl>
    </ResponsiveContainer>
  );
}

export default React.memo(EquityChart);
