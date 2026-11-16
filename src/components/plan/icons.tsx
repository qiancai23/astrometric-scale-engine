import React from 'react';

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

/** Two arrows pointing opposite ways (swap from and to). */
export const SwapIcon: React.FC = () => (
  <svg {...base}>
    <path d="M7 4v14" />
    <path d="M3.5 14.5 7 18l3.5-3.5" />
    <path d="M17 20V6" />
    <path d="M13.5 9.5 17 6l3.5 3.5" />
  </svg>
);

/** A crosshair (show on map). */
export const LocateIcon: React.FC = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="6.5" />
    <circle cx="12" cy="12" r="1.5" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
  </svg>
);

export const SearchIcon: React.FC = () => (
  <svg {...base} width={16} height={16}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </svg>
);

/** Chevron for stepping a date back (left) or forward (right). */
export const ChevronIcon: React.FC<{ dir: 'left' | 'right' }> = ({ dir }) => (
  <svg {...base} width={16} height={16}>
    <path d={dir === 'left' ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6'} />
  </svg>
);
