/**
 * Dataset DEMO 100 % sintético. Ningún nombre, correo ni archivo corresponde a personas reales.
 * Determinista (semilla fija) y relativo a "hoy" para que el tablero muestre casos variados.
 */
import { dueDateForMonth } from "@/domain/coverage";
import { addDays, addMonths, lastDayOfMonth } from "@/domain/dates";
import { describeDecision } from "@/domain/decision";
import { round2 } from "@/domain/reconciliation";
import type {
  Advisor,
  Client,
  Currency,
  Decision,
  EmailDraft,
  FollowUp,
  MarketViewVersion,
  PendingItem,
  Position,
  PositionItem,
  Review,
  Segment,
} from "@/domain/schemas";
import { BA_TZ } from "@/domain/dates";

export interface DemoDataset {
  advisors: Advisor[];
  clients: Client[];
  positions: Position[];
  marketView: { id: string; name: string; versions: MarketViewVersion[] };
  reviews: Review[];
  pendings: PendingItem[];
  drafts: EmailDraft[];
  followUps: FollowUp[];
}

export const DEMO_CLIENT_COUNT = 107;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ADVISORS: Advisor[] = [
  { id: "as-01", name: "Asesor DEMO Alfa", email: "asesor.alfa@example.com" },
  { id: "as-02", name: "Asesora DEMO Beta", email: "asesora.beta@example.com" },
  { id: "as-03", name: "Asesor DEMO Gamma", email: "asesor.gamma@example.com" },
  { id: "as-04", name: "Asesora DEMO Delta", email: "asesora.delta@example.com" },
  { id: "as-05", name: "Asesor DEMO Épsilon", email: "asesor.epsilon@example.com" },
  { id: "as-06", name: "Asesora DEMO Zeta", email: "asesora.zeta@example.com" },
];

const SECTORS = [
  "Agroindustria",
  "Servicios profesionales",
  "Comercio",
  "Industria",
  "Tecnología",
  "Salud",
];
const ALYCS = ["ALyC DEMO Uno", "ALyC DEMO Dos", "ALyC DEMO Tres"];

const INSTRUMENTS: { instrument: string; ticker?: string; currency: Currency; price: [number, number] }[] = [
  { instrument: "Bono soberano USD 2030 (DEMO)", ticker: "DMBS30", currency: "USD", price: [55, 70] },
  { instrument: "Obligación negociable energía (DEMO)", ticker: "DMONEN", currency: "USD", price: [95, 105] },
  { instrument: "Dólar MEP disponible (DEMO)", currency: "USD", price: [1, 1] },
  { instrument: "CEDEAR índice amplio (DEMO)", ticker: "DMCIDX", currency: "ARS", price: [18000, 26000] },
  { instrument: "FCI money market (DEMO)", ticker: "DMFMM", currency: "ARS", price: [30, 45] },
  { instrument: "Acción local sector bancario (DEMO)", ticker: "DMABAN", currency: "ARS", price: [5000, 9000] },
  { instrument: "Letra del Tesoro capitalizable (DEMO)", ticker: "DMLTC", currency: "ARS", price: [100, 130] },
  { instrument: "Caución tomadora (DEMO)", currency: "ARS", price: [1, 1] },
];

const KEEP_NOTES = [
  "Cartera alineada con el perfil; sin cambios este mes.",
  "Liquidez suficiente y duración acorde al horizonte.",
  "Se mantiene la estrategia; revisar vencimientos el mes próximo.",
];
const PROPOSALS = [
  "Reducir 10 % de bonos largos en USD y rotar a ON corporativas de corto plazo.",
  "Aumentar la posición en FCI money market para cubrir gastos previstos del cliente.",
  "Tomar ganancia parcial en CEDEAR y rebalancear hacia renta fija en pesos.",
];
const MISSING = [
  "Confirmar con el cliente necesidades de liquidez del próximo trimestre.",
  "Falta el resumen actualizado de la ALyC para conciliar USD.",
  "Validar el horizonte de inversión declarado en el perfil de riesgo.",
];

const iso = (date: string, time = "12:00") => new Date(`${date}T${time}:00-03:00`).toISOString();

export function buildDemoDataset(today: string): DemoDataset {
  const rand = mulberry32(107);
  const pick = <T,>(arr: readonly T[]): T => { const value = arr[Math.floor(rand() * arr.length)]; if (value === undefined) throw new Error("Empty demo collection"); return value; };
  const between = (min: number, max: number) => min + rand() * (max - min);
  const currentMonth = today.slice(0, 7);

  // Visión de mercado versionada
  const versions: MarketViewVersion[] = [
    {
      id: "vm-001",
      marketViewId: "vision-amauta",
      version: 1,
      title: "Prudencia en duración (DEMO)",
      summary: "Preferimos duración corta en renta fija y liquidez alta ante volatilidad local.",
      body: "Texto DEMO. Escenario base de volatilidad en tasas locales. Sugerimos priorizar instrumentos de corto plazo, mantener colchón de liquidez y evitar concentración en un solo emisor.",
      author: "Comité de inversiones DEMO",
      publishedAt: iso(addDays(today, -120)),
    },
    {
      id: "vm-002",
      marketViewId: "vision-amauta",
      version: 2,
      title: "Rotación gradual a crédito corporativo (DEMO)",
      summary: "Aprovechar spreads de ON de calidad; reducir exposición a bonos largos.",
      body: "Texto DEMO. Los diferenciales de crédito corporativo ofrecen compensación atractiva. Proponemos rotar de forma gradual desde soberanos largos hacia obligaciones negociables de emisores sólidos.",
      author: "Comité de inversiones DEMO",
      publishedAt: iso(addDays(today, -50)),
    },
    {
      id: "vm-003",
      marketViewId: "vision-amauta",
      version: 3,
      title: "Equilibrio entre pesos y dólares (DEMO)",
      summary: "Mantener cobertura en USD y sumar tramo en pesos de corto plazo con tasa real positiva.",
      body: "Texto DEMO. Con tasas reales positivas en pesos, conviene sumar un tramo corto en moneda local sin abandonar la cobertura en dólares. Revisar liquidez según necesidades de cada cliente.",
      author: "Comité de inversiones DEMO",
      publishedAt: iso(addDays(today, -9)),
    },
  ];
  const versionAt = (date: string) =>
    [...versions].reverse().find((v) => v.publishedAt <= iso(date)) ?? versions[0]!;

  const shuffledAdvisors = [...ADVISORS];
  const clients: Client[] = [];
  const positions: Position[] = [];
  const cutoff = lastDayOfMonth(addMonths(currentMonth, -1));

  for (let i = 1; i <= DEMO_CLIENT_COUNT; i++) {
    const id = String(i).padStart(3, "0");
    const r = rand();
    const segment: Segment = r < 0.5 ? "Medio" : r < 0.85 ? "Alto" : "Premium";
    const reviewDay = rand() < 0.06 ? 31 : 1 + Math.floor(rand() * 28);
    clients.push({
      id,
      name: `Cliente DEMO ${id}`,
      segment,
      sector: rand() < 0.7 ? pick(SECTORS) : undefined,
      advisorId: shuffledAdvisors[(i * 5) % shuffledAdvisors.length]!.id,
      reviewDay,
      isDemo: true,
    });

    const scale = segment === "Medio" ? 1 : segment === "Alto" ? 3 : 10;
    const count = 3 + Math.floor(rand() * 4);
    const chosen = [...INSTRUMENTS].sort(() => rand() - 0.5).slice(0, count);
    const items: PositionItem[] = chosen.map((ins, idx) => {
      const price = round2(between(ins.price[0], ins.price[1]));
      const baseQty = ins.currency === "USD" ? (price === 1 ? 2500 : 120) : price === 1 ? 900000 : 600_000 / price;
      const quantity = Math.round(baseQty * scale * between(0.5, 1.6));
      return {
        id: `it-${id}-${idx + 1}`,
        instrument: ins.instrument,
        ticker: ins.ticker,
        currency: ins.currency,
        quantity,
        price,
        marketValue: round2(quantity * price),
      };
    });
    const currencies = [...new Set(items.map((it) => it.currency))];
    const hasDiff = rand() < 0.12;
    const declaredTotals = currencies.map((currency, idx) => {
      const computed = round2(
        items.filter((it) => it.currency === currency).reduce((a, it) => a + it.marketValue, 0),
      );
      const delta = hasDiff && idx === 0 ? round2(currency === "USD" ? between(1, 50) : between(100, 5000)) : 0;
      return { currency, amount: round2(computed + (rand() < 0.5 ? delta : -delta)) };
    });
    positions.push({
      id: `pos-${id}-${cutoff}`,
      clientId: id,
      alyc: pick(ALYCS),
      cutoffDate: cutoff,
      drivePdf: {
        fileId: `DEMO_${id}_${cutoff.replaceAll("-", "")}_pdf`,
        fileName: `Posicion_${id}_${cutoff}_DEMO.pdf`,
      },
      items,
      declaredTotals,
    });
  }

  const reviews: Review[] = [];
  const pendings: PendingItem[] = [];
  let pendingSeq = 0;

  const makeDecision = (closeDate: string): Decision => {
    const r = rand();
    if (r < 0.6) return { type: "mantener", nota: pick(KEEP_NOTES) };
    if (r < 0.82)
      return {
        type: "proponer_cambio",
        propuesta: pick(PROPOSALS),
        fundamentoHorizonte: "El horizonte declarado (3 a 5 años) admite el ajuste propuesto.",
        fundamentoLiquidez: "La liquidez resultante cubre al menos seis meses de retiros previstos.",
        validacionAsesor: rand() < 0.55 ? "validada" : rand() < 0.7 ? "pendiente" : "observada",
        datoReconsiderar: "Un cambio relevante en la tasa real en pesos o en la brecha cambiaria.",
      };
    return {
      type: "falta_informacion",
      informacionFaltante: pick(MISSING),
      fechaLimite: addDays(closeDate, 5 + Math.floor(rand() * 12)),
    };
  };

  for (const client of clients) {
    let previous: Review | null = null;
    for (const offset of [-3, -2, -1, 0]) {
      const month = addMonths(currentMonth, offset);
      const due = dueDateForMonth(client.reviewDay, month);
      const r = rand();
      let status: "cerrada" | "en_curso" | null;
      if (offset < 0) status = r < 0.97 ? "cerrada" : null;
      else if (due < today) status = r < 0.72 ? "cerrada" : r < 0.85 ? "en_curso" : null;
      else status = r < 0.18 ? "cerrada" : r < 0.25 ? "en_curso" : null;
      if (!status) continue;

      const workDate = [addDays(due, -Math.floor(rand() * 3)), today].sort()[0]!;
      const v = versionAt(workDate);
      const decision = status === "cerrada" ? makeDecision(workDate) : rand() < 0.5 ? null : makeDecision(workDate);
      const review: Review = {
        id: `rev-${client.id}-${month}`,
        clientId: client.id,
        month,
        status,
        positionId: offset === 0 ? positions.find((p) => p.clientId === client.id)!.id : null,
        previousConclusion: previous?.decision ? describeDecision(previous.decision) : null,
        decision,
        marketViewSnapshot: {
          versionId: v.id,
          version: v.version,
          title: v.title,
          summary: v.summary,
          body: v.body,
          publishedAt: v.publishedAt,
          capturedAt: iso(workDate, "09:30"),
        },
        startedAt: iso(workDate, "09:30"),
        closedAt: status === "cerrada" ? iso(workDate, "17:00") : null,
      };
      reviews.push(review);
      if (status === "cerrada") previous = review;

      if (status === "cerrada" && decision?.type === "falta_informacion") {
        const resolved = offset <= -2 || (offset === -1 && rand() < 0.5);
        pendings.push({
          id: `pen-${String(++pendingSeq).padStart(3, "0")}`,
          clientId: client.id,
          reviewId: review.id,
          origin: "falta_informacion",
          description: decision.informacionFaltante,
          dueDate: decision.fechaLimite,
          status: resolved ? "resuelto" : "abierto",
          createdAt: review.closedAt!,
          resolvedAt: resolved ? iso(decision.fechaLimite, "11:00") : null,
        });
      }
      if (status === "cerrada" && decision?.type === "proponer_cambio" && decision.validacionAsesor !== "validada") {
        const resolved = offset <= -2;
        pendings.push({
          id: `pen-${String(++pendingSeq).padStart(3, "0")}`,
          clientId: client.id,
          reviewId: review.id,
          origin: "propuesta",
          description: "Obtener validación del asesor sobre la propuesta de cambio.",
          dueDate: addDays(workDate, 7),
          status: resolved ? "resuelto" : "abierto",
          createdAt: review.closedAt!,
          resolvedAt: resolved ? iso(addDays(workDate, 6), "11:00") : null,
        });
      }
    }
  }

  // Garantiza casos visibles para "hoy" en la demo.
  const open = pendings.filter((p) => p.status === "abierto");
  if (!open.some((p) => p.dueDate === today) && open[0]) open[0].dueDate = today;

  const followUps: FollowUp[] = [];
  const currentClosed = reviews.filter((r) => r.month === currentMonth && r.status === "cerrada");
  const proposalReviews = currentClosed.filter((r) => r.decision?.type === "proponer_cambio").slice(0, 3);
  proposalReviews.forEach((rev, idx) =>
    followUps.push({
      id: `seg-${String(followUps.length + 1).padStart(3, "0")}`,
      clientId: rev.clientId,
      title: "Repasar propuesta de cambio con el asesor",
      link: { kind: "propuesta", reviewId: rev.id },
      date: addDays(today, idx + 1),
      time: idx % 2 === 0 ? "10:00" : "15:30",
      durationMinutes: 30,
      timezone: BA_TZ,
      createdAt: iso(today, "08:00"),
    }),
  );
  open.slice(0, 3).forEach((p, idx) =>
    followUps.push({
      id: `seg-${String(followUps.length + 1).padStart(3, "0")}`,
      clientId: p.clientId,
      title: "Seguimiento de pendiente abierto",
      link: { kind: "pendiente", pendingId: p.id },
      date: addDays(today, idx + 2),
      time: "11:00",
      durationMinutes: 45,
      notes: "Recordatorio DEMO.",
      timezone: BA_TZ,
      createdAt: iso(today, "08:00"),
    }),
  );

  return {
    advisors: ADVISORS,
    clients,
    positions,
    marketView: { id: "vision-amauta", name: "Visión de mercado Amauta (DEMO)", versions },
    reviews,
    pendings,
    drafts: [],
    followUps,
  };
}

