// Planetary ephemeris from JPL's "Keplerian Elements for Approximate Positions of the
// Major Planets" (E. M. Standish, Table 1, valid 1800 AD – 2050 AD).
// Positions are heliocentric, J2000 ecliptic frame, in AU. Velocities in AU/day.

import { DEG, J2000, TWO_PI, GM_SUN, GM_SUN_KM, gmToAU } from './constants.js';

// Elements: a [AU], e, I [deg], L [deg], long.peri [deg], long.node [deg]
// Rates are per Julian century.
export const PLANETS = [
  {
    id: 'mercury', name: 'Mercury', short: 'Me',
    el: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    gmKm: 22031.868, radiusKm: 2439.4, minFlybyAltKm: 200, arrivalAltKm: 400,
    color: 0xa59d94, displaySize: 0.22,
  },
  {
    id: 'venus', name: 'Venus', short: 'V',
    el: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    rate: [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
    gmKm: 324858.592, radiusKm: 6051.8, minFlybyAltKm: 300, arrivalAltKm: 400,
    color: 0xe8c68a, displaySize: 0.36,
  },
  {
    id: 'earth', name: 'Earth', short: 'E',
    el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
    gmKm: 398600.435, radiusKm: 6378.1, minFlybyAltKm: 300, arrivalAltKm: 300,
    color: 0x4f8fe6, displaySize: 0.38,
  },
  {
    id: 'mars', name: 'Mars', short: 'Ma',
    el: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    gmKm: 42828.375, radiusKm: 3396.2, minFlybyAltKm: 200, arrivalAltKm: 400,
    color: 0xd0623b, displaySize: 0.28,
  },
  {
    id: 'jupiter', name: 'Jupiter', short: 'J',
    el: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    // Flybys kept outside ~4 Jupiter radii because of the radiation belts.
    gmKm: 126712764.1, radiusKm: 71492, minFlybyAltKm: 214000, arrivalAltKm: 5000,
    color: 0xd9b38c, displaySize: 0.95,
  },
  {
    id: 'saturn', name: 'Saturn', short: 'S',
    el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    // Flybys kept outside the main rings (~2.3 Saturn radii).
    gmKm: 37940584.8, radiusKm: 60268, minFlybyAltKm: 80000, arrivalAltKm: 20000,
    color: 0xe3cf9a, displaySize: 0.82, rings: true,
  },
  {
    id: 'uranus', name: 'Uranus', short: 'U',
    el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
    gmKm: 5794556.4, radiusKm: 25559, minFlybyAltKm: 8000, arrivalAltKm: 4000,
    color: 0x9fd8e0, displaySize: 0.6,
  },
  {
    id: 'neptune', name: 'Neptune', short: 'N',
    el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
    gmKm: 6836527.1, radiusKm: 24764, minFlybyAltKm: 4000, arrivalAltKm: 4000,
    color: 0x4a6fe3, displaySize: 0.58,
  },
];

export const PLANET_BY_ID = Object.fromEntries(PLANETS.map((p) => [p.id, p]));

for (const p of PLANETS) {
  p.gm = gmToAU(p.gmKm); // AU^3/day^2
  // Sphere of influence radius (Laplace): a * (m/M)^(2/5)
  p.soi = p.el[0] * Math.pow(p.gmKm / GM_SUN_KM, 0.4); // AU
  p.period = 36525 * 360 / p.rate[3]; // days
}

/** Classical orbital elements of a planet at Julian date jd. */
export function elementsAt(p, jd) {
  const T = (jd - J2000) / 36525;
  const a = p.el[0] + p.rate[0] * T;
  const e = p.el[1] + p.rate[1] * T;
  const I = (p.el[2] + p.rate[2] * T) * DEG;
  const L = (p.el[3] + p.rate[3] * T) * DEG;
  const varpi = (p.el[4] + p.rate[4] * T) * DEG;
  const Omega = (p.el[5] + p.rate[5] * T) * DEG;
  const omega = varpi - Omega;
  let M = (L - varpi) % TWO_PI;
  if (M > Math.PI) M -= TWO_PI;
  if (M < -Math.PI) M += TWO_PI;
  // Mean motion consistent with the ephemeris' own rate of mean longitude
  const n = (p.rate[3] * DEG) / 36525; // rad/day
  return { a, e, I, Omega, omega, M, n };
}

export function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let i = 0; i < 30; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-13) break;
  }
  return E;
}

/** Perifocal -> ecliptic rotation applied to (x', y'). */
function rotate(xp, yp, el) {
  const cO = Math.cos(el.Omega), sO = Math.sin(el.Omega);
  const cw = Math.cos(el.omega), sw = Math.sin(el.omega);
  const cI = Math.cos(el.I), sI = Math.sin(el.I);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

/** Heliocentric state {r, v} of a planet at jd. */
export function planetState(p, jd) {
  const el = elementsAt(p, jd);
  const E = solveKepler(el.M, el.e);
  const cE = Math.cos(E), sE = Math.sin(E);
  const b = Math.sqrt(1 - el.e * el.e);
  const xp = el.a * (cE - el.e);
  const yp = el.a * b * sE;
  const Edot = el.n / (1 - el.e * cE);
  const vxp = -el.a * sE * Edot;
  const vyp = el.a * b * cE * Edot;
  return { r: rotate(xp, yp, el), v: rotate(vxp, vyp, el) };
}

export function planetPosition(p, jd) {
  return planetState(p, jd).r;
}

/** Sampled orbit ellipse (for drawing) at epoch jd. */
export function orbitPoints(p, jd, segments = 256) {
  const el = elementsAt(p, jd);
  const b = Math.sqrt(1 - el.e * el.e);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const E = (i / segments) * TWO_PI;
    pts.push(rotate(el.a * (Math.cos(E) - el.e), el.a * b * Math.sin(E), el));
  }
  return pts;
}

export { GM_SUN };
