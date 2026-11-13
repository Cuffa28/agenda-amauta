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


## Acceso sin contraseña

El ingreso principal usa el código enviado al correo existente del usuario (signInWithOtp + verifyOtp). El código no se registra ni se conserva luego de verificarlo. Las cuentas habilitadas se controlan en agenda_access mediante RLS. La plantilla de correo del proyecto debe incluir {{ .Token }}. Las cuentas nuevas se habilitan desde Supabase; el formulario no crea usuarios automáticamente.


## Google Workspace y seguimiento

Ver GOOGLE_WORKSPACE.md para autorizar los servicios en el proyecto corporativo. La ficha incluye PDF en Drive, importador de posiciones Balanz para revisar, plan de rotación por moneda, historial de posiciones y avances de propuesta. Gmail conserva borradores editables; Calendar prepara bloques o seguimientos y crea eventos solo con confirmación. Las pruebas de API reales requieren completar la configuración y autorizar Google.


## Flujo de revisión y borradores

- La ficha carga sus consultas independientes en paralelo; posiciones, revisiones, pendientes y correos se filtran por cliente. La navegación reutiliza datos durante un minuto y actualiza en segundo plano cuando corresponde.
- Iniciar revisión muestra progreso y abre el formulario con la respuesta persistida, sin esperar una recarga global. Reintentar recupera la revisión existente. Los inicios concurrentes usan un identificador estable por cliente y mes.
- El borrador se prepara al abrir la revisión con el correo asignado al asesor. El asunto incluye cartera, identificador y mes. Los cambios guardados en la decisión marcan el texto como desactualizado hasta regenerarlo explícitamente.
- «Copiar para este chat» copia destinatario, asunto y cuerpo editado. No envía ni crea un correo externo. El usuario lo pega en su chat y solicita la revisión o el envío. La cuenta conectada al chat es independiente de la conexión Google de Agenda.
- «Guardar borrador en Gmail» conserva el consentimiento Google existente y requiere la configuración OAuth descrita en GOOGLE_WORKSPACE.md. La app no envía mensajes.
- Los correos de asesores se guardan en agenda_clients, fuera del código público, y se pueden modificar desde Editar ficha.

Una revisión iniciada por prueba se puede cerrar vacía: se archiva sin crear una revisión completada ni sumar cobertura. Se puede iniciar otra vez. Si ya tiene una decisión, un pendiente, un seguimiento o un correo guardado, se conserva el flujo habitual. Las posiciones y los PDFs se conservan.
