# Conectar Google Workspace a Agenda Amauta

La app permite ingresar con Google y conserva el código por correo como alternativa. La conexión de Google se autoriza por separado, desde la cuenta laboral. No se necesitan Client Secrets en el navegador.

## Configuración inicial en Google Cloud

1. Abrir https://console.cloud.google.com/ con la cuenta corporativa. Usar un proyecto propiedad de la organización Amauta.
2. Habilitar Google Drive API, Gmail API, Google Calendar API y Google Picker API.
3. En Google Auth Platform, configurar la aplicación como interna si el proyecto pertenece al Workspace. La conexión de servicios es para cuentas @amautainversiones.com; el acceso alternativo a Agenda se administra por separado.
4. Crear un cliente OAuth de tipo Aplicación web. Autorizar este origen JavaScript exacto: https://agenda-amauta.vercel.app . Workspace usa Google Identity Services con un código de autorización en ventana emergente. El servidor intercambia ese código; el Client Secret nunca se envía al navegador. Para el ingreso a Agenda mediante Supabase, conservar también su callback OAuth autorizado.
5. Configurar los permisos solicitados: openid, email, profile, drive.file, gmail.compose y calendar.events.owned. El administrador de Workspace puede necesitar habilitar la aplicación.
6. Preparar una clave pública de navegador para Google Picker. Restringirla a Google Picker API y Google Drive API, y a los referentes de Agenda y https://docs.google.com/*, según la documentación de Picker. No reutilizar una clave de servidor ni una clave sin restricciones.
7. Copiar Client ID, número de proyecto y clave del selector en Configuración de Agenda. No copiar Client Secret. Esos valores son configuración pública del navegador. Para disponer de la misma configuración en todas las PCs, definir VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_PROJECT_NUMBER y VITE_GOOGLE_PICKER_KEY en el proyecto Vercel agenda-amauta y volver a publicar.

## Uso

- Ingresar a Agenda con Google o con el código recibido por correo.
- Conectar Google Workspace y elegir la cuenta laboral. Revisar y aceptar los permisos en Google.
- Drive: seleccionar un PDF o subirlo. Los archivos nuevos conservan la privacidad predeterminada de Drive; la app no crea permisos públicos.
- El importador lee PDF de Balanz con texto en el navegador y completa un detalle editable. Guardar exige confirmar cliente y fecha. Un PDF escaneado o de formato no reconocido requiere carga manual. La conciliación muestra diferencias; no las completa con saldos inventados.
- Gmail: generar y revisar el borrador, guardar en Agenda y en Gmail. Las siguientes guardas actualizan el mismo borrador cuando se conserva su referencia. Agenda no implementa métodos de envío. gmail.compose es un permiso de Google que incluye envío, aunque la app solo usa borradores.
- Calendar: preparar un bloque con varias carteras o un seguimiento de una propuesta o pendiente. Revisar fecha, hora y duración, consultar superposiciones y confirmar. Se utiliza el calendario principal de la cuenta laboral, sin invitados y con visibilidad privada.
- El acceso se recupera al reabrir Agenda y se renueva automáticamente antes de vencer. Sólo se solicita autorización si se pierde, se revoca o vence el permiso renovable. Cada navegador o equipo necesita la autorización inicial. Los datos y referencias ya guardados se conservan.

## Estado y pruebas

Los permisos y las APIs deben probarse en el Workspace real después de configurar el proyecto. Que un botón esté implementado no demuestra que Google haya autorizado la conexión.

El access token temporal se mantiene sólo en memoria. La autorización renovable se conserva cifrada con AES-GCM en una cookie __Host-, HttpOnly, Secure y SameSite=Strict, vinculada al ID de la cuenta de Agenda. No se escribe en Supabase ni en localStorage. Cerrar sesión borra el access token de la memoria; al volver con la misma cuenta se recupera la conexión de este navegador. Desconectar Workspace elimina también la cookie local, sin revocar las autorizaciones de otros equipos.

El endpoint POST /api/google-workspace comprueba origen exacto, cabecera propia, sesión verificada por Supabase y acceso owner activo en agenda_access. Verifica que Google devuelva la misma cuenta laboral autorizada. Las respuestas no se cachean. El refresh token no aparece en JSON, bundles ni logs. No se modifica el esquema de la base.

## Configuración privada del servidor en Vercel

- GOOGLE_WORKSPACE_CLIENT_SECRET: secreto del cliente OAuth existente, marcado como Sensitive y sin prefijo VITE_.
- GOOGLE_WORKSPACE_COOKIE_KEY: 32 bytes aleatorios en base64url, Sensitive. Conservar esta clave entre publicaciones; cambiarla invalida las conexiones guardadas.
- GOOGLE_WORKSPACE_ORIGIN: https://agenda-amauta.vercel.app. Los previews no reciben estas credenciales ni comparten cookies de producción.

No copiar esas claves a archivos versionados. El usuario debe autorizar una vez la nueva conexión después de pasar del modelo temporal al renovable. Las pruebas de código no sustituyen esa autorización real.
