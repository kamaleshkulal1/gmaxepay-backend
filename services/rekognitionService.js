const { RekognitionClient, CompareFacesCommand } = require('@aws-sdk/client-rekognition');

const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const SIMILARITY_THRESHOLD = 80;

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
  compareFaces
};

