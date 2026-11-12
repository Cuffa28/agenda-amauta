import { createFileRoute } from '@tanstack/react-router';
import { PageHeader, SectionCard } from '@/components/PageHeader';
import { GoogleConnection, useGoogleWorkspace } from '@/integrations/google/GoogleConnection';
export const Route=createFileRoute('/configuracion')({ssr:false,component:Configuration});
function Configuration(){const google=useGoogleWorkspace();return <><PageHeader title="Configuración" description="Acceso y conexiones de Agenda Amauta"/><GoogleConnection showSetup/>
<SectionCard title="Estado de los servicios"><dl className="mt-4 grid gap-3">{[
['Agenda','Datos reales en Supabase; acceso con código al correo autorizado.'],
['Google Drive',google.connected?'Conectado: selección y carga de PDF.':'Pendiente de conexión a la cuenta laboral. Los enlaces ya guardados se conservan.'],
['Gmail',google.connected?'Conectado: guardar o actualizar borradores; vos revisás y enviás desde Gmail.':'Pendiente de conexión. Los borradores de Agenda se conservan.'],
['Google Calendar',google.connected?'Conectado: vista previa, control de superposiciones y creación confirmada en tu calendario principal.':'Pendiente de conexión. Podés preparar bloques y seguimientos.'],
['Publicación','Aplicación publicada en Vercel. El estado conectado se comprueba por sesión y no indica una prueba real hasta autorizar Google.']
].map(([name,value])=><div key={name}><dt className="font-semibold">{name}</dt><dd className="text-sm text-muted-foreground">{value}</dd></div>)}</dl></SectionCard></>;}
