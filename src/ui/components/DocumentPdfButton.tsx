'use client';

import React, { useState } from 'react';
import { FileText, Loader2, AlertTriangle } from 'lucide-react';
import { getDocumentViewAction, retryDocumentAction } from '@/actions/document.actions';

interface DocumentPdfButtonProps {
  sourceType: 'RTO' | 'RTM';
  sourceId: string;
  knownStatus: string;
  size?: string;
}

/**
 * Ícono de documento PDF (RTO/RTM) con estados READY/PENDING/FAILED/MISSING.
 * `knownStatus` viene precalculado desde el servidor (sin N+1 por fila); el
 * click siempre resuelve el estado real vía Server Action antes de actuar,
 * nunca vuelve a renderizar el PDF (docs/PDFS.md sección 13.1).
 */
export const DocumentPdfButton: React.FC<DocumentPdfButtonProps> = ({
  sourceType,
  sourceId,
  knownStatus,
  size = 'w-3.5 h-3.5',
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (knownStatus === 'MISSING') {
    return (
      <button
        type="button"
        disabled
        title="Sin PDF disponible para este documento histórico"
        className="p-1 rounded text-gray-300 cursor-not-allowed inline-flex"
      >
        <FileText className={size} />
      </button>
    );
  }

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const view = await getDocumentViewAction(sourceType, sourceId);
      if (!view.success || !view.data) {
        setError(view.error || 'Error al consultar el documento.');
        return;
      }

      if (view.data.status === 'READY' && view.data.signedUrl) {
        window.open(view.data.signedUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      if (view.data.status === 'PENDING') {
        setError('El PDF todavía se está generando. Intente nuevamente en unos segundos.');
        return;
      }

      if (view.data.status === 'FAILED' && view.data.documentId) {
        const retry = await retryDocumentAction(view.data.documentId);
        if (retry.success && retry.data?.status === 'READY') {
          const freshView = await getDocumentViewAction(sourceType, sourceId);
          if (freshView.success && freshView.data?.signedUrl) {
            window.open(freshView.data.signedUrl, '_blank', 'noopener,noreferrer');
            return;
          }
        }
        setError(retry.data?.errorMessage || retry.error || 'No se pudo generar el PDF. Reintentando automáticamente en el próximo click.');
        return;
      }

      setError('El documento no está disponible.');
    } finally {
      setLoading(false);
    }
  }

  const isFailed = knownStatus === 'FAILED';
  const colorClass = isFailed
    ? 'text-steffen-red hover:text-steffen-red-hover'
    : 'text-gray-600 hover:text-steffen-blue';

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        title={
          isFailed
            ? 'Error al generar el PDF — click para reintentar'
            : knownStatus === 'PENDING'
            ? 'Generando PDF…'
            : 'Ver PDF'
        }
        className={`p-1 rounded inline-flex transition-colors cursor-pointer disabled:cursor-wait ${colorClass}`}
      >
        {loading ? (
          <Loader2 className={`${size} animate-spin`} />
        ) : isFailed ? (
          <AlertTriangle className={size} />
        ) : (
          <FileText className={size} />
        )}
      </button>
      {error ? <span className="text-[10px] text-steffen-red max-w-[105px] leading-tight">{error}</span> : null}
    </span>
  );
};
