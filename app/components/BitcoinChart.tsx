/* eslint-disable react-hooks/immutability */
"use client";

import { useEffect, useMemo, useRef, useState, useReducer } from "react";
import Papa from "papaparse";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
  ScriptableLineSegmentContext,
} from "chart.js";
import { Line } from "react-chartjs-2";
import annotationPlugin from "chartjs-plugin-annotation";
import { BtcSourceController, PriceRow } from "../lib/BtcSourceController";
import { useObject } from "../lib/useObject";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  annotationPlugin,
);

const PRESETS = [
  { label: "Jan 2020", start: "2020-01-01", end: "2020-01-31" },
  { label: "2020", start: "2020-01-01", end: "2020-12-31" },
  { label: "2021", start: "2021-01-01", end: "2021-12-31" },
  { label: "2022", start: "2022-01-01", end: "2022-12-31" },
  { label: "2023", start: "2023-01-01", end: "2023-12-31" },
  { label: "2024", start: "2024-01-01", end: "2024-12-31" },
  { label: "Tudo", start: "2010-07-18", end: "2026-12-31" },
];

export function BitcoinChartLoadWrapper() {
  const controll = useObject(BtcSourceController);
  useEffect(() => {
    fetch("./Bitcoin-price-USD.csv")
      .then((res) => res.text())
      .then((csv) => {
        const result = Papa.parse<{ Date: string; Price: string }>(csv, {
          header: true,
          skipEmptyLines: true,
        });
        const allData = result.data.map((row) => ({
          date: row.Date,
          price: parseFloat(row.Price),
        }));
        controll.load({
          data: allData,
          avgWindow: 8,
        });
        controll.SetDay("2022-02-01");
      });
  }, []);

  if (controll == null) return <div>Loading</div>;

  return <BitcoinChart controller={controll} />;
}

export default function BitcoinChart({
  controller,
}: {
  controller: BtcSourceController;
}) {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);
  const [activePreset, setActivePreset] = useState("Jan 2020");
  const [cursorDate, setCursorDate] = useState("");

  // --- Mapas por data para lookup O(1) ---

  const realMap = new Map(
    controller.GetHistory().real.map((r) => [r.date, r.price]),
  );

  const avgMap = new Map(
    controller.GetHistory().avg.map((r) => [r?.date, r?.price]),
  );

  const catmullMap = new Map(
    controller.GetHistory().catmul.map((r) => [r?.date, r?.price]),
  );

  const history = controller.GetHistory();

  const extrapolatedDates = new Set(
    history.real.filter((r) => r.extrapolated).map((r) => r.date),
  );

  // Eixo X: datas no range + extrapoladas além do viewEndData
  const inRange = history.real
    .filter(
      (r) =>
        r.date >= controller.viewStartData && r.date <= controller.viewEndData,
    )
    .map((r) => r.date);
  const beyondEnd = history.real
    .filter((r) => r.extrapolated && r.date > controller.viewEndData)
    .map((r) => r.date);
  const rangeLabels = [...inRange, ...beyondEnd];

  // Datasets mapeados sobre rangeLabels
  const visibleRealPrices = rangeLabels.map((d) => realMap.get(d) ?? null);

  const chartData = {
    labels: [...rangeLabels, "TESTE"],
    datasets: [
      {
        label: "Bitcoin (USD)",
        data: visibleRealPrices,
        borderColor: "#f7931a",
        backgroundColor: "rgba(247, 147, 26, 0.1)",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.2,
        segment: {
          borderDash: (ctx: ScriptableLineSegmentContext) =>
            extrapolatedDates.has(rangeLabels[ctx.p1DataIndex])
              ? [6, 4]
              : undefined,
          borderColor: (ctx: ScriptableLineSegmentContext) =>
            extrapolatedDates.has(rangeLabels[ctx.p1DataIndex])
              ? "rgba(247, 147, 26, 0.5)"
              : "#f7931a",
        },
      },
      {
        label: `Média (${controller.avgWindow} dias)`,
        data: rangeLabels.map((d) => avgMap.get(d) ?? null),
        borderColor: "#38bdf8",
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false,
        tension: 0.2,
        spanGaps: true,
        segment: {
          borderDash: (ctx: ScriptableLineSegmentContext) =>
            extrapolatedDates.has(rangeLabels[ctx.p1DataIndex])
              ? [6, 4]
              : undefined,
          borderColor: (ctx: ScriptableLineSegmentContext) =>
            extrapolatedDates.has(rangeLabels[ctx.p1DataIndex])
              ? "rgba(56, 189, 248, 0.5)"
              : "#38bdf8",
        },
      },
    ],
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        labels: { color: "#94a3b8", boxWidth: 16, padding: 16 },
      },
      title: {
        display: true,
        text: "Preço do Bitcoin (USD)",
        color: "#e2e8f0",
        font: { size: 18, weight: "bold" },
      },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            `$${(ctx.parsed.y ?? 0).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`,
        },
      },
      annotation: {
        annotations: {
          dayCursorLine: {
            type: "line",
            xMin: controller.cursorDate,
            xMax: controller.cursorDate,
            borderColor: "#facc15",
            borderWidth: 2,
            label: {
              display: true,
              content: controller.cursorDate,
              position: "start",
              color: "#facc15",
              backgroundColor: "rgba(0,0,0,0.75)",
              font: { size: 11 },
              padding: 4,
            },
          },
          ...(cursorDate >= controller.viewStartData &&
          cursorDate <= controller.viewEndData
            ? {
                cursorLine: {
                  type: "line" as const,
                  xMin: cursorDate,
                  xMax: cursorDate,
                  borderColor: "#fb923c",
                  borderWidth: 2,
                  borderDash: [6, 4],
                  label: {
                    display: true,
                    content: `Current: ${cursorDate}`,
                    position: "start" as const,
                    color: "#fb923c",
                    backgroundColor: "rgba(0,0,0,0.75)",
                    font: { size: 11 },
                    padding: 4,
                  },
                },
              }
            : {}),
        },
      },
    },
    scales: {
      x: {
        type: "category",
        ticks: { color: "#94a3b8", maxTicksLimit: 10, maxRotation: 30 },
        grid: { color: "rgba(148,163,184,0.1)" },
      },
      y: {
        ticks: {
          color: "#94a3b8",
          callback: (value) => `$${Number(value).toLocaleString("en-US")}`,
        },
        grid: { color: "rgba(148,163,184,0.1)" },
      },
    },
  };

  function applyPreset(preset: (typeof PRESETS)[0]) {
    controller.viewStartData = preset.start;
    controller.viewEndData = preset.end;
    setActivePreset(preset.label);
  }

  function handleCustomDate(field: "start" | "end", value: string) {
    setActivePreset("");
    if (field === "start") controller.viewStartData = value;
    else controller.viewEndData = value;
  }

  const realPricesInRange = rangeLabels
    .map((d) => realMap.get(d))
    .filter((v): v is number => v !== undefined);
  const minPrice = realPricesInRange.length
    ? Math.min(...realPricesInRange)
    : 0;
  const maxPrice = realPricesInRange.length
    ? Math.max(...realPricesInRange)
    : 0;
  const lastPrice = realPricesInRange.length
    ? realPricesInRange[realPricesInRange.length - 1]
    : 0;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-orange-400 mb-2">
          Bitcoin Price Chart
        </h1>
        <p className="text-gray-400 mb-6 text-sm">
          Dados históricos de preço do Bitcoin em USD
        </p>

        {/* Presets */}
        <div className="flex flex-wrap gap-2 mb-4">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                activePreset === p.label
                  ? "bg-orange-500 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-4 mb-6 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">De:</label>
            <input
              type="date"
              value={controller.viewStartData}
              min="2010-07-18"
              max="2026-04-28"
              onChange={(e) => handleCustomDate("start", e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Até:</label>
            <input
              type="date"
              value={controller.viewEndData}
              min="2010-07-18"
              max="2026-04-28"
              onChange={(e) => handleCustomDate("end", e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Cursor:</label>
            <input
              type="date"
              value={controller.cursorDate}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
              onChange={(e) => {
                controller.SetDay(e.target.value);
                forceUpdate();
              }}
            />
            <button
              onClick={() => {
                controller.nextDay();
                forceUpdate();
              }}
              className="px-3 py-1 rounded bg-gray-800 text-gray-300 text-sm hover:bg-gray-700 border border-gray-700"
            >
              Advance
            </button>
            <button
              onClick={() => { controller.toggleAutoNextDay(); forceUpdate(); }}
              className={`px-3 py-1 rounded text-sm font-medium border transition-colors ${
                controller.autoNextTimeoutId != null
                  ? "bg-yellow-500 text-gray-900 border-yellow-400 hover:bg-yellow-400"
                  : "bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700"
              }`}
            >
              {controller.autoNextTimeoutId != null ? "⏸ Auto" : "▶ Auto"}
            </button>
            
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Média:</label>
            <input
              type="number"
              value={controller.avgWindow}
              min={1}
              onChange={(e) => {
                controller.setAvgWindow(parseInt(e.target.value) || 4);
                forceUpdate();
              }}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 w-20 focus:outline-none focus:border-sky-500"
            />
            <span className="text-gray-500 text-sm">dias</span>
          </div>

          <span className="text-gray-500 text-sm">
            {rangeLabels.length} pontos
          </span>
        </div>

        {/* Trading */}
        <div className="flex flex-wrap items-center gap-3 mb-4 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3">
          <button
            onClick={() => {
              controller.buy();
              forceUpdate();
            }}
            className="px-4 py-1.5 rounded bg-green-700 text-white text-sm font-semibold hover:bg-green-600"
          >
            Buy
          </button>
          <button
            onClick={() => {
              controller.sell();
              forceUpdate();
            }}
            className="px-4 py-1.5 rounded bg-red-700 text-white text-sm font-semibold hover:bg-red-600"
          >
            Sell
          </button>
          <button
            onClick={() => {
              controller.auto();
              forceUpdate();
            }}
            className="px-4 py-1.5 rounded bg-red-700 text-white text-sm font-semibold hover:bg-red-600"
          >
            Auto
          </button>
          <span className="text-xs text-gray-400">
            BTC:{" "}
            <span className="text-orange-300 font-mono">
              {controller.btcBalance.toFixed(8)}
            </span>
          </span>
          <span className="text-xs text-gray-400">
            USD:{" "}
            <span className="text-green-300 font-mono">
              $
              {controller.dolarBalance.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </span>
        </div>
        <textarea
          readOnly
          value={controller.log}
          className="w-full h-28 mb-6 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-xs text-gray-300 font-mono resize-none focus:outline-none"
          placeholder="Log..."
        />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Último preço", value: lastPrice },
            { label: "Máximo", value: maxPrice },
            { label: "Mínimo", value: minPrice },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="bg-gray-900 rounded-xl p-4 border border-gray-800"
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                {label}
              </p>
              <p className="text-xl font-bold text-orange-300">
                $
                {value.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div
          className="bg-gray-900 rounded-2xl border border-gray-800 p-4"
          style={{ height: 420 }}
        >
          <Line data={chartData} options={options} />
        </div>
      </div>
    </div>
  );
}
