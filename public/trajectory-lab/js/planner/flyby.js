// Patched-conic manoeuvre models at planets (all in km, km/s).

import { angleBetween, norm } from '../physics/vec.js';

/** Δv to leave a circular parking orbit of radius rp onto a hyperbola with excess speed vinf. */
export function departureDv(vinf, mu, rp) {
  return Math.sqrt(vinf * vinf + (2 * mu) / rp) - Math.sqrt(mu / rp);
}

/**
 * Δv to capture at periapsis rp.
 *  type 'circular' – circular orbit at rp
 *  type 'capture'  – elliptical capture orbit with eccentricity e (default 0.9)
 *  type 'flyby'    – no burn
 */
export function arrivalDv(vinf, mu, rp, type, e = 0.9) {
  if (type === 'flyby') return 0;
  const vp = Math.sqrt(vinf * vinf + (2 * mu) / rp);
  if (type === 'circular') return vp - Math.sqrt(mu / rp);
  return vp - Math.sqrt((mu * (1 + e)) / rp);
}

/**
 * Powered gravity assist: the hyperbolic excess velocity must turn from vIn to vOut.
 * Finds the periapsis radius producing the required turn and the periapsis burn that
 * matches |vIn| to |vOut|. If the turn is impossible above the minimum safe radius,
 * a penalty (the impulsive Δv needed to rotate the rest of the way) is returned.
 */
export function poweredFlyby(vIn, vOut, planet) {
  const a = norm(vIn), b = norm(vOut);
  const mu = planet.gmKm;
  const rmin = planet.radiusKm + planet.minFlybyAltKm;
  const delta = angleBetween(vIn, vOut);
  const turn = (rp) => Math.asin(1 / (1 + (rp * a * a) / mu)) + Math.asin(1 / (1 + (rp * b * b) / mu));
  const deltaMax = turn(rmin);

  let rp, penalty = 0;
  if (delta > deltaMax) {
    rp = rmin;
    penalty = 2 * Math.min(a, b) * Math.sin((delta - deltaMax) / 2);
  } else {
    // turn(rp) decreases monotonically with rp: bisection in log space
    let lo = Math.log(rmin), hi = Math.log(rmin * 1e7);
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if (turn(Math.exp(mid)) > delta) lo = mid;
      else hi = mid;
    }
    rp = Math.exp(0.5 * (lo + hi));
  }
  const dv = Math.abs(Math.sqrt(b * b + (2 * mu) / rp) - Math.sqrt(a * a + (2 * mu) / rp));
  return {
    rp,
    altKm: rp - planet.radiusKm,
    dv,
    penalty,
    feasible: penalty < 1e-3,
    turnDeg: (delta * 180) / Math.PI,
    maxTurnDeg: (deltaMax * 180) / Math.PI,
    vinfIn: a,
    vinfOut: b,
  };
}

/** Hyperbolic impact parameter |B| for periapsis rp. */
export function impactParameter(rp, vinf, mu) {
  return rp * Math.sqrt(1 + (2 * mu) / (rp * vinf * vinf));
}
