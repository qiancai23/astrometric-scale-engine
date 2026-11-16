import React from 'react';
import { useTween, TweenOptions } from '../../lib/motion';

export interface RollingValueProps extends TweenOptions {
  /** The number to show. When it changes the display rolls to the new value. */
  value: number;
  /** Turns the (animated) number into text, e.g. `formatDuration`. Called every frame while rolling. */
  format: (value: number) => string;
  className?: string;
  style?: React.CSSProperties;
  /** Rendered element. Default `span`. */
  as?: 'span' | 'div' | 'strong';
  /** Text for screen readers; defaults to the formatted final value (not the in-between frames). */
  ariaLabel?: string;
}

/**
 * A number that rolls to its new value instead of jumping.
 * Use for every figure in the interface that can change: travel times, speeds, distances.
 *
 *   <RollingValue value={shipSeconds} format={formatDuration} log />
 *
 * Pass `log` for quantities that can change by orders of magnitude, and `immediate` while the
 * value is itself being driven every frame (playback clocks), so it does not lag behind.
 */
export const RollingValue: React.FC<RollingValueProps> = ({ value, format, className, style, as = 'span', ariaLabel, ...tween }) => {
  const animated = useTween(value, tween);
  const Tag = as;
  const settled = format(value);
  const shown = animated === value ? settled : format(animated);
  return (
    <Tag className={className ? `rolling-value ${className}` : 'rolling-value'} style={style} aria-label={ariaLabel ?? settled}>
      <span aria-hidden="true">{shown}</span>
    </Tag>
  );
};
