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

# 3. Tokens base y tematización — R1

Fuente normativa: `DESIGN.md` §4–§7. Un solo sistema de componentes, con `data-theme="dark|light"` y CSS Custom Properties semánticas compartidas; no crear componentes duplicados por tema. Preferencia persistente entre sesiones, DARK por defecto, sin flash incorrecto ni hydration mismatch. Solo proveedor/control de theme requiere estado cliente cuando sea necesario; conservar Server Components.

## Colores

Comunes: Primary `#C38926`, Secondary/Black absoluto `#000000`, Info `#0E50A0`, Info hover `#05346E`, Success `#008102`, Danger `#DD0000`.

| Rol | DARK | LIGHT |
|---|---|---|
| background | `#161616` | `#EFEFEF` |
| surface | `#0F0F0F` | `#F6F6F6` |
| border-control | `#D9D9D9` | `#D9D9D9` |
| border-section/header | `#393939` | `#D9D9D9` |
| text-primary | `#FFFFFF` | `#212121` |
| section-title | `#6B6B6B` | `#6B6B6B` |
| gradiente prescrito | `#121212 → #000000` | `#F3F2F2 → #DEDDDD` |

Separar background, surface, surface-raised, text-primary, text-secondary, text-on-action, border-section, border-control, selection, hover, overlay, success, danger, info, chart-grid, chart-axis y chart-tooltip. Los tokens soft/derivados no determinados inequívocamente son a calibrar visualmente, sin inventar hexadecimales. `--steffen-surface` histórico mezcla texto y fondo: separar consumidores por rol antes de reutilizarlo; no basta reasignarlo a un fondo Light. Negro absoluto solo en casos prescritos.

Dorado: identidad, navegación activa, selección y foco; excluido de series estadísticas. `#D2AB68` y `#B99D22` obsoletos para UI activa, sin modificar PDFs versionados o assets con contrato independiente.

Los nombres heredados se interpretan por rol según DESIGN.md §4.1: Blue/Tertiary = Info, Blue Hover = Info hover, Green/Verde = Success, Red/Rojo = Danger, Border Button = border-control y Border Contenedor = border-section. Text Muted equivale a text-secondary salvo títulos de sección (section-title).

## Densidad y tipografía

Conservar exactamente tamaños actuales de fuentes, botones, inputs, tablas, sidebar, cards, gaps y paddings. Inter oficial; body 12 px. Escala: text-xs 11 px, text-sm 12 px, text-base 13 px, text-lg 14 px, text-xl 16 px, text-2xl 18 px, text-3xl 22 px, text-4xl 26 px. Conservar excepciones locales justificadas (encabezados, KPI e importes). `--spacing: 3px` y valores locales actuales permanecen.

## Superficies

Sin sombras decorativas; mantener bordes y radios implementados (panel/card 10 px, control 5 px). Surface y surface-raised son roles distintos. Solo los componentes prescritos usan gradiente; Light mantiene jerarquía entre fondo y surfaces, no blanco plano.

# 4. Button

## 4.1 Variantes oficiales

Misma acción, geometría y componente entre temas; solo cambian tokens. Base: dimensiones actuales, radio 5 px y texto de 12 px donde ya corresponda.

| Variante | Contrato |
|---|---|
| Primary | acción principal; Light puede usar Info/Info hover, sin convertir Success/Danger/neutrales en azules |
| PrimaryDark | neutro: Dark con gradiente oscuro y border-control; Light negro absoluto con text-on-action. Icon/IconText neutros admiten superficie elevada |
| Success | Success + text-on-action |
| Danger | Danger + text-on-action |
| Info | Info + text-on-action; hover `#05346E` |
| Icon | composición de Button con icono; label accesible obligatorio si no muestra texto |
| IconText | composición de Button con icono y texto |
| Menu | navegación, activo Primary e inactivo según tokens del tema (§5) |
| Lista | selector transparente con hover/selección del tema (§7) |
| Volver | enlace Info con triángulo; hover Info hover (§8) |
| IconRojo | Danger con icono y texto sobre acción de contraste |

No se exige un componente nuevo por variante cuando la composición del Button existente alcanza. Los nombres actuales de API (`principal`, `secundario`, `verde`, `rojo`, `azul`) no cambian por esta especificación; su adaptación se resolverá en implementación. PrimaryDark no es un componente exclusivo de Dark.

El botón circular de agregar conserva dimensiones y función actuales, con icono/texto de contraste del tema. IconButton comparte tokens y estados con Button. No confundir icono PDF rojo con una nueva acción destructiva.

## 4.2 Tamaños

- Chico: `~30 px` (texto 12 px semibold)
- Grande: `~50 px` (texto H3 14 px)

## 4.3 Estados

Default, Hover, Selected (solo si representa estado persistente), Disabled (opacidad reducida, sin interacción).

---

# 5. MenuButton

Botón de la barra lateral (variante Menu).

- Estructura: ícono (≈21 px) arriba, label 11 px semibold debajo.
- Default: icono y label neutrales del tema.
- Hover: hover-neutral sutil. Selected (módulo activo): icono y label Primary.
- Logout: control al pie separado de los módulos, sin card ni gradiente; referencia canónica exclusiva: Dashboard nuevo suministrado por el usuario. Las demás maquetas de logout son antiguas. Mismo componente, geometría y comportamiento entre Dark/Light; solo tokens. No modificar `logoutAction` ni sesión.

Conserva las rutas funcionales actuales (`DESIGN.md` §9). No se agregan ítems por aparecer en frames viejos.

No usar para acciones de formulario.

---

# 6. TabButton

Subpestañas (Productos / Materia Prima / Componentes). Patrón Lista (§7) con ícono: Default transparente; Selected con fondo surface-raised/gradiente del tema. Solo una Selected por grupo.

---

# 7. ListSelectorButton

Selector lateral de entidades (Clientes, Proveedores, Fórmulas, Productos Finales) y sub-pestañas.

- Default: transparente, ícono + texto text-primary (B1);
- Hover / Selected: fondo surface-raised/gradiente del tema, radius `5 px`.

Puede acompañarse por `Ver más`.

**Card de entidad (Pedidos):** mantiene cliente, código, fecha e importe, geometría actual y radio 10 px. Default con superficie/gradiente del tema y border-section. Selected DARK: `#000000` + borde `#C38926`, sin gradiente. Selected LIGHT: surface/gradiente claro según diseño + borde `#C38926`. Seleccionar no cambia dimensiones. Es selector de entidad, no KPI.

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

Visual Dark/Light:

- Default → fondo surface-raised/gradiente del tema, borde `Border Button`, texto text-primary, placeholder `Text Muted`, radius `5 px`;
- Focus → borde `Primary`;
- Disabled → interacción bloqueada, contraste reducido (manteniendo legibilidad);
- Error → borde `Red` + mensaje B4 `Red`.

Las variantes de contraste usan surface y border-control del tema; no reutilizar el token histórico Surface como texto o borde. Mantener dimensiones y comportamiento nativo, con text-secondary para placeholder y color-scheme correspondiente.

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

Visual: misma familia que los inputs (§9): fondo surface-raised/gradiente del tema, borde `Border Button`, flecha ▼ con contraste del tema, borde `Rojo` en error.

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

Estructura: valor principal dominante, label y contexto secundario opcional. Mantener las dimensiones locales implementadas.

Variantes semánticas de Card y KpiCard:

- **Neutral:** Surface o surface-raised/gradiente del tema según componente.
- **Positive:** LIGHT con success-soft y semántica Success; DARK con Surface oscura y énfasis principalmente en texto/valor/borde Success.
- **Negative:** LIGHT con danger-soft y semántica Danger; DARK con Surface oscura y énfasis principalmente en texto/valor/borde Danger.

Soft: tokens a calibrar visualmente, sin hexadecimales arbitrarios. Valor numérico dominante sobre etiqueta; conservar tamaños locales. Icono opcional por composición, no nueva identidad visual. No usar Card para reemplazar tablas de gestión ni crear variantes separadas por tema.

Dashboard R3.1: las cards de Pedidos abiertos y Ventas del mes tienen acento/borde Primary en ambos temas según DASHBOARD-dark/light; es una excepción visual explícita a Neutral, sin modificar dimensiones. Importes según DESIGN.md §5.1: Bold en Total facturado, Ganancia, cajas y Neto; Regular en deudas. IconTile de acción usa Info/Info hover en Light y gradiente oscuro en Dark.

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

Visual Dark/Light (`DESIGN.md` §12):

- LIGHT: Surface clara, header gris `#D9D9D9`, texto `#212121`, divisores finos.
- DARK: Surface `#0F0F0F`, header `#393939`, texto `#FFFFFF`, divisores con contraste suficiente.
- Success para positivos; Danger para faltantes/alertas; Info para links/acciones.
- Conservar densidad, alturas de fila, tamaños tipográficos, radios, responsive y scroll actuales, con alineación numérica consistente.
- Headers especiales solo donde estén prescritos; texto sobre un fondo de acción usa text-on-action. No fijar texto claro para todos los temas ni dorado obligatorio para el header del Pedido.

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

Visual: danger-soft y texto de contraste del tema, o valor crítico Danger según pantalla. No imponer relleno rojo oscuro en Light. Los derivados soft se calibran visualmente según DESIGN.md §4.1.

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

No inventar nuevos significados por color. StatusBadge conserva contenido, geometría y estado funcional; fondo, texto y borde usan tokens del tema, con text-on-action cuando corresponda.

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

Visual: Surface del tema, border-section, overlay semántico, text-primary, sin sombras decorativas; título H2/H3 e inputs del mismo sistema. Mantener dimensiones y scroll. Pedido abierto conserva Guardar y Cancelar: Guardar mantiene el editor abierto tras éxito y Cancelar/X protegen borradores pendientes, según FLOWS.md §14 y DESIGN.md §19. No introducir persistencia automática.

Conservar el responsive implementado según DESIGN.md §3.0; las referencias históricas de §56–§58 no autorizan a cambiarlo.

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

No usar para acciones normales. ConfirmDialog comparte Surface, border-section/énfasis Danger, text-primary y overlay del tema; no duplicar por tema. Mantener sus acciones Cancelar/Confirmar para Borrar PED y las demás confirmaciones destructivas vigentes.

### Protección de cambios sin guardar — Pedido abierto

El diálogo de cambios pendientes es una confirmación de abandono específica (`FLOWS.md` §14), distinta de borrar el Pedido. Reutilizar las primitivas visuales y el comportamiento accesible del sistema; no imponer el par fijo Cancelar/Confirmar ni tratar Guardar como acción destructiva.

- Cancelar, X o cierre por tarjeta seleccionada: **Descartar cambios / Seguir editando** cuando se perderían borradores; sin cambios, cerrar directamente.
- Otro pedido, navegación interna (sidebar, logos, mobile, logout), o Generar remito: **Guardar y continuar / Descartar cambios / Seguir editando** si existen borradores pendientes. Suspender el destino; ante fallo de guardado, mostrar error y conservar borrador y pedido actual. Para RTO, descartar continúa con el último estado persistido y conserva todas sus validaciones.
- Guardar sin destino pendiente persiste y mantiene abierto el editor; actualizar la referencia solo con éxito. Impedir doble guardado y no dar por guardados cambios posteriores a la solicitud.
- La detección semántica incluye productos y orden, cantidades, AG, bultos y otros campos editables existentes; excluye identidades temporales, derivados y cambios visuales. Revertir todos los valores limpia el estado pendiente.
- Abrir Agregar producto no marca cambios. Los datos escritos sin agregar son un borrador auxiliar independiente cuyo abandono se protege; Agregar solo incorpora al borrador del pedido, sin persistir.
- Diálogo propio con foco contenido, nombres de acciones explícitos y retorno de foco al seguir editando. Escape o cierre del diálogo equivalen a **Seguir editando**; no descartan ni ejecutan destinos.
- La navegación mediante controles internos está protegida. **Limitación conocida de Back/Forward (R5.4.1):** Atrás/Adelante nativos dentro de la SPA no cuentan con protección garantizada; su cobertura queda pendiente de una futura mejora. No se implementan workarounds de historial ni `precommitHandler`. Salidas del documento, refresh y cierre de pestaña usan `beforeunload` cuando el navegador lo permite; su aviso es nativo, con texto y botones del navegador. No prometer diálogo propio, guardado asíncrono al salir ni protección garantizada ante cierre forzado.

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
- color de texto con contraste suficiente sobre la Surface del tema;
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

Responsive, navegación mobile y tablas mobile conservan su implementación actual; §56–§58 son referencias históricas de planificación.

Quedan como refinamiento visual posterior:

- apariencia exacta del calendario desplegado del DatePicker;
- apariencia exacta del menú desplegado del Select;
- Toast/feedback no crítico;
- animaciones/transiciones.

Estos refinamientos no deben modificar reglas funcionales ni bloquear el MVP.


---

# 56. Responsive behavior

> Referencia histórica de planificación responsive. R1 conserva breakpoints, dimensiones, targets, navegación y scroll actuales (DESIGN.md §3.0); las pautas de esta sección no autorizan a ampliarlos ni rediseñarlos.

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

> **Alcance actualizado.** Esta card ya no define la pantalla Reportes (la definición de "cuatro cards" de Reportes queda derogada; ver `BUSINESS_RULES.md` §36). Se conserva para el bloque `REPORTE MENSUAL` del Dashboard (`BUSINESS_RULES.md` §35.5, `DESIGN.md` §15.1). Los componentes de la pantalla Reportes se listan en §60.1.

Card del bloque `REPORTE MENSUAL` del Dashboard.

Contenido:

1. valor;
2. label.

Variantes semánticas: Neutral para Ventas del mes, Total facturado y Pedidos abiertos; Positive/Success para Ganancia; Negative cuando corresponda explícitamente a un resultado negativo. Aplicar Card/KpiCard §19 en ambos temas. El valor domina a la etiqueta; icono opcional, dimensiones actuales. No imponer fondo negro o verde sólido como regla general de KPI.

El Figma rotula la card verde como `MARGEN NETO`: se mantiene el label normativo `GANANCIA`.

Labels exactos:

- `VENTAS DEL MES`
- `TOTAL FACTURADO`
- `GANANCIA`
- `PEDIDOS ABIERTOS`

No utilizar `MARGEN NETO`.

## 60.1 Componentes de Reportes (conceptual)

Reglas funcionales: `BUSINESS_RULES.md` §36. Composición: `DESIGN.md` §35.

Estructura, interacción y responsive: `DESIGN.md` §35 (aprobados en R3.1–R3.3). Esta lista fija responsabilidades y comportamiento; paleta y theme se fijan en DESIGN.md §35.11, conservando dimensiones actuales y alturas necesarias para legibilidad. Reutilizar primero los componentes existentes (§2): `Panel`, `SectionHeader`, `Select`, `Tabs`, `DataTable`, `EmptyState`, `MoneyDisplay`.

| Componente conceptual | Responsabilidad y comportamiento |
|---|---|
| YearSelector | Selector global de año en el encabezado de Reportes (no dentro de Facturación); controla toda la página; actualiza al seleccionar, sin botón Aplicar. Mobile: ancho completo bajo el título |
| ReportKpi | Valor + label de un KPI (`FACTURACIÓN`, `GANANCIA`, `GASTOS OPERATIVOS`, `TRANSPORTE`, `VENTAS`, `MARGEN %`, KPIs de análisis individual); muestra `—` para `null`. Grilla: a lo ancho en desktop, 3 por fila en tablet si entra, 2 columnas en mobile (sin carrusel) |
| MonthlySeriesChart | Serie enero–diciembre; distingue mes futuro (sin dato) de mes transcurrido con cero; leyenda interactiva para ocultar/mostrar series (también en touch); en mobile, scroll horizontal interno del área gráfica preservando los 12 meses |
| YearComparisonChart | Barras agrupadas (no líneas) de Facturación y Ganancia: año seleccionado + 2 anteriores; mismo tipo en mobile |
| ConcentrationComparisonChart | Barras horizontales agrupadas Top 5 / Top 10 / Resto: año seleccionado vs año − 1; serie sin datos se muestra como `Sin datos` sin ocultar la comparación; horizontales también en mobile |
| RankingPanel | Ranking con filas nombre + barra proporcional + valor; tabs (productos; una activa; scroll horizontal interno en mobile, nunca select) y selector local `Top 5` / `Top 10` siempre visible |
| ShareChart | Partes de un total (Top 4 + Otros; concentración 1–5 / 6–10 / resto). Cambia automáticamente a barras si hay valores negativos, sin confirmación. Mobile: ancho disponible, leyenda debajo |
| TopBuyersList | Ranking tipo tabla con barras proporcionales integradas (desktop/tablet); en mobile filas/cards compactas de dos niveles (Nombre + Total / Promedio·Última compra·Frecuencia) con barra al pie, sin tabla horizontal. Frecuencia como valor simple, sin estados interpretativos |
| AnalyticEntitySelector | Selector **buscable por nombre** de cliente registrado / `Mercado Libre` / `Consumidor Final`; actualiza KPIs, gráfico e historial inmediatamente |
| SalesHistoryList | "Ver historial" expandible, cerrado por defecto: RTO, Fecha, Total; enlaza al detalle de RTO solo si existe una ruta válida; en mobile filas/cards compactas |
| ChartTooltip | Hover (desktop) / tap (touch) sobre punto, barra o segmento: categoría/mes y valor exacto formateado; un nuevo tap reemplaza el anterior |
| PanelSkeleton | Loading interno por panel conservando su estructura; no hay spinner general de página |

Todos los paneles mantienen título, controles y estructura en estado vacío y muestran un empty state interno (§51), también en mobile.

Motor gráfico actual: Recharts. Ningún componente de Reportes modifica datos de negocio.

### Paleta y componentes gráficos R1

- Series económicas: Facturación `#0E50A0`, Ganancia `#008102`, Gastos operativos `#DD0000`.
- Comparación por período: seleccionado azul, anterior gris/neutro; las series que identifican métricas económicas mantienen la paleta económica.
- Top 4 + Otros: categoría 1 `#0E50A0`, categoría 2 `#008102`, categoría 3 `#DD0000`, categoría 4 `#7C3AED`, Otros `#6B7280`. Es distinción categórica, no juicio positivo/negativo.
- Concentración: posiciones 1–5 azul, 6–10 verde, Resto neutro Otros. Dorado excluido de todas las series y barras proporcionales.
- ReportingChartFrame: fondo Surface del tema y altura propia por legibilidad; conservar scroll interno.
- ReportingChartTooltip: Surface, border-section y text-primary del tema, manteniendo valores exactos del DTO.
- ReportingLegend: controles del sistema y colores consistentes con cada serie; preservar interacción.
- chart-grid y chart-axis/labels son tokens específicos; no defaults de Recharts que rompan el theme.
- ReportingPanel: altura natural, skeleton interno durante carga sin igualar paneles vecinos.
- CLIENTES desktop: izquierda Mayores compradores → Análisis individual; derecha Concentración → Evolución de concentración, pilas independientes sin esperar altura vecina. Mobile: Mayores compradores → Concentración → Análisis individual → Evolución de concentración. Una instancia de cada componente; no duplicar para responsive.
- FACTURACIÓN y PRODUCTOS mantienen estructura si no produce espacio muerto significativo. No eliminar arbitrariamente alturas de gráficos.

---

# 61. SectionHeader

Estructura: `Título ———————— línea`.

- título en section-title `#6B6B6B` (B1, o H3 en secciones grandes), sin forzar mayúsculas: respeta el texto del frame;
- línea 1 px `Border Contenedor` que ocupa el ancho restante (text-primary solo donde esté prescrito por contraste);
- controles al extremo (`Buscar`, select, `REGISTRAR PAGO`, `Ver todas ▸`).

Variante **alerta:** título y línea `Rojo` (`Bajo stock`).

Solo presenta: contenido y orden siguen `DESIGN.md` y `BUSINESS_RULES.md`.

---

# 62. Panel (contenedor)

- fondo Surface del tema;
- borde 1 px `Border Contenedor`;
- radius `10 px`;
- padding `15 px` lateral, `12 px` vertical;
- sin sombras.

Variante **alerta:** borde `Rojo`.

Preferir pocos Panels grandes antes que muchas cards fragmentadas.

---

# 63. ErpIcon

Renderiza los íconos base de `docs/visual-references/iconos/` (copiados a `public/icons/`) sin redibujarlos, aplicando el color por máscara CSS sobre la silueta del PNG:

- `chrome` (default): tratamiento de icono del tema con contraste — conservar silueta y geometría de botones/navegación;
- `gold`: `Primary` — navegación activa, ícono de cards de pedido y KPI;
- `light` (nombre histórico del tono): rol de icono/texto de contraste correspondiente, no fondo Surface;
- `red`: `Rojo` (documento PDF);
- `original`: el PNG sin máscara (tile de granel `tanque`).

Siempre decorativo (`aria-hidden`); el botón que lo contiene aporta el label accesible.

---

# 64. AppShell / PageHeader

- **AppShell/Sidebar:** Surface del tema con logo, MenuButtons (§5) y logout canónico; contenido sobre background del tema. Conservar anchos, paddings y breakpoints actuales.
- **PageHeader**: título y chip Admin conservan función y geometría; selector global DARK ↔ LIGHT en zona superior derecha, cambio inmediato, misma ruta, sin recarga de datos y preferencia persistida. Línea border-section. Header/mobile navigation ofrecen acceso equivalente sin alterar rutas, drawer, targets ni scroll.
- **SecondaryHeader** (pantallas secundarias): `Volver` (§8) a la izquierda, título H3 centrado, acción principal a la derecha.
