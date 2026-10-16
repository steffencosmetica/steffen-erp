'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Edit3, Power } from 'lucide-react';
import { toggleFinalProductActiveAction } from '@/actions/product.actions';
import type {
  FinalProductDTO,
  BaseProductOptionDTO,
  ComponentOptionDTO,
} from '@/actions/product.dto';
import { EditProductModal } from '../modals/EditProductModal';
import { ConfirmDialog, tableStyles } from '../components/UIComponents';
import { StockListToolbar } from '../components/StockListToolbar';
import { formatArs } from '@/lib/format';

interface ProductsViewProps {
  products: FinalProductDTO[];
  baseProducts: BaseProductOptionDTO[];
  components: ComponentOptionDTO[];
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
}) => {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [onlyCritical, setOnlyCritical] = useState(false);

  // Modales
  const [selectedProduct, setSelectedProduct] = useState<FinalProductDTO | null>(null);
  const [confirmDialogProduct, setConfirmDialogProduct] = useState<FinalProductDTO | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filtrado en cliente sobre DTOs ya ordenados por ratio en servidor
  const filteredProducts = products.filter((p) => {
    if (!showInactive && !p.active) return false;
    if (onlyCritical && !p.isBelowMinimum) return false;
    if (!searchTerm.trim()) return true;

    const term = searchTerm.toLowerCase();
    return (
      p.code.toLowerCase().includes(term) ||
      p.name.toLowerCase().includes(term) ||
      p.presentation.toLowerCase().includes(term) ||
      p.baseProductName.toLowerCase().includes(term) ||
      p.baseProductCode.toLowerCase().includes(term)
    );
  });

  const criticalCount = products.filter((p) => p.active && p.isBelowMinimum).length;

  const handleToggleActiveClick = (prod: FinalProductDTO) => {
    if (prod.active) {
      setConfirmDialogProduct(prod);
    } else {
      handleExecuteToggle(prod, true);
    }
  };

  const handleExecuteToggle = async (prod: FinalProductDTO, targetActive: boolean) => {
    setActionError(null);
    startTransition(async () => {
      const res = await toggleFinalProductActiveAction(prod.id, targetActive);
      if (!res.success) {
        setActionError(res.error || 'Error al cambiar estado del Producto Final');
      } else {
        router.refresh();
      }
      setConfirmDialogProduct(null);
    });
  };

  return (
    <>
      {actionError && (
        <div className="mt-4 p-3 border border-steffen-red rounded-[5px] text-xs font-semibold text-steffen-red flex justify-between items-center">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-gray-400 hover:text-black font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Contenedor Interior de Tabla idéntico a Figma STOCK.png */}
      <div>
        {/* Encabezado (Figma Stock): TÍTULO ——— filtros + Buscar */}
        <StockListToolbar
          title="Productos"
          criticalCount={criticalCount}
          onlyCritical={onlyCritical}
          onToggleCritical={() => setOnlyCritical(!onlyCritical)}
          showInactive={showInactive}
          onShowInactiveChange={setShowInactive}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />

        {/* Tabla de Productos con columnas según Figma STOCK.png y Section 23 */}
        {filteredProducts.length === 0 ? (
          <div className="py-12 text-center text-steffen-surface/60 text-xs">
            No hay productos registrados para los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableStyles.table}>
              <thead>
                <tr className={tableStyles.headRow}>
                  <th className="py-2 px-3 text-left">CODIGO</th>
                  <th className="py-2 px-3 text-left">PRODUCTO FINAL</th>
                  <th className="py-2 px-3 text-left">PRESENTACION</th>
                  <th className="py-2 px-3 text-left">PRODUCTO BASE (PBA)</th>
                  <th className="py-2 px-3 text-right">STOCK ACTUAL</th>
                  <th className="py-2 px-3 text-right">STOCK MINIMO</th>
                  <th className="py-2 px-3 text-right">COSTO TOTAL</th>
                  <th className="py-2 px-3 text-center">ESTADO</th>
                  <th className="py-2 px-3 text-center">ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => {
                  // Regla Figma STOCK.png: Si actual < mínimo, fila completa en salmón (#B10000)
                  const isRowCritical = p.isBelowMinimum;

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${
                        isRowCritical
                          ? tableStyles.rowAlert
                          : !p.active
                          ? `${tableStyles.row} opacity-60`
                          : `${tableStyles.row} hover:bg-steffen-gray/40`
                      }`}
                    >
                      {/* Código */}
                      <td className="py-1.5 px-3 font-bold">
                        {p.code}
                      </td>

                      {/* Producto Final */}
                      <td className="py-1.5 px-3 font-semibold">
                        {p.name}
                      </td>

                      {/* Presentación */}
                      <td className="py-1.5 px-3 font-medium text-gray-800">
                        {p.presentation}
                      </td>

                      {/* PBA */}
                      <td className="py-1.5 px-3 text-[11px] text-gray-700">
                        {p.baseProductCode} • {p.baseProductName}
                      </td>

                      {/* Stock Actual */}
                      <td className="py-1.5 px-3 text-right">
                        {p.stockCurrent} un
                      </td>

                      {/* Stock Mínimo */}
                      <td className="py-1.5 px-3 text-right text-gray-700">
                        {p.stockMinimum} un
                      </td>

                      {/* Costo Teórico Total */}
                      <td className="py-1.5 px-3 text-right">
                        {formatArs(p.cost.totalCostArs)}
                      </td>

                      {/* Estado */}
                      <td className="py-1.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded-[5px] ${
                            p.active
                              ? 'border border-steffen-green text-steffen-green'
                              : 'bg-steffen-gray text-steffen-surface/70'
                          }`}
                        >
                          {p.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td className="py-1.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedProduct(p)}
                            title="Ver ficha y editar producto"
                            className="p-1 rounded-[5px] hover:bg-steffen-gray text-steffen-surface/80 hover:text-steffen-surface transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleActiveClick(p)}
                            title={p.active ? 'Desactivar producto' : 'Activar producto'}
                            className={`p-1 rounded-[5px] hover:bg-steffen-gray transition-colors cursor-pointer ${
                              p.active
                                ? 'text-steffen-surface/60 hover:text-steffen-surface'
                                : 'text-steffen-green hover:text-steffen-green-hover'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Ficha y Edición */}
      {selectedProduct && (
        <EditProductModal
          key={selectedProduct.id}
          isOpen={true}
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onSuccess={() => {
            setSelectedProduct(null);
            startTransition(() => {
              router.refresh();
            });
          }}
        />
      )}

      {/* Confirmación para Desactivación */}
      {confirmDialogProduct && (
        <ConfirmDialog
          isOpen={true}
          title="Desactivar Producto Final"
          message={`¿Estás seguro de que deseas desactivar "${confirmDialogProduct.name}" (${confirmDialogProduct.code})? Ya no se podrá seleccionar para nuevos pedidos.`}
          onConfirm={() => handleExecuteToggle(confirmDialogProduct, false)}
          onCancel={() => setConfirmDialogProduct(null)}
        />
      )}
    </>
  );
};
