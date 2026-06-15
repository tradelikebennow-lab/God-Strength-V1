// src/components/CountUp.jsx
// Animated number that counts up to its value the first time it scrolls into
// view. Format-agnostic: pass a `format` fn (e.g. the dashboard's currency
// formatter) so it works for $, %, R, ratios. Honors prefers-reduced-motion.
import React, { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'motion/react';

export default function CountUp({ value, format, as = 'span', className, style, duration = 1100 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-8% 0px' });
  const reduce = useReducedMotion();
  const [n, setN] = useState(0);

  useEffect(() => {
    const numeric = typeof value === 'number' && isFinite(value);
    if (!inView || !numeric) { setN(value); return; }
    if (reduce) { setN(value); return; }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setN(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setN(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, reduce, duration]);

  const text = format ? format(n) : String(n);
  return React.createElement(as, { ref, className, style }, text);
}
