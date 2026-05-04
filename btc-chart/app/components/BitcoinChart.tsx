"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface PriceRow {
  date: string;
  price: number;
}

const PRESETS = [
  { label: "Jan 2020", start: "2020-01-01", end: "2020-01-31" },
  { label: "2020", start: "2020-01-01", end: "2020-12-31" },
  { label: "2021", start: "2021-01-01", end: "2021-12-31" },
  { label: "2022", start: "2022-01-01", end: "2022-12-31" },
  { label: "2023", start: "2023-01-01", end: "2023-12-31" },
  { label: "2024", start: "2024-01-01", end: "2024-12-31" },
  { label: "Tudo", start: "2010-07-18", end: "2026-12-31" },
];

export default function BitcoinChart() {
  const [allData, setAllData] = useState<PriceRow[]>([]);
  const [startDate, setStartDate] = useState("2020-01-01");
  const [endDate, setEndDate] = useState("2020-01-31");
  const [activePreset, setActivePreset] = useState("Jan 2020");
  const [loading, setLoading] = useState(true);
  const [avgWindow, setAvgWindow] = useState(2);
  const [blurDays, setBlurDays] = useState(5);

  useEffect(() => {
    fetch("/Bitcoin-price-USD.csv")
      .then((res) => res.text())
      .then((csv) => {
        const result = Papa.parse<{ Date: string; Price: string }>(csv, {
          header: true,
          skipEmptyLines: true,
        });
        const parsed: PriceRow[] = result.data.map((row) => ({
          date: row.Date,
          price: parseFloat(row.Price),
        }));
        setAllData(parsed);
        setLoading(false);
      });
  }, []);

  // --- Derived series computed on the FULL dataset so border values are correct ---

  const allAvgData = useMemo<(number | null)[]>(() => {
    return allData.map((_, i) => {
      if ((i + 1) % avgWindow !== 0) return null;
      const slice = allData.slice(i - avgWindow + 1, i + 1);
      return slice.reduce((sum, r) => sum + r.price, 0) / avgWindow;
    });
  }, [allData, avgWindow]);

  const allGaussianData = useMemo<number[]>(() => {
    const sigma = blurDays;
    const radius = Math.ceil(3 * sigma);
    return allData.map((_, i) => {
      let weightedSum = 0;
      let totalWeight = 0;
      for (let j = -radius; j <= radius; j++) {
        const idx = i + j;
        if (idx < 0 || idx >= allData.length) continue;
        const w = Math.exp(-(j * j) / (2 * sigma * sigma));
        weightedSum += allData[idx].price * w;
        totalWeight += w;
      }
      return weightedSum / totalWeight;
    });
  }, [allData, blurDays]);

  const allCatmullData = useMemo<(number | null)[]>(() => {
    const cp = allAvgData
      .map((v, i) => (v !== null ? { i, v } : null))
      .filter((p): p is { i: number; v: number } => p !== null);
    const result: (number | null)[] = new Array(allData.length).fill(null);
    for (let seg = 0; seg < cp.length - 1; seg++) {
      const p0 = cp[Math.max(0, seg - 1)];
      const p1 = cp[seg];
      const p2 = cp[seg + 1];
      const p3 = cp[Math.min(cp.length - 1, seg + 2)];
      const span = p2.i - p1.i;
      for (let x = p1.i; x <= p2.i; x++) {
        const t = span === 0 ? 0 : (x - p1.i) / span;
        const t2 = t * t;
        const t3 = t2 * t;
        result[x] =
          0.5 *
          (2 * p1.v +
            (-p0.v + p2.v) * t +
            (2 * p0.v - 5 * p1.v + 4 * p2.v - p3.v) * t2 +
            (-p0.v + 3 * p1.v - 3 * p2.v + p3.v) * t3);
      }
    }
    return result;
  }, [allData, allAvgData]);

  // --- Slice all series to the visible date window together ---

  const visible = useMemo(() => {
    return allData
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => row.date >= startDate && row.date <= endDate);
  }, [allData, startDate, endDate]);

  const filtered    = visible.map(({ row }) => row);
  const pairedAvgData  = visible.map(({ i }) => allAvgData[i]);
  const catmullRomData = visible.map(({ i }) => allCatmullData[i]);
  const gaussianBlurData = visible.map(({ i }) => allGaussianData[i]);

  const chartData = {
    labels: filtered.map((r) => r.date),
    datasets: [
      {
        label: "Bitcoin (USD)",
        data: filtered.map((r) => r.price),
        borderColor: "#f7931a",
        backgroundColor: "rgba(247, 147, 26, 0.1)",
        borderWidth: 2,
        pointRadius: filtered.length > 200 ? 0 : 3,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.2,
      },
      {
        label: `Média (${avgWindow} dias)`,
        data: pairedAvgData,
        borderColor: "#38bdf8",
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false,
        tension: 0.2,
        spanGaps: true,
      },
      {
        label: `Catmull-Rom (${avgWindow} dias)`,
        data: catmullRomData,
        borderColor: "#a78bfa",
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false,
        tension: 0,
        spanGaps: false,
      },
      {
        label: `Blur gaussiano (${blurDays} dias)`,
        data: gaussianBlurData,
        borderColor: "#4ade80",
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false,
        tension: 0.2,
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
    },
    scales: {
      x: {
        type: "category",
        ticks: {
          color: "#94a3b8",
          maxTicksLimit: 10,
          maxRotation: 30,
        },
        grid: { color: "rgba(148,163,184,0.1)" },
      },
      y: {
        ticks: {
          color: "#94a3b8",
          callback: (value) =>
            `$${Number(value).toLocaleString("en-US")}`,
        },
        grid: { color: "rgba(148,163,184,0.1)" },
      },
    },
  };

  function applyPreset(preset: (typeof PRESETS)[0]) {
    setStartDate(preset.start);
    setEndDate(preset.end);
    setActivePreset(preset.label);
  }

  function handleCustomDate(field: "start" | "end", value: string) {
    setActivePreset("");
    if (field === "start") setStartDate(value);
    else setEndDate(value);
  }

  const minPrice = filtered.length
    ? Math.min(...filtered.map((r) => r.price))
    : 0;
  const maxPrice = filtered.length
    ? Math.max(...filtered.map((r) => r.price))
    : 0;
  const lastPrice = filtered.length ? filtered[filtered.length - 1].price : 0;

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

        {/* Custom date range */}
        <div className="flex flex-wrap gap-4 mb-6 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">De:</label>
            <input
              type="date"
              value={startDate}
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
              value={endDate}
              min="2010-07-18"
              max="2026-04-28"
              onChange={(e) => handleCustomDate("end", e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-orange-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Média:</label>
            <input
              type="number"
              value={avgWindow}
              min={1}
              max={filtered.length || 365}
              onChange={(e) => setAvgWindow(Math.max(1, parseInt(e.target.value) || 1))}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 w-20 focus:outline-none focus:border-sky-500"
            />
            <span className="text-gray-500 text-sm">dias</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Blur:</label>
            <input
              type="number"
              value={blurDays}
              min={1}
              max={365}
              onChange={(e) => setBlurDays(Math.max(1, parseInt(e.target.value) || 1))}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 w-20 focus:outline-none focus:border-green-500"
            />
            <span className="text-gray-500 text-sm">dias</span>
          </div>
          <span className="text-gray-500 text-sm">{filtered.length} pontos</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Último preço", value: lastPrice },
            { label: "Máximo", value: maxPrice },
            { label: "Mínimo", value: minPrice },
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                {label}
              </p>
              <p className="text-xl font-bold text-orange-300">
                ${value.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4" style={{ height: 420 }}>
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Carregando dados...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Nenhum dado encontrado para o período selecionado.
            </div>
          ) : (
            <Line data={chartData} options={options} />
          )}
        </div>
      </div>
    </div>
  );
}
