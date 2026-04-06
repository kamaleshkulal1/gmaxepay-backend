const axios = require('axios');


const validateApiKey = () => {
  if (!process.env.MAPPLS_API_KEY) {
    throw new Error('Mappls API key is not configured. Please set MAPPLS_API_KEY in environment variables.');
  }
};

const reverseGeocode = async (latitude, longitude, options = {}) => {
  try {
    validateApiKey();

    // Validate coordinates
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      throw new Error('Invalid latitude or longitude format');
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error('Latitude must be between -90 and 90, Longitude must be between -180 and 180');
    }

    const apiKey = process.env.MAPPLS_API_KEY;
    const baseUrl = process.env.MAPPLS_API_URL || 'https://apis.mapmyindia.com';
    const geocodingUrl = `${baseUrl}/advancedmaps/v1/${apiKey}/rev_geocode`;

    const config = {
      method: 'get',
      url: geocodingUrl,
      params: {
        lat: lat,
        lng: lng,
        ...(options.region && { region: options.region }),
        ...(options.lang && { lang: options.lang })
      }
    };

    const geocodeResponse = await axios.request(config);

    if (geocodeResponse.data.responseCode !== 200) {
      throw new Error(
        `Mappls API error: ${geocodeResponse.data.responseCode}. ${geocodeResponse.data.error_message || 'Unknown error'}`
      );
    }

    if (!geocodeResponse.data.results || geocodeResponse.data.results.length === 0) {
      throw new Error('No address found for the given coordinates');
    }

    const result = geocodeResponse.data.results[0];

    const houseNumber = result.houseNumber || '';
    const houseName = result.houseName || '';
    const street = result.street || '';
    const subLocality = result.subLocality || '';
    const subSubLocality = result.subSubLocality || '';
    const locality = result.locality || '';
    const village = result.village || '';
    const city = result.city || '';
    const district = result.district || '';
    const subDistrict = result.subDistrict || '';
    const state = result.state || '';
    const pincode = result.pincode || '';
    const area = result.area || 'India';
    const poi = result.poi || '';

    // Construct the complete address from components
    const addressParts = [];
    if (houseNumber) addressParts.push(houseNumber);
    if (houseName) addressParts.push(houseName);
    if (street) addressParts.push(street);
    if (subSubLocality) addressParts.push(subSubLocality);
    if (subLocality) addressParts.push(subLocality);
    if (locality) addressParts.push(locality);
    if (village) addressParts.push(village);
    if (subDistrict) addressParts.push(subDistrict);
    if (district) addressParts.push(district);
    if (city) addressParts.push(city);
    if (state) addressParts.push(state);
    if (pincode) addressParts.push(`PIN-${pincode}`);
    if (area) addressParts.push(`(${area})`);

    const completeAddress = addressParts.length > 0
      ? addressParts.join(', ')
      : result.formatted_address;

    return {
      formatted_address: result.formatted_address || completeAddress,
      complete_address: completeAddress,
      address: completeAddress,
      address_components: {
        house_number: houseNumber,
        house_name: houseName,
        street: street,
        street_address: (houseNumber || houseName || street) ? `${houseNumber} ${houseName} ${street}`.trim() : '',
        sub_sub_locality: subSubLocality,
        sub_locality: subLocality,
        locality: locality,
        village: village,
        sub_district: subDistrict,
        district: district,
        city: city,
        state: state,
        postal_code: pincode,
        area: area,
        poi: poi,
        poi_distance: result.poi_dist || null
      },
      location: {
        latitude: parseFloat(result.lat) || lat,
        longitude: parseFloat(result.lng) || lng
      },
      coordinates: {
        latitude: parseFloat(result.lat) || lat,
        longitude: parseFloat(result.lng) || lng
      },
      response_code: geocodeResponse.data.responseCode,
      version: geocodeResponse.data.version
    };
  } catch (error) {
    console.error('Mappls reverse geocoding error:', error);
    if (error.response && error.response.data) {
      const errorData = error.response.data;
      const errorMessage =
        errorData.error_description ||
        errorData.error_message ||
        errorData.error ||
        errorData.message ||
        `Mappls API error: ${error.response.status}`;

      const errorCode = errorData.error_code || errorData.responsecode || '';
      const fullErrorMessage = errorCode
        ? `${errorMessage} (${errorCode})`
        : errorMessage;

      throw new Error(fullErrorMessage);
    }
    throw error;
  }
};

module.exports = {
  reverseGeocode
};

