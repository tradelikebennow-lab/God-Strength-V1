// src/components/AuthGate.jsx
// Login screen shown when there is no Supabase session.
// Sign-up is intentionally NOT offered: this is a single-user journal.
// (Also disable signups in Supabase Dashboard → Authentication → Providers
// → Email → "Allow new users to sign up" OFF, so the API path is closed too.)
import React, { useState } from 'react';
import { supabase } from '../data/supabaseClient.js';

export default function AuthGate() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // onAuthStateChange in App.jsx takes over from here
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card animate-in" onSubmit={handleSubmit}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 8 }}>
          <div className="brand-mark">G</div>
          <span className="brand-name">God Strength</span>
          <span className="brand-version">v1</span>
        </div>
        <div className="auth-subtitle">Sign in to your trading journal</div>

        <label className="auth-label" htmlFor="auth-email">Email</label>
        <input
          id="auth-email"
          className="auth-input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label className="auth-label" htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          className="auth-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />

        {error && <div className="auth-error">{error}</div>}

        <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
          {busy ? '…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
