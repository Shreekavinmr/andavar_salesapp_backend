const axios = require('axios');

/**
 * Reverse geocode latitude/longitude into a human-readable address.
 * Uses OpenStreetMap Nominatim API (free).
 */
async function reverseGeocode(latitude, longitude) {
  if (!latitude || !longitude) {
    throw new Error('Latitude and longitude are required for reverse geocoding');
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'YourAppName/1.0' } // Nominatim requires a UA
    });

    return data.display_name || null;
  } catch (err) {
    console.error('Reverse geocode failed:', err.message);
    throw new Error('Reverse geocode failed');
  }
}

module.exports = { reverseGeocode };