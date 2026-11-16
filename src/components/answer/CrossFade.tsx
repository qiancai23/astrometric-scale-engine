import React, { useEffect, useRef, useState } from 'react';

interface Layer {
  id: string;
  node: React.ReactNode;
}

interface CrossFadeProps {
  /** Identifies the content; when it changes the old content fades out as the new fades in. */
  id: string;
  children: React.ReactNode;
  className?: string;
  /** Milliseconds the outgoing content stays mounted. Match the CSS fade (`--dur-med`). */
  duration?: number;
}

/** Stacks the outgoing and incoming content in one grid cell and fades between them. */
export const CrossFade: React.FC<CrossFadeProps> = ({ id, children, className, duration = 320 }) => {
  const latest = useRef<Layer>({ id, node: children });
  const [leaving, setLeaving] = useState<Layer | null>(null);

  const timer = useRef(0);

  useEffect(() => {
    if (latest.current.id === id) return;
    const old = latest.current;
    latest.current = { id, node: children };
    setLeaving(old);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLeaving(null), duration);
    // `children` is a fresh object every render; only a change of `id` starts a fade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // While the id is unchanged, show the freshest children.
  const current: Layer = latest.current.id === id ? { id, node: children } : latest.current;
  if (latest.current.id === id) latest.current = current;

  return (
    <div className={`answer-crossfade${className ? ` ${className}` : ''}`}>
      {leaving && (
        <div key={leaving.id} className="answer-crossfade-layer is-leaving" aria-hidden="true">
          {leaving.node}
        </div>
      )}
      <div key={current.id} className={`answer-crossfade-layer${leaving ? ' is-entering' : ''}`}>
        {current.node}
      </div>
    </div>
  );
};
