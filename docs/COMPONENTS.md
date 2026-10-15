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

Fuente única de verdad: `DESIGN.md` §4–§7. Interfaz predominantemente dark (`DESIGN.md` §4.2).

## Colores

- Primary (dorado): `#C38926` — único dorado normativo
- Background: `#000000`
- Surface (clara/invertida): `#FBFBFB`
- Border: `#D9D9D9`
- Gray (gris oscuro de superficie: encabezados de tabla, rellenos): `#393939` — no como texto auxiliar principal sobre negro si no cumple contraste (`DESIGN.md` §4.3)
- Blue: `#0E50A0`
- Blue Hover: `#6E96C6`
- Green: `#008102`
- Green Hover: `#015C02`
- Red: `#DD0000`
- Red Hover: `#B10000`

Obsoletos: `#B99D22`, `#D2AB68`.

Equivalencias de nombres anteriores: `Secondary` → `Background`; `Tertiary`/`Tertiary Hover` → `Blue`/`Blue Hover`; `Text` → `Gray` (ahora superficie gris oscura); texto principal sobre fondo oscuro → `Surface`.

Decisiones provisionales (rojo oscuro de alerta `#B10000`, uso de `#393939`, atajos de granel y Listas de precios): `DESIGN.md` §4.3.

## Tipografía

`Inter`

- H1 — 32 px Bold
- H2 — 28 px Semi-bold
- H3 — 20 px Regular
- B1 — 16 px Semi-bold
- B2 — 16 px Regular
- B3 — 14 px Semi-bold
- B4 — 14 px Regular

## Gaps

- 6 px
- 12 px
- 20 px

## Superficies

- sin sombras decorativas;
- bordes finos;
- radius discreto (vigente: botones `2 px`, contenedores `5 px`, salvo que el Figma defina otro valor).

---

# 4. Button

## 4.1 Variantes

El rediseño cambia la apariencia de cada variante, no su semántica: un botón existente conserva su acción y su variante de uso.

### Primary (Principal)

Uso:

- confirmar acción principal;
- crear;
- registrar;
- actualizar.

Visual:

- Default: fondo negro + borde/identidad dorada (`Primary`);
- Hover / Selected: fondo dorado `#C38926`.

### Secondary (Secundario)

Uso:

- cancelar;
- acción alternativa;
- navegación secundaria.

Visual:

- Default: fondo negro + borde claro;
- Hover: estado diferenciado pero sobrio.

### Success (Verde)

Uso:

- acción positiva explícita cuando el diseño lo requiera.

Visual:

- Default: `Green` `#008102`;
- Hover: `Green Hover` `#015C02`.

### Danger (Rojo)

Uso:

- acción destructiva;
- borrar;
- desactivar cuando implique confirmación.

Visual:

- Default: `Red` `#DD0000`;
- Hover: `Red Hover` `#B10000`.

Variantes específicas: Nav (§5), List item (§7) y Back (§8).

### Add (circular)

Uso: crear un elemento nuevo dentro de una colección visual (en el Figma: `+` junto a las cards de Pedidos abiertos y a los tiles de `GRANELES`).

Visual: botón circular claro (`Surface`) con signo `+` oscuro.

Dispara exactamente la misma operación que el botón equivalente del módulo (Nuevo Pedido, Registrar Fabricación); no crea flujos nuevos.

### Icon-only

Uso: acciones compactas (Acceso Rápido, Simular, documento/PDF, Nueva Cuenta).

Visual: misma familia que Secondary con icono; la acción PDF usa icono de documento PDF rojo. Debe conservar touch target y un label accesible (tooltip/aria-label) porque no muestra texto.

---

## 4.2 Tamaños

### Small

Altura:

`40 px`

### Large

Altura:

`70 px`

---

## 4.3 Padding

Referencia:

- horizontal: `20 px`
- vertical chico: `6 px`
- vertical grande: `10 px`

La altura definida del botón tiene prioridad.

---

## 4.4 Estados

Según variante:

- Default
- Hover
- Selected cuando el botón se comporta como selección

No usar Selected en una acción momentánea si no representa estado persistente.

---

# 5. MenuButton

Botón de navegación principal (variante Nav).

Estados:

- Default
- Hover
- Selected

Selected indica el módulo activo.

Visual:

- navegación horizontal superior;
- icono dorado (`Primary`); texto dorado cuando corresponda;
- línea inferior (underline) dorada;
- estado activo claramente visible;
- variantes **icon-only** e **icon + texto** según contexto;
- salida/logout visualmente separada de los módulos.

Variantes de barra (`DESIGN.md` §9.0):

- pantallas principales: activo icon + texto con línea larga; resto icon-only con línea corta; logo a la izquierda; logout al extremo derecho;
- pantallas secundarias: todos icon + texto; activo con línea resaltada; `Volver` + título debajo.

Conserva las rutas funcionales actuales (`DESIGN.md` §9). No se agregan ítems por aparecer en frames viejos (por ejemplo `FÓRMULAS` como ítem superior).

No usar para acciones de formulario.

---

# 6. TabButton

Uso:

- Productos / Materias Primas / Componentes;
- otras subpestañas.

Estados:

- Default
- Hover
- Selected

Solo una pestaña del mismo grupo puede estar Selected.

Visual (según el frame Stock): botones con icono + texto en patrón List item: Default negro con borde claro; Selected invertido (`Surface`, contenido oscuro).

---

# 7. ListSelectorButton

Uso:

- selector de Cliente en Cuentas;
- selector de Proveedor;
- selector lateral de entidades.

Estados:

- Default
- Hover
- Selected

Puede acompañarse por `VER MÁS`.

Visual (variante List item):

- Default: fondo negro;
- Selected: blanco/invertido (`Surface`, contenido oscuro).

Puede incluir icono a la izquierda (persona en Clientes/Proveedores, producto en Fórmulas/Productos Finales).

Forma card (según el frame Pedidos): los PED abiertos se muestran como cards seleccionables con borde dorado (icono, código, cliente/origen, fecha e importe final potencial), con el mismo comportamiento Default/Selected. Es un selector de entidad, no una Card KPI (§19).

---

# 8. BackButton

Etiqueta:

`Volver`

Uso exclusivo:

volver a la pantalla anterior.

Visual (variante Back): `Blue` `#0E50A0`; hover `Blue Hover` `#6E96C6`. El mismo tratamiento azul se usa para enlaces y navegación secundaria (por ejemplo `IR A …`, `Ver todos >`).

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

- Default → fondo oscuro (`Background`), borde claro/gris, texto claro (`Surface`);
- Focus → borde `Primary`;
- Disabled → interacción bloqueada, contraste reducido (manteniendo legibilidad);
- Error → borde `Red` + mensaje B4 `Red`.

Variante invertida/clara:

- fondo `Surface` `#FBFBFB`;
- texto oscuro.

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

Visual: misma familia que los inputs (§9): dark por defecto, borde `Red` en error, variante invertida/clara disponible.

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

- **Default:** fondo negro, borde dorado (`Primary`);
- **Seleccionada / invertida:** fondo claro (`Surface`), contenido oscuro;
- **Destacada positiva:** fondo `Green` sólido.

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

Encabezado de sección del rediseño.

Estructura:

`TÍTULO DE SECCIÓN ———————— línea horizontal`

- título en mayúsculas (H2/H3 según jerarquía);
- línea horizontal fina que ocupa el ancho restante;
- acciones de la sección (por ejemplo `Ver todos >`) al extremo, sin competir con el título.

Ejemplos: `GRANELES`, `PRÓXIMA FABRICACIÓN`, `COSTO-GANANCIA`, `MOVIMIENTOS DE FÁBRICA`, `CUENTAS`.

Variantes (según el Figma):

- con control a la derecha: `Buscar`, selector o acción (`REGISTRAR PAGO`) alineados al extremo de la línea;
- **alerta:** título y línea en `Red` (sección `BAJO STOCK`).

Solo presenta: el contenido y el orden de cada sección siguen definidos por `DESIGN.md` y `BUSINESS_RULES.md`.

---

# 62. Panel (contenedor)

Contenedor plano para agrupar secciones.

Visual:

- fondo `Background` (negro/gris muy oscuro);
- borde fino gris;
- radius discreto;
- sin sombras;
- padding interno según la escala de gaps (`6 / 12 / 20 px`).

Preferir pocos Panels grandes antes que muchas cards fragmentadas.

Variante **alerta:** borde `Red` (sección `BAJO STOCK`).
