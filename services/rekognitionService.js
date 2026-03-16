const { RekognitionClient, CompareFacesCommand, DetectFacesCommand } = require('@aws-sdk/client-rekognition');

const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const SIMILARITY_THRESHOLD = 80;
const LIVENESS_CONFIDENCE_THRESHOLD = 10;

const detectLiveness = async (imageBase64) => {
  try {
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    const params = {
      Image: {
        Bytes: imageBuffer
      },
      Attributes: ['ALL']
    };

    const command = new DetectFacesCommand(params);
    const response = await rekognitionClient.send(command);

    // Check if at least one face is detected
    if (response.FaceDetails && response.FaceDetails.length > 0) {
      const face = response.FaceDetails[0];
      const confidence = face.Confidence || 0;

      // Check if face quality is good enough
      const quality = face.Quality;
      let brightnessScore = null;
      let sharpnessScore = null;

      if (quality) {
        const brightnessRaw = quality.Brightness;
        const sharpnessRaw = quality.Sharpness;

        brightnessScore = typeof brightnessRaw === 'object' && brightnessRaw !== null
          ? brightnessRaw.Value ?? null
          : brightnessRaw ?? null;

        sharpnessScore = typeof sharpnessRaw === 'object' && sharpnessRaw !== null
          ? sharpnessRaw.Value ?? null
          : sharpnessRaw ?? null;
      }

      const isGoodQuality =
        (brightnessScore === null || brightnessScore > 20) &&
        (sharpnessScore === null || sharpnessScore > 20);

      if (confidence >= LIVENESS_CONFIDENCE_THRESHOLD && isGoodQuality) {
        const responsePayload = {
          success: true,
          isLive: true,
          confidence: confidence,
          quality: {
            ...quality,
            Brightness: brightnessScore ?? quality?.Brightness ?? null,
            Sharpness: sharpnessScore ?? quality?.Sharpness ?? null
          }
        };
        return responsePayload;
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

