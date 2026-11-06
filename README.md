# Steve Generation 2.8

Aplicación web en español para convertir recursos de **Network Inventory** en documentos TXT de configuración **Cisco · NNI3 CARMEN, NNI2 MAPASINGUE, NNI PORTOVIEJO, PWHE CARRETAS y PWHE CALDERON**, y **Juniper DATOS e INTERNET**. Importa un archivo, completa el enlace, revisa y descarga encabezado, etiquetas, script y validaciones.

La versión **2.8** incorpora **Juniper DATOS e INTERNET, estático y BGP**, opciones comunes para crear VRF y velocidad en Cisco y medio óptico/eléctrico en todas las soluciones, con óptico por defecto. La rama de producción es **`codex/steve-generation-v1`**. La rama **`codex/juniper-datos`** conserva el desarrollo de Juniper; su CI solo ejecuta comprobaciones.

Sitio de producción: **https://steve-generation.pages.dev/**. El primer acceso se realiza como **root**, con la contraseña elegida en el secreto `PAGES_INITIAL_ADMIN_PASSWORD` del entorno. Desde Administración puedes crear las demás cuentas. Los usuarios y el historial de producción se guardan en D1 y son independientes de la base local.

## Funciones

- DATOS BGP, DATOS estático, INTERNET BGP e INTERNET estático en NNI3 CARMEN, NNI2 MAPASINGUE, NNI PORTOVIEJO, PWHE CARRETAS y PWHE CALDERON: veinte plantillas.
- Juniper DATOS e INTERNET, estático y BGP: cuatro plantillas con puerto `et-0/0/`, creación opcional de recursos y términos BGP editables. INTERNET BGP permite elegir Quito o Cuenca.
- Creación opcional de VRF en DATOS y velocidad en ambos servicios para las seis soluciones. Ambas opciones están en No por defecto.
- Enlace único, principal (PPL) y respaldo (BCK); medio óptico o eléctrico.
- Importación `.txt` por archivo, arrastre o texto pegado. UTF-8 y Windows-1252; máximo 256 KB. El archivo original se procesa en el navegador y no se sube al servidor.
- Validación de VLAN, ASN, IPv4, redes CIDR y las cuatro direcciones de una WAN `/30`.
- Vista previa de documento, script PE y validaciones; copia y descarga TXT con saltos CRLF.
- Usuario y contraseña; administrador para crear usuarios, restablecer contraseñas y activar/desactivar cuentas. Cada persona puede cambiar su propia contraseña.
- Enlace opcional a la ingeniería, debajo del título del TXT. Se admite HTTP/HTTPS y se conserva el enlace completo con sus parámetros.
- Historial privado: los últimos **100 documentos por usuario**. Descargar guarda el documento; copiar no lo guarda. Se pueden consultar, descargar y eliminar documentos.

Scripts ZTE y soluciones GPON y NNI2 CARMEN **todavía no están implementados**. La etiqueta ZTE es un recurso de texto, no una configuración de ese fabricante. La aplicación no se conecta a equipos ni ejecuta comandos.

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

Se mantiene el orden `DAT_BCK`, `INT_BCK`, `DAT_PPL` e `INT_PPL` en las cinco soluciones, según la confirmación del usuario. El tipo PPL/BCK aparece antes del servicio en el título. NNI2 no agrega comandos de `commit` al bloque PE; el bloque SMTP separado conserva su propia sintaxis.

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

## Reglas de PWHE CARRETAS

La solución `CARRETAS_PWHE3` genera un bloque de interfaz PWHE y xconnect para **IPTCHL3CAR205 (10.116.254.32)** y otro para **IPTCHL3CAR203 (10.116.254.29)**. Después presenta una sola sección común de enrutamiento: `ENRUTAMIENTO` para estático o `BGP` para BGP, incluidas las rutas estáticas de monitoreo y LAN que correspondan. El bloque SMTP de INTERNET queda separado para los equipos indicados en su encabezado.

| Recurso con VLAN 0600 | INTERNET | DATOS |
| --- | --- | --- |
| Interfaz en ambos PE | `PW-Ether20600` | `PW-Ether10600` |
| PW-ID en IPTCHL3CAR205 | `200600` | `100600` |
| PW-ID en IPTCHL3CAR203 | `210600` | `110600` |
| VRF | `internet-pccs-ncb` | La del enlace |
| Monitoreo | No requerido | Loopback `/32` obligatoria |

La VLAN se completa a **cuatro dígitos**: `600` y `0600` generan el mismo resultado. Se mantienen sus ceros en el encabezado, los identificadores y las validaciones. El rango válido sigue siendo 1–4094.

- Se ingresa la **IP del equipo Infinera**, usada como vecino en ambos pseudowires. Importar otro TXT borra ese campo para evitar reutilizar el vecino del enlace anterior.
- Se mantienen `mtu 2014`, `attach generic-interface-list PWHE-InterAS-Infinera`, `xconnect group EoMPLS_PWHE_Infinera` y `pw-class EoMPLS_Fusion_Infinera`.
- Las descripciones terminan con `--- L3-PWHE-PRI` y `--- L3-PWHE-BCK`. Estos roles de los PE son independientes de que el enlace del cliente sea único, PPL o BCK: siempre se generan ambos PE.
- El p2p usa automáticamente los primeros **16 caracteres** de `cliente_sucursal` normalizado. No hay otro campo editable para este nombre. Se usa también para los nombres cortos de las etiquetas PRI/BCK y la descripción del vecino BGP.
- El campo **Acceso** se conserva completo en el encabezado. Con el formato `N3059 - Finlandia_DRX30 - N-PE`, las etiquetas utilizan `Finlandia_DRX30`. Si ingresas solo el nombre del equipo, se usa tal cual. Se conserva su capitalización en las etiquetas PWHE.
- Las tres etiquetas se incluyen en el TXT y tienen botones de copia individuales: `CARRETAS_PWHE3`, `CARR_PWHE3_PRI` y `CARR_PWHE3_BCK`.
- DATOS estático enruta monitoreo y LAN; DATOS BGP mantiene esas rutas y utiliza las políticas `default_policy_pass_all`, `maximum-prefix 500 75` y `as-override`, como CARMEN.
- INTERNET estático enruta las redes públicas y LAN. INTERNET BGP utiliza prefix-set y política IN con sufijo `_IPV4_IN`, comunidades **`(19114:10, 19114:11, 19114:504)`**, `maximum-prefix 100 75 warning-only`, `as-override` y `remove-private-AS`. Conserva rutas LAN estáticas si se ingresan.
- La preferencia local y el peso de INTERNET BGP son **200** para único/PPL y **100** para BCK, aplicados en ambos PE. La política de salida es `RP_internet-pccs-ncb_IPV4_OUT` y el ASN local es `19114`.
- Las descripciones de rutas estáticas llevan cliente y sucursal con máximo 30 caracteres. El comentario SMTP también se genera desde cliente y sucursal, sin reutilizar nombres ajenos al enlace.

Las direcciones WAN siempre se toman del TXT y de sus correcciones manuales. El archivo de origen del ejemplo contiene `10.112.50.108/30`, mientras que el resultado de referencia usa `10.112.21.200/30`: la aplicación no convierte una red en otra. **Cargar ejemplo** utiliza los valores del resultado de referencia; al importar el TXT se conservan los del archivo, incluido el nombre compuesto `IPTCHL3CAR205 - IPTCHL3CAR203`.

En PWHE, las validaciones se presentan directamente como comandos, sin una nota adicional sobre los PE. Las validaciones SMTP se ejecutan en los equipos del bloque SMTP. Esta solución usa la columna de historial existente y no requiere migraciones nuevas.

## Reglas de PWHE CALDERON

`CALDERON_PWHE3` comparte las cuatro variantes de PWHE CARRETAS y presenta dos bloques PWHE seguidos de un solo bloque común de enrutamiento. Cambian los equipos, sus direcciones, las etiquetas y la línea de dampening:

| Recurso | Regla |
| --- | --- |
| PE principal | `IPTCHL3CALD02 (10.116.254.136)` |
| PE respaldo | `IPTCHL3CALD01 (10.116.254.26)` |
| VLAN 2318 · INTERNET | `PW-Ether22318`, PW-ID principal `202318`, respaldo `212318` |
| VLAN 2318 · DATOS | `PW-Ether12318`, PW-ID principal `102318`, respaldo `112318` |
| Vecinos | `neighbor ipv4 <IP Infinera> pw-id ...` en ambos PE |
| Dampening | `dampening 1 75 2000 240`, después de la dirección IP, en las dos interfaces y en las cuatro variantes |
| Etiqueta del enlace | `...:CALDERON_PWHE3` |
| Etiquetas cortas | `...:CLD_PWHE3_PRI` y `...:CLD_PWHE3_BCK` |

Según la confirmación del usuario, se mantienen las reglas de CARRETAS: **PPL/BCK**, ID en la descripción de la interfaz y las etiquetas, p2p de los primeros 16 caracteres y etiquetas PRI/BCK derivadas de ese nombre corto. No se reproduce la variante PPAL/PPALL ni la omisión de ID del ejemplo. Al unir el nombre corto de las etiquetas al servicio, se evita duplicar el guion bajo si el carácter 16 del p2p ya es `_`.

La VRF de INTERNET es `internet-pccs-ncb`, el ASN local es `19114` y las comunidades son `(19114:10, 19114:11, 19114:504)`. La preferencia local y el peso de INTERNET BGP son 200 para único/PPL y 100 para BCK. DATOS exige su VRF y loopback de monitoreo; las LAN se enrutan estáticamente. El prefix-set y todas sus referencias se generan con el mismo nombre. El comentario SMTP usa cliente y sucursal.

**Cargar ejemplo** prepara el caso de FARMAENLACE en Internet BGP con VLAN `2318`, ASN remoto `65113`, vecino Infinera `10.73.32.224`, red pública `200.24.209.244/30` y última milla `UM TELEFONICA`. Puedes editar esos recursos y cambiar el servicio y enrutamiento; el dampening pertenece a CALDERON y no se agrega a CARRETAS. Se conservan cuentas e historial sin migraciones adicionales.

### Actualizar una instalación existente

Detén el servidor con Ctrl+C antes de actualizar:

```powershell
git pull --ff-only
npm ci
npm run db:migrate
npm run dev
```

La migración `0002_history_solution.sql` agrega la solución al historial y asigna NNI3 CARMEN a los documentos anteriores. Conserva las cuentas, las contraseñas, las sesiones y los documentos. No vuelvas a crear `root` si ya existe. Los historiales nuevos muestran la solución y permiten buscar por ella.

## Probar Juniper localmente

Desde tu checkout existente en PowerShell, conserva cualquier cambio local y ejecuta:

```powershell
git fetch origin
git switch codex/juniper-datos
git pull --ff-only origin codex/juniper-datos
npm ci
npm run db:migrate
npm run dev
```

Entra con tu cuenta **local** existente, elige **Juniper**, el servicio y el enrutamiento, y pulsa **Cargar ejemplo**. Juniper carga el caso de ejemplo correspondiente a esa selección. La cuenta local es independiente de la cuenta del sitio público. Si todavía no tienes una cuenta local, créala con `npm run admin:create -- --local --username root`. Las migraciones conservan los usuarios e historiales existentes.

## Creación de VRF y velocidad en Cisco

Las opciones **Crear la VRF** y **Crear la velocidad** están en **No** por defecto. Crear VRF se ofrece solo en DATOS; INTERNET conserva la VRF compartida `internet-pccs-ncb`. Crear velocidad se ofrece en ambos servicios, con enrutamiento estático o BGP, incluidas CARRETAS y CALDERON.

Al crear VRF se pide la parte numérica del RD, con ASN `19114` fijo. MAPASINGUE utiliza IOS XE: `ip vrf`, export map `RM-monitor`, route-target export/import del RD y route-target import `19114:200002`. CARMEN, PORTOVIEJO y ambos PWHE utilizan IOS XR: `vrf`, address-family ipv4 unicast, route-targets y export route-policy `RM-monitor`. Las políticas compartidas RM-monitor deben existir en el equipo.

La definición de VRF y la política QoS aparecen antes de las interfaces. También se genera la redistribución de connected y static en el BGP del proveedor cuando se crea la VRF, incluido un enlace estático. En XE, connected usa `RM_<vrf>_connected`, que referencia la subinterfaz. En XR se agrega el RD bajo BGP. Un enlace BGP añade su vecino al mismo bloque. PWHE mantiene un solo bloque común de enrutamiento para sus dos PE.

Crear velocidad genera `policy-map <Kbps>` y `class class-default`. XE utiliza `police cir ... bc ... be ...`; XR, `police rate ... bps burst ... bytes peak-burst ... bytes`, con conform-action transmit y exceed-action drop. La tasa es Kbps × 1000 y el burst es esa tasa dividida entre 32, redondeada hacia arriba si es fraccionaria. `1024Kbps` genera `1024000` y `32000` en ambos sistemas. Las service-policy input/output se aplican aunque no se cree la velocidad.

## Reglas de Juniper DATOS

El archivo original con rol **FUSION** se importa conservando su WAN, la loopback y el ancho de banda; el ejemplo de resultado utiliza `40960Kbps`, pero importar el archivo de origen conserva `194560Kbps` hasta que lo cambies.

| Recurso | Regla |
| --- | --- |
| Puerto | Se muestra `et-0/0/` fijo; ingresa solo el número, por ejemplo `19`. Un TXT con `et-0/0/19` se importa sin duplicar el prefijo. |
| VLAN | El encabezado, `unit`, `vlan-id` y la interfaz en la VRF utilizan la misma VLAN ingresada. VLAN 1204 genera `et-0/0/19.1204`. |
| Descripciones | `CLIENTE_SUCURSAL_DAT[_PPL/BCK]_ID`, en mayúsculas, tanto en el puerto físico como en la unidad. La etiqueta copiable usa ese mismo nombre. |
| VRF | Se pide su nombre siempre. **Crear la VRF** está en **No** por defecto. Al elegir Sí se incluyen RD, comunidades y políticas import/export. |
| RD | Se ingresa solo la parte numérica; `19114` es fijo. Es obligatorio al crear la VRF y también en BGP cuando la VRF ya existe, para su comunidad de exportación. |
| Comunidad compartida | `19114:200002`, fija. |
| Velocidad | **Crear la velocidad** está en **No** por defecto. Al elegir Sí se incluyen policer, filtro y CoS. En ambos casos se aplican el filtro y el perfil del ancho de banda indicado. |
| Cálculos | `Kbps × 1000` para bandwidth-limit y shaping-rate; ese resultado dividido entre 32 para burst-size-limit, redondeado hacia arriba si hubiera una fracción de byte. `40960Kbps` genera `40960000` y `1280000`. |
| Negociación | `1g` hasta `1000000Kbps` inclusive; `10g` por encima de 1 Gbps. |
| Puerto físico | Siempre se generan `delete ... unit 0`, `delete ... disable`, `mtu 2000`, flexible-vlan-tagging y hierarchical-scheduler, como en el ejemplo. Revisa su uso en un puerto que ya tenga servicios. |
| Enrutamiento | Loopback `/32` y redes LAN opcionales como rutas estáticas hacia el CPE, también con BGP. |
| BGP | Grupo con el nombre completo de la etiqueta, descripción de cliente/sucursal, dirección local del PE, vecino CPE, ASN remoto, as-override y remove-private. |
| term export bgp | `3` por defecto, editable desde `3` para usar el siguiente término disponible de la política. Los términos 1 y 2 se reservan para direct/static. |

Las condiciones `from protocol bgp` y `from neighbor` se generan en comandos separados de Junos. El nuevo término se coloca explícitamente antes de `term reject` con `insert`, incluso al ampliar una política existente, para que el rechazo final no lo deje sin efecto. Al crear la VRF, las políticas import/export conservan un rechazo final.

Las validaciones usan el puerto, la velocidad y la loopback actuales; no reutilizan los valores distintos del ejemplo. La validación de `sigmars` se conserva como comando separado para el equipo Cisco de monitoreo. El documento identifica correctamente el servicio como DATOS. No se requiere una migración nueva: la solución se guarda en la columna de historial existente.

Importar otro archivo reinicia las opciones de creación, el RD y el término BGP para evitar reutilizar esos datos de otro enlace. El nombre de VRF y los recursos del inventario se conservan según lo importado. Si eliges No crear la VRF o la velocidad, se presupone que sus recursos ya existen en el equipo; la aplicación no los consulta.

## Reglas de Juniper INTERNET

INTERNET utiliza siempre `internet-pccs-ncb`, tanto en el encabezado como en los comandos; se corrige el `internet-pcs-ncb` que aparece en uno de los ejemplos. No se ofrece crear la VRF ni se exige RD o loopback de monitoreo. Se mantiene el puerto `et-0/0/`, VLAN igual a unit/vlan-id, MTU, negociación, filtro input y perfil CoS de DATOS. La creación opcional de velocidad también está disponible.

Las descripciones de interfaz y la etiqueta copiable conservan `CLIENTE_SUCURSAL_INT[_PPL/BCK]_ID`, incluido `SINID` cuando se ingresa así. Los nombres de prefix-list, política de entrada y grupo BGP utilizan `cliente_sucursal_int[_ppl/bck]` sin ID, siguiendo el ejemplo de INTERNET. El grupo BGP de DATOS conserva su nombre completo anterior.

INTERNET estático crea una ruta por red pública hacia el CPE. INTERNET BGP añade `encapsulation flexible-ethernet-services`, prefix-list de las redes públicas, política de entrada y grupo external con dirección del PE, vecino CPE, ASN remoto, límite de 100 prefijos, as-override, remove-private y política de salida `RP_internet-pccs-ncb_IPV4_OUT`. Las LAN opcionales se agregan como rutas estáticas en ambas variantes.

| Ubicación del equipo, obligatoria en BGP | Comunidades de entrada | Política de gestión |
| --- | --- | --- |
| Quito | `19114:10`, `19114:11`, `19114:504` | `RP_CPE-MGMT-INTERNET-PCCS-NCB` |
| Cuenca | `19114:20`, `19114:21`, `19114:504` | `RP_CPE-MGMT-INTERNET-PCCS-NCB_IPV4` |

Por confirmación del usuario, **local-preference y metric** son **200 para único/PPL** y **100 para BCK**. El campo **term gestión bgp** permite seleccionar el siguiente término disponible de la política de gestión; comienza en **4**. Se añade el vecino en ese término y se coloca antes del rechazo final mediante `insert`, con la misma lógica que `term export bgp` de DATOS.

En ambas variantes se incluyen configuración y validación SMTP en el bloque separado de `IPTCHL1CAR201 - IPTCHL1CCRM01`. El comentario se deriva del cliente y sucursal actuales. Las validaciones del PE usan comandos Junos y las redes, el puerto y el CPE actuales; las de SMTP conservan los comandos Cisco del bloque externo. No se reutiliza el CPE de un ejemplo diferente.

Importar otro TXT reinicia también la ciudad y `term gestión bgp` (4), para que se elija la ubicación del enlace nuevo antes de generar BGP. Las cuentas e historiales existentes se conservan sin migraciones adicionales.

## Pruebas

```bash
npm test
npm run check
npm run test:integration
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

- `test`: parser, las 60 combinaciones Cisco y las doce Juniper, Quito/Cuenca, creación de VRF/QoS XE/XR, redes, entradas inválidas y contraseñas.
- `check`: sintaxis y compilación del módulo avanzado de Pages en `dist/_worker.js`; no publica.
- `test:integration`: base temporal, migraciones, creación de administrador y Pages local con su módulo compilado. Comprueba también la inicialización segura del primer root, autenticación, permisos, las veinte variantes Cisco y las cuatro Juniper, creación de recursos, aislamiento del historial, contraseñas, desactivación y límite de intentos. Limpia base y servidor al terminar.
- `test:browser`: flujo real en Chromium de escritorio/móvil, importación, variantes, descarga, historial, copia individual de etiquetas PWHE, administración y errores JavaScript/CSP. Requiere Chromium instalado o `CHROMIUM_PATH`. Usa una base temporal. Capturas en `test-results/`, ignoradas por Git.

No requieren credenciales de Cloudflare. Estas pruebas no validan comandos contra equipos Cisco o Juniper reales.

## Publicar en Cloudflare Pages + D1

La aplicación está preparada para **Pages en modo avanzado**: `npm run build` copia la web a `dist/` y compila la API en `dist/_worker.js`. Pages aporta el binding `ASSETS`; D1 utiliza el binding `DB`. No se necesita un Worker separado. La API, las cookies y la web comparten el mismo origen.

La carpeta `dist/` es generada e ignorada por Git. No se deben arrastrar solamente los archivos de `public/` al panel de Pages: el paquete completo requiere `_worker.js` y su binding D1.

Pages Functions y D1 se pueden usar en sus niveles gratuitos dentro de las cuotas de Cloudflare. La configuración no contrata planes de pago ni garantiza uso ilimitado.

### Preparación de la cuenta

Si despliegas desde tu PC, autentica Wrangler con `npx wrangler login`. Desde un entorno autorizado también puedes utilizar `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`. El token requiere **Account → Cloudflare Pages → Edit** y **Account → D1 → Edit**, limitados a la cuenta elegida. Guárdalo como secreto; nunca en Git ni en el chat.

Crea una base D1 para producción:

```bash
npx wrangler d1 create steve-generation
```

Sustituye únicamente `database_id` en `wrangler.jsonc` por el UUID devuelto. El `preview_database_id` de ceros se conserva como identificador del emulador local para seguir usando los datos existentes de `.wrangler/state`. No es una base remota de preview. El ID de cuenta y el UUID de D1 son identificadores, no contraseñas.

Aplica las migraciones de producción:

```bash
npm run db:migrate:remote
```

La base de producción es independiente de tu PC. Las migraciones crean el esquema, sin copiar automáticamente cuentas o documentos locales. No se elimina la base local.

### Primera publicación mediante Wrangler

La rama actual de la aplicación es **`codex/steve-generation-v1`**. Se utiliza también como rama de producción del proyecto Pages:

```bash
npx wrangler pages project create steve-generation --production-branch codex/steve-generation-v1
```

El nombre del proyecto debe coincidir con `name` en `wrangler.jsonc`. Si ya tienes un proyecto, utiliza su nombre y comprueba sus bindings antes de publicar.

Para elegir tu contraseña inicial de producción sin compartirla, configúrala como secreto nativo de Pages:

```bash
npx wrangler pages secret put INITIAL_ADMIN_PASSWORD --project-name steve-generation
```

Wrangler solicita el valor de forma privada. Debe tener entre 4 y 128 caracteres. Alternativamente, puedes crear el administrador directamente con `npm run admin:create -- --remote --username root`; ambas opciones respetan las cuentas existentes.

Publica el paquete completo:

```bash
npm run deploy
```

Wrangler devolverá la URL real del despliegue. La publicación no se considera verificada solo por compilar: comprueba la página de acceso, el login y una generación con historial en la URL publicada.

### Primer acceso de root

Con una base vacía y `INITIAL_ADMIN_PASSWORD` configurado, abre el sitio e ingresa como **root** con esa contraseña. La cuenta se crea únicamente después de comprobar la contraseña y solo si no existe ningún usuario. No hay registro público ni una contraseña predeterminada.

El secreto inicial no agrega otro administrador a una base con usuarios y no restablece una contraseña que ya se cambió. Puedes eliminarlo desde los secretos de Pages después del primer acceso; la cuenta queda almacenada con su hash en D1.

Si el despliegue se prepara desde este entorno, el secreto gestionado `PAGES_INITIAL_ADMIN_PASSWORD` se utiliza únicamente para enviar el valor a Cloudflare como `INITIAL_ADMIN_PASSWORD`. No se incorpora al código, los argumentos de los comandos ni los archivos del proyecto.

### Actualizaciones automáticas desde GitHub

El workflow `.github/workflows/ci.yml` ejecuta pruebas en Windows y Linux. Un push a **`codex/steve-generation-v1`** también aplica migraciones remotas y publica en Pages cuando están configurados estos secretos en **GitHub → Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN`: permisos de edición de Pages y D1 para esa cuenta.
- `CLOUDFLARE_ACCOUNT_ID`: ID de la cuenta.

Los secretos del entorno de Codex y los de GitHub Actions son configuraciones independientes. Sin los secretos en GitHub, se ejecutan las pruebas y se omite la publicación. El workflow nunca crea ni modifica contraseñas de usuarios. La base y el proyecto Pages se preparan antes de activar la publicación automática.

Si prefieres la integración nativa de Pages con GitHub, crea el proyecto como proyecto conectado a Git desde el panel de Cloudflare, con estos ajustes:

| Ajuste | Valor |
| --- | --- |
| Repositorio | `saoviedo3/SteveGenerationV2.0` |
| Rama de producción | `codex/steve-generation-v1` |
| Framework | None |
| Comando de build | `npm run build` |
| Directorio de salida | `dist` |
| Node | 24 |

Configura antes el UUID real de D1 en el repositorio y el secreto inicial de Pages. Los proyectos Direct Upload y los conectados a Git tienen flujos diferentes; el workflow de GitHub Actions permite automatizar los Direct Upload sin una integración nativa.

## Datos y acceso

Contraseñas con PBKDF2-SHA256 y salt aleatorio; sesiones de 256 bits cuyo hash se almacena en la base. Cookies HttpOnly, SameSite=Strict y Secure en HTTPS; vencen a las 8 horas. Cambiar estado o restablecer contraseña revoca las sesiones del usuario. La API comprueba el origen de las escrituras, vuelve a validar los recursos y limita intentos de login por usuario e IP.

El administrador gestiona cuentas; su historial también está limitado a sus propios documentos. Quien administre la base de Cloudflare sí tiene acceso técnico a sus registros. No se usa analítica ni se envían archivos a servicios externos.

## Estructura

```text
public/               Interfaz y generador compartido con el servidor
worker/               API, autenticación y acceso a D1
migrations/           Esquema SQL versionado
scripts/              Build de Pages, administrador y pruebas funcionales
tests/                Ejemplos y pruebas de reglas
wrangler.jsonc        Configuración de Cloudflare
```

Para ampliar soluciones, agrega reglas y pruebas con sus plantillas verificadas antes de habilitarlas en la interfaz.
