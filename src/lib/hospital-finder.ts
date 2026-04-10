/**
 * Find the nearest hospital to a given location using OpenStreetMap Overpass API.
 * Falls back to a generic name if the API call fails.
 */

interface Hospital {
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function findNearestHospital(
  lat: number,
  lng: number,
  radiusMeters = 5000,
): Promise<Hospital | null> {
  try {
    // Use Overpass API to find hospitals within radius
    const query = `
      [out:json][timeout:10];
      (
        node["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
        way["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      );
      out center 5;
    `;

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!response.ok) throw new Error('Overpass API failed');

    const data = await response.json();
    const elements = data.elements || [];

    if (elements.length === 0) return null;

    // Calculate distances and find nearest
    const hospitals: Hospital[] = elements.map((el: any) => {
      const hLat = el.lat ?? el.center?.lat;
      const hLng = el.lon ?? el.center?.lon;
      const name = el.tags?.name || 'Unnamed Hospital';
      return {
        name,
        lat: hLat,
        lng: hLng,
        distanceKm: haversineKm(lat, lng, hLat, hLng),
      };
    }).filter((h: Hospital) => h.lat != null && h.lng != null);

    hospitals.sort((a, b) => a.distanceKm - b.distanceKm);
    return hospitals[0] || null;
  } catch (e) {
    console.warn('[HospitalFinder] Failed to find nearest hospital:', e);
    return null;
  }
}

/**
 * Get hospital name for a location, with fallback
 */
export async function getHospitalName(lat: number, lng: number): Promise<string> {
  const hospital = await findNearestHospital(lat, lng);
  if (hospital) {
    console.log(`[HospitalFinder] Nearest hospital: ${hospital.name} (${hospital.distanceKm.toFixed(1)} km)`);
    return hospital.name;
  }
  return 'Nearest Hospital';
}
