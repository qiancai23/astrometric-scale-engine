import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFlightStore } from '../../state/useFlightStore';
import type { AstroObject, Endpoint } from '../../types';
import { browseGroups, catalogSize, getEntry, searchCatalog } from '../../data/catalog';
import type { CatalogEntry, SearchHit } from '../../data/catalog';
import { formatCount, formatDistance } from '../../lib/format';
import { LocateIcon, SearchIcon, SwapIcon } from './icons';

interface Row {
  entry: CatalogEntry;
  hit?: SearchHit;
}

const WHICH_LABEL: Record<Endpoint, string> = { origin: 'FROM', destination: 'TO' };

const Dot: React.FC<{ color?: string }> = ({ color }) => (
  <span className="plan-dot" style={{ background: color ?? 'transparent' }} aria-hidden="true" />
);

const Highlighted: React.FC<{ name: string; ranges: [number, number][] }> = ({ name, ranges }) => {
  if (ranges.length === 0) return <>{name}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, b], k) => {
    if (a > at) parts.push(name.slice(at, a));
    parts.push(<mark key={k} className="plan-mark">{name.slice(a, b)}</mark>);
    at = b;
  });
  if (at < name.length) parts.push(name.slice(at));
  return <>{parts}</>;
};

function secondLine(e: CatalogEntry): string {
  if (e.kind === 'exoplanet') return `Exoplanet · orbits ${e.hostName ?? 'a nearby star'}`;
  const bits: string[] = [e.kindLabel];
  if (e.kind === 'star' && e.starType) bits.push(e.starType);
  if (e.constellation) bits.push(`in ${e.constellation}`);
  return bits.join(' · ');
}

/** The quiet text after the name in a closed field. */
function suffixFor(which: Endpoint, e: CatalogEntry | undefined): string {
  if (!e) return '';
  if (which === 'origin') {
    return e.kind === 'star' && e.spectralClass ? 'Star, type ' + e.spectralClass : e.kindLabel;
  }
  if (e.regime === 'Interstellar' && e.distanceFromSolMeters > 0) {
    return formatDistance(e.distanceFromSolMeters, { long: true }) + ' from the Sun';
  }
  return e.kindLabel;
}

/* ------------------------------------------------------------------ */
/* The open picker: input, results popover                             */
/* ------------------------------------------------------------------ */

interface OpenPickerProps {
  which: Endpoint;
  obj: AstroObject | null;
  onClose: (restoreFocus: boolean) => void;
}

const OpenPicker: React.FC<OpenPickerProps> = ({ which, obj, onClose }) => {
  const regime = useFlightStore((s) => s.regime);
  const setEndpoint = useFlightStore((s) => s.setEndpoint);
  const focusObject = useFlightStore((s) => s.focusObject);

  const uid = useId();
  const inputId = `plan-in-${uid}`;
  const listId = `plan-list-${uid}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState(regime === 'Interstellar' ? 'nearest-stars' : 'planets');
  const [active, setActive] = useState(-1);

  const trimmed = query.trim();
  const group = browseGroups.find((g) => g.id === groupId) ?? browseGroups[0];

  const rows: Row[] = useMemo(() => {
    if (trimmed) {
      return searchCatalog(trimmed, { limit: 8, excludeId: obj?.id }).map((hit) => ({ entry: hit.entry, hit }));
    }
    return group.entries.filter((e) => e.id !== obj?.id).map((entry) => ({ entry }));
  }, [trimmed, group, obj?.id]);

  const activeId = active >= 0 && active < rows.length ? rows[active].entry.id : null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // The map pings whichever row is highlighted.
  useEffect(() => {
    useFlightStore.getState().setBeacon(activeId);
  }, [activeId]);
  useEffect(() => () => useFlightStore.getState().setBeacon(null), []);

  // Click outside closes.
  useEffect(() => {
    const onDown = (ev: PointerEvent) => {
      if (wrapRef.current && ev.target instanceof Node && !wrapRef.current.contains(ev.target)) onClose(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [onClose]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (active < 0) return;
    document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  const choose = useCallback(
    (id: string) => {
      setEndpoint(which, id);
      onClose(true);
    },
    [setEndpoint, which, onClose],
  );

  const onKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    const n = rows.length;
    switch (ev.key) {
      case 'ArrowDown':
        ev.preventDefault();
        if (n) setActive((a) => (a + 1) % n);
        break;
      case 'ArrowUp':
        ev.preventDefault();
        if (n) setActive((a) => (a <= 0 ? n - 1 : a - 1));
        break;
      case 'Home':
        if (n) { ev.preventDefault(); setActive(0); }
        break;
      case 'End':
        if (n) { ev.preventDefault(); setActive(n - 1); }
        break;
      case 'Enter':
        ev.preventDefault();
        if (ev.shiftKey && activeId) focusObject(activeId);
        else if (activeId) choose(activeId);
        break;
      case 'Escape':
        ev.preventDefault();
        ev.stopPropagation();
        onClose(true);
        break;
      case 'Tab':
        onClose(false);
        break;
      default:
    }
  };

  const noun = rows.length === 1 ? 'match' : 'matches';

  return (
    <div className="plan-open" ref={wrapRef}>
      <div className="plan-field plan-field--input">
        <label className="micro-label plan-field-label" htmlFor={inputId}>
          {WHICH_LABEL[which]} · search planets and stars
        </label>
        <div className="plan-input-wrap">
          <SearchIcon />
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            className="plan-input"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeId ? `${listId}-opt-${active}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={obj ? (getEntry(obj.id)?.name ?? obj.name) : 'Search the catalog'}
            value={query}
            onChange={(ev) => {
              setQuery(ev.target.value);
              setActive(ev.target.value.trim() ? 0 : -1);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>

      <div className="plan-pop">
        {!trimmed && (
          <div className="plan-chips" role="group" aria-label="Browse lists" onMouseDown={(ev) => ev.preventDefault()}>
            {browseGroups.map((g) => (
              <button
                key={g.id}
                type="button"
                className="plan-chip"
                aria-pressed={g.id === group.id}
                onClick={() => { setGroupId(g.id); setActive(-1); }}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}

        {rows.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={trimmed ? 'Search results' : group.label}
            className="plan-results"
            onMouseDown={(ev) => ev.preventDefault()}
            onMouseLeave={() => setActive(-1)}
          >
            {rows.map((row, i) => {
              const e = row.entry;
              const switches = e.regime !== regime;
              const isActive = i === active;
              return (
                <li
                  key={e.id}
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={isActive}
                  className={'plan-row enter' + (isActive ? ' is-active' : '')}
                  style={{ '--i': Math.min(i, 10) } as React.CSSProperties}
                  onMouseEnter={() => setActive(i)}
                >
                  <div className="plan-row-main" onClick={() => choose(e.id)}>
                    <Dot color={e.color} />
                    <div className="plan-row-text">
                      <span className="plan-row-name">
                        <Highlighted name={e.name} ranges={row.hit?.ranges ?? []} />
                      </span>
                      <span className="plan-row-sub">
                        {switches && <span className="plan-row-map">{e.regime === 'Interstellar' ? 'Star map' : 'Solar system'} · </span>}
                        {secondLine(e)}
                      </span>
                      {row.hit?.matchedAlias && (
                        <span className="plan-row-sub plan-row-alias">also known as {row.hit.matchedAlias}</span>
                      )}
                    </div>
                    <div className="plan-row-side">
                      <span className="plan-row-dist num">
                        {e.distanceFromSolMeters > 0 ? formatDistance(e.distanceFromSolMeters) : 'Sol'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="plan-row-locate"
                    tabIndex={-1}
                    aria-label={`Show ${e.name} on map`}
                    title="Show on map"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={(ev) => { ev.stopPropagation(); focusObject(e.id); }}
                  >
                    <LocateIcon />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p id={listId} role="listbox" aria-label="Search results" className="plan-empty">
            No match. Try a constellation like Orion, or a name like Vega.
          </p>
        )}

        <p className="plan-pop-foot" aria-live="polite">
          {trimmed
            ? `${rows.length} ${noun} in ${formatCount(catalogSize)} objects · Enter to choose`
            : group.description}
        </p>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* One field (closed button, or the open picker)                       */
/* ------------------------------------------------------------------ */

const EndpointField: React.FC<{ which: Endpoint }> = ({ which }) => {
  const obj = useFlightStore((s) => (which === 'origin' ? s.origin : s.destination));
  const open = useFlightStore((s) => s.picker === which);
  const openPicker = useFlightStore((s) => s.openPicker);
  const btnRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef(false);

  useEffect(() => {
    if (!open && restoreRef.current) {
      restoreRef.current = false;
      btnRef.current?.focus();
    }
  }, [open]);

  const onClose = useCallback(
    (restoreFocus: boolean) => {
      restoreRef.current = restoreFocus;
      useFlightStore.getState().openPicker(null);
    },
    [],
  );

  if (open) return <OpenPicker which={which} obj={obj} onClose={onClose} />;

  const entry = obj ? getEntry(obj.id) : undefined;
  const name = entry?.name ?? obj?.name ?? 'Choose a place';

  return (
    <button
      ref={btnRef}
      type="button"
      className="plan-field plan-field--button"
      aria-haspopup="listbox"
      aria-expanded="false"
      onClick={() => openPicker(which)}
    >
      <span className="micro-label plan-field-label">{WHICH_LABEL[which]}</span>
      <span className="plan-field-name" key={obj?.id ?? 'none'}>
        <Dot color={entry?.color} />
        <span className="plan-ellipsis">{name}</span>
      </span>
      <span className="plan-field-sub plan-ellipsis">{suffixFor(which, entry)}</span>
    </button>
  );
};

/* ------------------------------------------------------------------ */
/* Both fields plus the swap button                                    */
/* ------------------------------------------------------------------ */

export const TargetPickers: React.FC = () => {
  const swapEndpoints = useFlightStore((s) => s.swapEndpoints);
  const pickerOpen = useFlightStore((s) => s.picker !== null);
  const canSwap = useFlightStore((s) => s.origin !== null && s.destination !== null);
  const [turns, setTurns] = useState(0);

  return (
    <div className="plan-targets">
      <EndpointField which="origin" />
      <EndpointField which="destination" />
      <button
        type="button"
        className={'plan-swap' + (pickerOpen ? ' is-hidden' : '')}
        aria-label="Swap from and to"
        title="Swap from and to"
        disabled={!canSwap}
        tabIndex={pickerOpen ? -1 : 0}
        onClick={() => {
          setTurns((t) => t + 1);
          swapEndpoints();
        }}
      >
        <span className="plan-swap-icon" style={{ transform: `rotate(${turns * 180}deg)` }}>
          <SwapIcon />
        </span>
      </button>
    </div>
  );
};
