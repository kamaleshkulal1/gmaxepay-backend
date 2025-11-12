const { RekognitionClient, CompareFacesCommand, DetectFacesCommand } = require('@aws-sdk/client-rekognition');

const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const SIMILARITY_THRESHOLD = 80;
const LIVENESS_CONFIDENCE_THRESHOLD = 50; // Minimum confidence for face detection

/**
 * Detect liveness by checking if a face is detected in the image
 * This is a basic liveness check - for production, consider using Face Liveness Session API
 * @param {string} imageBase64 - Base64 encoded image
 * @returns {Promise<Object>} - Liveness detection result
 */
const detectLiveness = async (imageBase64) => {
  try {
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    const params = {
      Image: {
        Bytes: imageBuffer
      },
      Attributes: ['ALL'] // Get all face attributes including quality
    };

    const command = new DetectFacesCommand(params);
    const response = await rekognitionClient.send(command);

    // Check if at least one face is detected
    if (response.FaceDetails && response.FaceDetails.length > 0) {
      const face = response.FaceDetails[0];
      const confidence = face.Confidence || 0;
      
      // Check if face quality is good enough
      const quality = face.Quality;
      const isGoodQuality = quality && 
        quality.Brightness && quality.Brightness.Value > 20 &&
        quality.Sharpness && quality.Sharpness.Value > 20;

      if (confidence >= LIVENESS_CONFIDENCE_THRESHOLD && isGoodQuality) {
        return {
          success: true,
          isLive: true,
          confidence: confidence,
          quality: quality
        };
      }
    }

    return {
      success: true,
      isLive: false,
      confidence: 0,
      message: 'No face detected or face quality is too low'
    };
  } catch (error) {
    console.error('Error detecting liveness with AWS Rekognition:', error);
    return {
      success: false,
      isLive: false,
      error: error.message
    };
  }
};

const compareFaces = async (sourceImageBase64, targetImageBase64) => {
  try {
    const sourceBuffer = Buffer.from(sourceImageBase64, 'base64');
    const targetBuffer = Buffer.from(targetImageBase64, 'base64');

    const params = {
      SourceImage: {
        Bytes: sourceBuffer
      },
      TargetImage: {
        Bytes: targetBuffer
      },
      SimilarityThreshold: SIMILARITY_THRESHOLD
    };

    const command = new CompareFacesCommand(params);
    const response = await rekognitionClient.send(command);

    if (response.FaceMatches && response.FaceMatches.length > 0) {
      const bestMatch = response.FaceMatches[0];
      return {
        success: true,
        matched: true,
        similarity: bestMatch.Similarity,
        faceMatch: bestMatch
      };
    }

    return {
      success: true,
      matched: false,
      similarity: 0,
      unmatchedFaces: response.UnmatchedFaces?.length || 0
    };
  } catch (error) {
    console.error('Error comparing faces with AWS Rekognition:', error);
    return {
      success: false,
      matched: false,
      error: error.message
    };
  }
};

module.exports = {
  detectLiveness,
  compareFaces
};

