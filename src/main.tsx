import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './index.css';

// The app (catalogs, 3D) is a large download. Load it after the boot screen in index.html has painted.
import('./App').then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  const boot = document.getElementById('boot');
  if (boot) {
    // Let the first frame of the app paint, then fade the boot screen away.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        boot.classList.add('boot-out');
        window.setTimeout(() => boot.remove(), 600);
      }),
    );
  }
});
