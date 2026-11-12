# Conectar Google Workspace a Agenda Amauta

La app conserva su acceso por código de correo. La conexión de Google se autoriza por separado, desde la cuenta laboral. No se necesitan Client Secrets en el navegador.

## Configuración inicial en Google Cloud

1. Abrir https://console.cloud.google.com/ con la cuenta corporativa. Usar un proyecto propiedad de la organización Amauta.
2. Habilitar Google Drive API, Gmail API, Google Calendar API y Google Picker API.
3. En Google Auth Platform, configurar la aplicación como interna si el proyecto pertenece al Workspace. La conexión de servicios es para cuentas @amautainversiones.com; el acceso alternativo a Agenda se administra por separado.
4. Crear un cliente OAuth de tipo Aplicación web. Autorizar este origen JavaScript exacto: https://agenda-amauta.vercel.app . La integración usa Google Identity Services en ventana emergente. No usa un Client Secret ni un callback de servidor.
5. Configurar los permisos solicitados: openid, email, profile, drive.file, gmail.compose y calendar.events.owned. El administrador de Workspace puede necesitar habilitar la aplicación.
6. Preparar una clave pública de navegador para Google Picker. Restringirla a Google Picker API y a los referentes de Agenda y https://docs.google.com/*, según la documentación de Picker. No reutilizar una clave de servidor ni una clave sin restricciones.
7. Copiar Client ID, número de proyecto y clave del selector en Configuración de Agenda. No copiar Client Secret. Esos valores son configuración pública del navegador. Para disponer de la misma configuración en todas las PCs, definir VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_PROJECT_NUMBER y VITE_GOOGLE_PICKER_KEY en el proyecto Vercel agenda-amauta y volver a publicar.

## Uso

- Ingresar a Agenda con el código recibido por correo.
- Conectar Google Workspace y elegir la cuenta laboral. Revisar y aceptar los permisos en Google.
- Drive: seleccionar un PDF o subirlo. Los archivos nuevos conservan la privacidad predeterminada de Drive; la app no crea permisos públicos.
- El importador lee PDF de Balanz con texto en el navegador y completa un detalle editable. Guardar exige confirmar cliente y fecha. Un PDF escaneado o de formato no reconocido requiere carga manual. La conciliación muestra diferencias; no las completa con saldos inventados.
- Gmail: generar y revisar el borrador, guardar en Agenda y en Gmail. Las siguientes guardas actualizan el mismo borrador cuando se conserva su referencia. Agenda no implementa métodos de envío. gmail.compose es un permiso de Google que incluye envío, aunque la app solo usa borradores.
- Calendar: preparar un bloque con varias carteras o un seguimiento de una propuesta o pendiente. Revisar fecha, hora y duración, consultar superposiciones y confirmar. Se utiliza el calendario principal de la cuenta laboral, sin invitados y con visibilidad privada.
- Si Google vence o cierra la autorización de sesión, volver a conectar desde el botón. Los datos y las referencias ya guardadas en Agenda se conservan.

## Estado y pruebas

Los permisos y las APIs deben probarse en el Workspace real después de configurar el proyecto. Que un botón esté implementado no demuestra que Google haya autorizado la conexión.

Las autorizaciones temporales de Google se mantienen solo en memoria. No se escriben en Supabase ni en localStorage. Se borran al cerrar sesión o desconectar. Los IDs de borradores y eventos se conservan en los registros existentes de Agenda; no se cambió el esquema de la base.
