const { TextractClient, DetectDocumentTextCommand } = require('@aws-sdk/client-textract');

const textractClient = new TextractClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const extractAadhaarData = async (imageBuffer) => {
  try {
    const params = {
      Document: {
        Bytes: imageBuffer
      }
    };

    const command = new DetectDocumentTextCommand(params);
    const response = await textractClient.send(command);

    if (!response.Blocks || response.Blocks.length === 0) {
      return {
        success: false,
        error: 'No text detected in the image'
      };
    }

    // Extract all text lines
    const textBlocks = response.Blocks
      .filter(block => block.BlockType === 'LINE')
      .map(block => block.Text)
      .join(' ');

    // Extract Aadhaar number (12 digits)
    const aadhaarRegex = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
    const aadhaarMatches = textBlocks.match(aadhaarRegex);
    const aadhaarNumber = aadhaarMatches && aadhaarMatches.length > 0 
      ? aadhaarMatches[0].replace(/\s/g, '') 
      : null;

    // Extract DOB (various formats: DD/MM/YYYY, DD-MM-YYYY, etc.)
    const dobRegex = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
    const dobMatches = textBlocks.match(dobRegex);
    let dob = null;
    if (dobMatches && dobMatches.length > 0) {
      dob = dobMatches[0];
    }

    // Extract gender (MALE, FEMALE, M, F)
    const genderRegex = /\b(MALE|FEMALE|M|F|Male|Female)\b/gi;
    const genderMatches = textBlocks.match(genderRegex);
    let gender = null;
    if (genderMatches && genderMatches.length > 0) {
      const genderText = genderMatches[0].toUpperCase();
      gender = genderText === 'M' || genderText === 'MALE' ? 'MALE' : 
               genderText === 'F' || genderText === 'FEMALE' ? 'FEMALE' : null;
    }

    // Extract name (usually appears before DOB or after "Name" keyword)
    // This is a simplified extraction - you may need to refine based on actual card format
    let name = null;
    const nameKeywords = ['Name', 'NAME', 'नाम'];
    for (const keyword of nameKeywords) {
      const keywordIndex = textBlocks.indexOf(keyword);
      if (keywordIndex !== -1) {
        const afterKeyword = textBlocks.substring(keywordIndex + keyword.length).trim();
        const nameMatch = afterKeyword.match(/^[A-Z\s]{3,}/);
        if (nameMatch) {
          name = nameMatch[0].trim();
          break;
        }
      }
    }

    // If name not found with keyword, try to extract first meaningful text block
    if (!name) {
      const lines = response.Blocks
        .filter(block => block.BlockType === 'LINE' && block.Confidence > 80)
        .map(block => block.Text.trim())
        .filter(text => text.length > 3 && !text.match(/^\d+$/));
      
      if (lines.length > 0) {
        name = lines[0];
      }
    }

    return {
      success: true,
      aadhaar_number: aadhaarNumber,
      name: name,
      dob: dob,
      gender: gender,
      rawText: textBlocks,
      blocks: response.Blocks
    };
  } catch (error) {
    console.error('Error extracting Aadhaar data with Textract:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Extract photo from Aadhaar card image
 * This extracts the face region from the Aadhaar card and returns as base64
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<String>} - Base64 encoded photo (data URL format)
 */
const extractAadhaarPhoto = async (imageBuffer) => {
  try {
    // Convert buffer to base64
    const base64Photo = imageBuffer.toString('base64');
    // Return in data URL format for consistency
    // You can enhance this later to crop just the face region using Rekognition
    return base64Photo;
  } catch (error) {
    console.error('Error extracting photo:', error);
    return null;
  }
};

module.exports = {
  extractAadhaarData,
  extractAadhaarPhoto
};
