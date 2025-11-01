const axios = require('axios');

/**
 * Validate Google API key is configured
 */
const validateApiKey = () => {
  if (!process.env.GOOGLE_GEOCODING_API_KEY) {
    throw new Error('Google Geocoding API key is not configured. Please set GOOGLE_GEOCODING_API_KEY in environment variables.');
  }
};

/**
 * Helper function to get address component by type
 */
const getAddressComponent = (addressComponents, types, shortName = false) => {
  const component = addressComponents.find(comp => 
    types.some(type => comp.types.includes(type))
  );
  return component ? (shortName ? component.short_name : component.long_name) : '';
};

/**
 * Reverse Geocoding - Convert coordinates to address
 * @param {number} latitude - Latitude coordinate
 * @param {number} longitude - Longitude coordinate
 * @param {object} options - Additional options (result_type, etc.)
 * @returns {Promise<object>} Address information
 */
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

    const geocodingUrl = `${process.env.GOOGLE_GEOCODING_URL}/geocode/json`;
    
    const config = {
      method: 'get',
      url: geocodingUrl,
      params: {
        latlng: `${lat},${lng}`,
        key: `${process.env.GOOGLE_GEOCODING_API_KEY}`,
        result_type: options.result_type || 'street_address|premise|subpremise|street_number|route|sublocality|locality|administrative_area_level_1|administrative_area_level_2|postal_code|country',
        ...options
      }
    };

    const geocodeResponse = await axios.request(config);
    
    if (geocodeResponse.data.status === 'ZERO_RESULTS') {
      throw new Error('No address found for the given coordinates');
    }

    if (geocodeResponse.data.status !== 'OK') {
      throw new Error(
        `Geocoding API error: ${geocodeResponse.data.status}. ${geocodeResponse.data.error_message || 'Unknown error'}`
      );
    }

    // Get the first (most accurate) result
    const result = geocodeResponse.data.results[0];
    const addressComponents = result.address_components || [];
    
    // Extract address components
    const doorNumber = getAddressComponent(addressComponents, ['street_number']);
    const streetName = getAddressComponent(addressComponents, ['route']);
    const sublocality = getAddressComponent(addressComponents, ['sublocality', 'sublocality_level_1']);
    const locality = getAddressComponent(addressComponents, ['locality']);
    const city = getAddressComponent(addressComponents, ['administrative_area_level_2', 'administrative_area_level_3']);
    const state = getAddressComponent(addressComponents, ['administrative_area_level_1']);
    const postalCode = getAddressComponent(addressComponents, ['postal_code']);
    const country = getAddressComponent(addressComponents, ['country']);

    // Construct the complete address
    const addressParts = [];
    if (doorNumber) addressParts.push(doorNumber);
    if (streetName) addressParts.push(streetName);
    if (sublocality) addressParts.push(sublocality);
    if (locality) addressParts.push(locality);
    if (city) addressParts.push(city);
    if (state) addressParts.push(state);
    if (postalCode) addressParts.push(postalCode);
    if (country) addressParts.push(country);

    const completeAddress = addressParts.join(', ');

    // Extract plus code if available
    const plusCode = geocodeResponse.data.plus_code || result.plus_code || null;
    const globalCode = plusCode ? (plusCode.global_code || '') : '';
    const plusCodeData = plusCode ? {
      global_code: globalCode,
      compound_code: plusCode.compound_code || '',
      plus_code_link: globalCode ? `https://plus.codes/${globalCode}` : '',
      google_maps_link: globalCode ? `https://maps.google.com/?q=${encodeURIComponent(globalCode)}` : ''
    } : {
      global_code: '',
      compound_code: '',
      plus_code_link: '',
      google_maps_link: ''
    };

    // Extract exact location bounds/viewport
    const exactLat = result.geometry.location.lat;
    const exactLng = result.geometry.location.lng;
    const exactLocation = {
      coordinates: {
        latitude: exactLat,
        longitude: exactLng
      },
      google_maps_link: `https://maps.google.com/?q=${exactLat},${exactLng}`,
      viewport: result.geometry.viewport ? {
        northeast: {
          latitude: result.geometry.viewport.northeast.lat,
          longitude: result.geometry.viewport.northeast.lng
        },
        southwest: {
          latitude: result.geometry.viewport.southwest.lat,
          longitude: result.geometry.viewport.southwest.lng
        }
      } : null,
      bounds: result.geometry.bounds ? {
        northeast: {
          latitude: result.geometry.bounds.northeast.lat,
          longitude: result.geometry.bounds.northeast.lng
        },
        southwest: {
          latitude: result.geometry.bounds.southwest.lat,
          longitude: result.geometry.bounds.southwest.lng
        }
      } : null
    };

    return {
      formatted_address: result.formatted_address,
      complete_address: completeAddress,
      address_components: {
        door_number: doorNumber,
        street_name: streetName,
        street_address: doorNumber && streetName ? `${doorNumber} ${streetName}` : (doorNumber || streetName),
        sublocality: sublocality,
        locality: locality,
        city: city,
        state: state,
        postal_code: postalCode,
        country: country
      },
      location: {
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng
      },
      exact_location: exactLocation,
      plus_code: plusCodeData,
      location_type: result.geometry.location_type,
      place_id: result.place_id
    };
  } catch (error) {
    console.error('Google Maps reverse geocoding error:', error);
    throw error;
  }
};

/**
 * Forward Geocoding - Convert address to coordinates
 * @param {string} address - Address string
 * @param {object} options - Additional options (region, bounds, etc.)
 * @returns {Promise<object>} Location information with coordinates
 */
const forwardGeocode = async (address, options = {}) => {
  try {
    validateApiKey();

    if (!address || typeof address !== 'string' || address.trim().length === 0) {
      throw new Error('Address is required');
    }

    const geocodingUrl = `${GOOGLE_MAPS_API_URL}/geocode/json`;
    
    const config = {
      method: 'get',
      url: geocodingUrl,
      params: {
        address: address.trim(),
        key: GOOGLE_GEOCODING_API_KEY,
        ...options
      }
    };

    const geocodeResponse = await axios.request(config);
    
    if (geocodeResponse.data.status === 'ZERO_RESULTS') {
      throw new Error('No location found for the given address');
    }

    if (geocodeResponse.data.status !== 'OK') {
      throw new Error(
        `Geocoding API error: ${geocodeResponse.data.status}. ${geocodeResponse.data.error_message || 'Unknown error'}`
      );
    }

    // Return all results
    const results = geocodeResponse.data.results.map(result => {
      const addressComponents = result.address_components || [];
      
      return {
        formatted_address: result.formatted_address,
        location: {
          latitude: result.geometry.location.lat,
          longitude: result.geometry.location.lng
        },
        location_type: result.geometry.location_type,
        place_id: result.place_id,
        types: result.types,
        address_components: {
          door_number: getAddressComponent(addressComponents, ['street_number']),
          street_name: getAddressComponent(addressComponents, ['route']),
          sublocality: getAddressComponent(addressComponents, ['sublocality', 'sublocality_level_1']),
          locality: getAddressComponent(addressComponents, ['locality']),
          city: getAddressComponent(addressComponents, ['administrative_area_level_2', 'administrative_area_level_3']),
          state: getAddressComponent(addressComponents, ['administrative_area_level_1']),
          postal_code: getAddressComponent(addressComponents, ['postal_code']),
          country: getAddressComponent(addressComponents, ['country'])
        }
      };
    });

    return {
      results: results,
      status: geocodeResponse.data.status
    };
  } catch (error) {
    console.error('Google Maps forward geocoding error:', error);
    throw error;
  }
};

module.exports = {
  reverseGeocode,
  forwardGeocode,
  getAddressComponent
};

