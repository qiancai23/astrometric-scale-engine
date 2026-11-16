import React from 'react';

/** What shows while the 3D map chunk downloads. Quiet: drifting star specks and a label. */
export const MapLoading: React.FC = () => (
  <div className="shell-map-loading" role="status">
    <div className="shell-specks shell-specks-a" aria-hidden="true" />
    <div className="shell-specks shell-specks-b" aria-hidden="true" />
    <p className="shell-map-loading-label">
      LOADING STAR MAP<span className="shell-ellipsis" aria-hidden="true" />
    </p>
  </div>
);

/** Catches a failed map (for example no WebGL) so the calculator panels keep working. */
export class MapBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: unknown): void {
    console.warn('The 3D map failed to start.', error);
  }
  render(): React.ReactNode {
    if (this.state.failed) {
      return (
        <div className="shell-map-error" role="alert">
          <p>The 3D map could not start on this device. The flight calculator still works.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
