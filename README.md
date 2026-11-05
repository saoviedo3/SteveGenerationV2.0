# Steve Generation

Aplicación web en español para convertir recursos de **Network Inventory** en documentos TXT de configuración **Cisco · NNI3 CARMEN, NNI2 MAPASINGUE y NNI PORTOVIEJO**. Importa un archivo, completa el enlace, revisa y descarga encabezado, etiqueta ZTE, script y validaciones.

## Funciones

- DATOS BGP, DATOS estático, INTERNET BGP e INTERNET estático en NNI3 CARMEN, NNI2 MAPASINGUE y NNI PORTOVIEJO: doce plantillas.
- Enlace único, principal (PPL) y respaldo (BCK); medio óptico o eléctrico.
- Importación `.txt` por archivo, arrastre o texto pegado. UTF-8 y Windows-1252; máximo 256 KB. El archivo original se procesa en el navegador y no se sube al servidor.
- Validación de VLAN, ASN, IPv4, redes CIDR y las cuatro direcciones de una WAN `/30`.
- Vista previa de documento, script PE y validaciones; copia y descarga TXT con saltos CRLF.
- Usuario y contraseña; administrador para crear usuarios, restablecer contraseñas y activar/desactivar cuentas. Cada persona puede cambiar su propia contraseña.
- Enlace opcional a la ingeniería, debajo del título del TXT. Se admite HTTP/HTTPS y se conserva el enlace completo con sus parámetros.
- Historial privado: los últimos **100 documentos por usuario**. Descargar guarda el documento; copiar no lo guarda. Se pueden consultar, descargar y eliminar documentos.

Juniper, scripts ZTE y soluciones GPON y NNI2 CARMEN **todavía no están implementados**. La etiqueta ZTE es un recurso de texto, no una configuración de ese fabricante. La aplicación no se conecta a equipos ni ejecuta comandos.

## Desarrollo local

Requisitos: Node.js 24 y npm. Cada tarea en la nube ya está aislada; usa el checkout existente, sin crear worktrees salvo petición explícita.

```bash
cd /workspace/SteveGenerationV2.0
npm ci
npm run db:migrate
npm run admin:create -- --local --username root
npm run dev
```

El comando de administrador solicita una contraseña de 4 a 128 caracteres **sin mostrarla**. No hay usuarios ni contraseñas predeterminados. También acepta `ADMIN_PASSWORD` desde el entorno para automatización segura; no guardes su valor en Git ni lo escribas en argumentos del comando. Si el usuario ya existe, el comando falla sin sobrescribirlo.

En Windows puedes usar PowerShell. Los scripts ejecutan el archivo JavaScript de Wrangler con Node, sin depender de archivos `.bin` específicos de Linux ni de comandos de shell para pasar argumentos. También se admiten rutas con espacios, como las de OneDrive. La integración de GitHub está configurada para ejecutar las pruebas tanto en Windows como en Linux.

Si instalaste la primera versión y `admin:create` solo muestra «No se creó el administrador» sin salida previa de Wrangler, actualiza tu checkout conservando tus cambios locales:

```powershell
git switch codex/steve-generation-v1
git pull --ff-only
npm ci
npm run db:migrate
npm run admin:create -- --local --username root
npm run dev
```

La actualización conserva `.wrangler/state` y no reinicia tu base. Si Git indica cambios locales incompatibles, no los descartes; resuélvelos antes de continuar. No se necesita `npm audit fix --force`: el proyecto fija una versión actualizada de Wrangler con sus dependencias corregidas. Los avisos de npm sobre `install-scripts` son distintos de un error al ejecutar el script; puedes revisar los paquetes con `npm install-scripts ls` si tu versión de npm lo admite.

Wrangler indica el puerto del servidor (normalmente 8787). Entra con la cuenta creada y pulsa **Cargar ejemplo** para probar las variantes. La base local permanece en `.wrangler/state`; es independiente de producción. Los procesos deben iniciarse de nuevo en cada máquina.

## Reglas de NNI3 CARMEN

| Recurso | Regla |
| --- | --- |
| Interfaz | `TenGigE0/2/1/2` |
| Subinterfaz DATOS / INTERNET | `10` / `30` seguido de la VLAN |
| ASN local | `19114` |
| WAN | `/30`, máscara `255.255.255.252`; PE y CLIENTE se identifican por su rol |
| VRF DATOS | Indicada por el usuario o importada |
| VRF INTERNET | `internet-pccs-ncb`, fija |
| Loopback DATOS | Obligatoria, `/32`; ruta estática en la VRF del enlace y validación en `sigmars` |
| Redes LAN | Opcionales; rutas estáticas hacia el CPE, también con BGP |
| DATOS BGP | `maximum-prefix 500 75`, `default_policy_pass_all` in/out, `as-override` |
| INTERNET estático | Rutas estáticas de las redes públicas hacia el CPE |
| INTERNET BGP | Prefix-set de redes públicas, política IN por enlace, `RP_internet-pccs-ncb_IPV4_OUT` OUT |
| Comunidades INTERNET BGP | `(19114:20, 19114:21, 19114:504)` |
| Preferencia/peso INTERNET BGP | `200` para único/PPL; `100` para BCK |
| INTERNET BGP | `maximum-prefix 100 75 warning-only`, `as-override`, `remove-private-AS` |
| Etiqueta | `CLIENTE_SUCURSAL_DAT/INT[_PPL/BCK]_ID:ACCESO:NNI3_CRM` |
| Última milla | Editable; se importa de las observaciones del TXT y usa `UM TIGO` como valor inicial si no viene |
| Medio óptico | `REQUIERE SFP 1000BASEBX` |
| Medio eléctrico | `REQUIERE CONVERSOR OPTICO/ELECTRICO` |

Las descripciones de las rutas estáticas (`description` en NNI3 y `name` en NNI2) se limitan a los primeros 30 caracteres del nombre normalizado de cliente y sucursal. Las descripciones de subinterfaces y las etiquetas conservan su nombre completo.

Las redes públicas de INTERNET se incluyen también en `SMTP-WHITELIST-NET` en un bloque separado para `IPTCHL1CAR201 - IPTCHL1CCRM01`. Ese bloque conserva `commit comment` según las plantillas. Revisa documento y equipo de destino antes de pegarlo. La aplicación no verifica que las VRF y políticas compartidas ya existan en la red real.

Cliente y sucursal se ingresan explícitamente. Importar un nuevo TXT borra los identificadores del enlace anterior (cliente, sucursal, IASI, OT, ID y enlace a la ingeniería), para evitar reutilizarlos por accidente. Los identificadores de configuración se normalizan a minúsculas sin acentos, con guiones bajos; la etiqueta usa mayúsculas. El bloque WAN conserva descripción original y nombre del PE, editables en **Etiquetas del bloque WAN**. Las redes LAN y públicas aceptan varias redes separadas por líneas, comas o punto y coma. Se aceptan espacios alrededor de la barra, como `200.7.198.88 /30`. Deben estar alineadas con su prefijo; se admite una ruta de host `/32`.

## Reglas de NNI2 MAPASINGUE

| Recurso | Regla |
| --- | --- |
| Interfaz | `TenGigabitEthernet1/1/1`; subinterfaz `10` + VLAN para DATOS y `30` + VLAN para INTERNET |
| Interfaz DATOS / INTERNET | `ip vrf forwarding` / `vrf forwarding`; `ip address` con máscara decimal |
| Protección IP | `no ip redirects` y `no ip proxy-arp` |
| DATOS | `route-map RM_<vrf>_connected permit 10` con `match interface` |
| Monitoreo DATOS | `ip route vrf ... <ip> 255.255.255.255 ... tag 10 name <máximo 30 caracteres>` |
| LAN | Rutas estáticas con máscara decimal, sin `tag 10`, también en enlaces BGP |
| DATOS BGP | ASN local `19114`, `address-family ipv4 vrf`, `activate`, `as-override`, `maximum-prefix 500` |
| INTERNET estático | Rutas de redes públicas con máscara decimal, sin tag |
| INTERNET BGP | `ip prefix-list PL_<nombre>_ALLOWED_IPV4` con secuencias 5, 10, 15… |
| Política de entrada | `route-map RM_internet-pccs-ncb_<nombre>_IPV4_IN permit 5` |
| Comunidades INTERNET BGP | `19114:20 19114:21 19114:504` |
| Preferencia y peso | `200` para único/PPL, `100` para BCK |
| Política de salida | `RM_internet-pccs-ncb_IPV4_OUT` |
| INTERNET BGP | `activate`, `remove-private-as`, `as-override`, `maximum-prefix 100` |
| Etiqueta | `CLIENTE_SUCURSAL_DAT/INT[_PPL/BCK]_ID:ACCESO:NNI2_MAP` |
| Validación de monitoreo | `sho route vrf sigmars` con la IP sin `/32` |

Se mantiene el orden `DAT_BCK`, `INT_BCK`, `DAT_PPL` e `INT_PPL` en las tres soluciones, según la confirmación del usuario. El tipo PPL/BCK aparece antes del servicio en el título. NNI2 no agrega comandos de `commit` al bloque PE; el bloque SMTP separado conserva su propia sintaxis.

## Reglas de NNI PORTOVIEJO

Portoviejo comparte las cuatro plantillas de CARMEN y utiliza `GigabitEthernet0/0/0/4` como interfaz base. Se selecciona desde **Solución** y se identifica como `NNI_PORT` en la etiqueta y el historial.

| Recurso | Regla |
| --- | --- |
| DATOS | Subinterfaz `10` + VLAN; VRF del enlace; loopback de monitoreo obligatoria |
| INTERNET | Subinterfaz `30` + VLAN; VRF fija `internet-pccs-ncb` |
| VLAN 3386 del ejemplo | `.103386` en DATOS y `.303386` en INTERNET |
| ASN local | `19114`, igual que CARMEN |
| BGP | Mismas políticas, comunidades, límites y preferencias de CARMEN; `200` para Internet único/PPL y `100` para BCK |
| Rutas estáticas | Cliente y sucursal normalizados; en enlaces PPL/BCK se reserva espacio para `_ppl` o `_bck` dentro del máximo de 30 caracteres |
| Etiqueta | `CLIENTE_SUCURSAL_DAT/INT[_PPL/BCK]_ID:ACCESO:NNI_PORT` |
| SMTP en INTERNET | Configuración en bloque separado y validación de `SMTP-WHITELIST-NET`, incluso para redes públicas `/32` |

Se usa el mismo cliente y sucursal del formulario para los nombres. No se agrega un campo abreviado ni se deducen siglas a partir del nombre completo. Para las rutas, se recorta el nombre cuando sea necesario; la etiqueta y la descripción de la subinterfaz conservan el nombre completo del enlace. Los nombres de las rutas de CARMEN y MAPASINGUE mantienen sus reglas anteriores.

Las decisiones confirmadas después del ejemplo prevalecen: Internet usa `.303386`, la descripción de ruta no incluye servicio ni ID y el documento sí lleva el bloque SMTP. Se conserva la estructura del script de CARMEN, incluido `show commit changes diff`.

**Cargar ejemplo** en Portoviejo prepara el caso de Internet estático con `20480Kbps`. No rellena ASN ni loopback de otras soluciones: si cambias a BGP o DATOS, debes completar los recursos correspondientes. Al importar un TXT con `AB: Kbps`, la aplicación avisa que falta el ancho de banda y bloquea la generación hasta que lo completes; no deduce la velocidad.

Esta incorporación usa la columna de solución existente y no requiere una migración adicional a `0002_history_solution.sql`. Los usuarios y documentos guardados se conservan.

### Actualizar una instalación existente

Detén el servidor con Ctrl+C antes de actualizar:

```powershell
git pull --ff-only
npm ci
npm run db:migrate
npm run dev
```

La migración `0002_history_solution.sql` agrega la solución al historial y asigna NNI3 CARMEN a los documentos anteriores. Conserva las cuentas, las contraseñas, las sesiones y los documentos. No vuelvas a crear `root` si ya existe. Los historiales nuevos muestran la solución y permiten buscar por ella.

## Pruebas

```bash
npm test
npm run check
npm run test:integration
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

- `test`: parser, las 36 combinaciones de solución/servicio/enrutamiento/tipo, redes, entradas inválidas y contraseñas.
- `check`: sintaxis y empaquetado con `wrangler deploy --dry-run`; no publica.
- `test:integration`: base temporal, migraciones, creación de administrador y Worker local. Comprueba autenticación, permisos, las doce variantes, aislamiento del historial, contraseñas, desactivación y límite de intentos. Limpia base y servidor al terminar.
- `test:browser`: flujo real en Chromium de escritorio/móvil, importación, variantes, descarga, historial, administración y errores JavaScript/CSP. Requiere Chromium instalado o `CHROMIUM_PATH`. Usa una base temporal. Capturas en `test-results/`, ignoradas por Git.

No requieren credenciales de Cloudflare. Estas pruebas no validan comandos contra un Cisco real.

## Publicar en Cloudflare Workers + D1

Un **Worker con assets estáticos** sirve web y API bajo el mismo origen; no requiere Pages separado. Se puede usar Workers Free y D1 Free sin servidor de pago, dentro de las cuotas de Cloudflare. Al superarlas, el servicio puede dejar de responder hasta reiniciarse la cuota. Esta configuración no contrata planes de pago ni garantiza uso ilimitado.

1. Crea una cuenta Cloudflare con Workers y D1 gratuitos. En una terminal autorizada:

   ```bash
   npx wrangler login
   npx wrangler d1 create steve-generation
   ```

2. Sustituye el `database_id` de ceros en `wrangler.jsonc` por el ID devuelto. Mantén el binding `DB` y nombre de la base. Ese ID es configuración, no una contraseña.

3. Prepara producción y crea tu administrador:

   ```bash
   npm run db:migrate:remote
   npm run admin:create -- --remote --username root
   ```

4. Publica:

   ```bash
   npm run deploy
   ```

5. Abre la dirección HTTPS asignada por Cloudflare, inicia sesión y crea las cuentas de tus compañeros en **Usuarios**. Las bases local y remota no comparten usuarios ni historial.

### Despliegue automático desde GitHub

`.github/workflows/ci.yml` ejecuta pruebas en pushes y pull requests. En un push a `main`, aplica migraciones y publica **solo si** están configurados estos secretos de GitHub Actions:

- `CLOUDFLARE_API_TOKEN`: token con permisos de edición de Workers Scripts y D1 para la cuenta elegida.
- `CLOUDFLARE_ACCOUNT_ID`: ID de esa cuenta.

Guárdalos en GitHub → Settings → Secrets and variables → Actions; nunca en archivos. Primero configura el `database_id`, la base y el administrador. Sin secretos se ejecuta CI y se omite el despliegue. El workflow no crea cuentas de Cloudflare ni planes de pago.

## Datos y acceso

Contraseñas con PBKDF2-SHA256 y salt aleatorio; sesiones de 256 bits cuyo hash se almacena en la base. Cookies HttpOnly, SameSite=Strict y Secure en HTTPS; vencen a las 8 horas. Cambiar estado o restablecer contraseña revoca las sesiones del usuario. La API comprueba el origen de las escrituras, vuelve a validar los recursos y limita intentos de login por usuario e IP.

El administrador gestiona cuentas; su historial también está limitado a sus propios documentos. Quien administre la base de Cloudflare sí tiene acceso técnico a sus registros. No se usa analítica ni se envían archivos a servicios externos.

## Estructura

```text
public/               Interfaz y generador compartido con el servidor
worker/               API, autenticación y acceso a D1
migrations/           Esquema SQL versionado
scripts/              Administrador y pruebas funcionales
tests/                Ejemplos y pruebas de reglas
wrangler.jsonc        Configuración de Cloudflare
```

Para ampliar soluciones, agrega reglas y pruebas con sus plantillas verificadas antes de habilitarlas en la interfaz.
