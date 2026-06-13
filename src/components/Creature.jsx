// src/components/Creature.jsx
// The discipline creature: a pixel-art pet whose vitality mirrors the
// computeDiscipline() score. Pure CSS (no deps, no timers, no canvas).
// States: best | thriving | healthy | tired | sick | critical | resting.
// Each sprite is a 2-frame strip (96x32) rendered as a background and
// animated via background-position. Per-state themed glow reuses --orb-glow.
import React from 'react';
import { CREATURE_SPRITES } from '../data/creatureSprites.js';

// One frame is 48x32 (3:2); the strip holds two frames side by side.
const FRAME_W = 48;
const FRAME_H = 32;

export default function Creature({ discipline, size = 132 }) {
  const key = discipline?.state?.key ?? 'resting';
  const strip = CREATURE_SPRITES[key] || CREATURE_SPRITES.resting;
  const w = size;
  const h = Math.round((size * FRAME_H) / FRAME_W);
  return (
    <div className={`creature creature-${key}`} style={{ width: w, height: h }} role="img"
      aria-label={`Discipline creature: ${discipline?.state?.label ?? 'Resting'}${discipline?.score != null ? `, score ${discipline.score}` : ''}`}>
      <div className="creature-glow" aria-hidden="true" />
      <div className="creature-sprite" style={{ width: w, height: h, backgroundImage: `url(${strip})` }} />
    </div>
  );
}
