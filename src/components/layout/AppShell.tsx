import { Link } from "@tanstack/react-router";
import { CalendarClock, LayoutDashboard, LineChart, Menu, Settings, Users } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { to: "/", label: "Resumen", icon: LayoutDashboard, exact: true },
  { to: "/clientes", label: "Clientes", icon: Users, exact: false },
  { to: "/vision-mercado", label: "Visión de mercado", icon: LineChart, exact: false },
  { to: "/seguimientos", label: "Seguimientos", icon: CalendarClock, exact: false },
  { to: "/configuracion", label: "Configuración", icon: Settings, exact: false },
] as const;

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 place-items-center rounded-md bg-sidebar-primary font-mono text-base font-semibold text-sidebar-primary-foreground">
        A
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-sidebar-accent-foreground">
          Amauta
        </div>
        <div className="text-xs text-sidebar-muted">Agenda de revisiones</div>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Principal">
      {NAV.map(({ to, label, icon: Icon, exact }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          activeOptions={{ exact, includeSearch: false }}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          activeProps={{
            className:
              "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--sidebar-primary)]",
          }}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function DemoBanner() {
  if (import.meta.env['VITE_AGENDA_MODE'] !== "demo") return <div className="border-b px-4 py-2 text-xs text-muted-foreground">Agenda interna · Datos persistidos en Supabase · Google Workspace pendiente de conectar</div>;
  return (
    <div className="demo-stripe border-b border-warning/50 px-4 py-2 text-xs text-warning-foreground lg:px-8">
      <span className="font-mono font-semibold tracking-widest">DEMO</span>
      <span className="mx-2">·</span>
      Datos sintéticos en la memoria de esta pestaña: se pierden al recargar. Sin base de datos ni
      integraciones conectadas.{" "}
      <Link to="/configuracion" className="font-medium underline underline-offset-2">
        Ver estado
      </Link>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-8 border-r border-sidebar-border bg-sidebar px-4 py-6 lg:flex">
        <Brand />
        <NavLinks />
        <div className="mt-auto rounded-md border border-sidebar-border px-3 py-3 text-xs text-sidebar-muted">
          Uso interno · Entorno de desarrollo
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between bg-sidebar px-4 py-3 lg:hidden">
          <Brand />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Abrir menú"
                className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-4">
              <SheetHeader className="mb-6 text-left">
                <SheetTitle className="sr-only">Navegación</SheetTitle>
                <Brand />
              </SheetHeader>
              <NavLinks onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>
        <DemoBanner />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

