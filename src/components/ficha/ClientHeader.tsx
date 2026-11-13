import { Pencil } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/Field";
import { DemoBadge, PortfolioStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRepoMutation } from "@/data/use-repo-mutation";
import type { PortfolioMonthStatus } from "@/domain/coverage";
import { formatDate } from "@/domain/dates";
import { clientUpdateSchema, issuesToFieldErrors, SEGMENTS, type Advisor, type Client, type Segment } from "@/domain/schemas";

export function ClientHeader({
  client,
  advisor,
  advisors,
  status,
}: {
  client: Client;
  advisor: Advisor | undefined;
  advisors: Advisor[];
  status: PortfolioMonthStatus;
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-primary px-2 py-0.5 font-mono text-sm font-medium text-primary-foreground" title="ID estable">
              {client.id}
            </span>
            {client.isDemo && <DemoBadge />}
            <PortfolioStatusBadge status={status.status} overdue={status.isOverdue} />
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">{client.name}</h1>
          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-4">
            <Item label="Segmento" value={client.segment} />
            <Item label="Sector" value={client.sector ?? "Sin sector"} muted={!client.sector} />
            <Item label="Asesor" value={advisor?.name ?? "—"} sub={advisor?.email} />
            <Item label="Vencimiento del mes" value={formatDate(status.dueDate)} mono />
          </dl>
        </div>
        <ClientEditDialog client={client} advisors={advisors} />
      </div>
    </div>
  );
}

function Item({ label, value, sub, mono, muted }: { label: string; value: string; sub?: string | undefined; mono?: boolean; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 truncate font-medium ${mono ? "font-mono tabular-nums" : ""} ${muted ? "text-muted-foreground" : "text-foreground"}`}>
        {value}
      </dd>
      {sub && <dd className="truncate text-xs text-muted-foreground">{sub}</dd>}
    </div>
  );
}

function ClientEditDialog({ client, advisors }: { client: Client; advisors: Advisor[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(client.name);
  const [segment, setSegment] = useState<Segment>(client.segment);
  const [sector, setSector] = useState(client.sector ?? "");
  const [advisorId, setAdvisorId] = useState(client.advisorId);
  const [advisorName,setAdvisorName]=useState(advisors.find(a=>a.id===client.advisorId)?.name??"");
  const [advisorEmail,setAdvisorEmail]=useState(advisors.find(a=>a.id===client.advisorId)?.email??"");
  const [reviewDay,setReviewDay]=useState(client.reviewDay);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useRepoMutation(
    (repo, patch: Parameters<typeof repo.updateClient>[1]) => repo.updateClient(client.id, patch),
    { invalidate: ["clients", "advisors", "drafts"], success: "Ficha actualizada", onSuccess: () => setOpen(false) },
  );

  const submit = () => {
    const parsed = clientUpdateSchema.safeParse({ name, segment, sector: sector.trim() || undefined, advisorId, advisorName: advisorName === "Sin asignar" ? "" : advisorName, advisorEmail, reviewDay, expectedUpdatedAt:client.updatedAt });
    if (!parsed.success) return setErrors(issuesToFieldErrors(parsed.error));
    setErrors({});
    mutation.mutate(parsed.data);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setName(client.name);
          setSegment(client.segment);
          setSector(client.sector ?? "");
          setAdvisorId(client.advisorId);
          setAdvisorName(advisors.find(a=>a.id===client.advisorId)?.name??"");setAdvisorEmail(advisors.find(a=>a.id===client.advisorId)?.email??"");setReviewDay(client.reviewDay);
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil />Editar ficha</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar ficha {client.id}</DialogTitle>
          <DialogDescription>El ID es estable y no se puede modificar.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="ID" hint="Texto con ceros iniciales">
            <Input value={client.id} disabled className="font-mono" />
          </Field>
          <Field label="Nombre" htmlFor="c-name" error={errors["name"]}>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Segmento" error={errors["segment"]}>
              <Select value={segment} onValueChange={(v) => setSegment(v as Segment)}>
                <SelectTrigger aria-label="Segmento"><SelectValue /></SelectTrigger>
                <SelectContent>{SEGMENTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Sector (opcional)" htmlFor="c-sector" error={errors["sector"]}>
              <Input id="c-sector" value={sector} onChange={(e) => setSector(e.target.value)} />
            </Field>
          </div>
          <Field label="Asesor" error={errors["advisorId"]}>
            <Select value={advisorId} onValueChange={id=>{setAdvisorId(id);const a=advisors.find(a=>a.id===id);setAdvisorName(a?.name??"");setAdvisorEmail(a?.email??"");}}>
              <SelectTrigger aria-label="Asesor"><SelectValue /></SelectTrigger>
              <SelectContent>
                {advisors.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {a.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Nombre del asesor"><Input value={advisorName} onChange={e=>setAdvisorName(e.target.value)}/></Field>
          <Field label="Correo del asesor" error={errors["advisorEmail"]}><Input type="email" value={advisorEmail} onChange={e=>setAdvisorEmail(e.target.value)}/></Field>
          <Field label="Día de revisión mensual" hint="0 significa sin programar"><Input type="number" min="0" max="31" value={reviewDay} onChange={e=>setReviewDay(Number(e.target.value))}/></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={mutation.isPending}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

