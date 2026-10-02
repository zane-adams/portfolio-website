// Lambert's problem: find the conic connecting r1 -> r2 in time dt.
// Universal-variable formulation (Bate, Mueller & White; Curtis Alg. 5.2),
// solved with a safeguarded bisection on z so it never diverges.
// Single revolution, prograde (counter-clockwise seen from ecliptic north).

import { cross, dot, norm } from './vec.js';

function stumpffC(z) {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 1 / 2 - z / 24 + (z * z) / 720;
}
function stumpffS(z) {
  if (z > 1e-6) {
    const s = Math.sqrt(z);
    return (s - Math.sin(s)) / (s * s * s);
  }
  if (z < -1e-6) {
    const s = Math.sqrt(-z);
    return (Math.sinh(s) - s) / (s * s * s);
  }
  return 1 / 6 - z / 120 + (z * z) / 5040;
}

/**
 * @returns {{v1:number[], v2:number[]}|null} velocities at r1 and r2 (same units as mu/dt)
 */
export function lambert(r1v, r2v, dt, mu) {
  const r1 = norm(r1v);
  const r2 = norm(r2v);
  if (dt <= 0) return null;
  let cosdth = dot(r1v, r2v) / (r1 * r2);
  cosdth = Math.max(-1, Math.min(1, cosdth));
  let dth = Math.acos(cosdth);
  if (cross(r1v, r2v)[2] < 0) dth = 2 * Math.PI - dth; // prograde
  if (1 - cosdth < 1e-12) return null; // 0° transfer: undefined plane
  const A = Math.sin(dth) * Math.sqrt((r1 * r2) / (1 - cosdth));
  if (Math.abs(A) < 1e-10) return null; // 180° transfer: plane undefined

  const sqmu = Math.sqrt(mu);
  const yOf = (z) => r1 + r2 + (A * (z * stumpffS(z) - 1)) / Math.sqrt(stumpffC(z));
  // F(z) = t(z)*sqrt(mu) - dt*sqrt(mu); monotonically increasing in z.
  const F = (z) => {
    const y = yOf(z);
    if (y < 0) return -Infinity;
    const C = stumpffC(z);
    return Math.pow(y / C, 1.5) * stumpffS(z) + A * Math.sqrt(y) - sqmu * dt;
  };

  let hi = 4 * Math.PI * Math.PI - 1e-9;
  let lo = -40;
  let k = 0;
  while (F(lo) > 0 && k < 40) {
    lo *= 2;
    k++;
  }
  if (F(lo) > 0) return null;
  let z = 0;
  for (let i = 0; i < 100; i++) {
    z = 0.5 * (lo + hi);
    const f = F(z);
    if (f > 0) hi = z;
    else lo = z;
    if (hi - lo < 1e-11 * Math.max(1, Math.abs(z))) break;
  }
  const y = yOf(z);
  if (!(y > 0)) return null;
  const f = 1 - y / r1;
  const g = A * Math.sqrt(y / mu);
  const gdot = 1 - y / r2;
  const v1 = [(r2v[0] - f * r1v[0]) / g, (r2v[1] - f * r1v[1]) / g, (r2v[2] - f * r1v[2]) / g];
  const v2 = [(gdot * r2v[0] - r1v[0]) / g, (gdot * r2v[1] - r1v[1]) / g, (gdot * r2v[2] - r1v[2]) / g];
  if (!isFinite(v1[0]) || !isFinite(v2[0])) return null;
  return { v1, v2 };
}
