import React from 'react';

/** Small inline stroke icons (1.5px, currentColor). Decorative: the button carries the label. */
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const LayersIcon: React.FC = () => (
  <svg {...base}>
    <path d="M12 3 3 8l9 5 9-5-9-5Z" />
    <path d="m3 12.5 9 5 9-5" />
    <path d="m3 16.5 9 5 9-5" />
  </svg>
);
export const ShareIcon: React.FC = () => (
  <svg {...base}>
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" />
  </svg>
);
export const CheckIcon: React.FC = () => (
  <svg {...base}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const HelpIcon: React.FC = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7" />
    <path d="M12 16.8h.01" />
  </svg>
);
export const ChevronIcon: React.FC<{ direction: 'left' | 'right' }> = ({ direction }) => (
  <svg {...base} width={16} height={16}>
    <path d={direction === 'left' ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6'} />
  </svg>
);
export const PlayIcon: React.FC = () => (
  <svg {...base} width={22} height={22} fill="currentColor" stroke="none">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
  </svg>
);
export const PauseIcon: React.FC = () => (
  <svg {...base} width={22} height={22} fill="currentColor" stroke="none">
    <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
  </svg>
);
export const CloseIcon: React.FC = () => (
  <svg {...base} width={14} height={14}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const BrandMark: React.FC<{ size?: number; className?: string }> = ({ size = 26, className }) => (
  <svg
    className={className ? `shell-brand-mark ${className}` : 'shell-brand-mark'}
    width={size}
    height={size}
    viewBox="0 0 26 26"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    aria-hidden="true"
  >
    <circle cx="13" cy="13" r="3.2" fill="currentColor" stroke="none" />
    <g className="shell-brand-orbit">
      <ellipse cx="13" cy="13" rx="11.5" ry="5" transform="rotate(-28 13 13)" />
    </g>
  </svg>
);
