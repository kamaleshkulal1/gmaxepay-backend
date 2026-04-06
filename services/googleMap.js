const axios = require('axios');

const validateApiKey = () => {
  if (!process.env.GOOGLE_GEOCODING_API_KEY) {
    throw new Error('Google Geocoding API key is not configured. Please set GOOGLE_GEOCODING_API_KEY in environment variables.');
  }
};

const getAddressComponent = (addressComponents, types, shortName = false) => {
  const component = addressComponents.find(comp =>
    types.some(type => comp.types.includes(type))
  );
  return component ? (shortName ? component.short_name : component.long_name) : '';
};

const reverseGeocode = async (latitude, longitude, options = {}) => {
  try {
    validateApiKey();

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

    const result = geocodeResponse.data.results[0];
    const addressComponents = result.address_components || [];

    const doorNumber = getAddressComponent(addressComponents, ['street_number']);
    const streetName = getAddressComponent(addressComponents, ['route']);
    const sublocality = getAddressComponent(addressComponents, ['sublocality', 'sublocality_level_1']);
    const locality = getAddressComponent(addressComponents, ['locality']);
    const city = getAddressComponent(addressComponents, ['administrative_area_level_2']);
    const district = getAddressComponent(addressComponents, ['administrative_area_level_3']);
    const state = getAddressComponent(addressComponents, ['administrative_area_level_1']);
    const postalCode = getAddressComponent(addressComponents, ['postal_code']);
    const country = getAddressComponent(addressComponents, ['country']);

    const addressParts = [];
    if (doorNumber) addressParts.push(doorNumber);
    if (streetName) addressParts.push(streetName);
    if (sublocality) addressParts.push(sublocality);
    if (locality) addressParts.push(locality);
    if (city) addressParts.push(city);
    if (district) addressParts.push(district);
    if (state) addressParts.push(state);
    if (postalCode) addressParts.push(postalCode);
    if (country) addressParts.push(country);

    const addressFromParts = addressParts.join(', ');
    const completeAddress = addressFromParts || result.formatted_address;

    const resultPlusCode = result.plus_code || null;
    const topLevelPlusCode = geocodeResponse.data.plus_code || null;
    const selectedPlusCode = resultPlusCode || topLevelPlusCode;
    const globalCode = selectedPlusCode ? (selectedPlusCode.global_code || '') : '';
    const compoundCode = selectedPlusCode ? (selectedPlusCode.compound_code || '') : '';

    const plusCodeData = {
      global_code: globalCode,
      compound_code: compoundCode,
      plus_code_link: globalCode ? `https://plus.codes/${encodeURIComponent(globalCode)}` : '',
      google_maps_link: globalCode ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(globalCode)}` : ''
    };
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
      address: completeAddress,
      address_components: {
        door_number: doorNumber,
        street_name: streetName,
        street_address: doorNumber && streetName ? `${doorNumber} ${streetName}` : (doorNumber || streetName),
        sublocality: sublocality,
        locality: locality,
        city: city || district,
        district: district,
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
      place_google_maps_link: result.place_id ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(result.place_id)}` : '',
      location_type: result.geometry.location_type,
      place_id: result.place_id
    };
  } catch (error) {
    console.error('Google Maps reverse geocoding error:', error);
    throw error;
  }
};


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
          city: getAddressComponent(addressComponents, ['administrative_area_level_2',]),
          state: getAddressComponent(addressComponents, ['administrative_area_level_3']),
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

