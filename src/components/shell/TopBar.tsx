import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFlightStore, openedFromSharedLink } from '../../state/useFlightStore';
import { currentFlightUrl } from '../../lib/useUrlSync';
import type { AstrometricRegime, MapLayers } from '../../types';
import { BrandMark, CheckIcon, HelpIcon, LayersIcon, ShareIcon } from './icons';

/* ------------------------------------------------------------------ */
/* Map switch                                                          */
/* ------------------------------------------------------------------ */

export const MapSwitch: React.FC<{ small?: boolean }> = ({ small }) => {
  const regime = useFlightStore((s) => s.regime);
  const switchRegime = useFlightStore((s) => s.switchRegime);
  const options: { id: AstrometricRegime; label: string }[] = [
    { id: 'Systemic', label: 'Solar system' },
    { id: 'Interstellar', label: 'Stars' },
  ];
  return (
    <div
      className={small ? 'panel shell-switch shell-switch-small' : 'panel shell-switch'}
      role="group"
      aria-label="Map"
      data-index={regime === 'Systemic' ? 0 : 1}
    >
      <span className="shell-switch-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className="shell-switch-option"
          aria-pressed={regime === o.id}
          onClick={() => switchRegime(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Layers menu                                                         */
/* ------------------------------------------------------------------ */

interface LayerRow {
  key: keyof MapLayers;
  label: string;
  note: string;
  disabledOn?: AstrometricRegime;
  disabledNote?: string;
}

const LAYER_ROWS: LayerRow[] = [
  { key: 'labels', label: 'Object names', note: 'Names beside the brightest and nearest objects' },
  {
    key: 'exoplanets',
    label: 'Exoplanets',
    note: '1,561 planets around other stars',
    disabledOn: 'Systemic',
    disabledNote: 'Switch to the star map to see these',
  },
  {
    key: 'orbits',
    label: 'Orbits',
    note: 'The paths planets take around the Sun',
    disabledOn: 'Interstellar',
    disabledNote: 'Only on the solar-system map',
  },
  { key: 'milkyWay', label: 'Milky Way backdrop', note: 'A dim photograph of our galaxy behind the map' },
];

export const LayersMenu: React.FC<{ iconOnly: boolean }> = ({ iconOnly }) => {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const layers = useFlightStore((s) => s.layers);
  const regime = useFlightStore((s) => s.regime);
  const toggleLayer = useFlightStore((s) => s.toggleLayer);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div
      className="shell-layers"
      ref={wrap}
      onBlur={(e) => {
        if (open && !wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={`btn shell-bar-btn${iconOnly ? ' btn-icon' : ''}${open ? ' is-open' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? 'shell-layers-menu' : undefined}
        aria-label={iconOnly ? 'Layers' : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <LayersIcon />
        {!iconOnly && <span className="shell-btn-text">Layers</span>}
      </button>
      {open && (
        <div className="panel shell-layers-menu" id="shell-layers-menu" role="group" aria-label="Map layers">
          {LAYER_ROWS.map((row, i) => {
            const disabled = row.disabledOn === regime;
            const on = layers[row.key];
            return (
              <button
                key={row.key}
                type="button"
                role="switch"
                aria-checked={on}
                disabled={disabled}
                className="shell-layer-row enter"
                style={{ '--i': i } as React.CSSProperties}
                onClick={() => toggleLayer(row.key)}
              >
                <span className="shell-layer-text">
                  <span className="shell-layer-label">{row.label}</span>
                  <span className="shell-layer-note">{disabled ? row.disabledNote : row.note}</span>
                </span>
                <span className={`shell-toggle${on && !disabled ? ' is-on' : ''}`} aria-hidden="true">
                  <span className="shell-toggle-thumb" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Share                                                               */
/* ------------------------------------------------------------------ */

const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the older method */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
};

export const ShareButton: React.FC<{ iconOnly: boolean; compact: boolean }> = ({ iconOnly, compact }) => {
  const showToast = useFlightStore((s) => s.showToast);
  const [done, setDone] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onShare = useCallback(async () => {
    const url = currentFlightUrl();
    if (compact && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: document.title, text: 'How long does this flight take?', url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        /* otherwise fall back to copying */
      }
    }
    const ok = await copyText(url);
    if (ok) {
      showToast('Link copied. Anyone who opens it sees this exact flight.');
      setDone(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setDone(false), 1800);
    } else {
      showToast(url);
    }
  }, [compact, showToast]);

  return (
    <button
      type="button"
      className={`btn shell-bar-btn${iconOnly ? ' btn-icon' : ''}${done ? ' is-done' : ''}`}
      aria-label={iconOnly ? 'Share this flight' : undefined}
      onClick={onShare}
    >
      <span className="shell-icon-swap" data-done={done}>
        <span className="shell-icon-a">
          <ShareIcon />
        </span>
        <span className="shell-icon-b">
          <CheckIcon />
        </span>
      </span>
      {!iconOnly && <span className="shell-btn-text">{done ? 'Link copied' : 'Share this flight'}</span>}
    </button>
  );
};

export const HelpLink: React.FC<{ iconOnly: boolean }> = ({ iconOnly }) => (
  <a
    className={`btn shell-bar-btn${iconOnly ? ' btn-icon' : ''}`}
    href={`${import.meta.env.BASE_URL}help.html`}
    target="_blank"
    rel="noopener"
    aria-label={iconOnly ? 'Help (opens in a new tab)' : undefined}
    style={{ textDecoration: 'none' }}
  >
    <HelpIcon />
    {!iconOnly && <span className="shell-btn-text">Help</span>}
  </a>
);

/* ------------------------------------------------------------------ */
/* The bars                                                            */
/* ------------------------------------------------------------------ */

const Brand: React.FC<{ showName: boolean }> = ({ showName }) => (
  <div className="panel shell-brand">
    <BrandMark size={26} />
    {showName ? (
      <span className="shell-brand-name">ASTROMETRIC SCALE ENGINE</span>
    ) : (
      <span className="visually-hidden">Astrometric Scale Engine</span>
    )}
  </div>
);

/** The first-visit line fades and collapses once the visitor changes anything. */
const FirstVisitLine: React.FC = () => {
  const fresh = useFlightStore((s) => !openedFromSharedLink && s.flightRevision === 0 && !s.hasFlown);
  return (
    <div className={`shell-hello${fresh ? '' : ' is-gone'}`} aria-hidden={!fresh}>
      <p className="shell-hello-title">How long does it take to get there?</p>
      <p className="shell-hello-sub">Pick two places and an engine. Real physics, real star catalogs.</p>
    </div>
  );
};

export const DesktopTopBar = React.forwardRef<HTMLElement, { iconOnly: boolean }>(({ iconOnly }, ref) => (
  <header className="shell-bar" ref={ref}>
    <h1 className="visually-hidden">Astrometric Scale Engine</h1>
    <div className="shell-bar-left">
      <Brand showName />
      <MapSwitch />
    </div>
    <FirstVisitLine />
    <div className="shell-bar-right">
      <LayersMenu iconOnly={iconOnly} />
      <ShareButton iconOnly={iconOnly} compact={false} />
      <HelpLink iconOnly={iconOnly} />
    </div>
  </header>
));
DesktopTopBar.displayName = 'DesktopTopBar';

export const CompactTopBar = React.forwardRef<HTMLElement, { showName: boolean }>(({ showName }, ref) => (
  <header className="shell-bar shell-bar-compact" ref={ref}>
    <h1 className="visually-hidden">Astrometric Scale Engine</h1>
    <Brand showName={showName} />
    <div className="shell-bar-right">
      <LayersMenu iconOnly />
      <ShareButton iconOnly compact />
      <HelpLink iconOnly />
    </div>
  </header>
));
CompactTopBar.displayName = 'CompactTopBar';
