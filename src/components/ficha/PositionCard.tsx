import { PdfAttachment } from "./PdfAttachment";

import { DisconnectedAction } from "@/components/DisconnectedAction";
import { SectionCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/domain/dates";
import { formatMoney, formatNumber } from "@/domain/format";
import { reconcilePosition } from "@/domain/reconciliation";
import type { Position } from "@/domain/schemas";

export function PositionCard({ position }: { position: Position | null }) {
  if (!position) {
    return (
      <SectionCard title="Posición">
        <p className="text-sm text-muted-foreground">No hay posición cargada para esta cartera.</p>
      </SectionCard>
    );
  }
  const rec = reconcilePosition(position);
  const items = [...position.items].sort((a, b) => a.currency.localeCompare(b.currency) || b.marketValue - a.marketValue);

  return (
    <SectionCard
      title="Posición"
      description={<>{position.alyc} · corte al <span className="font-mono">{formatDate(position.cutoffDate)}</span></>}
    >
      <div className="mb-5"><PdfAttachment position={position}/></div>

      {position.sourceNote && <p className="mb-5 rounded border border-warning p-3 text-sm">{position.sourceNote}</p>}
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        {rec.map((r) => (
          <div key={r.currency} className="rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground">{r.currency}</span>
              {r.reconciled ? (
                <Badge variant="success">Conciliado</Badge>
              ) : (
                <Badge variant="danger">{r.declared === null ? "Sin total declarado" : "Diferencia"}</Badge>
              )}
            </div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums">{formatMoney(r.computed, r.currency)}</div>
            <dl className="mt-2 grid grid-cols-2 gap-1 text-xs">
              <dt className="text-muted-foreground">Declarado en PDF</dt>
              <dd className="text-right font-mono tabular-nums">{r.declared === null ? "—" : formatMoney(r.declared, r.currency)}</dd>
              <dt className="text-muted-foreground">Diferencia</dt>
              <dd className={`text-right font-mono tabular-nums ${r.reconciled ? "" : "font-semibold text-destructive"}`}>
                {r.difference === null ? "—" : formatMoney(r.difference, r.currency)}
              </dd>
            </dl>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader className="bg-table-head">
            <TableRow>
              <TableHead>Instrumento</TableHead>
              <TableHead className="hidden sm:table-cell">Ticker</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead className="hidden text-right md:table-cell">Cantidad</TableHead>
              <TableHead className="hidden text-right md:table-cell">Precio</TableHead>
              <TableHead className="text-right">Valuación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it) => (
              <TableRow key={it.id}>
                <TableCell className="font-medium">{it.instrument}</TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">{it.ticker ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{it.currency}</TableCell>
                <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">{formatNumber(it.quantity, 0)}</TableCell>
                <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">{formatNumber(it.price)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatMoney(it.marketValue, it.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

