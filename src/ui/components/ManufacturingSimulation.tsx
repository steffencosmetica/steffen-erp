'use client';

import React, { useCallback, useState } from 'react';
import { RegistrarFabricacionModal, type BaseProductOption } from '@/ui/modals/RegistrarFabricacionModal';
import { ErpIcon } from './ErpIcon';

/**
 * Simular fabricación desde Próxima fabricación (Mi Fábrica y Dashboard): un único
 * flujo que abre RegistrarFabricacionModal en modo simulación con el Producto Base
 * del producto. Solo consulta disponibilidad; no genera MFA, consumos ni reservas.
 */
export function useManufacturingSimulation(baseProducts: BaseProductOption[]) {
  const [baseProductId, setBaseProductId] = useState<string | null>(null);

  const simulate = useCallback((id: string) => setBaseProductId(id), []);

  const modal = (
    <RegistrarFabricacionModal
      simulateOnly
      isOpen={baseProductId !== null}
      initialBaseProductId={baseProductId ?? undefined}
      onClose={() => setBaseProductId(null)}
      onSuccess={() => setBaseProductId(null)}
      baseProducts={baseProducts}
    />
  );

  return { simulate, modal };
}

/** Botón SIMULAR de cada fila (ícono fórmula). */
export const SimulateManufacturingButton: React.FC<{ productName: string; onClick: () => void }> = ({
  productName,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={`Simular fabricación de ${productName}`}
    aria-label={`Simular fabricación de ${productName}`}
    className="inline-flex items-center justify-center p-1 rounded-[5px] hover:bg-steffen-gray transition-colors cursor-pointer"
  >
    <ErpIcon name="formula" tone="light" className="w-5 h-5" />
  </button>
);
