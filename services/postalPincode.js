const axios = require('axios');


const validateApiUrl = () => {
  if (!process.env.POSTAL_PINCODE_URL) {
    throw new Error('Postal Pincode API URL is not configured. Please set POSTAL_PINCODE_URL in environment variables.');
  }
};

const getPincodeByCity = async (city) => {
  try {
    validateApiUrl();

    if (!city || typeof city !== 'string' || city.trim().length === 0) {
      throw new Error('City is required');
    }

    const url = `${process.env.POSTAL_PINCODE_URL}/postoffice/${encodeURIComponent(city.trim())}`;
    const response = await axios.get(url);
    const data = response.data;

    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('No data received from postal pincode API');
    }

    if (data[0].Status === 'Success') {
      return {
        success: true,
        data: data[0].PostOffice
      };
    } else {
      throw new Error('No pincode found for the given city. Try different spelling or district name.');
    }
  } catch (error) {
    console.error('Postal pincode service error (getPincodeByCity):', error);

    // Handle axios errors
    if (error.response) {
      throw new Error(`Postal API error: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`);
    } else if (error.request) {
      throw new Error('Unable to reach postal pincode API. Please check your network connection.');
    }

    throw error;
  }
};

/**
 * Get city details by pincode
 * @param {string|number} pincode - Postal pincode
 * @returns {Promise<object>} City information with post offices
 */
const getCityByPincode = async (pincode) => {
  try {
    validateApiUrl();

    if (!pincode) {
      throw new Error('Pincode is required');
    }

    // Convert to string and validate format (6 digits for India)
    const pincodeStr = String(pincode).trim();
    if (!/^\d{6}$/.test(pincodeStr)) {
      throw new Error('Invalid pincode format. Pincode must be 6 digits.');
    }

    const url = `${process.env.POSTAL_PINCODE_URL}/pincode/${pincodeStr}`;
    const response = await axios.get(url);
    const data = response.data;

    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('No data received from postal pincode API');
    }

    if (data[0].Status === 'Success' && data[0].PostOffice && data[0].PostOffice.length > 0) {
      const postOffices = data[0].PostOffice;

      // Extract unique city/district/state information
      const cityInfo = {
        pincode: postOffices[0].Pincode,
        state: postOffices[0].State,
        district: postOffices[0].District,
        postOffices: postOffices.map(office => ({
          name: office.Name,
          city: office.District,
          state: office.State,
          pincode: office.Pincode,
          division: office.Division,
          region: office.Region,
          circle: office.Circle
        })),
        totalPostOffices: postOffices.length
      };

      return {
        success: true,
        data: cityInfo
      };
    } else {
      throw new Error('Invalid pincode or no data found for the given pincode.');
    }
  } catch (error) {
    console.error('Postal pincode service error (getCityByPincode):', error);

    // Handle axios errors
    if (error.response) {
      throw new Error(`Postal API error: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`);
    } else if (error.request) {
      throw new Error('Unable to reach postal pincode API. Please check your network connection.');
    }

    throw error;
  }
};

module.exports = {
  getPincodeByCity,
  getCityByPincode
};

