import { createFileRoute } from '@tanstack/react-router';
import { PageHeader, SectionCard } from '@/components/PageHeader';

export const Route = createFileRoute('/configuracion')({ component: Configuration });
function Configuration() {
  return <><PageHeader title="Configuración" description="Estado real de este entorno de desarrollo" />
    <SectionCard title="Conexiones"><dl className="grid gap-4">{[
      ['Datos','Adaptador Supabase; requiere inicio de sesión autorizado'],
      ['Supabase','Tablas agenda_*; revisiones en curso y borradores persistidos, con políticas de acceso'],
      ['Google Drive','No conectado'],['Gmail','No conectado; envío de mensajes no implementado'],
      ['Google Calendar','No conectado; no se crean eventos'],['Publicación','Pendiente de publicación y prueba de acceso en el entorno final'],
    ].map(([name,value])=><div key={name}><dt className="font-semibold">{name}</dt><dd className="text-muted-foreground">{value}</dd></div>)}</dl></SectionCard>
  </>;
}
