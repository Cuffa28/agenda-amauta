import { Link } from '@tanstack/react-router';
import { ArrowUpRight, CalendarClock, LayoutDashboard, LineChart, Menu, Settings2, UsersRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { AmautaBrand } from '@/components/AmautaBrand';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useGoogleWorkspace } from '@/integrations/google/GoogleConnection';

const NAV = [
  { to: '/', label: 'Mi agenda', icon: LayoutDashboard, exact: true },
  { to: '/clientes', label: 'Carteras', icon: UsersRound, exact: false },
  { to: '/vision-mercado', label: 'Visión de mercado', icon: LineChart, exact: false },
  { to: '/seguimientos', label: 'Seguimientos', icon: CalendarClock, exact: false },
  { to: '/configuracion', label: 'Conexiones', icon: Settings2, exact: false },
] as const;
function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <nav className="workspace-nav" aria-label="Principal">{NAV.map(({ to, label, icon: Icon, exact }) => <Link
    key={to} to={to} onClick={onNavigate} activeOptions={{ exact, includeSearch: false }}
    className="workspace-nav-link" activeProps={{ className: 'nav-is-active' }}>
    <Icon size={18} strokeWidth={1.6}/><span>{label}</span><span className="nav-active-dot"/>
  </Link>)}</nav>;
}
export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const google = useGoogleWorkspace();
  const date = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const demo = import.meta.env['VITE_AGENDA_MODE'] === 'demo';
  return <div className="workspace-shell">
    <aside className="workspace-sidebar">
      <Link to="/" className="sidebar-brand" aria-label="Amauta · Ir a mi agenda"><AmautaBrand dark/></Link>
      <div className="sidebar-edition"><span>AGENDA</span><span>Tu mesa de inversión</span></div>
      <div className="sidebar-nav-label">ESPACIO DE TRABAJO</div>
      <NavLinks/>
      <div className="sidebar-note"><span className="sidebar-note-line"/><p>Una decisión clara.<br/>Un seguimiento a tiempo.</p></div>
      <div className="sidebar-profile"><span className="profile-avatar">FA</span><div><strong>Facundo Argañaraz</strong><span>Análisis & carteras</span></div></div>
      <div className="sidebar-footer">AMAUTA INVERSIONES <span>·</span> ESPACIO PRIVADO</div>
    </aside>
    <div className="workspace-main">
      <header className="workspace-topbar">
        <div className="mobile-navigation"><Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Abrir menú"><Menu/></Button></SheetTrigger><SheetContent side="left" className="mobile-sheet"><SheetHeader><SheetTitle className="sr-only">Navegación</SheetTitle><AmautaBrand dark/></SheetHeader><NavLinks onNavigate={() => setOpen(false)}/></SheetContent></Sheet></div>
        <div className="topbar-context"><span className="topbar-dot"/><span>Agenda Amauta</span><span className="topbar-divider">/</span><span className="topbar-date">{date}</span></div>
        <Link to="/configuracion" className={`workspace-connection ${google.connected ? 'connection-active' : ''}`}><span/>{google.connected ? 'Google conectado' : 'Conectar Google'}<ArrowUpRight size={13}/></Link>
      </header>
      {demo && <div className="workspace-demo">VISTA DE PRUEBA · Datos sintéticos. Los cambios de esta pestaña se reinician al recargar.</div>}
      <main className="workspace-content">{children}</main>
      <footer className="workspace-footer"><span>Agenda Amauta</span><span>Criterio, continuidad y una mirada propia.</span></footer>
    </div>
  </div>;
}
