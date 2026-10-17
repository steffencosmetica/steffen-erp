# REPORTES — Contrato funcional

Estado funcional: APROBADO
Estructura, UX y responsive: APROBADO (§17)
Detalles visuales finos (colores, px, alturas, gaps): PENDIENTE — se resuelven en la implementación reutilizando el sistema visual existente (§18)
Implementación: PENDIENTE — siguiente fase: R4 Backend analítico

Rama de trabajo:
feat/reportes-analytics

---

## 0. Naturaleza de este documento

Este documento consolida en un solo lugar todas las reglas aprobadas del módulo Reportes, para poder implementarlo sin reconstruirlas desde varios documentos.

**No reemplaza la jerarquía normativa.** Las fuentes normativas siguen siendo:

| Área | Fuente normativa |
|---|---|
| Reglas de negocio | `BUSINESS_RULES.md` §36 (y §35.5 para el Reporte mensual del Dashboard) |
| Flujo | `FLOWS.md` §49 |
| Datos | `DATA_MODEL.md` §65 |
| Composición visual | `DESIGN.md` §35 |
| Componentes | `COMPONENTS.md` §60.1 |
| Secuencia | `IMPLEMENTATION_PLAN.md` §22.2 |

Este documento debe mantenerse 100% consistente con ellas. Si aparece una discrepancia, prevalece la fuente normativa de su área y la discrepancia se reporta antes de implementar; no se resuelve por interpretación.

---

## 1. Alcance y principios

### 1.1 Alcance

Reemplaza por completo el contenido de la página `/reportes`. Se conservan la ruta `/reportes` y el shell general del ERP.

La definición anterior de Reportes ("exactamente cuatro cards": Ventas del mes, Total facturado, Ganancia, Pedidos abiertos) está **derogada** para esta página. Esas cuatro métricas se conservan sin cambios en el bloque `REPORTE MENSUAL` del Dashboard (`BUSINESS_RULES.md` §35.5, vista `v_current_reports`) y no forman parte de este contrato.

### 1.2 Principios

Reportes es un módulo analítico **100% READ-ONLY**:

- sus resultados **no se persisten**;
- no tiene tablas propias;
- no existen triggers, eventos ni procesos de "recalcular reportes";
- no usa vistas materializadas ni cachés persistidas;
- todos los valores se derivan dinámicamente de las operaciones fuente vigentes al momento de consultar;
- cualquier modificación válida en las operaciones fuente queda reflejada automáticamente en la siguiente consulta;
- nunca es una segunda fuente de verdad.

Reportes **no modifica** el comportamiento de: Pedidos, RTO, RTM, Clientes, Compras, Patrimonio, Fábrica ni Stock. Solo lee sus datos.

---

## 2. Arquitectura y aislamiento

Módulo nuevo e independiente:

```
ReportingRepository
→ ReportingService
→ reporting.dto
→ page.tsx (Server Component)
→ ReportesView
```

Se mantienen **intactos**, porque siguen alimentando el Dashboard y otras pantallas:

- `ReportDomainService` (`src/services/report.service.ts`);
- `ReportRepository` (`src/repositories/report.repository.ts`);
- `v_current_reports`.

`getCurrentBusinessPeriod()` (de `ReportDomainService`) puede reutilizarse para obtener la fecha comercial vigente; no se modifica.

Se respetan las reglas generales del proyecto: `composition.ts` server-only; Client Components no importan repositorios, DB ni servicios server-only; sin `any`; NUMERIC como string/Decimal (§13).

---

## 3. Selector global de año

Existe un único **selector global de año**. El año seleccionado controla toda la página.

- **Año por defecto:** el año de la fecha comercial vigente (`v_current_business_date`).
- **Opciones:** desde el primer año con información relevante para Reportes hasta el año actual.
- **Orden:** descendente.
- **Años intermedios sin actividad:** se incluyen.
- **Años futuros:** nunca se ofrecen.
- **Información relevante para determinar el primer año:** operaciones que pueden alimentar Reportes, como mínimo:
  - RTO `COMPLETED` (por `business_date` de la operación del RTO);
  - Gastos operativos (por `business_date` de su operación).
- Si no existe ninguna operación relevante, la única opción es el año actual.

Los bloques que comparan contra años anteriores (§5.3, §11) pueden referirse a años previos al primer año del selector; esos años no tienen ventas y se rigen por las reglas de empty state (§12) y de comparación de concentración (§11: `Sin datos`).

---

## 4. Reglas generales de ventas

### 4.1 Venta válida

Toda métrica basada en ventas considera exclusivamente:

`remittances.status = 'COMPLETED'`

Nunca considera:

- PED `OPEN`;
- RTO `RTM_PENDING`.

`VENTAS` = cantidad de RTO `COMPLETED`.

### 4.2 Fecha analítica

La fecha analítica de una venta es:

`business_operations.business_date` de la operación del RTO (`remittances.operation_id`).

Nunca la fecha del RTM (operación `SALE_RTM`) ni `created_at`.

Facturación, Ganancia y Transporte de una venta se imputan **todos** a esa fecha.

Los Gastos operativos se imputan a la `business_date` de su propia operación (`operating_expenses.operation_id`).

### 4.3 Año corriente y años cerrados

El año corriente y la fecha actual se determinan por la fecha comercial vigente (`v_current_business_date`), igual que el resto del ERP.

- **Año corriente:** acumulado de enero a la fecha actual.
- **Año cerrado:** acumulado de enero a diciembre completos.

### 4.4 Fechas futuras dentro del año corriente

Para el año corriente solo se incluyen operaciones con:

`business_date <= fecha comercial vigente`

Se excluyen las operaciones fechadas en el futuro aunque pertenezcan al mismo año.

Aplica a:

- ventas;
- ganancias;
- transporte;
- gastos operativos;
- rankings;
- análisis individual;
- concentración.

Para años cerrados no se aplica corte: se consideran enero–diciembre completos.

### 4.5 Semántica mensual (todas las series enero–diciembre)

- Mes ya transcurrido sin operaciones: valor `0`.
- Mes actual del año corriente: valor parcial acumulado hasta la fecha actual.
- Mes futuro del año corriente: `null` / sin dato.

Los doce meses permanecen siempre visibles en el eje enero–diciembre.

Un mes futuro **nunca** se representa como un mes transcurrido con valor cero.

### 4.6 Importes excluidos

La Facturación nunca incluye Saldo anterior ni Total a cobrar (`BUSINESS_RULES.md` §15). El importe de la venta es siempre `remittances.total_order_ars`.

---

## 5. Sección FACTURACIÓN

### 5.1 Resumen anual

Acumulado del año seleccionado (§4.3, §4.4).

| KPI | Regla |
|---|---|
| `FACTURACIÓN` | `SUM(remittances.total_order_ars)` |
| `GANANCIA` | `SUM(margin_remittances.gain_ars)` |
| `GASTOS OPERATIVOS` | `SUM(operating_expenses.amount_ars)` según la `business_date` de su `business_operation` |
| `TRANSPORTE` | `SUM(margin_remittances.transport_cost_ars)` |
| `MARGEN %` | `Ganancia / Facturación × 100` |
| `VENTAS` | `COUNT(RTO COMPLETED)` |

Reglas:

- **Gastos operativos** incluye todos los tipos: `LUZ`, `ALQUILER`, `COMISIÓN`, `OTRO`.
- La **comisión de Mercado Libre** se incluye, porque ya constituye un Gasto Operativo `COMISIÓN` en el ERP (`BUSINESS_RULES.md` §25, §27.3).
- **Transporte no** forma parte de Gastos operativos. Transporte no se registra en `operating_expenses` (genera MOV `TRANSPORTE`), por lo que no hay superposición.
- **Transporte es informativo.** La Ganancia RTM ya lo descuenta (`gain = total_order − products_cost_total − transport`, `BUSINESS_RULES.md` §17.4). No se vuelve a descontar.
- **Margen %:** si Facturación = 0 → `null` / `—`.
- **Ventas:** en UI se denomina "Ventas", aunque técnicamente representa la cantidad de remitos RTO `COMPLETED`.

### 5.2 Evolución mensual

Serie enero–diciembre del año seleccionado con:

- Facturación;
- Ganancia;
- Gastos operativos.

Aplica la semántica mensual de §4.5 y el corte de fecha de §4.4.

### 5.3 Facturación y Ganancia por año

Comparación interanual.

Muestra siempre: **año seleccionado + los 2 años anteriores**.

Ejemplo: seleccionado 2026 → 2024, 2025, 2026.

Métricas:

- Facturación;
- Ganancia.

**No** incluye Gastos operativos ni Transporte.

El año seleccionado, si es el corriente, respeta el corte de §4.4; los años anteriores son años cerrados.

---

## 6. Sección PRODUCTOS

### 6.0 Identidad y etiqueta del producto

- La identidad analítica de un producto es siempre `product_id`.
- Todo agrupamiento es por `product_id`; nunca depende del nombre.
- No se usa `product_name_snapshot` como clave de agrupación.
- La etiqueta visible es el **nombre actual** del producto en el maestro (`stock_items.name`, con `product_id = stock_items.id`).
- Un cambio de nombre no divide históricamente un producto en dos rankings.
- Los snapshots históricos siguen siendo la fuente de precio, costo, cantidades y valores económicos históricos.

### 6.1 Ranking

Una única visualización con tres pestañas:

- Más vendidos;
- Mayor facturación;
- Mayor contribución.

Selector: `Top 5` / `Top 10`.

### 6.2 Más vendidos

`SUM(remittance_items.quantity_sent)` por `product_id`.

Solo cantidades efectivamente remitidas. **Nunca** cantidad pedida.

### 6.3 Facturación atribuida por producto

`remittance_items.line_total_ars` representa importe **bruto pre-descuento** (`quantity_sent × unit_price_ars_snapshot`). Los descuentos viven a nivel del RTO (`remittance_discount_steps`), y el total final es `remittances.total_order_ars`.

Para cada RTO `COMPLETED`:

1. **Agrupar primero** las líneas por `remittance_id + product_id`. Es obligatorio porque el modelo no impide que un mismo producto aparezca más de una vez dentro de un PED/RTO.

   `subtotal_bruto_producto = Σ remittance_items.line_total_ars` del producto en ese RTO.

2. Para cada producto del RTO:

   `factor = total_order_ars / subtotal_ars`

   `facturación_atribuida = subtotal_bruto_producto × factor`

Así se atribuyen proporcionalmente los descuentos efectivos del RTO.

Hechos del modelo que garantizan el cálculo (`DATA_MODEL.md` §65.4):

- `Σ remittance_items.line_total_ars = remittances.subtotal_ars` exactamente (mismas líneas `ag_quantity > 0`);
- `subtotal_ars > 0` siempre (precio unitario > 0 y al menos una línea enviada), por lo que el factor nunca divide por cero.

### 6.4 Redondeo de facturación atribuida

- Cálculo interno con NUMERIC/Decimal exacto.
- La atribución operativa se mantiene a **6 decimales**.
- Dentro de cada RTO:
  1. calcular las atribuciones a 6 decimales;
  2. comparar `SUM(atribuciones)` contra `total_order_ars`;
  3. si existe residuo exclusivamente de redondeo, asignarlo al producto con **mayor subtotal bruto** del RTO;
  4. en empate, desempatar determinísticamente por `product_id`.

Debe cumplirse exactamente:

`SUM(facturación_atribuida de los productos del RTO) = remittances.total_order_ars`

**No** se redondea cada producto a pesos enteros para realizar esta distribución.

El formateo visual es independiente del cálculo interno.

### 6.5 Mayor facturación

Ranking anual por:

`SUM(facturación_atribuida)` por `product_id`.

### 6.6 Contribución

Terminología normativa: **CONTRIBUCIÓN**. No utilizar "Ganancia por producto".

Para cada producto:

`contribución = facturación_atribuida − total_cost_snapshot_ars`

Reglas:

- El costo utilizado es exclusivamente `margin_remittance_items.total_cost_snapshot_ars`: el costo histórico congelado en el RTM.
- **Nunca** se usa costo teórico actual.
- El Transporte **no** se distribuye entre productos.
- Contribución = resultado del producto **antes** de transporte.
- Ganancia RTM = resultado final de la venta **después** de transporte.
- **No** se exige `SUM(contribuciones) = Ganancia RTM`. La diferencia corresponde principalmente al Transporte, por diseño.
- El snapshot de costo puede ser `0` si el RTM se completó históricamente sin costo disponible. Reportes usa ese snapshot literalmente. No se agrega ninguna regla nueva de costo obligatorio.
- La Contribución puede ser **negativa**.

Ranking "Mayor contribución": `SUM(contribución)` anual por `product_id`.

### 6.7 Unión RTO / RTM por producto

`margin_remittance_items` no tiene `remittance_item_id`.

Para evitar multiplicaciones:

1. agregar `remittance_items` por `remittance_id + product_id`;
2. agregar `margin_remittance_items` por `remittance_id + product_id` (vía `margin_remittances.remittance_id`);
3. recién después realizar el JOIN.

**Nunca** hacer JOIN directo línea-a-línea por `product_id` cuando existen posibles productos repetidos.

### 6.8 Participación por producto

Selector:

- Unidades;
- Facturación;
- Contribución.

Para la métrica seleccionada: **Top 4 productos + "Otros productos"**.

- Unidades: Top 4 por unidades + Otros productos.
- Facturación: Top 4 por facturación atribuida + Otros productos.
- Contribución: Top 4 por contribución + Otros productos.
- El Top 4 se recalcula según la métrica seleccionada.
- "Otros productos" agrupa todo lo que queda fuera de los cuatro primeros.

Visualización:

- Si todos los valores representados son `>= 0`: puede utilizarse dona.
- Si existe alguna Contribución negativa: se usan **barras** en lugar de dona.
- Nunca se fuerzan valores negativos dentro de un gráfico de partes de un total.

---

## 7. Entidades analíticas comerciales

Reportes trabaja con una **entidad analítica común**.

Fuente canónica: `remittances.customer_source`.

- Valores persistidos (CHECK): `REGISTERED_CUSTOMER`, `MERCADO_LIBRE`, `CONSUMER_FINAL`.
- Se copia del PED al confirmar el RTO y queda **congelado históricamente** por el trigger de inmutabilidad de `remittances`.
- **No** se usa `recipient_name_snapshot` como discriminador.

| `customer_source` | Clave analítica | Etiqueta |
|---|---|---|
| `REGISTERED_CUSTOMER` | `"CLI:" + customer_id` | `customers.name` |
| `MERCADO_LIBRE` | `"ML"` | `Mercado Libre` |
| `CONSUMER_FINAL` | `"CF"` | `Consumidor Final` |

### 7.1 Clientes registrados

- Una entidad por `customer_id`.
- Etiqueta: `customers.name`.
- Un cliente actualmente **inactivo** permanece incluido en el análisis histórico si tuvo RTO `COMPLETED` en el período. La desactivación no borra ni excluye ventas históricas (`BUSINESS_RULES.md` §37.3).

### 7.2 Mercado Libre

- Una única entidad analítica `ML`, etiqueta `Mercado Libre`.
- No tiene `customer_id` y **no** se convierte en registro de `customers`.
- No modifica lógica operativa existente.

### 7.3 Consumidor Final

- Una única entidad analítica `CF`, etiqueta `Consumidor Final`.
- No tiene `customer_id` y **no** se convierte en registro de `customers`.
- No modifica lógica operativa existente.

### 7.4 Métricas por entidad

Todas sobre los RTO `COMPLETED` de la entidad en el período (§4.3, §4.4).

| Métrica | Regla |
|---|---|
| Total facturado | `SUM(total_order_ars)` |
| Compras / Ventas | `COUNT(RTO COMPLETED)` |
| Ticket promedio | `Total facturado / COUNT(RTO COMPLETED)`; sin compras → `null` / `—` |
| Promedio mensual | ver §7.5 |
| Última compra | `MAX(business_date)` de sus RTO `COMPLETED` |
| Frecuencia | ver §7.6 |

### 7.5 Promedio mensual

- **Año corriente:** total de enero al mes actual / cantidad de meses transcurridos. Ejemplo: octubre → dividir por 10.
- **Año cerrado:** total anual / 12.
- Los meses sin compras cuentan como cero.

### 7.6 Frecuencia

- Cada RTO `COMPLETED` cuenta como una compra/venta.
- Ordenar las fechas.
- Para `n >= 2`:

  `(última fecha − primera fecha) / (n − 1)`

  Equivalentemente: promedio de los intervalos consecutivos, en días.

- Dos RTO el mismo día: intervalo de 0 días; ambos cuentan.
- Para `n < 2`: `null` / `—`.

---

## 8. Mayores compradores

Ranking ordenado por Facturación total descendente.

Incluye:

- clientes registrados;
- Mercado Libre;
- Consumidor Final.

Selector: `Top 5` / `Top 10`.

Por entidad se muestra:

- Nombre;
- Total comprado/facturado;
- Promedio mensual (§7.5);
- Última compra (§7.4);
- Frecuencia (§7.6).

---

## 9. Análisis individual

Utiliza el mismo selector global de año.

### 9.1 Selector de entidad analítica

Para el año seleccionado muestra **únicamente** las entidades con al menos un RTO `COMPLETED` en ese año (respetando el corte de fecha de §4.4). Incluye:

- clientes registrados activos;
- clientes registrados actualmente inactivos, si tuvieron ventas ese año;
- Mercado Libre, si tuvo ventas ese año;
- Consumidor Final, si tuvo ventas ese año.

No se muestran entidades sin ninguna venta `COMPLETED` en el período seleccionado.

### 9.2 KPIs

| KPI | Regla |
|---|---|
| `TOTAL ANUAL` | `SUM(total_order_ars)` |
| `PROMEDIO MENSUAL` | §7.5 |
| `TICKET PROMEDIO` | total facturado / `COUNT(RTO COMPLETED)` |
| `COMPRAS / VENTAS` | `COUNT(RTO COMPLETED)` |
| `FRECUENCIA` | §7.6 |
| `ÚLTIMA COMPRA` | `MAX(business_date)` |

### 9.3 Evolución mensual

Facturación mensual de la entidad, siempre enero–diciembre, con la semántica de §4.5:

- mes pasado sin compra = 0;
- mes actual = parcial;
- mes futuro = `null`.

### 9.4 Historial expandible

"Ver historial". Muestra como mínimo:

- Código RTO;
- Fecha;
- Total.

Si la navegación existente permite abrir el detalle de RTO, la UI podrá enlazarlo.

---

## 10. Concentración

Objetivo: medir qué porcentaje de la facturación depende de pocas entidades comerciales.

**Universo:** clientes registrados, Mercado Libre y Consumidor Final. Por lo tanto, el denominador coincide con la Facturación total reportada del período (§5.1).

Todas las entidades se ordenan automáticamente por facturación descendente. **Nunca** se configura manualmente quién pertenece al Top 5 / Top 10.

### 10.1 Grupos de la dona

Las porciones **no** se superponen:

- posiciones 1–5;
- posiciones 6–10;
- resto.

Suman 100%.

### 10.2 Indicadores acumulados

- `TOP 5` = participación acumulada de las posiciones 1–5.
- `TOP 10` = participación acumulada de las posiciones 1–10.
- `RESTO` = 100% − Top 10.

Ejemplo:

- Top 5 = 43%;
- Top 10 = 67%;
- Resto = 33%.

Aunque la dona internamente representa:

- 1–5 = 43%;
- 6–10 = 24%;
- Resto = 33%.

### 10.3 Menos de 10 entidades

Ejemplo con 7 entidades:

- Top 5: las primeras cinco;
- Top 10: las siete existentes = 100%;
- Resto: 0%.

La métrica no se oculta.

### 10.4 Concentración sin facturación

Si para el año seleccionado la facturación total del universo de entidades analíticas es 0 — tanto si no existen RTO `COMPLETED` como si el universo analítico resulta sin facturación válida:

- la dona de Concentración muestra el estado `Sin datos`;
- `TOP 5` = sin dato / `—`;
- `TOP 10` = sin dato / `—`;
- `RESTO` = sin dato / `—`.

No se representan como 0%, porque el denominador es 0.

Las métricas económicas generales mantienen sus empty states (§12): Facturación 0, Ganancia 0, Gastos operativos 0, Transporte 0, Ventas 0, Margen % sin dato.

---

## 11. Comparación interanual de concentración

Comparación del año seleccionado contra el año seleccionado − 1.

- Cada año calcula su **propio** ranking, independientemente.
- No se siguen los mismos clientes entre años.
- Se comparan: Top 5, Top 10 y Resto.
- Si un año no tiene facturación: `Sin datos`.
- La ausencia de universo **no** se interpreta como concentración 0%.

---

## 12. Empty states

Sin ventas en el período:

| Dato | Valor |
|---|---|
| Facturación | `0` |
| Ganancia | `0` |
| Gastos operativos | `0` |
| Transporte | `0` |
| Ventas | `0` |
| Margen % | `null` / `—` |
| Rankings | `[]` |
| Entidades | `[]` |
| Series enero–diciembre | meses transcurridos sin movimientos = `0`; meses futuros del año corriente = `null` |
| Concentración | `Sin datos`; Top 5 / Top 10 / Resto = `—`, nunca 0% (§10.4) |
| Comparación de concentración | `Sin datos` para el año sin facturación (§11) |

La pantalla nunca requiere datos ficticios para funcionar.

Los mensajes de estado vacío siguen `COMPONENTS.md` §51 (mensaje específico al contexto, sin ilustraciones).

---

## 13. Precisión y Decimal/NUMERIC

- Los importes NUMERIC se preservan como string/Decimal; nunca `Number` para cálculos monetarios.
- Decimal con precisión 28; `ROUND_HALF_UP` donde corresponda.
- La facturación atribuida se mantiene a 6 decimales con la regla de residuo de §6.4.
- Las sumas de Facturación, Ganancia, Transporte y Gastos operativos son sumas exactas de los snapshots/importes persistidos; no se recalcula nada con costos o precios actuales.
- Los cocientes derivados (Margen %, Ticket promedio, Promedio mensual, participaciones de concentración y de producto) se calculan con Decimal exacto; el redondeo es solo de presentación.
- La Frecuencia se expresa en días.
- El formateo visual es independiente del cálculo interno.

---

## 14. Fuentes de datos

| Dato | Tabla / columna |
|---|---|
| Venta (filtro) | `remittances.status = 'COMPLETED'` |
| Fecha analítica de venta | `business_operations.business_date` vía `remittances.operation_id` |
| Fecha comercial vigente | `v_current_business_date` |
| Facturación | `remittances.total_order_ars` |
| Subtotal bruto del RTO | `remittances.subtotal_ars` |
| Ganancia | `margin_remittances.gain_ars` (1:1 por `remittance_id` UNIQUE) |
| Transporte | `margin_remittances.transport_cost_ars` |
| Gastos operativos | `operating_expenses.amount_ars` + `business_operations.business_date` vía `operating_expenses.operation_id` |
| Unidades / bruto por producto | `remittance_items.product_id`, `remittance_items.quantity_sent`, `remittance_items.line_total_ars` |
| Costo histórico por producto | `margin_remittance_items.total_cost_snapshot_ars` |
| Etiqueta de producto | `stock_items.name` (nombre actual) vía `product_id` |
| Entidad analítica | `remittances.customer_source`, `remittances.customer_id` |
| Etiqueta de cliente registrado | `customers.name` |
| Código RTO (historial) | `remittances.code` |

No se usan como fuente analítica:

- `orders` (ni cantidades pedidas);
- `recipient_name_snapshot` (como discriminador);
- `product_name_snapshot` (como clave);
- `prior_balance_snapshot_ars` / `total_to_collect_ars`;
- costo teórico actual (`v_current_product_cost`).

Referencia normativa: `DATA_MODEL.md` §65.

---

## 15. Arquitectura técnica futura

Decisión aprobada, todavía **no implementada**:

- una migración aditiva futura (`36`) con funciones PostgreSQL `STABLE`, exclusivamente READ-ONLY, para realizar las agregaciones;
- `EXECUTE` solo para `service_role` (mismo patrón que `get_customer_last_activity()`);
- sin `INSERT` / `UPDATE` / `DELETE` sobre tablas operativas;
- NUMERIC exactos, devueltos sin pérdida de precisión;
- evitar traer todos los RTO a Next para agregarlos en memoria;
- regenerar los tipos Supabase oficialmente tras la migración (no editar `database/types.ts` a mano);
- las consultas devuelven correctamente el caso vacío (§12).

Motor gráfico: **Recharts** (todavía no instalado).

Secuencia y estado (`IMPLEMENTATION_PLAN.md` §22.2):

| Subfase | Estado |
|---|---|
| R1 — Auditoría READ-ONLY | COMPLETADA |
| R2 — Contrato funcional | COMPLETADA |
| R2.1 — Documentación funcional (este documento) | COMPLETADA |
| R3.1 — Desktop | APROBADO |
| R3.2 — Interacciones | APROBADO |
| R3.3 — Responsive | APROBADO |
| R3.4 — Documentación UX | COMPLETADA |
| **R4 — Backend analítico** | **SIGUIENTE**: migración 36, Repository, Service, DTO, tests |
| R5 — UI | PENDIENTE: Recharts + `ReportesView` según §16–§17 y `DESIGN.md` §35; smoke manual |

Tests (R4) deben cubrir como mínimo: atribución y residuo por RTO, unión agregada RTO/RTM por producto, productos repetidos en un RTO, entidades ML/CF, promedio mensual, frecuencia, concentración (incluido < 10 entidades y sin facturación), semántica mensual, corte de fechas futuras, selector de años y empty state. Sin fixtures persistentes.

---

## 16. Decisiones de visualización funcional

| Sección | Bloque | Controles | Visualización |
|---|---|---|---|
| Global | Encabezado `REPORTES` | Selector global de año | — |
| Facturación | Resumen anual | — | KPIs |
| Facturación | Evolución mensual | Leyenda interactiva (ocultar/mostrar series) | Serie mensual enero–diciembre (Facturación, Ganancia, Gastos operativos) |
| Facturación | Facturación y Ganancia por año | — | Barras agrupadas (no líneas), 3 años |
| Productos | Ranking | 3 tabs (una activa) + `Top 5` / `Top 10` local | Filas con nombre + barra proporcional + valor |
| Productos | Participación | `Unidades` / `Facturación` / `Contribución` (independiente del Ranking) | Dona; barras automáticamente si hay Contribución negativa |
| Clientes | Mayores compradores | `Top 5` / `Top 10` local | Ranking tipo tabla con barras proporcionales integradas |
| Clientes | Análisis individual | Selector de entidad buscable por nombre; `Ver historial` | KPIs + serie mensual + historial expandible |
| Clientes | Concentración | — | Dona 1–5 / 6–10 / resto + indicadores acumulados debajo |
| Clientes | Evolución de la concentración | — | Barras horizontales agrupadas, año vs año − 1 |

Reglas de visualización con efecto funcional:

- los 12 meses siempre visibles; meses futuros sin dato, nunca como cero;
- nunca forzar valores negativos en un gráfico de partes de un total;
- `—` para valores `null`;
- `Sin datos` para concentración de un año sin facturación, con Top 5 / Top 10 / Resto en `—` (nunca 0%), tanto en la dona del año seleccionado (§10.4) como en la comparación interanual (§11);
- Frecuencia como valor simple (ej.: `24 días`), sin estados interpretativos ("atrasado", "en fecha", "debería comprar"): no existe regla normativa de tolerancia;
- terminología: `CONTRIBUCIÓN` (no "Ganancia por producto"), `GANANCIA` (no "Margen neto"), `VENTAS`.

Fuente normativa de estructura, interacción y responsive: `DESIGN.md` §35. Componentes: `COMPONENTS.md` §60.1.

---

## 17. UX, interacciones y responsive

Resumen consolidado de `DESIGN.md` §35 (aprobado en R3.1–R3.3). Ante discrepancia prevalece `DESIGN.md`.

### 17.1 Estructura

- Encabezado: `REPORTES` + selector global de año (en el encabezado general, no dentro de Facturación).
- Tres macrosecciones con títulos visibles: `FACTURACIÓN`, `PRODUCTOS`, `CLIENTES`.
- Cada gráfico, ranking o bloque analítico en **su propio Panel**; no mega-paneles por sección.

### 17.2 Desktop (`>= 1280 px`, sidebar visible)

- **Facturación:** Resumen anual (6 KPIs a lo ancho) → fila ~60/40: Evolución mensual / Facturación y Ganancia por año.
- **Productos:** fila ~60/40: Ranking de productos / Participación por producto.
- **Clientes:** fila 1 ~60/40: Mayores compradores / Concentración; fila 2 ~60/40: Análisis individual / Evolución de la concentración.
- No se fuerzan alturas iguales: si Análisis individual crece al expandir historial, solo ese panel crece; la columna derecha no se estira.
- Proporciones conceptuales; no se fijan píxeles.

### 17.3 Interacciones

- Selector global de año, selectores locales y selector de entidad: actualizan inmediatamente, sin botón Aplicar. El año actualiza toda la página; los locales, solo su bloque.
- `Top 5` / `Top 10` del Ranking de productos afecta solo ese ranking; el de Mayores compradores, solo ese ranking.
- Participación tiene selector propio, independiente de la tab activa del Ranking. Cambio a barras automático, sin confirmación.
- Análisis individual: al cambiar la entidad se actualizan KPIs, gráfico mensual e historial. Historial cerrado por defecto (`Ver historial`); enlace al detalle de RTO solo si existe una ruta válida (no se inventa ruta).
- Tooltips: hover (desktop) / tap (touch) sobre punto, barra o segmento → categoría/mes + valor exacto formateado; un nuevo tap reemplaza el anterior.
- Evolución mensual: tres series visibles al inicio; leyenda interactiva (también en touch) para ocultar/mostrar cada serie.
- Evolución de la concentración: si el año anterior no tiene datos, esa serie se muestra como `Sin datos`; no se oculta la comparación.

### 17.4 Loading, empty states y alturas

- Sin spinner general de página: skeleton/loading interno por panel, conservando su estructura.
- Ningún panel se oculta por falta de datos: se mantienen título, controles relevantes y estructura, con empty state interno (también compacto en mobile, nunca reducido a una línea externa).
- Cada tipo de gráfico tiene su altura natural; no se impone altura uniforme.

### 17.5 Tablet (aprox. 768–1279 px, topbar/drawer existente)

- Dos columnas cuando el contenido entre legible; 60/40 puede pasar a 50/50 o equivalente. No se obliga a una columna desde 1279 px.
- Resumen anual: 3 KPIs por fila cuando el ancho lo permita.

### 17.6 Mobile (una sola columna)

- Orden obligatorio: FACTURACIÓN → PRODUCTOS → CLIENTES.
- Selector global de año a ancho completo debajo de `REPORTES`.
- KPIs (Resumen anual y Análisis individual) en grilla de 2 columnas; última card impar puede ocupar el ancho; sin carrusel.
- Gráficos mensuales (general e individual): 12 meses preservados; scroll horizontal **interno** del área gráfica si no entran; labels no comprimidos en exceso. Nunca scroll horizontal de la página.
- Facturación y Ganancia por año: barras agrupadas, ancho adaptado; no cambia el tipo.
- Productos: tabs con scroll horizontal interno si no entran (nunca select); `Top 5`/`Top 10` visible; filas nombre + barra + valor (solo se reduce información secundaria; no cards por producto); Participación a ancho completo con leyenda debajo.
- Mayores compradores: sin tabla horizontal; fila/card compacta de dos niveles (Nombre + Total / Promedio/mes · Última compra · Frecuencia) con barra proporcional al pie; `Top 5`/`Top 10` visible.
- Análisis individual: selector buscable a ancho completo; evolución mensual con scroll interno si hace falta; historial como filas/cards compactas (RTO, Fecha, Total), tap abre detalle de RTO solo si existe ruta válida.
- Concentración: dona primero; debajo Top 5 / Top 10 / Resto en 3 columnas si entra, si no adaptar/apilar. Evolución de la concentración: barras horizontales (no verticales).

---

## 18. Pendientes exclusivamente visuales

Estructura, interacciones y responsive están aprobados (§17). Quedan para la implementación, reutilizando el sistema visual existente del ERP y sin efecto sobre reglas ni comportamiento:

- colores de series y gráficos (dentro de la paleta vigente; sin colores nuevos);
- tamaños en px, alturas exactas y gaps exactos;
- tipografías (sin tipografías nuevas);
- estilo definitivo de tooltips, leyendas, skeletons, barras proporcionales e historial expandible.

### Deuda documental menor (corregir en la fase de implementación)

Comentarios de código que todavía citan `BUSINESS_RULES §36` para las cuatro métricas mensuales, que ahora están en §35.5:

- `src/app/(erp)/page.tsx` (bloque `REPORTE MENSUAL`);
- `src/app/(erp)/reportes/page.tsx` (será reemplazado);
- `src/repositories/report.repository.ts`;
- `src/services/report.service.ts`.

`docs/AUDIT.md` conserva la referencia antigua a "cuatro métricas" como registro histórico de esa auditoría; no se modifica.
