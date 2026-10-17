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

El rediseño es exclusivamente visual: no agrega ni elimina funciones, no cambia rutas, flujos, reglas ni modelo de datos.

Frames de referencia del nuevo Figma (rediseño dark definitivo): `docs/visual-references/figma/` — `Frame 1.png` (guía de estilo: paleta, tipografía, márgenes, botones, inputs, cards), Dashboard, Mi Fábrica, Fórmulas, Pedidos, Pedido, Productos Finales, Stock, Ventas, Administración, Cuentas Clientes, Cuentas Proveedores, y el tablero completo en `Pdf.pdf`.

Íconos base: `docs/visual-references/iconos/` (se usan tal cual; solo se adapta color/estilo, ver §4.4).

Estos frames son las referencias visuales **definitivas** y reemplazan a las anteriores, que fueron eliminadas. No deben restaurarse ni usarse como fuente vigente.

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

## 3.0 Estado vigente (rediseño visual)

- La **referencia primaria es desktop**, según el nuevo Figma.
- El comportamiento mobile/tablet final **no se diseña en esta etapa**: la adaptación responsive se resuelve en **Fase 18**.
- Los componentes deben construirse de forma que permitan esa adaptación futura.
- Evitar dimensiones rígidas innecesarias (anchos/altos fijos de contenedores, tablas o columnas cuando no los exija el diseño).

El principio funcional de §3.1 (misma funcionalidad en todos los dispositivos) se mantiene.

Las subsecciones §3.2–§3.24 son **pautas preliminares**: se conservan como insumo para Fase 18 y no son normativas hasta que esa fase las revise contra el nuevo lenguaje visual.

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

Fuente: frame de estilo definitivo `docs/visual-references/figma/Frame 1.png` (paleta, tipografía, márgenes, botones, inputs, cards) y los frames de pantalla del mismo directorio.

## 4.1 Paleta definitiva (tokens)

| Token | Valor | Uso |
|---|---|---|
| Primary | `#C38926` | dorado Steffen: identidad, módulo activo de la navegación, borde de KPI y de card seleccionada, encabezado destacado de tabla |
| Secondary | `#000000` | fondo de paneles/secciones, barra lateral, superficies internas |
| Surface | `#FBFBFB` | texto principal sobre dark; superficie clara (modo light futuro) |
| Fondo | `#EFEFEF` | fondo de página del **modo light** (reservado; no se implementa todavía) |
| Fondo Dark | `#101010` | fondo de página del modo dark (área de contenido detrás de los paneles) |
| Border Button | `#D9D9D9` | borde de botones, inputs y selects |
| Border Contenedor | `#393939` | borde de paneles/secciones; fondo del encabezado de tabla |
| Tertiary (Blue) | `#0E50A0` | `Volver`, enlaces `IR A …` / `Ver todas ▸`, navegación secundaria |
| Blue Hover | `#6E96C6` | hover de Blue |
| Verde | `#008102` | acción positiva (`REGISTRAR PAGO`, `ACTUALIZAR`), resultado favorable |
| Verde Hover | `#015C02` | hover de Verde |
| Rojo | `#DD0000` | destructivo, alerta, faltante |
| Rojo Hover | `#B10000` | hover de Rojo |
| Surface Dark Degrade | `linear-gradient(180deg, #121212 0%, #000000 100%)` | fondo de botones, inputs, selects, cards de pedido e ítem de lista seleccionado |

Tokens derivados (necesarios para reproducir los frames; se documentan aquí antes de usarse):

| Token | Valor | Uso |
|---|---|---|
| Text Muted | `#9A9A9A` | títulos de sección (`Reporte mensual`, `VENTAS DEL MES`), labels de navegación inactivos, placeholders |
| Alert Row | `#6B0000` | fondo de fila de alerta (stock bajo el mínimo, `URG PARA PEDIDOS`, `SALDO ACTUALIZADO` con deuda) |
| Button Hover | `#393939` | relleno de botón dark en Hover (`PrimaryDark Hover` del frame de estilo) |

`#C38926` es el **único dorado normativo**. Obsoletos: `#B99D22`, `#D2AB68` (este último solo persiste en los PDFs v1.0, ver `PDFS.md`).

Equivalencias con nombres anteriores (solo migración): `Background` → `Secondary`; `Border` → `Border Button`; `Gray` → `Border Contenedor`; `Blue` → `Tertiary`.

Los tokens se centralizan como variables CSS (`src/app/globals.css`) y utilidades Tailwind (`bg-steffen-*`, `text-steffen-*`, `border-steffen-*`). No se escriben colores sueltos en componentes si existe un token.

## 4.2 Identidad dark y preparación para modo light

- Página: `Fondo Dark` `#101010`; barra lateral y paneles: `Secondary` `#000000`.
- Paneles con borde `Border Contenedor`; botones e inputs con borde `Border Button` y fondo `Surface Dark Degrade`.
- Sin sombras.
- Dorado solo para identidad, módulo activo y énfasis (KPI, card seleccionada, header de líneas del pedido).
- Texto principal `Surface`; texto secundario `Text Muted`.

El modo activo se define con `data-theme` en `<html>` (`dark` vigente). Todos los colores se consumen vía variables, de modo que el modo light futuro (`Fondo` `#EFEFEF`, superficies `Surface`) se agregue redefiniendo las variables bajo `[data-theme="light"]`, sin tocar componentes. **Hoy solo se implementa dark.**

## 4.3 Radius

| Elemento | Radius |
|---|---|
| Paneles / secciones / cards | `10 px` |
| Botones, inputs, selects, ítems de lista | `5 px` |

Reemplaza los valores anteriores (`2 px` / `5 px`).

## 4.4 Iconografía

Fuente: `docs/visual-references/iconos/`. Se usan esos íconos (no se redibujan); solo se adapta color/estilo:

- **Dentro de botones:** plateado/cromado (degradé claro sobre la silueta del ícono).
- **Navegación:** módulo activo en `Primary`; inactivos en plateado.
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

La referencia de escala es la **densidad visual del ERP con el navegador al 75 % de zoom**, implementada de forma **nativa** en el sistema de diseño:

- prohibido `zoom: 0.75` y `transform: scale(0.75)`;
- el layout ocupa `width: 100%` y se adapta al viewport (sin contenedor máximo);
- controles ~25 % más compactos; tipografía, padding, gaps e íconos reducidos;
- borders siempre 1 px (no se escalan); radius de panel 10 px y de botón 5 px se conservan;
- no reducir mecánicamente si perjudica la legibilidad (texto auxiliar mínimo 10–11 px).

Implementación: tokens de Tailwind en `globals.css` (`--spacing: 3px`, escala `--text-*`) más valores fijos de control (botón 30/50 px).

Esta escala **reemplaza** la escala anterior del rediseño dark (28/24/18/14/12 y botones 40/70).

## 5.1 Tipografía

Familia: `Inter` (cargada por la aplicación).

| Token | Tamaño | Peso | Uso |
|---|---:|---|---|
| H1 | 22 px | Bold | título de pantalla (`Dashboard`, `Mi Fabrica`) |
| H2 | 18 px | Semi-bold | título de ventana/pedido (`PEDIDO 0000`) |
| H3 | 14 px | Regular | título de pantalla secundaria (`CLIENTES`, `FORMULAS`), títulos de bloque |
| Body semibold | 12 px | Semi-bold | encabezados de tabla, labels, botones, títulos de sección |
| Body regular | 12 px | Regular | contenido general, filas de tabla |
| Auxiliar | 11 px | Regular | contenido secundario, placeholders, labels de navegación |

Numerales de KPI: 24 px Bold (display).

| Display ExtraLight | 24 px | ExtraLight (200), tracking -0.02em | importes de las cards de Cuentas/Caja (Caja Steffen, Caja Mercado Libre, Deudas) y Total facturado; NETO usa Bold. Clase `.ui-display-extralight`. Los importes nunca se truncan: las cards crecen con el contenido |

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

| Variante (frame de estilo) | Default | Hover / Selected |
|---|---|---|
| PrimaryDark (Secondary) | fondo `Surface Dark Degrade`, borde `Border Button`, texto `Surface` | fondo `Button Hover` `#393939` |
| Principal (Grande) | igual que PrimaryDark, 50 px, texto H3 | igual que PrimaryDark |
| Icon / IconText | PrimaryDark con ícono plateado (± texto) | igual |
| Verde | `Verde` sólido | `Verde Hover` |
| Rojo | `Rojo` sólido | `Rojo Hover` |
| Rojo Foto (icon) | `Rojo` sólido con ícono claro (`Retiro caja`) | `Rojo Hover` |
| Menu | ícono + label; inactivo plateado/`Text Muted` | activo/hover: ícono y label `Primary` |
| Lista | transparente, ícono + texto `Surface` | Hover/Selected: fondo `Surface Dark Degrade` |
| Volver | triángulo + texto `Tertiary` | `Blue Hover` |
| Add (`+`) | círculo `Surface` con `+` oscuro | `Border Button` |

Todos los íconos dentro de botones se ven plateados/cromados (§4.4). El rediseño no cambia la acción de ningún botón.

---

# 9. Navegación principal

## 9.0 Lenguaje visual

- **Barra lateral izquierda** (`Secondary`, ~78 px) con: logo arriba; los 5 módulos en columna (ícono + label debajo); logout como botón Icon al pie, separado.
- Módulo activo: ícono y label en `Primary` sólido. Inactivos: ícono plateado y label `Text Muted`; hover: ícono y label en **dorado cromado** (degradé metálico sobre `Primary`).
- Debajo de los 5 módulos, separados por una línea, **accesos directos** a pantallas existentes: Clientes (`/clientes`), Proveedores (`/proveedores`) y Listas de precios (`/precios`). No son módulos nuevos ni agregan funciones; se resaltan solo en su propia ruta.
- Área de contenido sobre `Fondo Dark`.
- **Encabezado de pantalla principal:** título H1 a la izquierda, chip `Admin` (sesión) a la derecha y una línea `Border Contenedor` debajo.
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

- Panel: fondo `Secondary`, borde 1 px `Border Contenedor`, radius `10 px`, padding `15 px` lateral / `12 px` vertical, sin sombra.
- Título de sección: `Título ———— línea` en `Text Muted` (B1/H3), línea 1 px `Border Contenedor` (o `Surface` en fichas de Cuentas, según frame) que ocupa el ancho restante; controles opcionales (Buscar, select, `REGISTRAR PAGO`) al extremo.
- Sección de alerta: título y línea `Rojo`, panel con borde `Rojo`.

---

# 11. Patrón de ventanas operativas

Ventanas disparadas por botones (Fabricación, Envasado, Nueva Fórmula, Nuevo Producto, Nuevo Pedido, Compra, Pago Cliente, Pago Proveedor, Gasto Operativo, Retiro, Nueva MPR/COM, Nuevo Cliente, Nuevo Proveedor).

Tratamiento: panel dark (§10.1, radius 10), título H2/H3, labels sobre inputs, valores automáticos distinguibles, acciones al final (`Cancelar` PrimaryDark; confirmación en su variante semántica). Overlay negro semitransparente. Sin sombras.

## 11.1 Inputs y selects

- Default: fondo `Surface Dark Degrade`, borde `Border Button`, texto `Surface`, placeholder `Text Muted`, radius `5 px`, B2/B4.
- Error: borde y texto `Rojo`.
- Variante de borde claro: fondo `Secondary` con borde `Surface` (frame de estilo, tercer input).
- Select: misma familia, con flecha ▼ clara.

---

# 12. Patrón de tablas

- Encabezado: fondo `Border Contenedor` `#393939`, texto `Surface` B1, sin radius.
- Encabezado destacado: fondo `Primary` (líneas del Pedido). Encabezado de alerta: fondo `Rojo` (Bajo stock).
- Filas sobre `Secondary`, texto `Surface` B2, separador inferior 1 px `Surface`.
- Fila de alerta: fondo `Alert Row` `#6B0000`, texto `Surface`.
- Valores positivos en `Verde`, críticos en `Rojo`; cobertura con granel `(n)GR` en `Tertiary`.
- Densidad alta; alineación numérica consistente; sin zebra.

El rediseño preserva ordenamientos, búsquedas, filtros e interacciones existentes. Los criterios de cada estado pertenecen a `BUSINESS_RULES.md`.

---

# 13. Estados críticos en rojo

El rojo comunica un problema operativo que requiere atención:

- stock actual menor que stock mínimo;
- faltante de cobertura en Resumen de Pedidos;
- celda de un PED que no puede cubrirse completamente;
- acciones destructivas.

Tratamiento:

- valor crítico en `Rojo`;
- fila de alerta con fondo `Alert Row` `#6B0000` y texto `Surface` (`URG PARA PEDIDOS`, stock bajo el mínimo, `SALDO ACTUALIZADO` con deuda);
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
- `CUENTAS`: tabla compacta con valores positivos en `Green` y negativos en `Red`; debajo, botones de acciones patrimoniales (`Pago Proveedor` Secondary, `Pago Clientes` Success, acciones icon-only, acción destructiva en Danger);
- columna derecha: `RESUMEN DE PEDIDOS` (matriz con faltantes en `Red` y cobertura con granel en tono secundario);
- franja inferior `BAJO STOCK` con el tratamiento de sección de alerta (§13): tabla de Componente/MP con `SIMULAR COMPRA` y tabla de Producto Final con estado y `SIMULAR`.

El Dashboard sigue mostrando todos sus bloques vigentes (§15.1–§15.5), aunque el frame no los dibuje igual. En particular, la tabla `CUENTAS` del frame muestra una sola `CAJA`; se mantienen Caja Steffen y Caja Mercado Libre por separado. El bloque vacío `REPORTE VENTAS` del frame no corresponde a una función vigente y no se implementa hasta que se defina funcionalmente. El atajo `Listas de precios` en Acceso Rápido abre la pantalla existente de Lista de Precios; no crea un flujo nuevo.

---

## 15.2 Cards

Las cards muestran valores derivados en tiempo real.

No deben parecer inputs.

Deben priorizar:

1. nombre de métrica;
2. valor;
3. contexto temporal si aplica.

Patrón KPI (rediseño):

- **Default:** fondo negro, borde dorado (`Primary`);
- **Con ícono:** igual que Default, con ícono a la izquierda del numeral;
- **Destacada positiva:** fondo `Verde` sólido.

Numerales grandes y labels compactos.

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

- sección `PEDIDOS`: cada PED abierto como card seleccionable (fondo degradé, borde `Border Contenedor`; seleccionada con borde `Primary`) con icono, código, cliente/origen y fecha; un botón circular `+` crea un Nuevo Pedido;
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

Tratamiento visual (rediseño, según el frame Pedido):

- título `PEDIDO xxxx` y cabecera en grilla de pares label/valor; `Cant. bultos` como input dark;
- tabla de líneas con encabezado destacado en `Primary` (variante de DataTable); por línea, editar (lápiz) y borrar (icono rojo), y `AG` como input dark al extremo derecho;
- `Agregar producto` (Secondary) debajo de las líneas;
- totales alineados a la derecha: Subtotal, cada descuento por separado, Total Pedido, Saldo, Total a Cobrar;
- footer de acciones: `Borrar pedido` (Danger), `Cancelar` y `Guardar` (Secondary) y la acción de confirmación (Success).

El frame rotula la acción verde como `Registrar compra`: se mantiene el label y la acción vigentes de confirmación del RTO.

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

La pantalla vigente incluye:

- acciones superiores;
- Cotización USD;
- Ventas;
- Resumen Cuentas Clientes;
- Deudas Proveedores;
- Cuentas;
- Últimos Movimientos.

Tratamiento visual (rediseño, según el frame Administración):

- `VENTAS DEL MES`: selector de mes en el encabezado, tabla compacta con Ganancia en `Green`, acceso al RTO con icono, fila `TOTAL` y enlace `IR A VENTAS` (Blue);
- acciones superiores `GASTO OPERATIVO` y `LISTA DE PRECIOS` como botones grandes con icono;
- `COTIZACION DOLAR`: input dark y `ACTUALIZAR` (Success);
- `CUENTAS`: tabla compacta con valores positivos en `Green` y negativos en `Red`, `NETO` destacado y `RETIRO CAJA` (Danger);
- `CUENTAS CLIENTES` y `DEUDAS PROVEEDORES`: secciones con `REGISTRAR PAGO` (Success) en el encabezado, tabla compacta con acceso a la cuenta por icono, fila `TOTAL` y enlaces `IR A CLIENTES` / `IR A PROVEEDORES` (Blue);
- `MOVIMIENTOS ADMINISTRACION`: tabla compacta a todo el ancho y enlace `IR A MOVIMIENTOS` (Blue).

Se mantiene todo lo que el frame no dibuja:

- la Cotización Actual y su última actualización (§22.2), además del input;
- Caja Mercado Libre en Cuentas;
- el acceso a Liquidación Mercado Libre (§22.6);
- el acceso discreto a `/system-status`.

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

## 22.6 Cuentas

Mostrar:

- Caja Steffen;
- Caja Mercado Libre;
- Deudas Clientes;
- Deudas Proveedores;
- Neto.

Acción:

- Retiro Caja.

También debe existir acceso al flujo de Liquidación Mercado Libre.

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
- cards KPI (§15.2): cantidad de ventas y Total facturado (Default), Ganancia Total (destacada positiva), más un botón PDF icon-only;
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

**No define todavía** colores nuevos, tamaños en px, alturas exactas, gaps exactos, tipografías nuevas ni estilos gráficos definitivos. La implementación reutiliza el sistema visual existente del ERP (tokens, `Panel`, `SectionHeader`, inputs/selects, tabs, tablas, empty states).

Motor gráfico previsto: Recharts (todavía no instalado).

## 35.1 Estructura general

```
REPORTES                                   [Año global ▼]

FACTURACIÓN
  [Resumen anual — KPIs]
  [Evolución mensual ~60%] [Facturación y Ganancia por año ~40%]

PRODUCTOS
  [Ranking de productos ~60%] [Participación por producto ~40%]

CLIENTES
  [Mayores compradores ~60%]  [Concentración ~40%]
  [Análisis individual ~60%]  [Evolución de la concentración ~40%]
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

| Fila | ~60% | ~40% |
|---|---|---|
| 1 | Mayores compradores | Concentración |
| 2 | Análisis individual | Evolución de la concentración |

- No se fuerzan alturas iguales entre paneles.
- Si Análisis individual crece al expandir el historial, solo ese panel aumenta su altura; la columna derecha **no** se estira para igualarlo.

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

- **Una sola columna.**
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

## 35.11 Pendientes exclusivamente visuales

Quedan para la implementación, reutilizando el sistema visual existente y sin efecto sobre reglas ni comportamiento:

- colores de series (dentro de la paleta vigente; sin colores nuevos);
- tamaños en px, alturas exactas y gaps exactos;
- estilo definitivo de tooltips, leyendas, skeletons y barras proporcionales.

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
- uso moderado del dorado Steffen `#C38926` (único dorado normativo; `#B99D22` y `#D2AB68` quedan obsoletos);
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

El comportamiento responsive, mobile y tablet final se resuelve en **Fase 18** (ver §3.0); las pautas de §3.2–§3.24 son preliminares.

No inventar una identidad visual nueva para los puntos todavía pendientes: se aplica el lenguaje visual del nuevo Figma.
