# COMPONENTS.md — ERP STEFFEN

## 1. Objetivo

Este documento define los componentes visuales reutilizables del ERP.

No contiene lógica de negocio.

Un componente no debe implementar reglas propias que contradigan `BUSINESS_RULES.md` o `FLOWS.md`.

---

# 2. Principio de reutilización

Antes de crear un componente nuevo:

1. revisar este documento;
2. reutilizar una variante existente;
3. agregar una variante solo si existe una necesidad visual real;
4. evitar componentes duplicados con nombres distintos.

Ejemplo:

No crear:

- `ClientSelect`
- `SupplierSelect`
- `ProductSelect`

como controles visualmente diferentes si todos pueden usar el mismo componente `Select` con distinta fuente de opciones.

---

# 3. Tokens base

Fuente única de verdad: `DESIGN.md` §4–§7 y el frame de estilo `docs/visual-references/figma/Frame 1.png`. Implementación: variables CSS en `src/app/globals.css` (`--steffen-*`) expuestas como utilidades Tailwind (`bg-steffen-*`, `text-steffen-*`, `border-steffen-*`). Los componentes consumen tokens, no hex sueltos.

## Colores

- Primary: `#C38926` — único dorado normativo
- Secondary: `#000000` — paneles, sidebar
- Surface: `#FBFBFB` — texto principal sobre dark
- Fondo (light, reservado): `#EFEFEF`
- Fondo Dark: `#101010` — fondo de página
- Border Button: `#D9D9D9`
- Border Contenedor: `#393939` — también fondo de encabezado de tabla
- Tertiary (Blue): `#0E50A0` / hover `#6E96C6`
- Verde: `#008102` / hover `#015C02`
- Rojo: `#DD0000` / hover `#B10000`
- Surface Dark Degrade: `linear-gradient(180deg, #121212, #000000)`
- Derivados: Text Muted `#9A9A9A`, Alert Row `#6B0000`, Button Hover `#393939`

Obsoletos: `#B99D22`, `#D2AB68`.

## Densidad

Escala nativa equivalente a la densidad de Chrome al 75 % (`DESIGN.md` §5.0): sin `zoom` ni `transform`; `width: 100%`; borders 1 px.

## Tipografía

`Inter`

- H1 — 22 px Bold
- H2 — 18 px Semi-bold
- H3 — 14 px Regular
- Body semibold — 12 px
- Body regular — 12 px
- Auxiliar — 11 px

## Gaps

- 4 px
- 8 px
- 15 px

## Superficies

- sin sombras;
- bordes 1 px;
- radius: paneles/cards `10 px`; botones/inputs/ítems de lista `5 px`.

## Modo de color

Solo dark (`data-theme="dark"` en `<html>`). El modo light futuro redefine las mismas variables bajo `[data-theme="light"]`; ningún componente debe asumir colores fuera de las variables.

---

# 4. Button

## 4.1 Variantes

El rediseño cambia la apariencia de cada variante, no su semántica: un botón existente conserva su acción.

Base común: radius `5 px`, borde 1 px, padding horizontal `~15 px`, texto Body semibold 12 px, íconos plateados/cromados (§63).

### PrimaryDark (Secondary / Principal en código)

Uso: acción principal o alternativa neutra (crear, guardar, cancelar, abrir ventanas).

- Default: fondo `Surface Dark Degrade`, borde `Border Button`, texto `Surface`;
- Hover / Selected: fondo `Button Hover` `#393939`.

### Success (Verde)

- Default: `Verde` sólido (`REGISTRAR PAGO`, `ACTUALIZAR`, `Generar Remito`, `Pago Clientes`);
- Hover: `Verde Hover`.

### Danger (Rojo)

- Default: `Rojo` sólido (`Borrar pedido`, `RETIRO CAJA`);
- Hover: `Rojo Hover`.

### Add (circular)

`+` dentro de colecciones visuales (cards de Pedidos, tiles de granel): círculo `Surface` (~66 px) con `+` oscuro (ícono `boton-mas`). Dispara la misma operación que el botón equivalente del módulo.

### Icon / IconText

PrimaryDark con ícono plateado (± texto). Debe tener label accesible (`aria-label`/tooltip) cuando no muestra texto. Variante **Rojo Foto**: fondo `Rojo` con ícono claro (Retiro caja). El documento PDF usa ícono rojo sobre PrimaryDark.

## 4.2 Tamaños

- Chico: `~30 px` (texto 12 px semibold)
- Grande: `~50 px` (texto H3 14 px)

## 4.3 Estados

Default, Hover, Selected (solo si representa estado persistente), Disabled (opacidad reducida, sin interacción).

---

# 5. MenuButton

Botón de la barra lateral (variante Menu).

- Estructura: ícono (≈21 px) arriba, label 11 px semibold debajo.
- Default: ícono plateado, label `Text Muted`.
- Hover / Selected (módulo activo): ícono y label `Primary`.
- Logout: botón Icon (borde `Border Button`) al pie de la barra, separado de los módulos.

Conserva las rutas funcionales actuales (`DESIGN.md` §9). No se agregan ítems por aparecer en frames viejos.

No usar para acciones de formulario.

---

# 6. TabButton

Subpestañas (Productos / Materia Prima / Componentes). Patrón Lista (§7) con ícono: Default transparente; Selected con fondo `Surface Dark Degrade`. Solo una Selected por grupo.

---

# 7. ListSelectorButton

Selector lateral de entidades (Clientes, Proveedores, Fórmulas, Productos Finales) y sub-pestañas.

- Default: transparente, ícono + texto `Surface` (B1);
- Hover / Selected: fondo `Surface Dark Degrade`, radius `5 px`.

Puede acompañarse por `Ver más`.

**Card de entidad (Pedidos):** card seleccionable con fondo `Surface Dark Degrade`, borde `Border Contenedor`, radius `10 px`; contenido centrado (ícono + código H2, cliente B1, fecha B1, importe). **Selected:** borde `Primary`. Es un selector de entidad, no una Card KPI (§19).

---

# 8. BackButton

`◂ Volver` en `Tertiary` (`#0E50A0`), hover `Blue Hover`. El mismo tratamiento se usa para enlaces de navegación secundaria (`IR A … ▸`, `Ver todas ▸`).

No utilizar como Cancelar dentro de formularios.

---

# 9. TextInput

Usos:

- nombre;
- domicilio;
- localidad;
- descripción;
- INCI;
- presentación;
- teléfono;
- DNI.

Estados visuales mínimos:

- Default
- Focus
- Disabled
- Error

Visual (rediseño, input dark):

- Default → fondo `Surface Dark Degrade`, borde `Border Button`, texto `Surface`, placeholder `Text Muted`, radius `5 px`;
- Focus → borde `Primary`;
- Disabled → interacción bloqueada, contraste reducido (manteniendo legibilidad);
- Error → borde `Red` + mensaje B4 `Red`.

Variante de borde claro (frame de estilo):

- fondo `Secondary`;
- borde `Surface`.

No crear una nueva identidad visual fuera de estos tokens.

---

# 10. NumberInput

Base para datos numéricos.

Variantes funcionales:

- Integer
- Decimal
- Money
- Percentage
- WeightKg

---

# 11. WeightInput

Label siempre incluye:

`(kg)`

Precisión:

hasta 3 decimales.

Ejemplos válidos:

- `0,350`
- `1,000`
- `180,000`

No mostrar ni almacenar gramos.

---

# 12. UnitInput

Uso:

- unidades de PRO;
- unidades de COM;
- cantidades AG;
- bultos.

Solo enteros.

---

# 13. MoneyInput

Uso para importes editables.

Ejemplos:

- Pago;
- Transporte;
- Gasto;
- Retiro;
- Precio Compra.

Los costos calculados no usan MoneyInput; usan `MoneyDisplay`.

---

# 14. MoneyDisplay

Componente no editable.

Uso:

- totales;
- costos;
- saldos;
- precios derivados;
- Ganancia;
- Caja.

Debe distinguirse visualmente de un input.

---

# 15. PercentageInput

Uso:

- descuento manual;
- aumento masivo de Lista.

Los descuentos de Cliente registrados en su ficha pueden utilizar este componente.

---

# 16. DateInput

Componente de fecha con:

- fecha actual por defecto cuando corresponda;
- calendario desplegable;
- posibilidad de seleccionar fecha anterior.

No reemplazar `business_date` por `created_at`.

---

# 17. Select

Componente desplegable reutilizable.

Usos:

- Cliente;
- Proveedor;
- PBA;
- GRA;
- PRO;
- MPR;
- COM;
- moneda del Proveedor al crear/editar su ficha;
- tipo;
- Lista de Precios;
- perfil de descuento.

Debe admitir contenido compuesto, por ejemplo:

`CLIENTE | SALDO`

Visual: misma familia que los inputs (§9): fondo `Surface Dark Degrade`, borde `Border Button`, flecha ▼ clara, borde `Rojo` en error.

---

# 18. SearchInput

Uso:

- búsqueda en tablas;
- Clientes;
- Proveedores;
- Stock;
- Movimientos.

No reemplaza filtros estructurados.

---

# 19. Card

Uso exclusivo para:

- KPI;
- saldo;
- indicador;
- resumen.

Estructura:

1. label;
2. valor principal;
3. contexto secundario opcional.

Variantes KPI (rediseño):

- **Default:** fondo `Secondary`, borde 2 px `Primary`, radius `10 px`;
- **Con ícono:** Default con ícono (§63) junto al numeral;
- **Destacada positiva:** fondo `Verde` sólido.

Numerales grandes y labels compactos.

No usar Card para reemplazar una tabla de gestión.

---

# 20. DataTable

Componente base para listados densos.

Debe soportar:

- columnas configurables;
- alineación numérica;
- fila de total;
- fila crítica;
- acciones;
- búsqueda/filtros externos;
- orden según datos entregados.

El componente no decide la lógica de orden.

Visual (rediseño):

- compacta, densidad alta;
- encabezado gris oscuro (`Gray`) con texto blanco (`Surface`);
- filas sobre fondo oscuro con texto blanco;
- separadores horizontales finos;
- alineación numérica consistente;
- sin zebra striping decorativo salvo que el diseño lo requiera;
- valores críticos pueden ir en `Red`; valores positivos en `Green`.

Variantes de encabezado (según el Figma):

- **Default:** fondo `Gray`, texto `Surface`;
- **Destacada:** fondo `Primary`, texto `Surface` (tabla de líneas del Pedido);
- **Alerta:** fondo `Red`, texto `Surface` (tablas de la sección `BAJO STOCK`).

Una fila `TOTAL` puede cerrar la tabla con el total alineado a su columna y un enlace de navegación secundaria (`IR A …`, `Blue`) en la misma franja.

Se preservan ordenamientos, búsquedas, filtros e interacciones existentes.

---

# 21. CriticalRow

Variante de fila.

Usa semántica roja.

Aplicaciones:

- stock debajo del mínimo;
- otras alertas confirmadas.

La fila recibe el estado desde negocio.

Visual: fondo rojo oscuro con texto `Surface`, o valor crítico en `Red` según la pantalla. El rojo oscuro del Figma no está en la paleta: se incorpora como token en `DESIGN.md` §4.1 con su valor exacto; hasta entonces, `Red Hover` `#B10000`.

En el Figma se usa en: filas `URG PARA PEDIDOS`, filas de stock bajo el mínimo y fila `SALDO ACTUALIZADO` con deuda.

No calcula internamente `stock_actual / stock_minimum`.

---

# 22. TotalRow

Fila de totales.

Uso:

- ventas;
- pedidos;
- compras;
- cuentas;
- remitos.

Debe diferenciarse de las filas de datos sin competir con H1/H2.

---

# 23. ActionCell

Celda de acciones de tabla.

Acciones visuales principales:

- Ver → ojo
- Editar → lápiz
- Borrar → acción destructiva

No mostrar lápiz si el registro es inmutable.

---

# 24. StatusBadge

Uso:

- `URG PARA PEDIDOS`
- `POCO STOCK`
- estados de lote;
- estados operativos si se muestran.

Semántica visual:

- urgencia → roja;
- estado no crítico → token correspondiente definido en diseño.

No inventar nuevos significados por color.

---

# 25. Modal / OperationWindow

Contenedor reutilizable para acciones.

Estructura:

1. Header
2. Body
3. Footer de acciones

Header:

- título H2;
- cierre si se define.

Body:

- campos;
- secciones;
- tablas internas si corresponde.

Footer:

- Cancelar;
- Confirmar.

Visual (rediseño): contenedor dark (`Background`), borde fino, sin sombras, título H2/H3, inputs dark.

El comportamiento responsive final se resuelve en Fase 18 (`DESIGN.md` §3.0); §56–§58 de este documento son pautas preliminares.

---

# 26. FormField

Wrapper de:

- Label
- Control
- Hint opcional
- Error opcional

Los labels deben permanecer visibles.

No usar placeholder como único label.

---

# 27. ReadOnlyField

Uso para valores automáticos dentro de formularios.

Ejemplos:

- Código automático;
- Precio calculado;
- kg disponibles;
- costo total;
- comisión.

Debe parecer dato del formulario, pero no editable.

---

# 28. Tabs

Componente contenedor de subpestañas.

Uso confirmado:

Stock:

- Productos
- Materias Primas
- Componentes

Debe conservar el estado Selected.

---

# 29. DragHandle

Uso:

- filas de Resumen de Pedidos;
- columnas PED.

Indica que el elemento puede reordenarse.

El componente visual no modifica stock ni genera reservas reales.

---

# 30. PlanningMatrix

Componente específico de Pedidos.

Partes:

- columna Producto;
- columnas PED;
- Total;
- Stock;
- cobertura;
- Faltante.

Capacidades:

- reorder de filas;
- reorder de columnas;
- celda crítica;
- faltante crítico.

Debe recibir resultados calculados desde el motor de planificación.

No calcular inventario dentro del componente.

---

# 31. PlanningCell

Estados:

### Normal

Cantidad completamente cubierta.

### Shortage

Cantidad del PED no completamente cubierta.

Visual:

rojo.

La cifra mostrada sigue siendo la cantidad solicitada.

---

# 32. SimulationNotice

Leyenda para zonas de simulación.

Texto conceptual:

`Simulación de planificación — no modifica stock ni genera movimientos.`

Uso:

- Resumen de Pedidos;
- Simular Compra cuando sea necesario.

---

# 33. SummaryValue

Par label/valor.

Usos:

- Subtotal;
- Total Pedido;
- Saldo;
- Total a Cobrar;
- Costo Productos;
- Transporte;
- Ganancia;
- Neto.

Debe permitir enfatizar el total final.

---

# 34. DiscountBreakdown

Representa descuentos sucesivos.

Debe mostrar cada paso por separado.

Ejemplo:

- 30%
- 10%
- 5%

No mostrar simplemente 45%.

---

# 35. PriceListSelector

Select especializado de Listas activas.

Opciones mínimas:

- Salón
- Público
- Ecommerce

Puede incluir listas futuras.

---

# 36. DiscountProfileSelector

Uso exclusivo en Costo-Ganancia.

Opciones iniciales:

- 35%
- 30% + 10% + 5%
- 40% + 10%
- 50%

Es simulación.

No modifica fichas de Clientes.

---

# 37. CurrencyRateField

Bloque para cotización USD.

Partes:

- Cotización Actual;
- Última actualización;
- Nueva Cotización;
- Actualizar.

---

# 38. PurchaseFxOverride

Visible únicamente en CMP de proveedor USD.

Partes:

- Cotización global propuesta;
- input Cotización utilizada en esta compra.

Debe comunicar que cambiar este input:

- modifica solo la CMP;
- no actualiza la cotización global.

---

# 39. AccountSummaryTable

Uso:

- Resumen Clientes;
- Deudas Proveedores.

Variantes:

### Clientes

Muestra todos.

Saldo positivo:

fila crítica/roja y prioritaria.

### Proveedores

Muestra solo deuda positiva.

---

# 40. LedgerTable

Uso para cuenta corriente de Cliente/Proveedor.

Formato tipo asiento.

Debe admitir:

- fecha;
- referencia;
- débito/crédito o campos equivalentes definidos por pantalla;
- saldo acumulado;
- acciones.

El cálculo del saldo no ocurre en UI.

---

# 41. MovementTable

Variantes:

- MST
- MFA
- MOV

Todas comparten patrón tabular, pero sus columnas difieren.

No mezclar los tres tipos en un único historial visual si el módulo requiere uno específico.

---

# 42. DocumentLink

Acción para abrir:

- RTO;
- RTM;
- PDF Estado de Cuenta.

No debe simular edición.

---

# 43. ConfirmationDialog

Obligatorio para acciones destructivas confirmadas.

Caso explícito:

- Borrar PED abierto.

Contenido mínimo:

- acción;
- entidad afectada;
- Cancelar;
- Confirmar.

No usar para acciones normales.

---

# 44. InlineEditAction

Icono lápiz.

Solo mostrar donde la edición esté permitida.

Casos:

- ficha Cliente;
- ficha Proveedor;
- Pago;
- Compra;
- MPR/COM asociado a Proveedor;
- Fórmula vigente mediante flujo de versión.

No mostrar para:

- RTO COMPLETED;
- RTM;
- históricos inmutables.

---

# 45. CostBreakdown

Componente visual para:

- Producto Final;
- Fórmula;
- RTM.

Permite listar:

- concepto;
- cantidad;
- costo unitario;
- costo total.

No recalcula por sí mismo.

---

# 46. StockPriorityTable

Configuración de DataTable para:

- PRO;
- MPR;
- COM.

Recibe filas ya ordenadas por:

`stock_actual / stock_mínimo ASC`

CriticalRow:

`stock_actual < stock_mínimo`

---

# 47. FilterBar

Contenedor de filtros.

Usos:

Movimientos:
- fecha desde;
- fecha hasta;
- tipo;
- búsqueda.

Ventas:
- año;
- mes.

Selector de período (según el frame Ventas): año + doce meses como fila de botones; el mes seleccionado con fondo `Blue`.

Stock:
- proveedor;
- búsqueda.

No mezclar filtros con acciones primarias.

---

# 48. EntityPicker

Patrón compuesto para pantallas de cuentas.

Partes:

- botones/lista de entidades recientes;
- Selected;
- Ver Más;
- Buscar opcional.

Orden entregado desde backend:

`updated_at DESC`

---

# 49. QuickActionGrid

Uso Dashboard.

Acciones confirmadas:

- Compra;
- Nuevo Pedido;
- Envasado;
- Fabricación;
- Pago Cliente;
- Pago Proveedor.

Cada botón abre el flujo original.

---

# 50. MarketplaceSettlementSummary

Componente específico de Liquidación ML.

Muestra:

- Saldo Caja ML;
- Bruto;
- Neto;
- Comisión.

Relación visual:

`Bruto = Neto + Comisión`

---

# 51. EmptyState

Estado vacío MVP:

- texto B2/B4 según densidad;
- color de texto con contraste suficiente sobre fondo oscuro (no `#393939` sobre negro; ver `DESIGN.md` §4.3);
- sin ilustraciones;
- sin nuevos colores;
- mensaje específico al contexto;
- acción primaria solo cuando exista una acción obvia.

Ejemplos:

- `No hay pedidos abiertos.`
- `No hay lotes de granel disponibles.`
- `No hay proveedores con deuda pendiente.`

---

# 52. Loading / Error global

## Loading

Durante una operación que confirma datos:

- deshabilitar temporalmente la acción que la disparó;
- mostrar indicador de carga dentro del botón o zona correspondiente;
- no mostrar éxito antes del commit;
- evitar doble envío.

## Error

Error de validación:

- borde/estado `Red`;
- mensaje B4 próximo al campo o bloque afectado.

Error transaccional/general:

- mostrar mensaje visible con causa concreta cuando esté disponible;
- mantener los datos ingresados siempre que sea seguro;
- ofrecer Reintentar cuando corresponda.

No utilizar errores silenciosos.

---

# 53. Formato numérico

## Pesos argentinos

Mostrar con separador de miles.

Listas de Precios:

sin centavos.

Costos internos:

pueden conservar decimales aunque la presentación puede redondearse visualmente según contexto.

No truncar el valor persistido.

## Kg

Mostrar máximo 3 decimales.

## Unidades

Enteros.

---

# 54. Nomenclaturas a corregir del Figma

Implementar:

- `MPR`, no MAT.
- `MST`, no MVS.
- `MFA`, no MVF.
- `Costo-Ganancia`, no Margen por producto.
- `Ganancia`, no Margen.
- `Peso (kg)`.
- `Agregar componente`, no Agregar materia prima dentro de Nuevo Producto.
- `Costo extra variable`, no Costo embalaje.
- `Proveedor`, no Cliente en Pago a Proveedores.
- `Total Pedido`.
- `Total a Cobrar`.

---

# 55. Componentes pendientes de especificación visual

El MVP ya define comportamiento suficiente para implementar:

- Focus;
- Disabled;
- Error;
- Loading;
- Empty State;
- PDFs.

Responsive, navegación mobile y tablas mobile se resuelven en Fase 18; §56–§58 son pautas preliminares.

Quedan como refinamiento visual posterior:

- apariencia exacta del calendario desplegado del DatePicker;
- apariencia exacta del menú desplegado del Select;
- Toast/feedback no crítico;
- animaciones/transiciones.

Estos refinamientos no deben modificar reglas funcionales ni bloquear el MVP.


---

# 56. Responsive behavior

> Pautas preliminares, insumo para Fase 18. No son normativas hasta que esa fase las revise contra el nuevo lenguaje visual (`DESIGN.md` §3.0). Desktop es la referencia primaria; los componentes deben construirse sin dimensiones rígidas innecesarias para permitir esta adaptación.

## Button

Mobile:

- mantiene mínimo 40 px de alto;
- puede ocupar 100% del ancho en formularios;
- acciones secundarias pueden compartir fila si entran cómodamente.

## DataTable

Debe soportar:

- modo normal desktop;
- overflow horizontal;
- primera columna sticky;
- header sticky;
- render alternativo tipo bloques cuando la pantalla lo defina.

La estrategia la decide la pantalla, no el componente por sí solo.

## Modal / OperationWindow

Desktop:

- modal/ventana.

Mobile:

- variante `full-screen`;
- header fijo opcional;
- footer de acciones fijo opcional;
- body scrolleable.

## Tabs

En mobile:

- si son pocas y entran, mantener tabs;
- si no entran, usar scroll horizontal solo para subpestañas;
- la navegación principal no usa tabs horizontales.

## PlanningMatrix

Mobile:

- overflow horizontal;
- primera columna sticky;
- header sticky;
- drag touch;
- alternativa `Ordenar prioridad`.

## Card

Mobile:

- `width: 100%` por defecto;
- KPI compactos pueden ocupar 50% si el ancho útil lo permite.

## FilterBar

Desktop:

- horizontal.

Mobile:

- wrap vertical;
- controles 100% ancho cuando sea necesario.

## EntityPicker

Desktop:

- lista visible.

Mobile:

- selector/search compacto;
- no ocupar altura excesiva con muchas entidades.

## ActionCell

Touch target mínimo:

`40 × 40 px`

## FormField

Mobile:

- width 100%;
- label siempre visible.

---

# 57. MobileFullScreenForm

Variante de contenedor para operaciones complejas en mobile (pauta preliminar, Fase 18).

Estructura:

1. Header
   - volver/cerrar;
   - título.
2. Body scrolleable.
3. Footer de acciones.

Uso:

- Compra;
- Pedido;
- Fabricación;
- Envasado;
- Fórmula;
- Producto;
- Pago;
- Gasto;
- Liquidación ML.

---

# 58. PriorityReorderSheet

Alternativa mobile al drag dentro de PlanningMatrix (pauta preliminar, Fase 18).

Contenido:

- título;
- lista vertical;
- DragHandle;
- etiqueta del Producto o PED;
- acción Guardar.

Permite ordenar:

- Productos;
- Pedidos.

No genera movimientos de negocio.

---

# 59. SupplierCurrencyDisplay

Uso:

- Compra;
- ficha/resumen de Proveedor.

Muestra la moneda definida en la ficha del Proveedor:

- ARS;
- USD.

Dentro de una CMP es un valor automático/no editable.

En la ficha de un Proveedor ya registrado también es solo lectura.

Si el Proveedor usa USD, `PurchaseFxOverride` permite modificar únicamente la cotización usada por esa CMP.


---

# 60. ReportMetricCard

Card específica de la pestaña Reportes.

Contenido:

1. valor;
2. label.

Variantes (rediseño; ver Card §19):

### Default (antes NeutralPrimaryBorder)

Uso:

- Ventas del mes;
- Total facturado;
- Pedidos abiertos.

Visual:

- fondo negro (`Background`);
- borde `Primary`;
- texto `Surface`.

### Positive

Uso:

- Ganancia.

Visual:

- fondo `Green` sólido;
- texto de alto contraste.

La variante `Dark` anterior (Pedidos abiertos) se integra en Default, como en el bloque `REPORTE MENSUAL` del Dashboard del Figma; puede incluir icono junto al numeral.

El Figma rotula la card verde como `MARGEN NETO`: se mantiene el label normativo `GANANCIA`.

Labels exactos:

- `VENTAS DEL MES`
- `TOTAL FACTURADO`
- `GANANCIA`
- `PEDIDOS ABIERTOS`

No utilizar `MARGEN NETO`.

---

# 61. SectionHeader

Estructura: `Título ———————— línea`.

- título en `Text Muted` (B1, o H3 en secciones grandes), sin forzar mayúsculas: respeta el texto del frame;
- línea 1 px `Border Contenedor` que ocupa el ancho restante (en fichas de Cuentas el frame usa línea `Surface`);
- controles al extremo (`Buscar`, select, `REGISTRAR PAGO`, `Ver todas ▸`).

Variante **alerta:** título y línea `Rojo` (`Bajo stock`).

Solo presenta: contenido y orden siguen `DESIGN.md` y `BUSINESS_RULES.md`.

---

# 62. Panel (contenedor)

- fondo `Secondary`;
- borde 1 px `Border Contenedor`;
- radius `10 px`;
- padding `15 px` lateral, `12 px` vertical;
- sin sombras.

Variante **alerta:** borde `Rojo`.

Preferir pocos Panels grandes antes que muchas cards fragmentadas.

---

# 63. ErpIcon

Renderiza los íconos base de `docs/visual-references/iconos/` (copiados a `public/icons/`) sin redibujarlos, aplicando el color por máscara CSS sobre la silueta del PNG:

- `chrome` (default): degradé plateado — íconos dentro de botones y navegación inactiva;
- `gold`: `Primary` — navegación activa, ícono de cards de pedido y KPI;
- `light`: `Surface`;
- `red`: `Rojo` (documento PDF);
- `original`: el PNG sin máscara (tile de granel `tanque`).

Siempre decorativo (`aria-hidden`); el botón que lo contiene aporta el label accesible.

---

# 64. AppShell / PageHeader

- **AppShell:** barra lateral (`Secondary`) con logo, MenuButtons (§5) y logout; contenido sobre `Fondo Dark` con padding `20 px`+.
- **PageHeader** (pantallas principales): título H1 a la izquierda, chip de sesión `Admin` (PrimaryDark chico, muestra el usuario autenticado; sin acción) a la derecha y línea 1 px `Border Contenedor` debajo.
- **SecondaryHeader** (pantallas secundarias): `Volver` (§8) a la izquierda, título H3 centrado, acción principal a la derecha.
