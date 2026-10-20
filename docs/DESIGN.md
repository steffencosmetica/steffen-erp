# DESIGN.md — ERP STEFFEN

## 1. Objetivo

Este documento define la implementación visual y de interacción del ERP Steffen.

No define lógica de negocio, cálculos, persistencia ni efectos sobre stock/patrimonio.

Prioridad documental:

1. `BUSINESS_RULES.md`
2. `DATA_MODEL.md`
3. `FLOWS.md`
4. `DESIGN.md`
5. `COMPONENTS.md`

Si el Figma o una pantalla visual contradice una regla funcional ya confirmada, se corrige la interfaz.  
La lógica funcional no se modifica para coincidir con un diseño desactualizado.

## 1.1 Principio de autoridad

- `BUSINESS_RULES.md` y `FLOWS.md` mandan sobre **comportamiento**.
- `DESIGN.md`, `COMPONENTS.md` y el **nuevo Figma** (rediseño visual definitivo) mandan sobre **apariencia**.
- `IMPLEMENTATION_PLAN.md` manda sobre la **secuencia de implementación**.
- `PDFS.md` manda sobre el **contrato documental/histórico** de los PDFs.
- La implementación actual conserva **todas** sus funcionalidades existentes.

Dark/Light es exclusivamente visual. La única modificación de persistencia de R1 es el autosave del Pedido abierto definido en `FLOWS.md` §14; no cambia reglas de negocio, rutas ni modelo de datos.

Referencias visuales del repositorio (supeditadas al contrato R1 y a las imágenes nuevas suministradas por el usuario): `docs/visual-references/figma/` — `Frame 1.png` (guía de estilo: paleta, tipografía, márgenes, botones, inputs, cards), Dashboard, Mi Fábrica, Fórmulas, Pedidos, Pedido, Productos Finales, Stock, Ventas, Administración, Cuentas Clientes, Cuentas Proveedores, y el tablero completo en `Pdf.pdf`.

Íconos base: `docs/visual-references/iconos/` (se usan tal cual; solo se adapta color/estilo, ver §4.4).

Las nuevas imágenes establecen estética; no restauran estructuras funcionales históricas. Prevalece la funcionalidad actual si una imagen la contradice. Caso explícito: no reconstruir la antigua sección/tablas de Cuentas de Administración. Cerrar sesión se referencia únicamente al Dashboard nuevo (§9.0).

---

# 2. Fuente visual

El **nuevo Figma** es la referencia visual definitiva del ERP y reemplaza al Figma/PDF anterior.

Define únicamente:

- jerarquía visual;
- colores;
- tamaños;
- espaciados;
- layouts;
- tablas;
- navegación;
- botones;
- inputs;
- estados visuales;
- cards;
- contenedores.

## 2.1 Lectura del Figma

Si el Figma:

- **omite una función existente** → la función NO se elimina; se integra con el lenguaje visual nuevo;
- **muestra datos ficticios** (nombres de personas, precios, cantidades, códigos, fechas, nombres de productos, saldos, descuentos) → son placeholders visuales, NO reglas de negocio;
- **usa nomenclatura vieja** → se mantiene la nomenclatura normativa vigente (§37);
- **muestra códigos viejos** como `MVF` o `MVS` → NO se restauran (se usan `MFA` y `MST`);
- **dice "Margen"** donde corresponde "Ganancia" → se mantiene `Ganancia`.

Las anotaciones funcionales del Figma (viejo o nuevo) no reemplazan a `BUSINESS_RULES.md` ni a `FLOWS.md`.

---

# 3. Responsive y estrategia por dispositivo

## 3.0 Estado vigente y preservación responsive

Dark y Light conservan los breakpoints y el comportamiento responsive actuales. No modificar navegación, scroll, targets táctiles, orden funcional ni layout funcional, salvo la composición compacta de cotización y las columnas independientes de CLIENTES definidas explícitamente por R1. Las pautas siguientes se leen sin autorizar un rediseño responsive ni una ampliación global de controles.

## 3.1 Principio general

El ERP mantiene **la misma funcionalidad en desktop, tablet y mobile**.

Desde mobile se debe poder:

- consultar;
- fabricar;
- envasar;
- crear y editar Pedidos abiertos;
- confirmar RTO;
- completar RTM;
- registrar Compras;
- registrar Pagos;
- registrar Gastos;
- registrar Retiros;
- liquidar Mercado Libre;
- administrar Stock;
- consultar y editar Fórmulas;
- consultar Cuentas;
- generar documentos;
- utilizar planificación.

No existe una versión mobile “solo lectura”.

El responsive adapta la interfaz, pero no recorta funcionalidades.

---

## 3.2 Breakpoints

Regla general del ERP, alineada con la navegación real existente:

| Rango | Ancho | Navegación |
|---|---|---|
| Mobile | `< 768 px` | topbar / drawer (§3.5) |
| Tablet / responsive intermedio | `768 px – 1279 px` | topbar / drawer (§3.5) |
| Desktop | `>= 1280 px` | layout desktop con barra lateral (sidebar) |

### Mobile

`< 768 px` (`360 px – 767 px`).

Ancho mínimo soportado:

`360 px`

### Tablet / responsive intermedio

`768 px – 1279 px`

### Desktop

`>= 1280 px`

Desde `1280 px` el ERP usa el layout desktop con barra lateral. Por debajo de `1280 px` usa el comportamiento responsive existente con topbar/drawer.

La implementación debe ser fluida dentro de cada rango.

---

## 3.3 Padding horizontal

### Mobile

- 360–390 px → `16 px`
- 391–767 px → `20 px`

### Tablet

`24 px`

### Desktop

`24–32 px`, según densidad de la pantalla.

Las tablas que necesiten más ancho pueden ocupar todo el espacio disponible del viewport.

---

## 3.4 Ancho de contenido

No utilizar un contenedor rígido pequeño para todo el ERP.

### Desktop

- utilizar el ancho disponible;
- centrar contenido cuando corresponda;
- permitir que tablas y matrices aprovechen el viewport;
- evitar un máximo tipo 1200 px que comprima información densa.

Para pantallas informativas simples puede existir un máximo amplio, pero las tablas operativas tienen prioridad sobre ese límite.

---

## 3.5 Navegación responsive

### Desktop

Mantener la barra lateral completa con los módulos de §9:

- Dashboard
- Mi Fábrica
- Pedidos
- Stock
- Administración

(Fórmulas pertenece a Mi Fábrica; ver §9.)

### Tablet

Por debajo de `1280 px` (§3.2) la barra lateral no se muestra: se usa la misma navegación responsive que en mobile (barra superior + drawer / menú desplegable).

### Mobile

La navegación principal pasa a:

- barra superior;
- nombre del módulo actual;
- botón menú;
- drawer lateral / menú desplegable.

El menú muestra todos los módulos.

No utilizar scroll horizontal de pestañas como navegación principal mobile.

---

## 3.6 Jerarquía vertical mobile

En mobile:

1. título/contexto;
2. acciones principales;
3. filtros;
4. contenido;
5. acciones secundarias.

Las secciones que en desktop están lado a lado pasan a apilarse verticalmente.

Gap principal entre secciones:

`20 px`

Gap interno habitual:

`12 px`

Gap compacto:

`6 px`

---

## 3.7 Cards responsive

### Desktop

Distribuir horizontalmente según el Figma y el ancho disponible.

### Tablet

2–3 por fila según contenido.

### Mobile

Preferencia:

- 2 KPI pequeños por fila;
- 1 por fila si el contenido necesita más ancho.

Cards de contenido complejo ocupan:

`100%`

---

## 3.8 Tablas responsive

No existe una única transformación para todas las tablas.

Se utilizan tres estrategias.

### A. Tabla simple → bloques mobile

Aplicar cuando cada fila puede comprenderse como una entidad individual con pocos campos.

Ejemplos:

- Productos;
- Pedidos abiertos;
- Granel disponible;
- Próximas fabricaciones.

En mobile cada fila puede convertirse en bloque vertical manteniendo:

- dato principal;
- datos secundarios;
- estado;
- acción.

### B. Tabla densa → scroll horizontal

Aplicar cuando transformar a cards destruiría la comparación entre columnas.

Ejemplos:

- Materias Primas;
- Movimientos;
- Ventas;
- cuentas corrientes;
- Fórmulas;
- costos;
- listas de precios.

Reglas:

- contenedor con overflow horizontal;
- conservar encabezados;
- no reducir texto a tamaños ilegibles;
- columnas numéricas mantienen alineación;
- si corresponde, primera columna sticky.

### C. Matriz → scroll horizontal + sticky

Aplicar al Resumen de Pedidos.

- primera columna Producto sticky;
- encabezado superior sticky;
- columnas PED conservan ancho legible;
- scroll horizontal;
- scroll vertical normal;
- estados críticos visibles;
- drag/reorder compatible con touch.

---

## 3.9 Sticky headers

Cuando una tabla o matriz requiere scroll:

- encabezado puede permanecer sticky;
- primera columna puede permanecer sticky cuando sea necesaria para mantener contexto.

Especialmente:

- Resumen de Pedidos;
- tablas financieras extensas;
- fórmulas extensas.

---

## 3.10 Formularios y ventanas operativas

### Desktop

Usar ventana/modal cuando corresponda.

### Tablet

Modal amplio o panel según contenido.

### Mobile

Toda operación compleja pasa a **pantalla completa**.

Ejemplos:

- Compra;
- Nuevo Pedido;
- Fabricación;
- Envasado;
- Nueva Fórmula;
- Nuevo Producto;
- Pago;
- Gasto;
- Liquidación ML.

Reglas mobile:

- inputs 100% ancho;
- secciones apiladas;
- tablas internas adaptadas;
- header con título;
- acción de volver/cerrar;
- footer fijo con acciones principales cuando sea útil.

---

## 3.11 Footer de acciones mobile

En operaciones de creación/registro:

- `Cancelar` / `Volver`
- acción primaria

pueden mantenerse fijos en la parte inferior.

Debe reservarse espacio para que el contenido no quede oculto debajo del footer.

---

## 3.12 Inputs mobile

- ancho 100%;
- labels visibles;
- separación mínima 12 px;
- controles táctiles cómodos;
- evitar controles pequeños juntos;
- selects y date pickers deben poder abrirse correctamente en viewport reducido.

No reducir tipografía por debajo de los tokens definidos solo para “hacer entrar” contenido.

---

## 3.13 Drag & drop mobile

El Resumen de Pedidos debe soportar reordenamiento con touch.

Además del drag directo, mobile debe ofrecer una alternativa:

`ORDENAR PRIORIDAD`

Esta acción abre una lista vertical reordenable.

Se aplica a:

- prioridad de Productos;
- prioridad de Pedidos.

La alternativa evita depender exclusivamente de arrastrar columnas dentro de una matriz horizontal.

---

## 3.14 Dashboard responsive

### Desktop

Mantener composición multicolumna del diseño.

### Tablet

Reorganizar en 2 columnas cuando el contenido lo permita.

### Mobile

Orden recomendado:

1. KPI;
2. Acceso Rápido;
3. Resumen de Pedidos;
4. Alertas Stock / Simular Compra;
5. Cuentas;
6. Disponible en Granel.

Los bloques ocupan ancho completo salvo KPI pequeños.

---

## 3.15 Mi Fábrica responsive

### Desktop

Mantener estructura del diseño.

### Mobile

Ordenar:

1. acciones rápidas;
2. Próximas fabricaciones;
3. Granel disponible;
4. Costo-Ganancia;
5. Movimientos de Fábrica.

Las tablas simples pueden convertirse en bloques.

Costo-Ganancia y Movimientos pueden usar scroll horizontal.

---

## 3.16 Pedidos responsive

### Lista de Pedidos abiertos

Mobile:

- filas transformables a bloques;
- código y cliente como información principal;
- importe y fecha secundarios;
- acción Ver visible.

### Resumen de Pedidos

Siempre mantener concepto de matriz.

Mobile:

- scroll horizontal;
- Producto sticky;
- encabezado sticky;
- acción `Ordenar prioridad`.

### Pedido individual

Mobile:

- cabecera en bloques;
- líneas de pedido en tabla horizontal o cards por producto, según densidad;
- AG debe quedar visible/editable;
- totales al final;
- acciones principales fijas cuando corresponda.

---

## 3.17 Stock responsive

### Productos

Mobile:

puede transformarse a bloques.

### Materias Primas / Componentes

Debido a cantidad de columnas:

- scroll horizontal;
- primera columna Código/Producto sticky cuando ayude;
- filtros arriba.

---

## 3.18 Administración responsive

### Desktop

Mantener composición por bloques.

### Mobile

Orden:

1. acciones administrativas;
2. Cotización USD;
3. Cuentas;
4. Ventas;
5. Clientes;
6. Proveedores;
7. Últimos Movimientos.

Las tablas largas usan las reglas de tabla densa.

---

## 3.19 Cuentas Cliente/Proveedor responsive

### Selector de entidades

Desktop:

lista/botones laterales o superiores según diseño.

Mobile:

- selector desplegable;
- búsqueda;
- `Ver más` si corresponde.

### Ficha

Campos en una sola columna.

### Asiento

Scroll horizontal o formato de ledger compacto.

No ocultar saldo.

---

## 3.20 Listas de Precios responsive

Mobile:

1. selector de lista;
2. acciones de lista;
3. filtros/búsqueda;
4. tabla horizontal.

La selección masiva debe seguir siendo utilizable con touch.

---

## 3.21 Reportes responsive

Definido en §35.2 y §35.9–§35.10 (tablet aprox. 768–1279 px con dos columnas cuando entren; mobile en una sola columna con orden Facturación → Productos → Clientes; scroll horizontal solo interno de áreas gráficas y tabs). La pauta anterior de grilla de cuatro cards queda derogada.

---

## 3.22 Touch targets

Elementos interactivos deben ser cómodos para touch.

Referencia mínima:

`40 px`

Aplicar a:

- botones;
- icon buttons;
- handles;
- tabs;
- filas seleccionables.

---

## 3.23 Texto y truncado

Evitar cortar información crítica.

Si el contenido es largo:

- wrap cuando sea razonable;
- ellipsis solo si existe forma de ver el contenido completo;
- no truncar importes;
- no truncar códigos esenciales;
- no truncar estados críticos.

---

## 3.24 Orientación

El sistema debe funcionar en portrait y landscape.

Mobile landscape puede aprovechar mayor ancho para tablas, pero no debe ser requisito para operar.

---

# 4. Sistema visual

Fuente vigente: contrato R1 e imágenes nuevas del usuario; los frames del repositorio aportan referencias solo cuando no los contradigan.

## 4.1 Tokens semánticos Dark/Light — contrato R1

Los temas DARK y LIGHT son dos representaciones visuales del mismo ERP. Existe un único sistema de componentes con tokens semánticos compartidos; no se duplican componentes por tema. Cambiar tema no modifica reglas de negocio, cálculos, datos, permisos, acciones, navegación, estructura funcional ni comportamiento responsive.

### Tokens comunes

| Rol | Valor | Uso |
|---|---|---|
| Primary / Steffen | `#C38926` | identidad, navegación activa, selección, foco visual y estados puntuales definidos por diseño |
| Secondary / Black | `#000000` | negro absoluto para casos específicos de alto contraste; no sustituye Surface |
| Info / Blue | `#0E50A0` | enlaces, acciones informativas y navegación secundaria |
| Info hover | `#05346E` | hover de Info |
| Success | `#008102` | acción o resultado positivo |
| Danger | `#DD0000` | acción destructiva, faltante o alerta |

El dorado queda excluido de las series estadísticas (§35.11). `#D2AB68` y `#B99D22` son obsoletos para la UI activa. Los usos históricos en PDFs versionados y assets con contrato independiente no se modifican por Dark/Light; rige `PDFS.md`.

### Tokens por tema

| Rol | DARK | LIGHT |
|---|---|---|
| background | `#161616` | `#EFEFEF` |
| surface | `#0F0F0F` | `#F6F6F6` |
| surface-raised | gradiente `#121212 → #000000` cuando el componente lo prescribe; en otro caso Surface | gradiente `#F3F2F2 → #DEDDDD` cuando el componente lo prescribe; en otro caso Surface |
| border-control / Border button | `#D9D9D9` | `#D9D9D9` |
| border-section / Border section/header | `#393939` | `#D9D9D9` |
| text-primary | `#FFFFFF` | `#212121` |
| section-title | `#6B6B6B` | `#6B6B6B` |

Light conserva jerarquía entre fondo general, surfaces y componentes elevados: no es una pantalla blanca plana. Dark utiliza Surface para panels y sections; el negro absoluto no es su sustituto indiscriminado. Los gradientes se limitan a botones neutros, inputs/selects, selectores de lista y cards que los prescriban; la card de Pedido seleccionada Dark es una excepción explícita sin gradiente (§18.1).

Roles independientes obligatorios, además de los anteriores: `text-secondary`, `text-on-action`, `selection`, `hover`, `overlay`, `success`, `danger`, `info`, `chart-grid`, `chart-axis` y `chart-tooltip` (superficie, borde y texto). `selection` usa Primary para el énfasis/borde sin imponer el mismo relleno a todos los componentes. `text-on-action` se determina por contraste sobre la acción, nunca por el color de texto principal del tema. `chart-axis` incluye labels; `chart-grid` no se confunde con el borde de sección.

`text-secondary` toma `#6B6B6B` como referencia muted; títulos de sección usan `section-title`. Debe calibrarse por separado la legibilidad de contenido secundario, placeholders e iconos. Los tokens `success-soft`, `danger-soft`, hover, overlay, texto sobre acción y derivados gráficos sin valor inequívoco quedan **a calibrar visualmente durante implementación**, sin inventar hexadecimales. Esto no permite cambiar los valores explícitos de las tablas anteriores. Se conserva el criterio sin sombras decorativas.

El token histórico `--steffen-surface` tiene usos ambiguos, incluido texto claro. Antes de reutilizarlo se deben separar los consumidores por rol (fondo, texto, texto sobre acción, etc.). No puede simplemente reasignarse a un fondo Light. La capa heredada `.erp-dark` y los colores locales deben reconciliarse con esos roles; no alcanza con cambiar variables sin revisar sus consumidores.

Los colores se centralizan como CSS Custom Properties semánticas y utilidades compartidas. Los componentes no incorporan hexadecimales sueltos cuando existe un token.

Lectura de nombres heredados en el resto del documento: Tertiary/Blue = Info; Blue Hover = Info hover; Verde/Green = Success; Rojo/Red = Danger; Border Button = border-control; Border Contenedor/Gray = border-section. Text Muted identifica text-secondary salvo títulos de sección, que usan section-title. Secondary en nombres históricos de botones significa PrimaryDark, no impone fondo negro.

## 4.2 Sistema de theme y preferencia

Contrato conceptual: `data-theme="dark|light"` en el elemento raíz y CSS Custom Properties semánticas. Si existe preferencia persistida se utiliza; de lo contrario, DARK por defecto. La preferencia persiste entre sesiones.

La resolución inicial debe estar disponible para el render del servidor (por ejemplo mediante cookie), y el cliente debe iniciar con el mismo valor: evitar flash de tema incorrecto y hydration mismatch. No convertir innecesariamente Server Components a Client Components; solo el proveedor/control de theme requiere estado cliente cuando sea necesario. El proveedor puede recibir contenido renderizado en servidor sin convertirlo en lógica cliente.

### Selector global DARK ↔ LIGHT

Desktop: zona superior derecha del ERP. Responsive/mobile: acceso equivalente sin alterar la navegación. Cambio inmediato en toda la aplicación, conservando ruta, datos cargados y funcionalidad, sin recarga de datos causada por el cambio de tema. Persistir la preferencia. El control y sus estados comparten geometría entre temas.

La implementación de esta infraestructura queda para R2; R1 solo fija el contrato documental.

## 4.3 Radius

| Elemento | Radius |
|---|---|
| Paneles / secciones / cards | `10 px` |
| Botones, inputs, selects, ítems de lista | `5 px` |

Reemplaza los valores anteriores (`2 px` / `5 px`).

## 4.4 Iconografía

Fuente: `docs/visual-references/iconos/`. Se usan esos íconos (no se redibujan); solo se adapta color/estilo:

- **Dentro de botones:** tratamiento de icono del tema con contraste, conservando silueta y geometría; cromado donde lo prescriba el diseño.
- **Navegación:** módulo activo en `Primary`; inactivos mediante token de icono del tema.
- Ícono PDF/documento: rojo.

Asignación: `panel` → Dashboard; `fabrica` → Mi Fábrica; `hacer-un-pedido` → Pedidos y cards de pedido; `distribuidor` → Stock; `imac` → Administración; `carrito-de-compras` → Compra; `formula` → Fabricación/Fórmulas/Simular; `envase-de-spa-de-jabon-cremoso` → Envasado, Componentes y lista de productos; `lista` → Listas de precios; `medico` → Gasto operativo; `retiro` → Retiro caja; `orden` → Pedidos abiertos / Ventas (KPI); `ingresos` → Ventas del mes; `productos` → pestaña Productos; `Sin-título-1` → pestaña Materia Prima; `tanque` → tile de granel; `usuario` → lista de clientes/proveedores; `nueva-cuenta` → Nueva cuenta; `boton-mas` → botón `+`.

Donde no hay ícono de referencia se usa un ícono lineal neutro con el mismo tratamiento de color.

## 4.5 Decisiones visuales vigentes

1. **Tocar un granel** en Mi Fábrica abre Envasado de ese lote (atajo a la función existente).
2. **`Listas de precios`** en Acceso Rápido abre la pantalla existente.
3. El chip `Admin` del encabezado de página identifica la sesión (muestra el usuario autenticado); no agrega funciones.

---

# 5. Densidad y tipografía

## 5.0 Densidad visual

La referencia canónica son los tamaños actualmente implementados. Dark/Light conserva exactamente la densidad visual: no agrandar globalmente tipografías, botones, inputs, tablas, sidebar, cards, gaps ni paddings.

Se mantiene `--spacing: 3px`, los valores locales y la escala real de `globals.css`:

| Utilidad | Tamaño |
|---|---:|
| text-xs | 11 px |
| text-sm | 12 px |
| text-base | 13 px |
| text-lg | 14 px |
| text-xl | 16 px |
| text-2xl | 18 px |
| text-3xl | 22 px |
| text-4xl | 26 px |

Body: **12 px**. Se conservan las excepciones locales existentes justificadas por jerarquía (encabezados de página, valores KPI e importes destacados), sin uniformarlas ni ampliarlas. Dark/Light no autoriza a modificar esta escala ni las dimensiones actuales de los componentes.

## 5.1 Tipografía

Familia oficial: `Inter`, cargada en el layout raíz mediante `next/font/google`, variable `--font-inter`, subconjunto latin y display swap.

| Token | Tamaño | Peso | Uso |
|---|---:|---|---|
| H1 | 22 px | Bold | título de pantalla (`Dashboard`, `Mi Fabrica`) |
| H2 | 18 px | Semi-bold | título de ventana/pedido (`PEDIDO 0000`) |
| H3 | 14 px | Regular | título de pantalla secundaria (`CLIENTES`, `FORMULAS`), títulos de bloque |
| Body semibold | 12 px | Semi-bold | encabezados de tabla, labels, botones, títulos de sección |
| Body regular | 12 px | Regular | contenido general, filas de tabla |
| Auxiliar | 11 px | Regular | contenido secundario, placeholders, labels de navegación |

Numerales de KPI: 24 px Bold (display).

| Display ExtraLight | tamaño local vigente (p. ej. 22 px en Total facturado del Dashboard) | ExtraLight (200), tracking -0.02em | importes de las cards de Cuentas/Caja (Caja Steffen, Caja Mercado Libre, Deudas) y Total facturado; NETO usa Bold. Clase `.ui-display-extralight`. Los importes nunca se truncan: las cards crecen con el contenido |

Inter se carga como fuente variable, por lo que el peso 200 está disponible sin recursos adicionales.

---

# 6. Espaciado

Gaps: `4 px`, `8 px`, `15 px` (en Tailwind con `--spacing: 3px`: `gap-1`≈3, `gap-3`=9, `gap-5`=15). No introducir otra escala sin actualizar este documento. Densidad alta en tablas.

---

# 7. Márgenes / padding

- Contenedores: laterales `15 px`; superior/inferior `8–12 px`.
- Botones: laterales `~15 px`; superior/inferior `4 px`.

---

# 8. Botones

Alturas: Chico `~30 px`, Grande `~50 px`. Radius `5 px`. Íconos dentro de botones: 18–24 px.

| Variante oficial | Contrato visual compartido |
|---|---|
| Primary | énfasis Primary; texto sobre acción con contraste |
| PrimaryDark | acción neutra; surface-raised/gradiente del tema, border-control y text-primary; el nombre no limita su uso a Dark |
| Success | Success y text-on-action |
| Danger | Danger y text-on-action |
| Info | Info, hover Info hover y text-on-action |
| Icon / IconText | composición de Button con icono, con o sin texto; label accesible cuando no muestra texto |
| Menu | navegación; activo Primary; inactivo text-secondary/icono del tema |
| Lista | transparente por defecto; hover/selección con tokens del tema |
| Volver | triángulo y texto Info, hover Info hover |
| IconRojo | acción destructiva con icono; Danger y text-on-action |

El control circular `+` conserva su función y dimensiones actuales, con contraste e icono adecuados al tema. Componer variantes del Button existente es suficiente: no se exige un componente independiente por variante. El tratamiento de iconos usa tokens del tema (§4.4), conservando su geometría.

---

# 9. Navegación principal

## 9.0 Lenguaje visual

**Cerrar sesión:** la única referencia visual canónica es el Dashboard nuevo suministrado por el usuario. Las versiones presentes en otras maquetas son antiguas y no se utilizan. Dark y Light comparten componente, geometría y comportamiento; solo cambian tokens. Mantener `logoutAction` y todo el flujo de sesión. Desktop y mobile conservan sus ubicaciones funcionales vigentes.

- **Barra lateral izquierda** (Surface del tema, ~78 px) con: logo arriba; los 5 módulos en columna (ícono + label debajo); logout como botón Icon al pie, separado.
- Módulo activo: ícono y label en `Primary` sólido. Inactivos: ícono plateado y label `Text Muted`; hover: ícono y label en **dorado cromado** (degradé metálico sobre `Primary`).
- Debajo de los 5 módulos, separados por una línea, **accesos directos** a pantallas existentes: Clientes (`/clientes`), Proveedores (`/proveedores`) y Listas de precios (`/precios`). No son módulos nuevos ni agregan funciones; se resaltan solo en su propia ruta.
- Área de contenido sobre background del tema.
- **Encabezado de pantalla principal:** título H1 a la izquierda; chip `Admin` (sesión) y selector global de theme en la zona superior derecha; línea border-section debajo.
- **Pantallas secundarias** (Fórmulas, Productos Finales, Clientes, Proveedores, Listas de precios, etc.): sin título H1; `Volver` (Tertiary) a la izquierda, título H3 centrado y acción principal a la derecha.

Los frames `FORMULAS` y `PRODUCTOS FINALES` todavía muestran la navegación superior anterior: se aplica igualmente la barra lateral, por consistencia con el resto de los frames.

Módulos (rutas vigentes, sin agregar ítems):

- DASHBOARD (`/`)
- MI FÁBRICA (`/fabrica`)
- PEDIDOS (`/pedidos`)
- STOCK (`/stock`)
- ADMINISTRACIÓN (`/administracion`)

### Reglas jerárquicas estrictas:

1. **FÓRMULAS NO es un ítem de la navegación principal**:
   - Pertenece jerárquicamente a **Mi Fábrica**.
   - Dentro de `/fabrica`, el bloque "FORMULAS" provee los accesos:
     - *Nueva fórmula* $\rightarrow$ abre el modal de alta reutilizando `/formulas?action=new` sin duplicar `NewFormulaModal`.
     - *Ver todas >* $\rightarrow$ navega a la página secundaria completa `/formulas`.
   - Cuando el usuario se encuentra en `/formulas`, **MI FÁBRICA** permanece resaltado como activo.

2. **ADMINISTRACIÓN es una página completa directa, NO un menú desplegable (dropdown)**:
   - Al hacer click en `ADMINISTRACIÓN`, navega directamente a `/administracion`.
   - Las páginas secundarias `/clientes`, `/proveedores` y `/precios` continúan existiendo de forma completa pero se acceden desde los módulos y enlaces internos de `/administracion` (ej. *IR A CLIENTES >*, *IR A PROVEEDORES >*, *LISTA DE PRECIOS*).
   - El acceso a `/system-status` se mantiene como enlace secundario discreto de auditoría al pie de `/administracion`.
   - En `/clientes`, `/proveedores`, `/precios` y `/system-status`, **ADMINISTRACIÓN** permanece resaltado como activo.

3. **Productos desde Mi Fábrica**:
   - En `/fabrica`, el botón *Nuevo Producto* enlaza canónicamente a `/stock?tab=productos&action=new` abriendo directamente el modal de alta de PRO.
   - El enlace *Ver todos >* navega canónicamente a `/stock?tab=productos`.
   - En `/stock`, **STOCK** permanece resaltado como activo.

---

# 10. Patrón general de pantalla

Cada pantalla principal mantiene:

1. barra lateral de navegación;
2. encabezado de pantalla (H1 + chip de sesión + línea) o, en pantallas secundarias, `Volver` + título;
3. acciones principales próximas al contenido que modifican;
4. secciones agrupadas por función en Paneles;
5. tablas para información densa;
6. cards para KPI y como selectores de entidad (cards de Pedidos);
7. ventanas operativas para crear/registrar;
8. pantallas secundarias para detalle/historial.

No convertir información tabular en cards si el Figma la define como tabla.

## 10.1 Contenedores / secciones

- Panel: fondo Surface del tema, borde 1 px `Border Contenedor`, radius `10 px`, padding `15 px` lateral / `12 px` vertical, sin sombra.
- Título de sección: `Título ———— línea` en section-title `#6B6B6B` (B1/H3), línea 1 px border-section (o contraste de text-primary donde esté prescrito) que ocupa el ancho restante; controles opcionales (Buscar, select, `REGISTRAR PAGO`) al extremo.
- Sección de alerta: título y línea `Rojo`, panel con borde `Rojo`.

---

# 11. Patrón de ventanas operativas

Ventanas disparadas por botones (Fabricación, Envasado, Nueva Fórmula, Nuevo Producto, Nuevo Pedido, Compra, Pago Cliente, Pago Proveedor, Gasto Operativo, Retiro, Nueva MPR/COM, Nuevo Cliente, Nuevo Proveedor).

Tratamiento: panel Surface del tema (§10.1, radius 10), título H2/H3, labels sobre inputs, valores automáticos distinguibles, acciones al final (`Cancelar` PrimaryDark; confirmación en su variante semántica). Overlay mediante token semántico del tema. Sin sombras.

## 11.1 Inputs y selects

- Fondo surface-raised/gradiente del tema cuando esté prescrito; borde border-control, texto text-primary y placeholder text-secondary.
- Focus: Primary. Error: Danger y mensaje visible. Disabled: sin interacción, conservando legibilidad.
- Selects, opciones y flecha consumen tokens del tema, incluido el esquema de color nativo.
- Mantener tamaños, radio y comportamiento actuales; no crear controles separados por tema.

---

# 12. Patrón de tablas

- DARK: filas sobre Surface `#0F0F0F`, header `#393939`, texto `#FFFFFF` y divisores con contraste suficiente.
- LIGHT: filas sobre Surface `#F6F6F6`, header `#D9D9D9`, texto `#212121` y divisores finos.
- Encabezados semánticos especiales solo donde estén prescritos; no trasladar automáticamente el dorado de maquetas antiguas a headers nuevos.
- Success para positivos, Danger para faltantes/alertas e Info para enlaces/acciones. La semántica de cobertura se conserva.
- Alertas mediante tokens semánticos de fondo/texto del tema; no imponer un relleno oscuro a Light.
- Mantener densidad actual, alturas de fila, tipografía, radios implementados, alineación numérica, responsive y scroll actuales.

Se preservan ordenamientos, búsquedas, filtros e interacciones. Los criterios de estado pertenecen a `BUSINESS_RULES.md`.

---

# 13. Estados críticos en rojo

El rojo comunica un problema operativo que requiere atención:

- stock actual menor que stock mínimo;
- faltante de cobertura en Resumen de Pedidos;
- celda de un PED que no puede cubrirse completamente;
- acciones destructivas.

Tratamiento:

- valor crítico en `Rojo`;
- fila de alerta con fondo danger-soft y texto de contraste del tema (`URG PARA PEDIDOS`, stock bajo el mínimo, `SALDO ACTUALIZADO` con deuda);
- sección de alerta: título + línea `Rojo`, panel con borde `Rojo`, encabezados de tabla en `Rojo` (`Bajo stock`).

No usar rojo ni verde como decoración.

---

# 14. Acciones por icono

Patrones presentes:

- ojo → visualizar;
- lápiz → editar.

Acciones históricas inmutables deben ofrecer visualización, no edición.

Ejemplos:

- RTO finalizado → visualizar;
- RTM finalizado → visualizar.

---

# 15. Dashboard

## 15.1 Objetivo visual

Aplicar Dark/Light exclusivamente a la estética de estructura general, Reporte mensual, Cuentas, Acceso rápido, Bajo stock, Resumen de pedidos, Cotización dólar y navegación, incluyendo selector de theme y logout. No alterar consultas, cálculos, acciones ni bloques funcionales actuales.

**Cotización dólar compacta:** `COTIZACION DOLAR`, valor actual y fila `[input] [ACTUALIZAR]`. Evitar altura innecesaria; surface, control y botón consumen tokens del tema. Conservar la lógica vigente de cotización y actualización.

Debe funcionar como resumen operativo.

Bloques:

- cards de indicadores;
- Resumen de Pedidos;
- Acceso Rápido;
- Alerta Stock MPR/COM + Simular Compra;
- Cuentas;
- Disponible en Granel.

Tratamiento visual (rediseño, según el frame Dashboard):

- columna izquierda: `REPORTE MENSUAL` con cards KPI (§15.2) de Pedidos abiertos, Ventas del mes, Total facturado (Default) y Ganancia (destacada positiva; el Figma la rotula `MARGEN NETO`, se mantiene `GANANCIA`), más los botones `NUEVO PEDIDO` y `VER VENTAS` (Secondary);
- `ACCESO RAPIDO`: botones icon-only y botón con icono + texto (§8);
- `CUENTAS`: conservar las cards y acciones patrimoniales actuales, con tokens Neutral/Positive/Negative según su significado; mantener Caja Steffen y Caja Mercado Libre separadas;
- columna derecha: `RESUMEN DE PEDIDOS` (matriz con faltantes en `Red` y cobertura con granel en tono secundario);
- franja inferior `BAJO STOCK` con el tratamiento de sección de alerta (§13): tabla de Componente/MP con `SIMULAR COMPRA` y tabla de Producto Final con estado y `SIMULAR`.

El Dashboard conserva su estructura funcional actual; las referencias solo cambian estética. No reconstruir tablas de Cuentas históricas ni eliminar bloques vigentes. El bloque vacío `REPORTE VENTAS` del frame no corresponde a una función vigente y no se implementa hasta que se defina funcionalmente. El atajo `Listas de precios` en Acceso Rápido abre la pantalla existente de Lista de Precios; no crea un flujo nuevo.

---

## 15.2 Cards

Las cards muestran valores derivados en tiempo real.

No deben parecer inputs.

Deben priorizar el valor numérico sobre la etiqueta; contexto temporal secundario cuando corresponda.

Variantes semánticas compartidas por cards y KPI:

- **Neutral:** Surface o gradiente del tema según componente.
- **Positive:** en Light, fondo success-soft y semántica Success; en Dark, Surface oscura con énfasis principalmente en valor/texto/borde Success.
- **Negative:** en Light, fondo danger-soft y semántica Danger; en Dark, Surface oscura con énfasis principalmente en valor/texto/borde Danger.

Los fondos soft son tokens a calibrar visualmente, sin hexadecimales inventados. Un icono es una composición, no otra identidad visual. Conservar tamaños locales y jerarquía existentes; no convertir las cards en inputs.

---

## 15.3 Acceso rápido

Botones visibles para:

- Compra;
- Nuevo Pedido;
- Envasado;
- Fabricación;
- Pago Clientes;
- Pago Proveedor.

Deben abrir exactamente la misma operación que su acceso desde el módulo correspondiente.

No crear flujos duplicados.

---

## 15.4 Resumen de Pedidos

Debe reutilizar visualmente la misma lógica de la matriz de Pedidos, en versión resumida.

No debe aparentar una reserva real.

---

## 15.5 Alerta stock / Simular compra

Tabla compacta con:

- Código;
- Producto;
- Proveedor;
- Actual;
- Cantidad simulada;
- Total estimado.

La simulación debe diferenciarse visualmente de una Compra real.

---

# 16. Mi Fábrica

## 16.1 Acciones principales

Botones:

- Registrar Fabricación;
- Envasado;
- Nuevo Producto;
- Nueva Fórmula;
- Ver todos según sección.

Tratamiento visual (rediseño, según el frame Mi Fábrica):

- `GRANELES`: cada GRA abierto como tile con icono de tanque, kg disponibles, Producto Base, código y fecha; un botón circular `+` registra una Fabricación; tocar un granel abre el registro de Envasado de ese lote (punto de entrada al flujo existente, no un flujo nuevo);
- `PRÓXIMA FABRICACIÓN`: tabla compacta; la fila `URG PARA PEDIDOS` con fondo rojo oscuro (§13); acción `SIMULAR` icon-only por fila;
- `FORMULAS`: panel lateral con selector de PBA, composición (Materia Prima / Cantidad), botón `Nueva formula` (Secondary) y enlace `Ver todas` (Blue) hacia `/formulas`;
- `COSTO-GANANCIA`: tabla compacta con el selector de descuento integrado en el encabezado;
- `MOVIMIENTOS DE FÁBRICA`: tabla compacta a todo el ancho.

Los movimientos se muestran con código `MFA` aunque el frame use `MVF`.

El frame no dibuja los accesos `Envasado` ni `Nuevo Producto`. Envasado queda accesible desde los tiles de granel; `Nuevo Producto` y `Ver todos` de Productos (§9, regla 3) se mantienen.

---

## 16.2 Granel disponible

Tabla/listado con:

- GRA;
- Fecha;
- Producto Base;
- kg disponibles.

Cada lote se muestra individualmente.

---

## 16.3 Próximas fabricaciones

Tabla con:

- Producto Final;
- Stock mínimo;
- Stock actual;
- Estado;
- acceso a simulación cuando corresponda.

Estados:

- `URG PARA PEDIDOS`
- `POCO STOCK`

`URG PARA PEDIDOS` tiene prioridad visual.

---

## 16.4 Fórmulas

La pantalla secundaria muestra:

- PBA;
- código MPR;
- Materia Prima;
- cantidad `(kg)`;
- costo/kg;
- costo final;
- total kg;
- costo granel;
- costo por kg.

Debe existir acción Editar Fórmula.

Tratamiento visual (rediseño, según el frame Fórmulas): navegación de pantalla secundaria con `Volver` y título `FORMULAS`; `NUEVA FORMULA` (Secondary) arriba a la derecha; lista lateral de PBA con el patrón Lista (seleccionado con fondo degradé, con icono); panel con Producto Base y código, tabla de composición (Código, Materia Prima, Cantidad (kg), Costo por kilo, Costo final) y totales automáticos (Total kg granel, Costo granel, Costo producto por kg); `Editar Formula` (Secondary) abajo a la derecha.

---

## 16.5 Productos Finales

Pantalla secundaria con lista de PRO y ficha del producto seleccionado.

Ficha:

- Código;
- Fecha creación;
- PBA;
- Presentación;
- Peso `(kg)`;
- composición;
- costo base;
- componentes;
- subtotal;
- costo extra variable 2%;
- costo total.

Tratamiento visual (rediseño, según el frame Productos Finales): navegación de pantalla secundaria con `Volver` y título `PRODUCTOS FINALES`; `NUEVO PRODUCTO` (Secondary) arriba a la derecha; lista lateral de PRO con el patrón Lista (seleccionado con fondo degradé); panel con la ficha en grilla de pares label/valor, tabla de composición (Código, Cantidad, Componente, Costo), `Costo Extra Variable 2%` y `Costo Total` destacado; `Editar Producto` (Secondary) abajo a la derecha.

El campo Peso se muestra siempre en kg (`Peso (kg)`), aunque el frame muestre otra unidad.

---

## 16.6 Costo-Ganancia

Nombre definitivo:

`COSTO-GANANCIA`

No utilizar “Margen por producto”.

Tabla:

- Producto Final;
- Costo Total;
- Precio Lista Salón;
- Descuento;
- Precio Final;
- Markup;
- Ganancia.

Selector de descuento:

- 35%;
- 30% + 10% + 5%;
- 40% + 10%;
- 50%.

La sección utiliza exclusivamente Lista Salón.

---

## 16.7 Movimientos de Fábrica

Tabla:

- Código MFA;
- Fecha;
- Tipo;
- Descripción;
- Origen/registro.

Tipos visibles:

- Fabricación;
- Envasado;
- Merma;
- Sobrante.

---

# 17. Stock

## 17.1 Subpestañas

- Productos
- Materias Primas
- Componentes

Mantener patrón de pestañas consistente.

Tratamiento visual (rediseño, según el frame Stock):

- pestañas `Productos` / `Materia Prima` / `Componentes` como botones con icono en patrón Lista (seleccionada con fondo degradé);
- `NUEVA MATERIA PRIMA/COMPONENTE` (Secondary) arriba a la derecha;
- título de sección con línea horizontal y `Buscar` alineado a la derecha;
- tabla compacta con filas `actual < mínimo` con fondo rojo oscuro (§13);
- sección `MOVIMIENTOS DE STOCK` debajo, con códigos `MST` aunque el frame use `MVS`.

Se conservan filtros (incluido el filtro por proveedor de Materias Primas), búsqueda y orden por prioridad de stock.

---

## 17.2 Productos

Tabla:

- Código;
- Producto Final;
- Stock Actual;
- Stock Mínimo.

Filas críticas:

- rojo cuando `actual < mínimo`.

El orden no se representa como orden alfabético/código, sino por prioridad de stock definida en negocio.

---

## 17.3 Materias Primas

Tabla con información más densa:

- Código;
- Proveedor de referencia;
- Materia Prima;
- INCI;
- Última Compra;
- Última Actualización de Precio;
- Moneda;
- Precio unitario moneda origen;
- Precio unitario ARS;
- Precio unitario ARS + IVA;
- Stock Actual;
- Stock Mínimo.

Filtro por proveedor.

El proveedor visible principal es el de la **última actualización de precio** del ítem.

---

## 17.4 Componentes

Mismo patrón de prioridad y criticidad que Materias Primas.

Unidad de stock:

`unidades`

---

## 17.5 Movimientos de Stock

Tabla:

- Código MST;
- Fecha;
- Tipo;
- Registro;
- Descripción.

No utilizar el prefijo viejo MVS.

---

# 18. Pedidos

## 18.1 Pedidos abiertos

Tabla superior:

- Código PED;
- Fecha;
- Cliente/origen;
- Importe final potencial;
- Ver.

Solo PED abiertos.

Tratamiento visual de la pantalla Pedidos (rediseño, según el frame Pedidos):

- sección `PEDIDOS`: cada PED abierto como card seleccionable con cliente, código, fecha e importe. Default: superficie/gradiente del tema y border-section. Selected DARK: fondo `#000000`, borde `#C38926`, **sin gradiente**. Selected LIGHT: surface/gradiente claro según diseño, borde `#C38926`. El estado no cambia dimensiones. El botón circular `+` conserva la creación de Pedido;
- al seleccionar una card, el detalle del PED (§19) se muestra en un panel debajo, en la misma pantalla;
- sección `RESUMEN DE PEDIDOS`: matriz compacta (§12) con faltantes en `Red` y cobertura con granel en tono secundario.

La card conserva la información vigente de la lista: también muestra el importe final potencial y da acceso a Ver, aunque el frame solo dibuje código, cliente y fecha.

La alerta de RTM pendiente (§18.6) conserva prioridad visual máxima. Se conserva el reordenamiento de filas y columnas.

---

## 18.2 Resumen de Pedidos

Es una matriz.

Filas:

Productos Finales presentes en al menos un pedido abierto.

Columnas:

Pedidos abiertos.

Columnas finales:

- Total;
- Stock;
- cobertura con granel;
- Faltante.

---

## 18.3 Reordenamiento

Filas y columnas son reordenables.

La UI debe dejar claro que:

- orden de filas = prioridad de productos;
- orden de columnas = prioridad de pedidos/clientes.

El orden persistido debe reflejarse al volver a entrar.

---

## 18.4 Faltantes

Si un PED no puede cubrir su cantidad:

- la celda de cantidad se marca en rojo.

Si el producto queda con faltante:

- el faltante final se marca en rojo.

---

## 18.5 Reserva simulada

Debe existir una leyenda o indicación visual que deje claro:

`Planificación / simulación — no modifica stock`

No presentar reservas virtuales como stock comprometido real.

## 18.6 RTM pendiente

Si existe un RTO en estado `RTM_PENDING`:

- mostrar una alerta persistente y prioritaria;
- ofrecer acción `COMPLETAR RTM`;
- al entrar a Pedidos, priorizar este flujo;
- deshabilitar la confirmación de un nuevo RTO hasta resolverlo.

---

# 19. Pedido abierto

Pantalla/ventana de detalle del PED.

Muestra:

- Código;
- Fecha;
- Cliente/datos;
- Domicilio;
- bultos;
- peso `(kg)`;
- líneas;
- Cantidad;
- Producto;
- PU;
- PT;
- AG;
- Subtotal;
- descuentos;
- Total Pedido;
- Saldo;
- Total a Cobrar.

Acciones por línea:

- editar;
- borrar.

Acción destructiva:

- Borrar Pedido con confirmación.

Tratamiento visual Dark/Light:

- Conservar los datos y campos actualmente editables; no inventar campos a partir de maquetas históricas.
- Título `PEDIDO xxxx`, cabecera compacta y bultos/input según theme.
- Columnas de datos: **Cant. / Producto / PU / PT / AG**. Conservar acciones de línea vigentes en una celda o control auxiliar, sin perder eliminar producto.
- Importes preferentemente en una línea cuando el ancho lo permita, por ejemplo `$ 7.032.190,00`; evitar separar verticalmente símbolo y número si hay espacio horizontal. Esto no modifica precisión, cálculo ni formato monetario funcional vigente.
- Peso, cantidades, labels e importes se adaptan horizontalmente al contenido cuando sea posible, sin apilados artificiales.
- Totales alineados y jerarquía actual, sin alterar cálculos.
- Al implementar autosave (`FLOWS.md` §14), eliminar Guardar y Cancelar de la edición del Pedido; redistribuir el footer sin huecos reservados. Conservar Borrar pedido con confirmación y Generar remito (Success).
- La X simplemente cierra; no pregunta si guardar ni cancela persistencia. Estados de guardado/error visibles sin ampliar globalmente controles.

El flujo de confirmación del RTO conserva su función y sus propios controles; la eliminación de Cancelar del editor no elimina cancelar una confirmación o descartar el formulario de agregar producto.

---

# 20. RTO

El RTO final:

- reemplaza cantidad solicitada por cantidad enviada AG;
- muestra cálculos reales;
- es documento histórico;
- luego de confirmar no se edita.

Debe permitir visualizar/generar PDF.

---

# 21. RTM

Misma base visual del RTO agregando:

- Costo Unitario;
- Costo Total;
- Costo Productos;
- Transporte;
- Ganancia.

No utilizar “Margen”.

---

# 22. Administración — pantalla principal

La implementación actual de Administración determina sus bloques, acciones y navegación. Aplicar tokens Dark/Light a las secciones vigentes, Cotización USD, Ventas, cuentas de clientes/proveedores y movimientos sin reconstruir estructuras retiradas.

**Referencia histórica excluida:** la antigua sección/tablas de Cuentas visible en algunas maquetas de Administración NO debe restablecerse. Las nuevas imágenes establecen estética; cuando contradigan funcionalidad vigente prevalece el sistema actual. Conservar los accesos actuales, incluida Liquidación Mercado Libre y `/system-status` donde ya existan.

---

## 22.1 Acciones superiores

Accesos:

- Gasto Operativo;
- Lista de Precios;
- otras acciones administrativas definidas.

---

## 22.2 Cotización USD

Mostrar simultáneamente:

- Cotización Actual;
- última actualización;
- input Nueva Cotización;
- botón Actualizar.

No ocultar el valor actualmente vigente.

---

## 22.3 Ventas

Tabla compacta:

- Fecha;
- Cliente/origen;
- Total;
- Ganancia;
- N.º RTO;
- Ver RTO.

Acceso:

`IR A VENTAS`

---

## 22.4 Resumen Cuentas Clientes

Mostrar todos los clientes.

Clientes con saldo `> 0`:

- primero;
- destacados en rojo.

Clientes sin deuda:

- debajo.

Columnas:

- Cliente;
- Saldo;
- Último Pago;
- Última Compra;
- Cuenta.

---

## 22.5 Deudas Proveedores

Mostrar únicamente proveedores con deuda positiva.

Columnas equivalentes:

- Proveedor;
- Saldo;
- Último Pago;
- Última Compra;
- Cuenta.

---

## 22.6 Cuentas — referencia histórica, no reconstruir

La maqueta histórica mostraba:

- Caja Steffen;
- Caja Mercado Libre;
- Deudas Clientes;
- Deudas Proveedores;
- Neto.

Acción histórica:

- Retiro Caja.

Esta lista no ordena reconstruir una sección ni trasladar sus acciones. Conservar las ubicaciones funcionales actuales y el acceso vigente a Liquidación Mercado Libre.

---

## 22.7 Últimos Movimientos

Tabla resumida:

- Código MOV;
- Fecha;
- Tipo;
- Descripción;
- Importe;
- Variación Patrimonial.

Acceso:

`IR A MOVIMIENTOS`

---

# 23. Movimientos — pantalla completa

Default:

`Últimos 90 días`

Debe permitir:

- rango de fechas;
- filtro por tipo;
- búsqueda.

Orden:

más reciente primero.

La existencia de un filtro de 90 días no debe comunicar que movimientos más antiguos fueron eliminados.

---

# 24. Ventas — pantalla completa

Elementos:

- selector de año;
- selector de mes;
- cards;
- tabla histórica.

Cards:

- cantidad de ventas;
- Total Facturado;
- Ganancia Total.

Tabla:

- Fecha;
- Cliente/origen;
- Total;
- Ganancia;
- N.º RTO;
- RTO;
- RTM.

Orden:

más reciente primero.

Tratamiento visual (rediseño, según el frame Ventas):

- navegación de pantalla secundaria con `Volver` y título `VENTAS`;
- selector de período en una fila: año + doce meses como botones; el mes seleccionado con fondo `Blue`;
- cards KPI (§15.2): cantidad de ventas y Total facturado Neutral; Ganancia con semántica Success/Positive; el resto neutral salvo significado explícito. El selector año/mes se adapta al theme sin cambiar filtros ni cálculos;
- sección `VENTAS DEL MES` con tabla compacta (Ganancia en `Green`; acceso a RTO y RTM con icono de documento, que abre el PDF almacenado).

Los labels normativos se mantienen: `GANANCIA` (no `MARGEN` ni `MARGEN NETO`), `RTO` y `RTM` (no `R. CLIENTE` / `R. MARGEN`).

El botón PDF del frame no corresponde a un documento vigente de Ventas (los PDFs del MVP son RTO, RTM y Estados de Cuenta): no se implementa hasta que se defina funcionalmente.

---

# 25. Cuentas Clientes

## 25.0 Tratamiento visual (rediseño, según el frame Clientes)

- navegación de pantalla secundaria con `Volver` y título `CLIENTES`; Nueva Cuenta como botón icon-only (persona +) arriba a la derecha;
- lista lateral de clientes con el patrón Lista (icono de persona; transparente por defecto, fondo degradé cuando está seleccionado) y `Ver mas` al final;
- `FICHA CLIENTE <nombre>`: título con línea, lápiz de edición a la derecha y datos en grilla de pares label/valor;
- `MOVIMIENTOS`: título con línea y `Buscar` alineado a la derecha; asiento con tabla compacta (Fecha, Venta, Remito, Pago, Total), acceso al RTO por icono y lápiz en Pagos;
- fila final `SALDO ACTUALIZADO`, con fondo rojo oscuro cuando hay deuda (§13);
- `REGISTRAR PAGO` (Success) y botón PDF de Estado de Cuenta icon-only.

## 25.1 Selector de clientes

Los editados recientemente aparecen primero.

Mostrar un conjunto inicial.

Última opción:

`VER MÁS`

---

## 25.2 Nueva Cuenta

Abre Nuevo Cliente.

---

## 25.3 Ficha Cliente

Debe mostrar:

- Código;
- DNI;
- Domicilio;
- Provincia;
- Localidad;
- Transporte;
- Teléfono;
- Dirección Transporte;
- Fecha Registro;
- Categoría;
- Descuento 1;
- Descuento 2;
- Descuento 3.

Lápiz:

- editar ficha.

---

## 25.4 Asiento de cuenta

Formato de movimientos:

- Fecha;
- Venta;
- RTO;
- Pago;
- Total/Saldo.

RTO:

- visualizar.

Pago:

- editar.

---

## 25.5 Acciones

- Registrar Pago;
- PDF Estado de Cuenta.

---

# 26. Estado de Cuenta — ventana

Debe respetar el estilo de las demás ventanas operativas.

Campos:

- Cliente/Proveedor automático;
- Fecha Desde;
- Fecha Hasta.

Acciones:

- Cancelar;
- Generar PDF.

El PDF resultante contiene:

- saldo anterior;
- movimientos del período;
- saldo final.

La estructura y el template MVP del documento están definidos en `PDFS.md`.

---

# 27. Cuentas Proveedores

Mismo patrón visual de Cuentas Clientes, incluido el tratamiento visual del rediseño (§25.0). Según el frame Proveedores, el panel inferior se divide en `MATERIAS PRIMAS/COMPONENTES` (lista editable de ítems asociados) y `MOVIMIENTOS` (asiento con Compra y Pago).

La ficha sigue mostrando la Moneda del proveedor como dato de solo lectura (§31.1), aunque el frame no la dibuje.

Agregar sección:

`MATERIAS PRIMAS / COMPONENTES`

Los ítems asociados son editables.

Asiento:

- Compra;
- Pago.

Compra y Pago:

- editables según reglas funcionales.

---

# 28. Lista de Precios

## 28.1 Selector de Lista

Debe poder cambiar entre:

- Salón;
- Público;
- Ecommerce;
- futuras listas activas.

---

## 28.2 Tabla

- Código PRO;
- Producto Final;
- Precio Actual;
- Última Actualización;
- Editar/seleccionar.

---

## 28.3 Acciones

- Crear Lista;
- Renombrar Lista;
- Activar/Desactivar listas adicionales;
- Aumentar toda la lista;
- Aumentar productos seleccionados.

Los precios se muestran sin centavos.

---

# 29. Compra

Ventana con:

- Proveedor;
- Código CMP;
- Fecha;
- Moneda;
- Cotización si USD;
- líneas de compra;
- cantidad;
- MPR/COM;
- posibilidad de seleccionar un ítem existente aunque aún no esté asociado al proveedor;
- posibilidad de crear una nueva MPR/COM desde la Compra;
- PU neto;
- PU ARS + IVA;
- total de línea;
- total general.

Si proveedor USD:

mostrar cotización propuesta y permitir editarla solo para esa CMP.

Acciones:

- Cancelar;
- Registrar Compra;
- Registrar Deuda Proveedor.

La diferencia entre ambas acciones debe quedar visualmente clara.

---

# 30. Pago Cliente

Campos:

- Fecha;
- Cliente;
- Importe.

Selector:

`CLIENTE | SALDO`

Solo deuda positiva.

---

# 31. Pago Proveedor

Campos:

- Fecha;
- Proveedor;
- Importe.

Selector:

`PROVEEDOR | SALDO`

Solo deuda positiva.

---
## 31.1 Nuevo Proveedor

Campos:

- Código automático;
- Fecha de creación;
- Proveedor;
- Vendedor;
- Teléfono;
- Moneda:
  - ARS;
  - USD.

La moneda es obligatoria y luego se hereda automáticamente en Compras.

Después de registrar el Proveedor, Moneda se muestra como dato de solo lectura y no ofrece edición.

---

# 32. Gasto Operativo

Campos:

- Fecha;
- Tipo;
- Descripción;
- Importe.

Tipos iniciales:

- Luz;
- Alquiler;
- Comisión;
- Otro.

Si `Otro`:

la UI debe mostrar Descripción como requerida.

---

# 33. Retiro

Campos:

- Fecha;
- Descripción;
- Importe.

---

# 34. Liquidación Mercado Libre

Ventana administrativa con:

- Fecha;
- Saldo actual Caja Mercado Libre;
- Importe Bruto;
- Importe Neto a Caja Steffen;
- Comisión calculada.

Debe visualizar claramente:

`Bruto = Neto + Comisión`

---

# 35. Reportes

> **Derogación.** La definición visual anterior ("pantalla compuesta por cuatro cards", "no contiene tablas ni inputs", grilla 2×2 con Ventas del mes / Total facturado / Ganancia / Pedidos abiertos) queda **derogada**. Esas cuatro métricas se conservan en el bloque `REPORTE MENSUAL` del Dashboard (§15.1; `BUSINESS_RULES.md` §35.5).

Reglas funcionales: `BUSINESS_RULES.md` §36. Contrato consolidado: `REPORTES.md`.

Esta sección define **jerarquía, composición, proporciones conceptuales, controles, interacción, responsive, comportamiento de gráficos y estados de carga/vacío** (aprobados en R3.1 Desktop, R3.2 Interacciones y R3.3 Responsive).

R1 fija paleta y theming en §35.11. Se reutilizan componentes y densidad actuales (tokens, Panel, SectionHeader, inputs/selects, tabs, tablas y empty states), sin redefinir tamaños globales.

Motor gráfico actual: Recharts. Este contrato no requiere instalar dependencias.

## 35.1 Estructura general

```
REPORTES                                   [Año global ▼]

FACTURACIÓN
  [Resumen anual — KPIs]
  [Evolución mensual ~60%] [Facturación y Ganancia por año ~40%]

PRODUCTOS
  [Ranking de productos ~60%] [Participación por producto ~40%]

CLIENTES
  Columna izquierda ~60%: Mayores compradores → Análisis individual
  Columna derecha ~40%: Concentración → Evolución de la concentración
  (apilados independientes, sin filas compartidas)
```

- El **selector global de año** se ubica en el encabezado general de Reportes, **no** dentro de Facturación. Controla toda la página.
- Tres macrosecciones con **títulos visibles**: `FACTURACIÓN`, `PRODUCTOS`, `CLIENTES`.
- Cada gráfico, ranking o bloque analítico vive en **su propio Panel**. No se usa un único mega-panel por sección.
- Las proporciones son conceptuales (aprox.); no se fijan píxeles.

## 35.2 Breakpoints de Reportes

Se mantiene el criterio responsive existente del ERP (navegación §3.5):

| Rango | Navegación | Layout de Reportes |
|---|---|---|
| Desktop `>= 1280 px` | barra lateral visible | §35.3–§35.5 |
| Tablet aprox. `768 px – 1279 px` | topbar / drawer existente | §35.9 |
| Mobile (ancho chico, `< 768 px`) | topbar / drawer existente | §35.10 |

No se crea un breakpoint exclusivo para Reportes salvo necesidad técnica posterior demostrada.

## 35.3 FACTURACIÓN — desktop

Orden:

1. **Resumen anual**: KPIs `FACTURACIÓN`, `GANANCIA`, `GASTOS OPERATIVOS`, `TRANSPORTE`, `VENTAS`, `MARGEN %`, distribuidos a lo ancho disponible.
2. Segunda fila, relación aprox. **60/40**:
   - **Evolución mensual** (~60%): necesita mayor ancho (12 meses × 3 series: Facturación, Ganancia, Gastos operativos).
   - **Facturación y Ganancia por año** (~40%): **barras agrupadas** (no líneas); año seleccionado + 2 anteriores.

## 35.4 PRODUCTOS — desktop

Dos paneles en una fila, relación aprox. **60/40**.

### Ranking de productos (~60%)

- Tabs: `Más vendidos` / `Mayor facturación` / `Mayor contribución`. Una sola tab activa por vez.
- Selector local `Top 5` / `Top 10`: afecta **solo** este ranking.
- Cada fila: nombre del producto, barra proporcional y valor.

### Participación por producto (~40%)

- Selector **independiente** `Unidades` / `Facturación` / `Contribución`; no depende de la tab activa del Ranking.
- Unidades → dona.
- Facturación → dona.
- Contribución → dona si todos los valores representados son `>= 0`; si existe al menos una contribución negativa, cambia **automáticamente** a barras, sin pedir confirmación.

## 35.5 CLIENTES — desktop

Dos columnas verticales independientes:

| Columna izquierda (~60%) | Columna derecha (~40%) |
|---|---|
| Mayores compradores → Análisis individual | Concentración → Evolución de concentración |

El segundo panel de cada columna comienza inmediatamente debajo del primero, con el gap actual correspondiente, sin esperar la altura del vecino. No forzar alturas iguales ni alineación horizontal entre segundos paneles. Expandir historial solo aumenta su propio panel.

### Mayores compradores

- Selector local `Top 5` / `Top 10`.
- Orden: facturación total descendente.
- Visualización: ranking tipo tabla con **barras proporcionales integradas**.
- Columnas: Nombre, Total comprado/facturado, Promedio mensual, Última compra, Frecuencia.
- Frecuencia como valor simple (ej.: `24 días`). **No** se generan estados interpretativos ("atrasado", "en fecha", "debería comprar"): no existe regla normativa de tolerancia.

### Análisis individual

- Selector de entidad analítica **buscable por nombre** (cliente registrado, `Mercado Libre`, `Consumidor Final`, según `BUSINESS_RULES.md` §36.8).
- Al cambiar la entidad se actualizan inmediatamente KPIs, gráfico mensual e historial. Sin botón Aplicar.
- KPIs: Total anual, Promedio mensual, Ticket promedio, Compras/Ventas, Frecuencia, Última compra.
- Evolución mensual: gráfico enero–diciembre.
- Historial: **cerrado por defecto**; control `Ver historial`. Al expandirse muestra como mínimo RTO, Fecha y Total. Si existe una ruta válida al detalle de RTO, la fila permite navegar; no se inventa una ruta nueva.

### Concentración

- Panel con **dona** (posiciones 1–5 / 6–10 / resto) e **indicadores acumulados debajo** (`TOP 5`, `TOP 10`, `RESTO`).
- Sin facturación válida: se mantiene el panel y se muestra `Sin datos`, con `TOP 5: —`, `TOP 10: —`, `RESTO: —` (`BUSINESS_RULES.md` §36.9.2.1).

### Evolución de la concentración

- **Barras horizontales agrupadas**: año seleccionado vs año seleccionado − 1, métricas Top 5 / Top 10 / Resto.
- Si el año anterior no tiene datos: se mantiene el gráfico/panel y esa serie se representa como `Sin datos`. No se oculta toda la comparación.

## 35.6 Interacciones generales

- **Selector global de año:** al seleccionar otro año se actualiza toda la página inmediatamente. Sin botón Aplicar.
- **Tooltips (desktop):** hover sobre punto, barra o segmento muestra categoría/mes y valor exacto formateado.
- **Evolución mensual:** las tres series visibles inicialmente; la **leyenda es interactiva** y permite ocultar/mostrar individualmente Facturación, Ganancia y Gastos operativos.
- **Facturación y Ganancia por año:** barras agrupadas, no líneas.
- **Selectores locales** (`Top 5`/`Top 10`, tabs, métrica de participación, entidad): actualizan solo su bloque, sin botón Aplicar.

## 35.7 Touch

- Tap sobre punto, barra o segmento muestra el tooltip.
- Otro tap / cambio de elemento reemplaza el tooltip anterior.
- La leyenda de series sigue siendo interactiva: tocar una leyenda activa/desactiva la serie correspondiente.
- Touch targets según §3.22.

## 35.8 Loading, empty states y alturas

- **Loading:** no se usa spinner general de página. Cada panel mantiene su estructura y muestra skeleton/loading interno en su bloque.
- **Empty states:** nunca se oculta completamente un panel por falta de datos. Se mantienen título, controles relevantes y estructura, y se muestra un empty state interno (COMPONENTS §51). Valores de empty state: `REPORTES.md` §12.
- **Alturas:** cada tipo de gráfico puede tener su altura natural. No se impone una altura uniforme. Se prioriza legibilidad, labels completos y buena relación con el contenido.

## 35.9 Tablet (aprox. 768 px – 1279 px)

- Conservar **dos columnas** cuando el contenido entre de forma legible. No se obliga a una sola columna desde 1279 px.
- Las proporciones 60/40 pueden transformarse en 50/50 o distribución equivalente según el espacio disponible.
- Resumen anual: **3 KPIs por fila** cuando el ancho lo permita.
- No se fijan píxeles.

## 35.10 Mobile

### General

- **Una sola columna.** En CLIENTES conservar un único orden de lectura: Mayores compradores → Concentración → Análisis individual → Evolución de concentración. No duplicar componentes para obtener el layout desktop/mobile.
- Orden obligatorio de macrosecciones: 1. FACTURACIÓN, 2. PRODUCTOS, 3. CLIENTES. No se reordenan.
- Encabezado: `REPORTES` y, debajo, el selector global de año a ancho completo o prácticamente completo.
- Ningún panel provoca scroll horizontal de toda la página.

### Resumen anual

- KPIs en grilla de **2 columnas**.
- Si queda una última card impar, puede ocupar el ancho disponible según convenga al layout.
- No se usa carrusel horizontal de KPIs.

### Gráficos mensuales (Evolución mensual general e individual)

- Se preservan los 12 meses.
- Si no entran legiblemente: **scroll horizontal interno del área gráfica**. No se comprimen excesivamente los labels para forzar que entre todo.
- Solo el área gráfica se desplaza horizontalmente; el panel no provoca scroll horizontal de la página.

### Facturación y Ganancia por año

- Se mantienen las barras agrupadas (3 años); se adapta el ancho. No cambia el tipo de gráfico por ser mobile.

### Productos

- Tabs `Más vendidos` / `Mayor facturación` / `Mayor contribución`: se mantienen; si no entran, scroll horizontal interno de tabs. **No** se convierten en select.
- Selector `Top 5` / `Top 10`: visible; no se esconde en un menú.
- Ranking: cada fila mantiene nombre del producto, barra proporcional y valor. Solo se reduce información secundaria si es necesario. **No** se transforma cada producto en una card independiente.
- Participación: dona/barras ocupan el ancho disponible; la leyenda pasa debajo del gráfico.

### Mayores compradores

- **No** se usa tabla horizontal con scroll.
- Cada entidad es una fila/card compacta de dos niveles:
  - nivel superior: Nombre + Total;
  - nivel secundario: Promedio/mes · Última compra · Frecuencia;
  - al pie: barra proporcional.
- Se mantiene el selector `Top 5` / `Top 10`.

### Análisis individual

- Selector buscable de entidad a ancho completo.
- KPIs en grilla de 2 columnas.
- Evolución mensual con scroll horizontal interno si hace falta.
- Historial expandido como filas/cards compactas (RTO, Fecha, Total); se evita tabla horizontal. Tocar la fila puede abrir el detalle de RTO si existe ruta válida.

### Concentración

- Dona primero; debajo `TOP 5`, `TOP 10`, `RESTO`, en 3 columnas si el ancho lo permite; si no, adaptar/apilar sin comprometer legibilidad.
- Evolución de la concentración: se mantienen barras **horizontales**; no se convierten a verticales.

### Empty states en mobile

- Se mantiene el panel con título y controles si aplican, y un empty state compacto dentro. No se reduce el bloque a una simple línea externa.

## 35.11 Paleta y theme de gráficos — R1

El dorado `#C38926` queda excluido de todas las series estadísticas, incluidas barras proporcionales de rankings. No cambia ningún cálculo, filtro ni criterio analítico.

| Serie económica | Color |
|---|---|
| Facturación | `#0E50A0` |
| Ganancia | `#008102` |
| Gastos operativos | `#DD0000` |

Comparaciones por período: seleccionado azul; período anterior gris/neutro. En gráficos cuya serie identifica una métrica económica (Facturación/Ganancia por año), mantener la paleta económica y los años como categorías, sin confundir ambas codificaciones.

| Categoría Top 4 + Otros | Color |
|---|---|
| Categoría 1 | `#0E50A0` |
| Categoría 2 | `#008102` |
| Categoría 3 | `#DD0000` |
| Categoría 4 | `#7C3AED` |
| Otros | `#6B7280` |

La paleta categórica distingue categorías; no implica resultado positivo/negativo salvo significado explícito del gráfico. Concentración utiliza azul para posiciones 1–5, verde para posiciones 6–10 y neutro Otros para Resto. Mantener correspondencia entre geometría, tooltip y leyenda.

Panels y fondo de charts: Surface del tema. Tooltip: Surface + border-section + text-primary. Grid: chart-grid. Ejes/labels: chart-axis. Leyenda: sistema visual compartido del ERP. No usar defaults de Recharts que rompan el tema.

Cada gráfico puede conservar su altura específica por legibilidad; no eliminarlas arbitrariamente. FACTURACIÓN y PRODUCTOS mantienen estructura mientras no genere espacio muerto significativo; CLIENTES sigue §35.5. Solo quedan por calibrar derivados de contraste/soft y detalles locales que no alteren la densidad vigente.

---

# 36. PDFs

Documentos del MVP:

- RTO;
- RTM;
- Estado de Cuenta Cliente;
- Estado de Cuenta Proveedor.

Diseño MVP:

- formato A4 vertical;
- estilo administrativo y sobrio;
- fondo blanco (los PDFs no adoptan la interfaz dark de la aplicación);
- texto negro/gris;
- uso del dorado según el contrato independiente de `PDFS.md`; los PDFs versionados y assets históricos no cambian por Dark/Light;
- logo Steffen en encabezado;
- tablas simples y legibles;
- sin elementos decorativos innecesarios.

RTM debe indicar claramente:

`USO INTERNO`

Los PDFs se generan desde datos históricos/snapshots ya confirmados.

No recalculan información vigente.

Una vez generado un PDF final, se almacena. Las acciones `Ver RTO`, `Ver RTM` y equivalentes abren el archivo almacenado; no vuelven a generarlo en cada visualización.

El contrato de datos, estructura por documento y estrategia de templates se define en `PDFS.md`.

La identidad visual podrá evolucionar posteriormente sin cambiar la lógica ni los contratos de datos.

---

# 37. Textos y nomenclaturas definitivas

Utilizar:

- `Costo-Ganancia`, no “Margen por producto”.
- `Ganancia`, no “Margen” en RTM/Ventas.
- `MFA`, no MVF.
- `MST`, no MVS.
- `MPR`, no MAT.
- `Peso (kg)`.
- `Kg disponibles`.
- `Stock mínimo`.
- `Total Pedido`.
- `Saldo`.
- `Total a Cobrar`.

Las etiquetas antiguas del Figma deben corregirse al implementar.

---

# 38. Contenido automático vs editable

La UI debe distinguir claramente:

### Automático

- códigos;
- costos calculados;
- totales;
- equivalencias ARS;
- kg disponibles;
- saldos;
- precios derivados;
- comisión calculada;
- ganancia.

### Editable

solo campos permitidos por los flujos.

No presentar un valor automático como input editable.

---

# 39. Diseño pendiente

Queda pendiente el refinamiento visual no funcional de:

- animaciones/transiciones no esenciales;
- detalles estéticos opcionales.

R1 conserva el comportamiento responsive actual según §3.0; no abre una nueva fase de rediseño mobile/tablet.

No inventar una identidad visual nueva para los puntos todavía pendientes: se aplica el lenguaje visual del nuevo Figma.
