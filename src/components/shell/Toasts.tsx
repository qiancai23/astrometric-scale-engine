import React, { useEffect, useRef, useState } from 'react';
import { useFlightStore } from '../../state/useFlightStore';
import { CloseIcon } from './icons';

const TOAST_MS = 4500;

const ToastChip: React.FC<{ message: string }> = ({ message }) => {
  const dismiss = useFlightStore((s) => s.dismissToast);
  const [hovered, setHovered] = useState(false);
  const timer = useRef(0);
  useEffect(() => {
    if (hovered) return;
    timer.current = window.setTimeout(dismiss, TOAST_MS);
    return () => window.clearTimeout(timer.current);
  }, [hovered, dismiss]);
  return (
    <div
      className="panel shell-toast"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="shell-toast-text">{message}</span>
      <button type="button" className="shell-toast-close" aria-label="Dismiss message" onClick={dismiss}>
        <CloseIcon />
      </button>
    </div>
  );
};

/** The store's single toast, bottom centre, above the playback panel (or the sheet on phones). */
export const Toasts: React.FC = () => {
  const toast = useFlightStore((s) => s.toast);
  return (
    <div className="shell-toast-region" role="status" aria-live="polite">
      {toast && <ToastChip key={toast.id} message={toast.message} />}
    </div>
  );
};
