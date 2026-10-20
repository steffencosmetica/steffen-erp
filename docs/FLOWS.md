# FLOWS.md — ERP STEFFEN

## 1. Objetivo

Este documento define, paso a paso, cómo se ejecutan las operaciones principales del ERP.

No redefine reglas de negocio ni estructura de datos.

Jerarquía:

1. `BUSINESS_RULES.md`
2. `DATA_MODEL.md`
3. `FLOWS.md`

Si aparece una contradicción, prevalece la regla de negocio.

---

# 2. Principios transversales

## 2.1 Operaciones atómicas

Toda operación que modifica más de una entidad debe ejecutarse dentro de una única transacción de base de datos.

Regla:

> O se completa toda la operación, o no se completa ninguna parte.

Ejemplos:

- Fabricación;
- Envasado;
- Compra;
- Confirmación de RTO;
- RTM;
- Pago Cliente;
- Pago Proveedor;
- Ajuste de Stock;
- Liquidación Mercado Libre.

---

## 2.2 Validaciones críticas

Toda validación crítica debe repetirse en backend dentro de la transacción.

No alcanza con validar en frontend.

Ejemplos:

- stock suficiente;
- granel suficiente;
- componentes suficientes;
- producto activo;
- proveedor activo;
- precio vigente;
- cuenta existente;
- pedido todavía abierto.

---

## 2.3 Bloqueos

Antes de modificar saldos, bloquear las filas involucradas.

Según operación:

- `stock_balances`;
- `bulk_lots`;
- `financial_accounts`;
- secuencias de códigos.

---

## 2.4 Trazabilidad

Toda operación debe poder reconstruirse.

Por eso:

- `MST` apunta a la operación origen;
- `MFA` apunta a la operación origen;
- `MOV` apunta a la operación origen;
- snapshots históricos conservan los valores usados en ese momento.

---

# 3. CREAR NUEVA FÓRMULA / NUEVO PRODUCTO BASE

## 3.1 Entrada

Datos:

- fecha;
- nombre del Producto Base;
- observaciones;
- filas de Materias Primas;
- cantidad en kg por Materia Prima.

---

## 3.2 Validaciones

1. Debe existir al menos una Materia Prima.
2. Todas las MPR seleccionadas deben estar activas.
3. Cada cantidad debe ser `> 0`.
4. Toda cantidad debe respetar precisión máxima de 3 decimales.
5. El nombre del Producto Base es obligatorio.

---

## 3.3 Ejecución

1. Generar código `PBAxxxx`.
2. Crear `base_products`.
3. Crear `formula_versions`:
   - `version_number = 1`;
   - `is_current = true`.
4. Crear `formula_version_items`.
5. Calcular en tiempo real:
   - Total kg;
   - Costo actual por MPR;
   - Costo granel actual;
   - Costo actual por kg del PBA.
6. Confirmar transacción.

---

## 3.4 Resultado

Se crea:

- un nuevo PBA;
- su primera versión de fórmula.

No genera:

- stock;
- GRA;
- MST;
- MFA;
- MOV.

---

# 4. EDITAR FÓRMULA

## 4.1 Precondición

Debe existir el PBA.

---

## 4.2 Ejecución

1. Leer versión vigente.
2. Crear una nueva `formula_version`.
3. Asignar:
   - mismo PBA;
   - `version_number = anterior + 1`;
   - `is_current = true`.
4. Pasar la versión anterior a:
   - `is_current = false`.
5. Crear los nuevos `formula_version_items`.
6. Recalcular costos teóricos actuales.
7. Confirmar.

---

## 4.3 Resultado

Se mantiene el mismo `PBAxxxx`.

No se modifican:

- GRA históricos;
- ENV históricos;
- RTO;
- RTM;
- ventas históricas.

---

# 5. CREAR PRODUCTO FINAL

## 5.1 Entrada

Datos:

- fecha;
- Producto Base;
- presentación comercial;
- peso `(kg)`;
- stock inicial;
- stock mínimo;
- componentes;
- cantidad de cada componente.

---

## 5.2 Validaciones

1. PBA activo.
2. PBA con fórmula vigente.
3. Peso `> 0`.
4. Peso con máximo 3 decimales.
5. Stock mínimo `> 0`.
6. Stock inicial `>= 0`.
7. Todos los COM activos.
8. Cantidad de cada COM `> 0` y entera.

---

## 5.3 Ejecución

1. Generar código `PROxxxx`.
2. Crear `stock_items`:
   - item_type = PRO;
   - unit_type = UNIT.
3. Crear `products`.
4. Crear `product_components`.
5. Calcular costo teórico actual:
   - costo PBA según peso;
   - costo de componentes;
   - subtotal;
   - 2% extra;
   - costo total.
6. Si `stock inicial > 0`:
   - crear operación de ajuste;
   - crear MST tipo AJUSTE;
   - actualizar `stock_balances`.
7. Confirmar.

---

# 6. CREAR PROVEEDOR

## 6.1 Entrada

Datos:

- fecha;
- proveedor;
- vendedor;
- teléfono;
- moneda:
  - ARS;
  - USD.

## 6.2 Validaciones

1. Nombre obligatorio.
2. Moneda obligatoria.
3. Moneda válida: ARS o USD.

## 6.3 Ejecución

1. Generar código `PRVxxxx`.
2. Crear `suppliers`.
3. Crear cuenta `SUPPLIER_PAYABLE`.
4. Confirmar.

La moneda definida se utilizará automáticamente en las CMP del proveedor.

Una vez registrada la ficha del Proveedor, la moneda no es editable.

---

# 7. CREAR MATERIA PRIMA / COMPONENTE

## 7.1 Entrada

Datos:

- Tipo;
- fecha;
- nombre;
- INCI si aplica;
- proveedor inicial;
- moneda automática heredada del proveedor;
- precio neto inicial;
- stock inicial;
- stock mínimo.

---

## 7.2 Validaciones

1. Tipo válido:
   - MPR;
   - COM.
2. Stock mínimo `> 0`.
3. Stock inicial `>= 0`.
4. Precio neto inicial `> 0`.
5. Proveedor activo.
6. Utilizar automáticamente la moneda definida en la ficha del proveedor.
7. Si MPR:
   - unidad = KG.
8. Si COM:
   - unidad = UNIT.

---

## 7.3 Ejecución

1. Generar:
   - `MPRxxxx`;
   - o `COMxxxx`.
2. Crear `stock_items`.
3. Crear subtipo:
   - `raw_materials`;
   - o `components`.
4. Crear relación `supplier_items`.
5. Registrar `price_updated_at` como la primera actualización de precio del ítem.
6. Calcular precio bruto con IVA.
7. Si stock inicial `> 0`:
   - crear ajuste;
   - generar MST;
   - actualizar balance.
8. Confirmar.

---

# 8. CREAR MPR/COM DESDE UNA COMPRA

## 8.1 Uso

Durante una CMP:

### Ítem nuevo

Si el ítem no existe:

1. abrir alta rápida;
2. crear MPR/COM;
3. asociarlo automáticamente al proveedor de la CMP;
4. volver a la línea de Compra.

### Ítem existente sin asociación

Si la MPR/COM ya existe pero todavía no está asociada al proveedor:

1. seleccionarla desde la CMP;
2. crear automáticamente la relación `Proveedor ↔ MPR/COM`;
3. tomar el precio neto ingresado en la línea;
4. establecer la actualización de precio al momento de registrar la CMP;
5. no duplicar la MPR/COM.

---

## 8.2 Regla de stock

En este flujo:

- el maestro se crea con stock inicial 0;
- el ingreso físico se registra únicamente mediante la CMP.

No duplicar stock.

---

# 9. FABRICACIÓN

## 9.1 Entrada

Datos:

- fecha;
- PBA;
- kg fabricados;
- observaciones.

---

## 9.2 Prevalidaciones

1. PBA activo.
2. Fórmula vigente existente.
3. Kg fabricados `> 0`.
4. Máximo 3 decimales.
5. Todas las MPR de la fórmula activas.
6. Stock suficiente de cada MPR.

---

## 9.3 Cálculo previo

Para cada MPR:

`cantidad necesaria = cantidad fórmula × kg fabricados / total kg fórmula`

Regla de escalado y redondeo individual (Fase 6):
- Cada MPR se escala proporcionalmente y se redondea individualmente a 3 decimales con `ROUND_HALF_UP`.
- No se redistribuyen diferencias de ±0,001 kg entre ingredientes.
- `kg_fabricated` representa el rendimiento declarado del lote y `kg_available` nace igual a `kg_fabricated`.
- La suma de consumos físicos redondeados puede diferir mínimamente del rendimiento declarado por efecto de la precisión física de 1 g.

Calcular:

- cantidad necesaria;
- costo teórico actual con IVA;
- costo total de esa MPR.

Luego:

`Costo total GRA = suma costos MPR`

`Costo por kg snapshot = Costo total GRA / kg fabricados`

---

## 9.4 Transacción

1. Bloquear balances MPR involucrados.
2. Revalidar stock.
3. Generar código `GRAxxxx`.
4. Crear `business_operation`.
5. Crear `bulk_lots`.
6. Crear snapshots de MPR.
7. Por cada MPR:
   - descontar stock;
   - crear MST FABRICACIÓN;
   - actualizar balance.
8. Crear MFA FABRICACIÓN.
9. Confirmar.

---

## 9.5 Resultado

El GRA nace con:

`kg_available = kg_fabricated`

Estado:

`OPEN`

---

## 9.6 Error

Si una MPR no alcanza:

- rollback;
- no crear GRA;
- no crear MST;
- no crear MFA;
- informar:
  - MPR;
  - requerido;
  - disponible.

---

# 10. ENVASADO

## 10.1 Selección

1. seleccionar PBA;
2. listar GRA abiertos del PBA;
3. seleccionar GRA;
4. mostrar kg disponibles;
5. seleccionar PRO del mismo PBA;
6. ingresar unidades;
7. indicar si es último del lote.

---

## 10.2 Validaciones

1. GRA abierto.
2. PRO activo.
3. PRO pertenece al PBA del GRA.
4. Unidades `> 0`.
5. Todos los COM requeridos activos.
6. Stock suficiente de todos los COM.
7. Calcular:

`kg requeridos = unidades × peso PRO`

Si `Último del lote = NO`:

`kg requeridos <= kg disponibles`

Si no cumple:

- bloquear.

---

## 10.3 Cálculo de costos

Tomar:

- costo por kg snapshot del GRA;
- costo actual de cada COM;
- 2% extra.

Calcular snapshot de costo unitario del ENV.

---

## 10.4 Transacción

1. Bloquear GRA.
2. Bloquear balances COM y PRO.
3. Revalidar:
   - kg;
   - componentes.
4. Generar `ENVxxxx`.
5. Crear `business_operation`.
6. Crear `packaging_operations`.
7. Crear snapshots de componentes.
8. Descontar componentes.
9. Generar MST ENVASADO por COM.
10. Aumentar stock PRO.
11. Generar MST ENVASADO por PRO.
12. Actualizar kg disponibles del GRA.
13. Crear MFA ENVASADO.

Si último lote:

14. calcular diferencia física;
15. si diferencia:
   - registrar MERMA;
   - o SOBRANTE;
16. crear MFA adicional;
17. `kg_available = 0`;
18. estado GRA = CLOSED.

19. Confirmar.

---

## 10.5 Error de componentes

Si falta algún COM:

- rollback;
- informar:
  - componente;
  - requerido;
  - disponible.

---

# 11. AJUSTE DE STOCK

## 11.1 Entrada

Datos:

- ítem;
- cantidad de ajuste;
- signo;
- motivo/observación.

---

## 11.2 Transacción

1. Validar ítem activo o históricamente válido.
2. Bloquear balance en PostgreSQL.
3. Si es ajuste negativo: validar que el saldo actual + delta >= 0. Si resulta en saldo negativo, rechazar transacción por stock insuficiente.
4. Crear `business_operation`.
5. Crear `stock_adjustment`.
6. Crear `stock_adjustment_item`.
7. Crear MST AJUSTE.
8. Actualizar `stock_balances`.
9. Confirmar.

---

# 12. NUEVO PEDIDO

## 12.1 Selección de origen

Opciones:

- Cliente registrado;
- Mercado Libre;
- Consumidor Final.

---

## 12.2 Cliente registrado

Al seleccionar:

1. cargar CLI;
2. asignar Lista Salón;
3. copiar descuentos de la ficha;
4. congelar esos descuentos en el PED.

---

## 12.3 Mercado Libre

Al seleccionar:

1. asignar Lista Ecommerce;
2. no asociar CLI;
3. saldo anterior = 0;
4. descuento manual opcional.

---

## 12.4 Consumidor Final

Al seleccionar:

1. asignar Lista Público;
2. no asociar CLI;
3. saldo anterior = 0;
4. mostrar campos manuales;
5. descuento manual opcional.

---

## 12.5 Creación del PED

1. Generar `PEDxxxx`.
2. Guardar `price_snapshot_at`.
3. Crear `orders`.
4. Crear snapshot de descuentos.
5. Estado = OPEN.
6. Asignar prioridad de columna persistente.
7. Confirmar.

No genera movimientos.

---

# 13. AGREGAR PRODUCTO A PEDIDO

## 13.1 Validaciones

1. PED OPEN.
2. PRO activo.
3. PRO posee precio en la Lista del PED válido a `price_snapshot_at`.
4. Cantidad `> 0`.

---

## 13.2 Ejecución

1. Buscar precio histórico vigente en `price_snapshot_at`.
2. Guardar ese precio en `order_items`.
3. Guardar cantidad.
4. Recalcular:
   - subtotal;
   - descuentos;
   - Total pedido;
   - peso potencial.
5. Persistir automáticamente al confirmar Agregar producto, según §14; no requiere botón Guardar.

No genera movimientos.

---

# 14. EDITAR PEDIDO ABIERTO

Se permite:

- cambiar cantidad;
- cambiar producto;
- eliminar línea;
- cargar AG;
- cambiar cantidad de bultos;
- editar datos manuales de Consumidor Final.

No se permite:

- editar manualmente precio unitario;
- cambiar el snapshot de lista;
- cambiar descuentos congelados de Cliente registrado.

Toda modificación recalcula el potencial del pedido. El autosave siguiente solo cubre campos y operaciones actualmente editables; no agrega controles ni campos nuevos. Las reglas de BUSINESS_RULES.md permanecen intactas.

## 14.1 Persistencia automática del Pedido abierto — R1

Todo cambio editable que antes dependía de Guardar se persiste automáticamente: AG, cantidad solicitada cuando sea editable, bultos, agregar/eliminar producto y cualquier otro campo actualmente editable. Eliminar Guardar y Cancelar del editor cuando se implemente este contrato; no dejar huecos visuales reservados. No eliminar las acciones de cancelar formularios auxiliares o confirmaciones vigentes.

## 14.2 Inputs: blur y Enter

Inputs numéricos y textuales guardan al perder foco (blur) o al presionar Enter. No guardar cada tecla. Enter seguido de blur no produce dos escrituras equivalentes; tampoco se escribe si no cambió el valor confirmado. Validar según el contrato vigente antes de enviar. No hace falta debounce para estos eventos.

## 14.3 Acciones discretas

Agregar producto persiste al confirmar la acción; eliminar producto persiste al confirmar la acción según el flujo actual, sin inventar un nuevo diálogo. Mantener las validaciones de producto, precio histórico, cantidades y mínimo de una línea. Borrar pedido conserva su confirmación propia (§15) y no equivale a eliminar una línea.

## 14.4 Borrador, confirmación y errores

Separar estado borrador del último estado confirmado por el servidor. Solo considerar definitivo un cambio después de confirmación exitosa. Si falla:

1. mostrar error visible;
2. restaurar el último valor confirmado del campo o la operación afectada;
3. no presentar el valor fallido como válido ni incorporarlo a payloads posteriores.

Un error no resuelto bloquea Generar remito aunque la UI ya haya restaurado el valor. Resolverlo requiere reconciliar explícitamente el estado confirmado o confirmar con éxito una corrección/reintento pertinente; no basta ocultar el mensaje. Los fallos inesperados de comunicación también deben llevar al estado de error y reconciliación, sin asumir persistencia exitosa.

## 14.5 Serialización por pedido

Una sola petición activa por pedido; serializar cambios rápidos. Construir cada payload desde el último estado confirmado y las operaciones pendientes correspondientes al ejecutarlo, no desde un snapshot antiguo capturado al escribir. Identificar respuestas por pedido/operación para impedir que una respuesta antigua sobrescriba un cambio posterior o afecte otro pedido seleccionado.

Ante fallo, detener/reconciliar operaciones dependientes antes de continuar; conservar cambios ya confirmados. La cola no debe reintroducir un valor fallido. Refrescar cards y planificación tras confirmación sin reinicializar borradores vigentes.

## 14.6 Cierre mediante X

La X simplemente cierra la vista: no cancela, no revierte, no pregunta si guardar ni descarta cambios confirmados. El blur correspondiente confirma el borrador activo conforme §14.2; cerrar no debe abortar esa operación. Si hay guardado activo o en cola, su ciclo de vida debe sobrevivir al cierre visual, por ejemplo mediante coordinación en un padre estable por pedido. Un error posterior debe seguir siendo visible y conservarse al reabrir el pedido.

## 14.7 Generar remito como barrera

Antes de continuar:

1. confirmar cualquier borrador activo;
2. esperar todos los guardados pendientes;
3. comprobar que no exista error sin resolver.

Si todo fue confirmado, continuar con las validaciones y confirmación vigentes. Si algún guardado falló, bloquear la generación y mostrar error. La barrera debe coordinar blur/Enter y click para no adelantarse al último cambio ni duplicar escrituras. El RTO se previsualiza y genera siempre desde el último estado persistido, no desde un borrador local. Se mantiene el bloqueo por RTM pendiente y toda validación vigente de remito.

## 14.8 AG y alcance de concurrencia

AG admite entero >= 0 o vacío/null durante la edición según contrato vigente; puede ser menor, igual o **mayor** que la cantidad solicitada. Para generar remito se mantienen AG completo y al menos un AG positivo según las validaciones existentes. Autosave no cambia esta regla.

Fuera de alcance: detectar/resolver conflictos entre dos pestañas o usuarios que editan simultáneamente el mismo pedido. Conservar comportamiento actual: última escritura válida prevalece. No agregar versionado ni migración para este alcance.

## 14.9 Reutilización del contrato existente

Reutilizar `updateOrderAction` → OrderService.updateOrder → OrderRepository.updateOrderAtomic → `update_order_atomic(p_order_id, p_update_json)`. No hace falta una Server Action nueva ni cambios de backend/DB para este alcance.

La RPC admite campos opcionales de cabecera; si recibe `items`, reemplaza la lista completa de renglones, no aplica deltas por línea. Bloquea el pedido y exige OPEN; los precios se resuelven a `price_snapshot_at` de su lista original. La cola construye ese reemplazo completo desde estado confirmado más operaciones pendientes. Reconciliar el detalle devuelto por lectura cuando haga falta para precios/normalizaciones; no presentar precios preliminares vigentes como confirmación del precio histórico.

La atomicidad de la RPC no detecta snapshots obsoletos de otras pestañas; esa limitación sigue fuera de alcance. **No hace falta migración.**

---

# 15. BORRAR PEDIDO ABIERTO

## 15.1 Validación

Solo PED OPEN.

---

## 15.2 Flujo

1. pedir confirmación;
2. marcar PED como CANCELLED;
3. dejar de incluirlo en planificación;
4. no generar movimientos.

---

# 16. PLANIFICACIÓN DE PEDIDOS

## 16.1 Regla

Es simulación pura.

No persistir reservas.

No generar:

- MST;
- MFA;
- MOV;
- ENV;
- GRA.

---

## 16.2 Carga inicial

1. tomar PED OPEN;
2. ordenar columnas según prioridad persistente;
3. detectar PRO presentes;
4. ordenar filas según prioridad persistente.

---

## 16.3 Recursos virtuales

Crear estructura temporal con:

- stock PRO;
- kg agregados de GRA abiertos por PBA;
- stock COM.

---

## 16.4 Procesamiento por fila

Para cada PRO, de arriba hacia abajo:

1. calcular total pedido;
2. usar stock PRO virtual;
3. calcular faltante;
4. si falta:
   - calcular capacidad por granel;
   - calcular capacidad por cada COM;
   - tomar mínimo;
5. reservar virtualmente recursos;
6. distribuir cobertura entre PED de izquierda a derecha;
7. marcar celdas incompletas;
8. calcular faltante final.

---

## 16.5 Reordenamiento

Mover fila:

- actualizar prioridad de PRO;
- recalcular toda la simulación.

Mover columna:

- actualizar prioridad del PED;
- recalcular toda la simulación.

No generar movimientos.

---

# 17. CONFIRMAR RTO

## 17.1 Precondiciones

1. PED OPEN.
2. AG definidos para las líneas enviadas.
3. Stock PRO suficiente para todas las cantidades AG.
4. El PED no fue convertido previamente.
5. Todas las líneas deben tener AG definido como entero `>= 0`.
6. Debe existir al menos una línea con `AG > 0`.

---

## 17.2 Cálculo

Por línea:

`cantidad real = AG`

Calcular nuevamente:

- subtotal real;
- descuentos;
- Total pedido real;
- peso real.

Cliente registrado:

- obtener saldo anterior actual de la cuenta.

Mercado Libre / Consumidor Final:

- saldo anterior = 0.

`Total a cobrar = Total pedido + saldo anterior`

---

## 17.3 Transacción

1. Bloquear PED.
2. Bloquear balances PRO.
3. Revalidar stock.
4. Generar `RTOxxxx`.
5. Crear `business_operation`.
6. Crear `remittances`.
7. Crear snapshots:
   - destinatario;
   - descuentos;
   - líneas;
   - peso;
   - importes.
8. Descontar PRO.
9. Crear MST VENTA por línea.
10. Crear MOV VENTA.
11. Actualizar cuenta correspondiente:

### Cliente registrado

`CUSTOMER_RECEIVABLE += Total pedido`

### Mercado Libre

`CASH_MERCADO_LIBRE += Total pedido`

### Consumidor Final

`CASH_STEFFEN += Total pedido`

12. PED → CONVERTED.
13. Vincular `converted_rto_id`.
14. RTO → RTM_PENDING.
15. Confirmar la transacción de RTO.
16. Desde este punto el RTO queda inmutable.
17. Generar el PDF del RTO desde el snapshot confirmado.
18. Mantener la venta obligatoriamente en flujo hacia RTM.

---

## 17.4 Resultado

El PED desaparece de Pedidos abiertos.

Las cantidades no enviadas no quedan pendientes.

## 17.5 RTM pendiente obligatorio

Mientras exista un RTO propio del flujo actual en estado `RTM_PENDING`:

- debe mostrarse de forma persistente como acción obligatoria;
- al volver a Pedidos, el sistema debe llevar al usuario a completar ese RTM;
- no se puede confirmar un nuevo RTO hasta completar el RTM pendiente;
- cerrar navegador/app no elimina el pendiente.

Con esta regla, para el MVP solo debe existir como máximo un RTO `RTM_PENDING` originado por este usuario/flujo a la vez.

---

# 18. GENERAR RTM

## 18.1 Precondición

RTO con estado:

`RTM_PENDING`

---

## 18.2 Entrada

Dato manual:

- Transporte.

---

## 18.3 Cálculo de costos

Para cada PRO enviado:

1. obtener costo teórico actual en ese momento;
2. congelarlo;
3. multiplicar por cantidad.

`Costo productos = suma costos línea`

`Ganancia = Total pedido - Costo productos - Transporte`

---

## 18.4 Transacción

1. Generar `RTMxxxx`.
2. Crear `business_operation` tipo `SALE_RTM`.
3. Crear `margin_remittances`.
4. Crear snapshots por línea.
5. Si Transporte > 0:
   - crear MOV TRANSPORTE vinculado a la operación RTM;
   - Caja Steffen `-= Transporte`.
6. Guardar Ganancia.
7. RTO → COMPLETED.
8. Confirmar la transacción RTM.
9. Generar el PDF del RTM desde el snapshot confirmado.
10. Finalizar el flujo y volver a Pedidos.

---

## 18.5 Inmutabilidad

Una vez RTO = COMPLETED:

- RTO inmutable;
- RTM inmutable;
- venta histórica cerrada.

---

# 19. GENERAR PDF RTO

El PDF se genera automáticamente después de confirmar el RTO, desde snapshots de `remittances` y `remittance_items`.

Flujo:

1. crear `generated_documents` en estado `PENDING`;
2. guardar `payload_snapshot`;
3. renderizar;
4. guardar el PDF en storage;
5. guardar `file_reference`;
6. marcar `READY`.

Si falla el renderer:

- marcar `FAILED`;
- guardar el error;
- permitir reintentar sin volver a crear el RTO ni los movimientos;
- el fallo del PDF **no revierte la venta**.

No recalcular precios actuales.

`Ver RTO` abre el PDF almacenado si está `READY`; no lo regenera.

La venta continúa obligatoriamente hacia RTM aunque el renderizado del PDF necesite reintento.

---

# 20. GENERAR PDF RTM

Se genera automáticamente después de confirmar el RTM, desde:

- RTM;
- snapshots de costos;
- transporte;
- ganancia.

Flujo:

1. crear `generated_documents` en estado `PENDING`;
2. guardar `payload_snapshot`;
3. renderizar;
4. guardar el PDF en storage;
5. guardar `file_reference`;
6. marcar `READY`.

Si falla el renderer:

- marcar `FAILED`;
- conservar el RTM y la venta ya confirmados;
- permitir reintentar únicamente la generación del documento.

`Ver RTM` abre el PDF almacenado si está `READY`; no lo regenera.

La lógica comercial de la venta queda finalizada con el RTM confirmado, independientemente de un fallo técnico temporal del renderer.

---

# 21. REGISTRAR COMPRA

## 21.1 Entrada

Datos:

- proveedor;
- fecha;
- líneas MPR/COM;
- cantidad;
- precio neto;
- modalidad:
  - PAID;
  - DEBT.

Moneda:

la del proveedor.

Si USD:

- precargar cotización global;
- permitir editar cotización solo para la CMP.

---

## 21.2 Validaciones

1. Proveedor activo.
2. Todas las líneas pertenecen al mismo proveedor.
3. La moneda se hereda de la ficha del proveedor.
4. Moneda única.
5. Cantidades `> 0`.
6. MPR:
   - kg;
   - máximo 3 decimales.
7. COM:
   - unidades enteras.
8. Precios netos `> 0`.

---

## 21.3 Cálculo

Por línea:

si ARS:

`precio bruto ARS = precio neto × 1,21`

si USD:

`precio bruto ARS = precio neto USD × cotización CMP × 1,21`

`total línea = cantidad × precio bruto`

`total CMP = suma líneas`

---

## 21.4 Transacción Compra pagada

1. Generar `CMPxxxx`.
2. Crear `business_operation`.
3. Crear purchase + items.
4. Bloquear balances de ítems.
5. Aumentar stock.
6. Crear MST COMPRA.
7. Crear automáticamente `supplier_items` si una línea usa un ítem existente todavía no asociado al proveedor.
8. Actualizar precio del proveedor y `price_updated_at`.
9. La relación con actualización de precio más reciente pasa a ser la fuente del costo teórico.
10. Bloquear Caja Steffen.
11. Caja Steffen `-= total CMP`.
12. Crear MOV COMPRA.
13. Confirmar.

---

## 21.5 Transacción Compra a deuda

Mismos pasos de stock.

En patrimonio:

1. bloquear cuenta proveedor;
2. `SUPPLIER_PAYABLE += total CMP`;
3. crear MOV COMPRA;
4. confirmar.

No tocar Caja Steffen.

---

# 22. EDITAR COMPRA

## 22.1 Precondición funcional

La Compra se corrige antes de que esos insumos sean utilizados operativamente.

---

## 22.2 Flujo

1. bloquear CMP;
2. leer estado anterior;
3. calcular diferencia por línea;
4. bloquear balances afectados;
5. ajustar stock por diferencia;
6. actualizar MST asociado;
7. recalcular total CMP;
8. recalcular precio de proveedor;
9. actualizar `price_updated_at` y recalcular qué relación Proveedor ↔ Ítem determina el costo vigente;
10. ajustar:
   - Caja;
   - o cuenta proveedor;
11. actualizar MOV original;
12. si se modificó la Fecha, actualizar `business_operations.business_date`; MST y MOV relacionados reflejan esa fecha por relación;
13. confirmar.

No crear CMP compensatoria.

---

# 23. PAGO CLIENTE

## 23.1 Selector

Mostrar solo Clientes con:

`saldo > 0`

Formato:

`CLIENTE | SALDO`

---

## 23.2 Entrada

- fecha;
- cliente;
- importe.

Se permite importe mayor al saldo.

---

## 23.3 Transacción

1. crear `business_operation`;
2. crear `payment`;
3. bloquear cuenta cliente;
4. bloquear Caja Steffen;
5. cuenta cliente `-= importe`;
6. Caja Steffen `+= importe`;
7. crear MOV PAGO_CLIENTE;
8. crear financial entries;
9. confirmar.

---

# 24. EDITAR PAGO CLIENTE

1. bloquear Pago;
2. obtener importe anterior;
3. calcular diferencia;
4. bloquear cuentas afectadas;
5. actualizar pago;
6. actualizar MOV original;
7. recalcular entries;
8. recalcular saldos;
9. si se modificó la Fecha, actualizar `business_operations.business_date`; MST/MOV relacionados reflejan esa fecha por relación;
10. confirmar.

No crear movimiento compensatorio.

---

# 25. PAGO PROVEEDOR

## 25.1 Selector

Mostrar solo Proveedores con:

`saldo > 0`

---

## 25.2 Transacción

1. crear operación;
2. crear payment;
3. bloquear cuenta proveedor;
4. bloquear Caja Steffen;
5. cuenta proveedor `-= importe`;
6. Caja Steffen `-= importe`;
7. crear MOV PAGO_PROVEEDOR;
8. crear financial entries;
9. confirmar.

NO se permite sobrepago a proveedor:
- importe > 0;
- saldo > 0;
- importe <= saldo actual;
- si importe > saldo actual -> transacción rechazada con excepción ("El importe no puede superar la deuda actual del proveedor.").

---

# 26. EDITAR PAGO PROVEEDOR

Misma estrategia que Pago Cliente:

1. bloquear Pago;
2. obtener importe anterior;
3. calcular diferencia;
4. bloquear cuentas afectadas;
5. actualizar Pago;
6. actualizar MOV original;
7. recalcular entries;
8. recalcular saldos;
9. si se modificó la Fecha, actualizar `business_operations.business_date`;
10. confirmar.

No crear movimiento compensatorio.

---

# 27. GASTO OPERATIVO

## 27.1 Entrada

- fecha;
- tipo;
- descripción;
- importe.

Tipos:

- LUZ;
- ALQUILER;
- COMISIÓN;
- OTRO.

Si OTRO:

Descripción obligatoria.

---

## 27.2 Transacción manual

1. crear operación;
2. crear operating_expense;
3. bloquear Caja Steffen;
4. Caja Steffen `-= importe`;
5. crear MOV GASTO_OPERATIVO;
6. crear financial entry;
7. confirmar.

---

# 28. RETIRO DE CAJA

1. validar importe > 0;
2. crear operación;
3. crear withdrawal;
4. bloquear Caja Steffen;
5. Caja Steffen `-= importe`;
6. crear MOV RETIRO;
7. crear entry;
8. confirmar.

Caja puede quedar negativa.

---

## 28.1 INGRESO DE CAJA (Fase 19.1)

Contraparte de Retiro (BUSINESS_RULES §26.1). Una sola transacción (`register_cash_deposit_atomic`):

1. validar importe > 0 y concepto obligatorio;
2. bloquear Caja Steffen;
3. crear operación `CASH_DEPOSIT`;
4. crear `cash_deposit`;
5. crear MOV INGRESO_CAJA;
6. crear entry `+importe` sobre Caja Steffen;
7. Caja Steffen `+= importe`;
8. confirmar.

No es venta: no toca Caja ML, deudas, stock, facturación ni ganancia. Solo alta (mismo criterio que Retiro).

---

## 28.2 SALDO DE APERTURA (Fase 19.1)

Deuda previa al inicio operativo de un cliente o proveedor (BUSINESS_RULES §20.2). Desde la ficha de Cliente / Proveedor: botón **SALDO DE APERTURA** (o **EDITAR SALDO DE APERTURA**), visible solo mientras la cuenta no tenga otra actividad.

Alta (`register_opening_balance_atomic`, una transacción):

1. validar importe > 0 y fecha;
2. bloquear la cuenta corriente;
3. validar tipo `CUSTOMER_RECEIVABLE` / `SUPPLIER_PAYABLE` (nunca CASH);
4. validar que no exista otra apertura para la cuenta;
5. validar que la cuenta no tenga actividad (asientos, pagos, compras, RTO);
6. crear operación `OPENING_BALANCE` (fecha comercial elegida);
7. crear `opening_balance` (importe, observación opcional);
8. crear MOV SALDO_APERTURA y entry `+importe` sobre la cuenta;
9. cuenta `+= importe`;
10. confirmar.

Editar (`edit_opening_balance_atomic`): mismas validaciones de actividad; actualiza importe, fecha y observación, el MOV original y su entry; cuenta `+= (nuevo - anterior)`.

Eliminar (`delete_opening_balance_atomic`, con confirmación): mismas validaciones de actividad; cuenta `-= importe`; elimina entry, MOV, registro y operación de la apertura.

No genera caja, stock, MST, MFA, compra, pedido, RTO, RTM, venta, ganancia ni comisión.

---

# 29. LIQUIDACIÓN MERCADO LIBRE

## 29.1 Entrada

- fecha;
- bruto;
- neto ingresado.

Calcular:

`comisión = bruto - neto`

---

## 29.2 Validaciones

1. Bruto `> 0`.
2. Neto `>= 0`.
3. Neto `<= bruto`.
4. `bruto <= saldo actual de Caja Mercado Libre`.

---

## 29.3 Transacción

1. crear `business_operation`;
2. crear `marketplace_settlement`;
3. bloquear:
   - Caja Mercado Libre;
   - Caja Steffen.
4. Crear MOV TRANSFERENCIA_MERCADO_LIBRE:
   - Caja ML `-= neto`;
   - Caja Steffen `+= neto`.
5. Si comisión > 0:
   - crear operating_expense tipo COMISIÓN;
   - crear MOV GASTO_OPERATIVO;
   - Caja ML `-= comisión`.
6. Confirmar.

Resultado:

`Salida Caja ML = bruto`

`Ingreso Caja Steffen = neto`

---

# 30. ACTUALIZAR COTIZACIÓN GLOBAL

## 30.1 Entrada

Nueva cotización USD → ARS.

---

## 30.2 Validación

`rate > 0`

---

## 30.3 Transacción

1. desactivar cotización vigente;
2. insertar nueva;
3. marcar nueva como actual;
4. confirmar.

No actualizar históricos.

Los costos teóricos cambian por consulta.

---

# 31. ACTUALIZAR LISTA DE PRECIOS — PRODUCTO INDIVIDUAL

1. seleccionar Lista;
2. seleccionar PRO;
3. ingresar nuevo precio entero;
4. validar `> 0`;
5. cerrar versión vigente;
6. insertar nueva versión;
7. confirmar.

No modificar PED ya creados.

---

# 32. ACTUALIZAR LISTA MASIVAMENTE

## 32.1 Entrada

- Lista;
- porcentaje;
- todos los PRO o selección.

---

## 32.2 Cálculo

Por PRO:

`nuevo = precio actual × (1 + porcentaje/100)`

Redondear al peso.

---

## 32.3 Transacción

Para cada PRO:

1. cerrar versión vigente;
2. insertar nueva versión.

Todo el lote debe confirmarse como una sola operación lógica.

---

# 33. CREAR NUEVA LISTA DE PRECIOS

1. ingresar nombre;
2. crear `price_lists`;
3. `system_role = NULL`;
4. activa por defecto;
5. crearla sin precios cargados;
6. cargar precios posteriormente desde Administración.

Las Listas iniciales con roles de sistema no deben perder su función interna aunque se renombren.

Listas con rol de sistema:

- no pueden desactivarse;
- solo las listas adicionales pueden activarse/desactivarse.

---

# 34. INACTIVAR ENTIDAD

Aplica a:

- PRO;
- PBA;
- MPR;
- COM;
- CLI;
- PRV;
- Lista.

Flujo:

1. validar que existe;
2. `active = false`;
3. conservar todo historial;
4. quitar de selectores que inician nuevas operaciones;
5. conservarla disponible cuando sea necesaria para cerrar una obligación u operación ya existente;
6. confirmar.

Ejemplos:

- CLI/PRV inactivo con saldo → puede seguir recibiendo/registrando Pagos;
- PRO inactivo ya incluido en PED abierto → puede completar ese RTO;
- GRA abierto → puede terminar de envasarse aunque el PBA haya sido inactivado.

No borrar físicamente.

---

# 35. ESTADO DE CUENTA CLIENTE

## 35.1 Entrada

- Cliente;
- Fecha desde;
- Fecha hasta.

---

## 35.2 Cálculo

1. obtener cuenta CUSTOMER_RECEIVABLE;
2. calcular saldo inmediatamente anterior a Fecha desde;
3. listar entries del período;
4. calcular saldo al cierre;
5. generar PDF.

---

## 35.3 PDF

Debe mostrar:

- datos cliente;
- período;
- saldo anterior;
- movimientos;
- saldo final.

---

# 36. ESTADO DE CUENTA PROVEEDOR

Mismo flujo usando:

`SUPPLIER_PAYABLE`

Movimientos relevantes:

- Compras;
- Pagos.

---

# 37. DASHBOARD

El Dashboard no genera estados propios.

Cada bloque consulta fuentes reales.

---

## 37.1 Ventas

Usar RTO COMPLETED + RTM.

---

## 37.2 Pedidos abiertos

Usar PED OPEN.

---

## 37.3 Resumen de pedidos

Usar exactamente el mismo motor de planificación de Pedidos.

---

## 37.4 Cuentas

Calcular:

- Caja Steffen;
- Caja Mercado Libre;
- Deudas Clientes;
- Deudas Proveedores;
- Neto.

---

## 37.5 Granel disponible

Listar GRA OPEN.

---

# 38. SIMULAR COMPRA

## 38.1 Entrada

Por ítem:

- cantidad simulada.

---

## 38.2 Cálculo

Tomar:

- proveedor de referencia;
- precio vigente;
- moneda;
- cotización global si USD;
- IVA.

Calcular total estimado.

---

## 38.3 Resultado

Solo visual.

No genera:

- CMP;
- MST;
- MOV;
- cambios patrimoniales;
- cambios de stock.

---

# 39. COSTO-GANANCIA

## 39.1 Fuente

Usar siempre:

- Lista Salón;
- costo teórico actual PRO.

---

## 39.2 Perfil seleccionado

Opciones iniciales:

- 35%;
- 30% + 10% + 5%;
- 40% + 10%;
- 50%.

---

## 39.3 Cálculo

1. tomar precio Lista Salón;
2. aplicar descuentos sucesivos;
3. obtener Precio final;
4. calcular:
   - Markup;
   - Ganancia.

No generar movimientos.

---

# 40. VENTAS

La pantalla Ventas consulta únicamente:

RTO COMPLETED + RTM.

Orden:

más reciente primero.

Filtros:

- año;
- mes.

Cards:

- cantidad de ventas;
- total facturado;
- ganancia total.

---

# 41. MOVIMIENTOS

Mostrar:

- MOV históricos.

Default:

últimos 90 días.

Permitir rango anterior.

Orden:

más reciente primero.

---

# 42. PRÓXIMAS FABRICACIONES

## 42.1 URG PARA PEDIDOS

Se muestra cuando existen PED OPEN con PRO asociados a ese PBA.

Tiene prioridad.

---

## 42.2 POCO STOCK

Se muestra cuando:

`stock actual PRO < stock mínimo PRO`

Solo si no corresponde URG PARA PEDIDOS.

---

# 43. FLUJO DE FALLA GENERAL

Si una operación transaccional falla:

1. hacer rollback;
2. no emitir movimientos parciales;
3. no modificar balances;
4. no generar documento final;
5. informar causa concreta.

Ejemplos:

- stock insuficiente;
- componente insuficiente;
- GRA ya cerrado;
- pedido ya convertido;
- proveedor inactivo;
- producto sin precio;
- cotización inválida.

---

# 44. FLUJO DE REINTENTO

Después de una falla:

- el usuario puede corregir datos;
- volver a ejecutar;
- el código visible no debe duplicarse;
- si un código fue reservado dentro de una transacción abortada, la estrategia exacta de reutilización/no reutilización debe respetar `DATA_MODEL.md` y priorizar unicidad sobre continuidad visual.

---

# 45. OPERACIONES QUE NO GENERAN MOVIMIENTOS

No generan MST/MFA/MOV:

- crear PBA;
- editar fórmula;
- crear Lista;
- actualizar precio de Lista;
- actualizar cotización;
- reordenar filas de planificación;
- reordenar columnas de planificación;
- simular compra;
- consultar Costo-Ganancia;
- consultar Dashboard;
- generar PDF desde histórico;
- editar datos maestros sin efecto económico directo.

---

# 46. OPERACIONES QUE SÍ GENERAN MOVIMIENTOS

## MST

Generan MST:

- stock inicial;
- Compra;
- Fabricación;
- Envasado;
- Venta;
- Ajuste.

## MFA

Generan MFA:

- Fabricación;
- Envasado;
- Merma;
- Sobrante.

## MOV

Generan MOV:

- Venta;
- Compra;
- Pago Cliente;
- Pago Proveedor;
- Transporte;
- Gasto Operativo;
- Retiro;
- Ingreso de caja;
- Saldo de apertura (cliente / proveedor);
- Liquidación Mercado Libre.

---

# 47. MATRIZ RESUMEN DE EFECTOS

| Operación | Stock | Granel | Patrimonio | MST | MFA | MOV |
|---|---|---|---|---|---|---|
| Crear PBA | No | No | No | No | No | No |
| Editar fórmula | No | No | No | No | No | No |
| Crear PRO con stock 0 | No | No | No | No | No | No |
| Crear PRO con stock inicial | Sí | No | No | Sí | No | No |
| Fabricación | MPR ↓ | GRA ↑ | No | Sí | Sí | No |
| Envasado | COM ↓ / PRO ↑ | GRA ↓ | No | Sí | Sí | No |
| Ajuste Stock | Sí | No | No | Sí | No | No |
| Crear PED | No | No | No | No | No | No |
| Planificación | No | No | No | No | No | No |
| Confirmar RTO Cliente | PRO ↓ | No | Deuda Cliente ↑ | Sí | No | Sí |
| Confirmar RTO ML | PRO ↓ | No | Caja ML ↑ | Sí | No | Sí |
| Confirmar RTO Consumidor | PRO ↓ | No | Caja Steffen ↑ | Sí | No | Sí |
| Generar RTM c/transporte | No | No | Caja Steffen ↓ | No | No | Sí |
| Compra pagada | MPR/COM ↑ | No | Caja Steffen ↓ | Sí | No | Sí |
| Compra deuda | MPR/COM ↑ | No | Deuda Proveedor ↑ | Sí | No | Sí |
| Pago Cliente | No | No | Deuda Cliente ↓ / Caja ↑ | No | No | Sí |
| Pago Proveedor | No | No | Deuda Proveedor ↓ / Caja ↓ | No | No | Sí |
| Gasto Operativo | No | No | Caja ↓ | No | No | Sí |
| Retiro | No | No | Caja ↓ | No | No | Sí |
| Ingreso de caja | No | No | Caja ↑ | No | No | Sí |
| Saldo de apertura cliente | No | No | Deuda Cliente ↑ | No | No | Sí |
| Saldo de apertura proveedor | No | No | Deuda Proveedor ↑ | No | No | Sí |
| Liquidación ML | No | No | Caja ML ↓ / Caja Steffen ↑ | No | No | Sí |

---

# 48. RENDERIZADO DE DOCUMENTOS

## 48.1 Principio

La lógica del ERP arma un **payload JSON estable** para cada documento.

El renderer recibe ese JSON y devuelve/genera un PDF.

El renderer no debe:

- consultar precios actuales;
- recalcular saldos;
- recalcular costos;
- modificar datos;
- decidir reglas de negocio.

Solo presenta la información recibida.

---

## 48.2 MVP

Renderer:

`INTERNAL_HTML_PDF`

Flujo:

1. construir payload desde snapshots/históricos;
2. validar payload;
3. renderizar template HTML/CSS;
4. convertir a PDF;
5. guardar archivo/referencia;
6. crear `generated_documents`;
7. guardar:
   - template key;
   - template version;
   - payload snapshot;
   - renderer type.

---

## 48.3 Futuro n8n

El mismo payload podrá enviarse mediante webhook a n8n.

n8n podrá:

1. recibir JSON;
2. aplicar un template propio;
3. generar PDF;
4. devolver el archivo o una referencia;
5. opcionalmente almacenarlo/enviarlo.

Cambiar de renderer no debe exigir cambios en:

- RTO;
- RTM;
- cuentas corrientes;
- cálculos;
- snapshots;
- movimientos.

---

# 49. REPORTES

> **Derogación.** El flujo anterior ("renderizar las cuatro cards" de Ventas del mes, Total facturado, Ganancia y Pedidos abiertos) ya no corresponde a la pantalla Reportes. Esas cuatro métricas siguen calculándose para el bloque `REPORTE MENSUAL` del Dashboard (`BUSINESS_RULES.md` §35.5, `v_current_reports`).

Reglas: `BUSINESS_RULES.md` §36.

## 49.1 Carga

Al abrir Reportes:

1. obtener la fecha comercial vigente (`v_current_business_date`);
2. tomar el año del selector global (controla toda la página; por defecto el año de la fecha comercial vigente; opciones desde el primer año con RTO `COMPLETED` o Gastos operativos hasta el año actual, en orden descendente, sin años futuros — `BUSINESS_RULES.md` §36.2.1);
3. consultar, solo lectura, RTO `COMPLETED` del año por `business_date` de la operación del RTO, sus RTM, ítems y `operating_expenses` del año; en el año corriente, solo `business_date <= fecha comercial vigente`;
4. calcular dinámicamente:
   - Facturación (resumen anual, evolución mensual, comparación con los 2 años anteriores);
   - Productos (rankings, facturación atribuida, contribución, participación);
   - Clientes / entidades analíticas (mayores compradores, análisis individual, concentración y su evolución vs año anterior);
5. renderizar las tres secciones, incluyendo empty states sin datos ficticios.

## 49.2 Cambio de año o de selector

Cambiar el año, la pestaña, el Top 5/10, la métrica de participación o la entidad analítica solo vuelve a consultar / recalcular en memoria de la consulta. No persiste nada.

## 49.3 Efectos

Reportes no genera movimientos, no modifica operaciones fuente y no persiste resultados. No existen procesos de recalculado: toda modificación válida de las operaciones fuente se refleja en la siguiente consulta.

---

# 50. PUNTOS NO RESUELTOS

No quedan puntos funcionales conocidos sin resolver para los flujos principales del MVP.

Si durante la implementación aparece un caso no documentado:

- no inferir;
- documentar;
- consultar;
- actualizar primero `BUSINESS_RULES.md`.
