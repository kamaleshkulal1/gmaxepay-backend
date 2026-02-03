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

    // Extract all text lines with their block information
    const lineBlocks = response.Blocks
      .filter(block => block.BlockType === 'LINE')
      .map(block => ({
        text: block.Text,
        confidence: block.Confidence || 0,
        geometry: block.Geometry
      }));

    const textBlocks = lineBlocks.map(block => block.text).join(' ');

    // First, extract and mark date patterns to exclude them from Aadhaar extraction
    // Extract dates in various formats (DD/MM/YYYY, DD-MM-YYYY, etc.)
    const datePatterns = [
      /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/g,  // DD/MM/YYYY or DD-MM-YYYY
      /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/g,  // YYYY/MM/DD or YYYY-MM-DD
    ];
    
    const dates = [];
    datePatterns.forEach(pattern => {
      const matches = textBlocks.match(pattern);
      if (matches) dates.push(...matches);
    });

    // Extract Aadhaar number (12 digits) - improved logic
    // First, try to find numbers in individual line blocks (more accurate)
    const lineBlockCandidates = [];
    lineBlocks.forEach(block => {
      const lineText = block.text;
      // Skip lines that contain date keywords
      const lowerText = lineText.toLowerCase();
      if (lowerText.includes('date') || lowerText.includes('issue') || lowerText.includes('download')) {
        return; // Skip this line
      }
      
      // Try to find Aadhaar number in this line
      const aadhaarRegexWithSpaces = /\b\d{4}\s+\d{4}\s+\d{4}\b/g;
      const matches = lineText.match(aadhaarRegexWithSpaces);
      if (matches) {
        matches.forEach(match => {
          const digits = match.replace(/\s/g, '');
          if (digits.length === 12) {
            lineBlockCandidates.push({
              number: digits,
              confidence: block.confidence,
              source: 'line_block'
            });
          }
        });
      }
    });

    // Also search in full text blocks
    // First, try to find numbers in the format XXXX XXXX XXXX (with spaces) - most common format
    const aadhaarRegexWithSpaces = /\b\d{4}\s+\d{4}\s+\d{4}\b/g;
    let aadhaarMatches = textBlocks.match(aadhaarRegexWithSpaces);
    
    // If not found, try without spaces
    if (!aadhaarMatches || aadhaarMatches.length === 0) {
      const aadhaarRegexNoSpaces = /\b\d{12}\b/g;
      aadhaarMatches = textBlocks.match(aadhaarRegexNoSpaces);
    }
    
    // If still not found, try flexible pattern
    if (!aadhaarMatches || aadhaarMatches.length === 0) {
      const aadhaarRegexFlexible = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
      aadhaarMatches = textBlocks.match(aadhaarRegexFlexible);
    }
    
    // Combine line block candidates with full text matches
    if (aadhaarMatches) {
      aadhaarMatches.forEach(match => {
        const digits = match.replace(/\s/g, '');
        if (digits.length === 12 && !lineBlockCandidates.find(c => c.number === digits)) {
          lineBlockCandidates.push({
            number: digits,
            confidence: 0,
            source: 'full_text'
          });
        }
      });
    }
    
    // Use lineBlockCandidates as aadhaarMatches for filtering
    aadhaarMatches = lineBlockCandidates.map(c => {
      // Reconstruct the match with spaces if it was from line block
      return c.number.match(/.{1,4}/g)?.join(' ') || c.number;
    });

    let aadhaarNumber = null;
    
    if (lineBlockCandidates.length > 0) {
      // Filter out invalid Aadhaar numbers
      const validCandidates = lineBlockCandidates
        .filter(candidate => {
          const num = candidate.number;
          // Must be exactly 12 digits
          if (num.length !== 12) return false;
          
          // STRICT: Filter out numbers that start with year patterns (19XX or 20XX)
          // Aadhaar numbers never start with years
          const firstFour = num.substring(0, 4);
          if (firstFour >= '1900' && firstFour <= '2099') {
            return false; // Definitely a date component, reject it
          }
          
          // Filter out numbers that end with year patterns and are near date formats
          const lastFour = num.substring(8, 12);
          if (lastFour >= '1900' && lastFour <= '2099') {
            // Check if this number is part of a date pattern
            const matchIndex = textBlocks.indexOf(num);
            if (matchIndex !== -1) {
              const beforeMatch = textBlocks.substring(Math.max(0, matchIndex - 15), matchIndex);
              const afterMatch = textBlocks.substring(matchIndex + num.length, matchIndex + num.length + 15);
              const context = (beforeMatch + afterMatch).toLowerCase();
              
              // If surrounded by date separators, it's likely part of a date
              if (context.match(/[\/\-]\d{12}[\/\-]/) || context.match(/\d{1,2}[\/\-]\d{12}/)) {
                return false;
              }
            }
          }
          
          // Check if the number appears within any extracted date
          const isPartOfDate = dates.some(date => {
            const dateDigits = date.replace(/[\/\-]/g, '');
            return dateDigits.includes(num) || num.includes(dateDigits.substring(0, 8));
          });
          
          if (isPartOfDate) return false;
          
          return true;
        });

      // If we have valid candidates, score and select the best one
      if (validCandidates.length > 0) {
        if (validCandidates.length === 1) {
          aadhaarNumber = validCandidates[0].number;
        } else {
          // Score candidates based on context, position, and confidence
          const scoredCandidates = validCandidates.map(candidate => {
            const num = candidate.number;
            const matchIndex = textBlocks.indexOf(num);
            const context = textBlocks.substring(Math.max(0, matchIndex - 50), matchIndex + 50).toLowerCase();
            let score = 0;
            
            // Add confidence score (higher confidence = better)
            score += candidate.confidence / 10;
            
            // Higher score if it came from line block (more accurate)
            if (candidate.source === 'line_block') {
              score += 15;
            }
            
            // Higher score if it appears near "Aadhaar" or similar keywords
            if (context.includes('aadhaar') || context.includes('आधार') || context.includes('enrolment')) {
              score += 20;
            }
            
            // Lower score if it appears near date keywords
            if (context.includes('date') || context.includes('issue') || context.includes('download')) {
              score -= 15;
            }
            
            // Prefer numbers in XXXX XXXX XXXX format (with spaces)
            const originalMatch = aadhaarMatches.find(m => m.replace(/\s/g, '') === num);
            if (originalMatch && originalMatch.includes(' ')) {
              score += 10;
            }
            
            // Lower score if it starts with year-like patterns (shouldn't happen after filtering, but just in case)
            if (num.startsWith('19') || num.startsWith('20')) {
              score -= 20;
            }
            
            return { candidate: num, score };
          });
          
          // Sort by score (highest first) and take the best one
          scoredCandidates.sort((a, b) => b.score - a.score);
          aadhaarNumber = scoredCandidates[0].candidate;
        }
      }
    }

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
