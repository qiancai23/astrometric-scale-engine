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
  'aria-hidden': true,
};

export const PlayIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg {...base} width={size} height={size} fill="currentColor">
    <path d="M7 4.8v14.4a.8.8 0 0 0 1.2.7l11.6-7.2a.8.8 0 0 0 0-1.4L8.2 4.1A.8.8 0 0 0 7 4.8z" />
  </svg>
);

export const PauseIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg {...base} width={size} height={size} fill="currentColor">
    <rect x="6" y="4.5" width="4" height="15" rx="1" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" />
  </svg>
);

export const ReplayIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg {...base} width={size} height={size}>
    <path d="M4 12a8 8 0 1 0 2.6-5.9" />
    <path d="M4 4v4.5h4.5" />
  </svg>
);

export const ChevronIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg {...base} width={size} height={size}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
