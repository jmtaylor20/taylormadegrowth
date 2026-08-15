// Mapbox mileage helper — turn two addresses into driving miles.
// Uses the public token in config (browser-safe). No token = feature is off.
import { MAPBOX_TOKEN } from './config.js';

const MILES_PER_METER = 1 / 1609.344;

export function mapboxReady() {
  return typeof MAPBOX_TOKEN === 'string' && MAPBOX_TOKEN.startsWith('pk.');
}

async function geocode(query) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
    + `?limit=1&country=US&types=address,place,postcode,poi&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Address lookup failed');
  const data = await res.json();
  if (!data.features || !data.features.length) throw new Error('Address not found: ' + query);
  return data.features[0].center; // [lng, lat]
}

// One-way driving miles between two addresses (rounded to 0.1).
export async function drivingMiles(fromAddr, toAddr) {
  const [a, b] = await Promise.all([geocode(fromAddr), geocode(toAddr)]);
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${a[0]},${a[1]};${b[0]},${b[1]}`
    + `?overview=false&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Route lookup failed');
  const data = await res.json();
  if (!data.routes || !data.routes.length) throw new Error('No driving route found');
  return Math.round(data.routes[0].distance * MILES_PER_METER * 10) / 10;
}
