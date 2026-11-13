import { createFileRoute } from '@tanstack/react-router';
import { CalendarDays, FolderOpen, LockKeyhole, Mail } from 'lucide-react';
import { PageHeader, SectionCard } from '@/components/PageHeader';
import { GoogleConnection, useGoogleWorkspace } from '@/integrations/google/GoogleConnection';
export const Route = createFileRoute('/configuracion')({ ssr: false, component: Configuration });
function Configuration() {
  const google = useGoogleWorkspace();
  return <><PageHeader eyebrow="Tu entorno de trabajo" title="Tus conexiones" description="La información y las herramientas que acompañan cada revisión."/>
    <GoogleConnection showSetup/>
    <div className="service-grid">{[
      { title:'Google Drive',icon:FolderOpen,body:'La posición original, siempre a mano. Elegí o cargá el PDF desde tu Drive laboral.' },
      { title:'Gmail',icon:Mail,body:'Tu criterio, listo para conversar. Prepará un borrador editable para el asesor y revisalo antes de enviarlo.' },
      { title:'Google Calendar',icon:CalendarDays,body:'Un momento para cada próximo paso. Reservá bloques de revisión y seguimientos, con vista previa y sin invitados.' },
    ].map(({title,icon:Icon,body})=><section className="surface-card service-card" key={title}><span className="service-icon"><Icon size={21} strokeWidth={1.5}/></span><h2>{title}</h2><p>{body}</p><div className={`service-state ${google.connected?'connected':''}`}><span/>{google.connected?'Cuenta laboral conectada':'Pendiente de autorización'}</div></section>)}</div>
    <SectionCard title="Un espacio privado, con continuidad" actions={<LockKeyhole size={17} className="text-muted-foreground"/>}><p className="text-sm text-muted-foreground">{import.meta.env['VITE_AGENDA_MODE']==='demo'?'Estás en una demostración con datos sintéticos; los cambios se reinician al recargar.':'Las revisiones, los borradores y los pendientes se conservan al volver a entrar. El acceso a Agenda es para las cuentas autorizadas; Google se conecta por separado con tu cuenta laboral.'}</p><p className="mt-3 text-xs text-muted-foreground">La conexión a Google puede requerir una nueva autorización al vencer la sesión. Los enlaces, las decisiones y los seguimientos guardados permanecen en Agenda.</p></SectionCard>
  </>;
}
