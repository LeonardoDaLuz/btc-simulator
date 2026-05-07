export interface PriceRow {
  date: string;
  price: number | null;
  extrapolated?: boolean;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export class BtcSourceController {
  private allData: PriceRow[] = [];

  public avgWindow: number = 4;
  DayCursor: number = 0;
  public viewStartData: string = "0";
  public viewEndData: string = "0";
  public dolarBalance: number = 10000;
  public btcBalance: number = 0;
  public btcPriceOnLastSell = 0;
  public btcPriceOnLastBuy = 999999;
  public log: string = "";
  autoNextTimeoutId: NodeJS.Timeout | null = null;

  load(args: { data: PriceRow[]; avgWindow: number }) {
    this.allData = args.data;
    this.DayCursor = args.data.length - 1;
    this.avgWindow = args.avgWindow;
  }
  buy() {
    const todayPrice = this.allData[this.DayCursor];
    const btcAmount = this.dolarBalance / todayPrice.price!;
    this.dolarBalance = 0;
    this.btcBalance += btcAmount;
    this.btcPriceOnLastBuy = todayPrice.price!;
    this.log +=
      "\n BTC purchased. BTC balance: " +
      this.btcBalance.toLocaleString("pt-BR", {
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      });
  }
  auto() {
    const history = this.GetHistory();
    history.real = history.real.filter((x) => !x.extrapolated);
    history.avg = history.avg.filter((x) => !x?.extrapolated);
    const lastReal = history.real[history.real.length - 1];
    const lastAvg = history.avg[history.avg.length - 1];

    if (this.dolarBalance > 0) {
      if (lastReal.price! < lastAvg.price!) {
        this.buy();
      }
    } else {
      if (lastReal.price! > lastAvg.price!) {
        this.sell();
      }
    }
  }
  sell() {
    const todayPrice = this.allData[this.DayCursor];
    const dolarAmount = this.btcBalance * todayPrice.price!;
    this.btcBalance = 0;
    this.dolarBalance += dolarAmount;
    this.btcPriceOnLastSell = todayPrice.price!;
    this.log +=
      "\n BTC selled. Dolar balance: " +
      this.btcBalance.toLocaleString("pt-BR", {
        minimumFractionDigits: 8,
        maximumFractionDigits: 8,
      });
  }
  get cursorDate(): string {
    return this.allData[this.DayCursor]?.date ?? "";
  }

  get firstDate(): string {
    return this.allData[0]?.date ?? "";
  }

  get lastDate(): string {
    return this.allData[this.allData.length - 1]?.date ?? "";
  }

  nextDay(): void {
    if (this.DayCursor < this.allData.length - 1) {
      this.SetDay(this.allData[this.DayCursor + 1].date);
    }
  }

  toggleAutoNextDay() {
    if (this.autoNextTimeoutId) {
      clearInterval(this.autoNextTimeoutId);
      this.autoNextTimeoutId = null;
    } else {
      this.autoNextTimeoutId = setInterval(() => {
        this.nextDay();
        this.auto();
      }, 50);
    }
  }
  setAvgWindow(val: number) {
    this.avgWindow = val;
  }

  SetDay(date: string): void {
    const idx = this.allData.findIndex((r) => r.date === date);
    if (idx !== -1) this.DayCursor = idx;
    const newStartData = new Date(date);
    const newEndData = new Date(date);
    newStartData.setMonth(newStartData.getMonth() - 1);
    newEndData.setMonth(newEndData.getMonth() + 1);
    this.viewStartData = newStartData.toISOString().split("T")[0];
    this.viewEndData = newEndData.toISOString().split("T")[0];
  }

  GetHistory(): {
    real: PriceRow[];
    avg: PriceRow[];
    catmul: PriceRow[];
  } {
    const real = this.allData.slice(0, this.DayCursor + 1);
    if (real.length < 2) return { real: [], avg: [], catmul: [] };

    const last = real[real.length - 1];
    const prev = real[real.length - 2];
    const delta = last.price! - prev.price!;

    const realPreview: PriceRow[] = Array.from({ length: 10 }, (_, i) => ({
      date: addDays(last.date, i + 1),
      price: last.price! + delta * (i + 1),
      extrapolated: true,
    }));

    const avg: PriceRow[] = real.map((row, i) => {
      //if ((i + 1) % this.avgWindow !== 0) return { ...row, price: null };
      const slice = real.slice(i - this.avgWindow + 1, i + 1);
      const price =
        slice.reduce((sum, r) => sum + r.price!, 0) / this.avgWindow;
      return { date: row.date, price };
    });
    for (let i = 0; i < avg.length; i++) {
      const ai = avg[i];
      if (ai.price === null) {
        const last = avg[i - 1];
        if (!last) continue;
        if (last.price == null) continue;
        const prev = avg[i - 2];
        if (!prev) continue;
        if (prev.price == null) continue;
        const delta = last.price - prev.price;
        avg[i].price = last.price + delta;
      }
    }
    const avgLast = avg[avg.length - 1].price;
    const avgPrev = avg[avg.length - 2].price;
    if (avgLast == null) throw new Error("avgLast cannot be null");
    if (avgPrev == null) throw new Error("avgLast cannot be null");

    const avgDelta = avg.length >= 2 ? avgLast - avgPrev : 0;

    const avgPreview: PriceRow[] = Array.from({ length: 10 }, (_, i) => ({
      date: addDays(last.date, i + 1),
      price: avgLast + avgDelta * (i + 1),
      extrapolated: true,
    }));

    const catmul = (() => {
      const history = real;
      const cp = avg
        .map((v, i) => (v !== null ? { i, v: v.price } : null))
        .filter((p): p is { i: number; v: number } => p !== null);
      const result: PriceRow[] = new Array(history.length).fill(null);
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
          const price =
            0.5 *
            (2 * p1.v +
              (-p0.v + p2.v) * t +
              (2 * p0.v - 5 * p1.v + 4 * p2.v - p3.v) * t2 +
              (-p0.v + 3 * p1.v - 3 * p2.v + p3.v) * t3);
          result[x] = { date: history[x].date, price };
        }
      }
      return result;
    })();

    return {
      real: [...real, ...realPreview],
      avg: [...avg, ...avgPreview],
      catmul,
    };
  }
}
