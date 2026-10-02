// Physical constants and unit helpers.
// Internal simulation units: distance in AU, time in days, angles in radians.

export const AU_KM = 149597870.7;
export const DAY_S = 86400;
export const J2000 = 2451545.0; // Julian date of the J2000 epoch
export const DEG = Math.PI / 180;
export const TWO_PI = Math.PI * 2;
export const OBLIQUITY = 23.43928 * DEG; // Earth's axial tilt (ecliptic -> equatorial)
export const C_KM_S = 299792.458;

// Gravitational parameters (km^3/s^2), JPL DE440 values
export const GM_SUN_KM = 1.32712440041e11;

// Convert GM from km^3/s^2 to AU^3/day^2
export const gmToAU = (gmKm) => (gmKm * DAY_S * DAY_S) / (AU_KM * AU_KM * AU_KM);
export const GM_SUN = gmToAU(GM_SUN_KM);

// Velocity conversions
export const AUD_TO_KMS = AU_KM / DAY_S; // AU/day -> km/s
export const KMS_TO_AUD = DAY_S / AU_KM;

// Dates
export const jdFromDate = (date) => date.getTime() / 86400000 + 2440587.5;
export const dateFromJd = (jd) => new Date((jd - 2440587.5) * 86400000);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(jd, withTime = false) {
  const d = dateFromJd(jd);
  if (isNaN(d.getTime())) return '—';
  const s = `${d.getUTCDate().toString().padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (!withTime) return s;
  return `${s} ${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')} UTC`;
}
export function isoDate(jd) {
  return dateFromJd(jd).toISOString().slice(0, 10);
}
export function fmtDuration(days) {
  const d = Math.abs(days);
  if (d < 2) return `${(d * 24).toFixed(1)} h`;
  if (d < 120) return `${Math.round(d)} d`;
  const y = d / 365.25;
  if (y < 2) return `${Math.round(d)} d (${(d / 30.44).toFixed(1)} mo)`;
  return `${y.toFixed(2)} yr (${Math.round(d)} d)`;
}
