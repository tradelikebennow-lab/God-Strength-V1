// src/components/ErrorBoundary.jsx
// Last line of defence: a throw inside any analytics memo or render would
// otherwise white-screen the whole single-page app. This catches it, shows a
// recovery panel, and lets the user copy the error or reload — their data is
// safe in Supabase, so a reload almost always recovers.
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[error-boundary]', error, info);
  }

  handleCopy = () => {
    const { error } = this.state;
    const text = `${error?.message || error}\n\n${error?.stack || ''}`;
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-loading" style={{ flexDirection: 'column', gap: 12, padding: 24, textAlign: 'center' }}>
        <div style={{ color: 'var(--danger)', fontWeight: 600, fontSize: 'var(--text-lg)' }}>
          Something broke while rendering.
        </div>
        <div style={{ opacity: 0.7, maxWidth: 520 }}>
          Your data is saved in the cloud — a reload usually fixes this. If it keeps
          happening, copy the error and send it over.
        </div>
        <div style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.8, maxWidth: 520, wordBreak: 'break-word' }}>
          {String(this.state.error?.message || this.state.error)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={this.handleCopy}>Copy error</button>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
