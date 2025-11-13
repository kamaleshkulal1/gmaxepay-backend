const axios = require('axios');
const FormData = require('form-data');
const apiKey = process.env.LLM_API_KEY;
const apiToken = process.env.LLM_API_TOKEN;
const llmUrl = process.env.LLM_GMAXEPAY;

// ASL AEPS Onboarding
const  llmAadhaarOcr = async (front_image, back_image) => {
    try{
      // Create FormData instance
      const formData = new FormData();
      
      // Append files with their buffers
      // front_image and back_image are multer file objects with buffer property
      formData.append('front_image', front_image.buffer, {
        filename: front_image.originalname || 'front_photo.jpg',
        contentType: front_image.mimetype || 'image/jpeg'
      });
      
      formData.append('back_image', back_image.buffer, {
        filename: back_image.originalname || 'back_photo.jpg',
        contentType: back_image.mimetype || 'image/jpeg'
      });
      
      const response = await axios.post(`${llmUrl}/api/aadhaar/upload`,
          formData, {
        headers: {
          ...formData.getHeaders(),
          'X-API-Key': apiKey,
          'X-API-Token': apiToken
        }
      });
      return response.data;
    } catch (error) {
      console.log("error",error);
      return error.response?.data || { success: false, error: error.message };
    }
  }

  const llmPanVerification = async (panFrontImage) => {
    try{
      // Create FormData instance
      const formData = new FormData();
      
      // Append file with its buffer
      // panFrontImage is a multer file object with buffer property
      formData.append('panFrontImage', panFrontImage.buffer, {
        filename: panFrontImage.originalname || 'front_photo.jpg',
        contentType: panFrontImage.mimetype || 'image/jpeg'
      });
      
      const response = await axios.post(`${llmUrl}/api/pan/upload`,
        formData, {
          headers: {
            ...formData.getHeaders(),
            'X-API-Key': apiKey,
            'X-API-Token': apiToken
          }
        });
      return response.data;
    } catch (error) {
      console.log("error",error);
      return error.response?.data || { success: false, error: error.message };
    }
  } 
module.exports = {
    llmAadhaarOcr,
    llmPanVerification
}