// src/components/LoginGrid.jsx
// Login-only WebGL backdrop: a cobalt perspective grid that flows toward the
// viewer, breathes, and drifts with the pointer. Three.js is DYNAMICALLY
// imported so it ships as its own lazy chunk loaded only on the auth screen —
// it never touches the main app bundle. Falls back to a CSS grid if WebGL/
// Three.js is unavailable, and is fully disabled under prefers-reduced-motion.
import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

export default function LoginGrid() {
  const canvasRef = useRef(null);
  const reduce = useReducedMotion();
  const [mode, setMode] = useState('fallback'); // 'fallback' | 'webgl'

  useEffect(() => {
    if (reduce) return; // CSS fallback stays; no Three.js loaded at all
    let disposed = false;
    let cleanup = () => {};

    import('three')
      .then((THREE) => {
        const canvas = canvasRef.current;
        if (disposed || !canvas) return;
        const host = canvas.parentElement;

        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x0a0f1e, 5, 20);
        const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
        cam.position.set(0, 1.5, 7);
        cam.lookAt(0, 0, -4);

        const g1 = new THREE.GridHelper(80, 80, 0x6d83ff, 0x2e3e84);
        g1.material.transparent = true; g1.material.opacity = 0.5; g1.position.z = -4;
        const g2 = new THREE.GridHelper(80, 40, 0x8a6dff, 0x24306b);
        g2.material.transparent = true; g2.material.opacity = 0.25; g2.position.y = -0.02; g2.position.z = -4;
        scene.add(g1); scene.add(g2);

        let tx = 0, raf = 0;
        const resize = () => {
          const w = host.clientWidth, h = host.clientHeight;
          renderer.setSize(w, h, false);
          cam.aspect = w / Math.max(1, h);
          cam.updateProjectionMatrix();
        };
        const onMove = (e) => { tx = (e.clientX / window.innerWidth - 0.5) * 0.6; };
        resize();
        window.addEventListener('resize', resize);
        window.addEventListener('pointermove', onMove);

        const t0 = performance.now();
        const loop = (now) => {
          const t = (now - t0) / 1000;
          g1.position.z = ((t * 0.6) % 2) - 4;
          g2.position.z = g1.position.z;
          const breathe = 0.42 + 0.12 * Math.sin(t * 0.7);
          g1.material.opacity = breathe;
          g2.material.opacity = breathe * 0.5;
          cam.position.x += (tx - cam.position.x) * 0.04;
          cam.lookAt(0, 0, -4);
          renderer.render(scene, cam);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        setMode('webgl');

        cleanup = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener('resize', resize);
          window.removeEventListener('pointermove', onMove);
          g1.geometry.dispose(); g1.material.dispose();
          g2.geometry.dispose(); g2.material.dispose();
          renderer.dispose();
        };
      })
      .catch(() => { /* keep CSS fallback */ });

    return () => { disposed = true; cleanup(); };
  }, [reduce]);

  return (
    <div className="login-grid" aria-hidden="true">
      {mode === 'fallback' && <div className="login-grid-fallback" />}
      {!reduce && <canvas ref={canvasRef} className="login-grid-canvas" />}
    </div>
  );
}
