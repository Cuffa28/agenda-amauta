# Agenda Amauta

Aplicación interna de revisión mensual de carteras. React y TanStack Start; Supabase Auth y tablas agenda_* con RLS. El CRM existente no se modifica.

## Desarrollo

Copiar `.env.example` a `.env.local` y completar únicamente la URL de Supabase y su clave publicable. Nunca usar claves secretas o service_role en VITE_*. La demo sintética se habilita solo con `VITE_AGENDA_MODE=demo`.

```
npm ci
npm run dev
npx tsc --noEmit
npm test
npm run build
```

Los PDF y datos de clientes pertenecen a Drive y Supabase, no al repositorio. El acceso se controla en Supabase Auth y en las políticas RLS de agenda_access.

## Publicación

El adaptador Nitro genera la salida para Vercel. Configurar VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en el proyecto, conservar VITE_GOOGLE_AUTH_ENABLED=false hasta habilitar el proveedor Google. Autorizar el dominio de la app en las redirecciones de Supabase Auth sin quitar otros dominios existentes.
