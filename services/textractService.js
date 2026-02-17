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
      // Handle formats: XXXX XXXX XXXX, XXXX.XXXX XXXX, XXXX.XXXX.XXXX, etc.
      // Match 12 digits with any combination of spaces/dots anywhere - remove all dots
      const aadhaarRegexStandard = /\b\d{4}[\s.]+\d{4}[\s.]+\d{4}\b/g;
      const standardMatches = lineText.match(aadhaarRegexStandard);
      if (standardMatches) {
        standardMatches.forEach(match => {
          // Remove all spaces and dots, extract only digits
          const digits = match.replace(/[\s.]/g, '');
          if (digits.length === 12) {
            lineBlockCandidates.push({
              number: digits,
              confidence: block.confidence,
              source: 'line_block'
            });
          }
        });
      }
      
      // Also try flexible pattern for cases where dots/spaces appear in different positions
      // Match sequences of 2-4 digits separated by spaces/dots, that could form 12 digits
      const aadhaarRegexFlexible = /\b(?:\d{2,4}[\s.]+){2,4}\d{2,4}\b/g;
      const flexibleMatches = lineText.match(aadhaarRegexFlexible);
      if (flexibleMatches) {
        flexibleMatches.forEach(match => {
          // Remove all spaces and dots, extract only digits
          const digits = match.replace(/[\s.]/g, '');
          if (digits.length === 12 && !lineBlockCandidates.find(c => c.number === digits)) {
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
    // First try standard 4-4-4 pattern format (most common)
    const aadhaarRegexStandard = /\b\d{4}[\s.]+\d{4}[\s.]+\d{4}\b/g;
    let aadhaarMatches = textBlocks.match(aadhaarRegexStandard);
    
    // If not found, try flexible pattern for cases where dots/spaces appear in different positions
    if (!aadhaarMatches || aadhaarMatches.length === 0) {
      const aadhaarRegexFlexible = /\b(?:\d{2,4}[\s.]+){2,4}\d{2,4}\b/g;
      aadhaarMatches = textBlocks.match(aadhaarRegexFlexible);
    }
    
    // If not found, try without spaces/dots (12 consecutive digits)
    if (!aadhaarMatches || aadhaarMatches.length === 0) {
      const aadhaarRegexNoSpaces = /\b\d{12}\b/g;
      aadhaarMatches = textBlocks.match(aadhaarRegexNoSpaces);
    }
    
    // Combine line block candidates with full text matches
    if (aadhaarMatches) {
      aadhaarMatches.forEach(match => {
        // Remove all spaces and dots, extract only digits
        const digits = match.replace(/[\s.]/g, '');
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

      if (lineBlockCandidates.length > validCandidates.length) {
        const filtered = lineBlockCandidates.filter(c => !validCandidates.find(v => v.number === c.number));
      }

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
      } else {
        console.log(`[Textract Debug] No valid candidates after filtering`);
      }
    } else {
      console.log(`[Textract Debug] No Aadhaar candidates found in image`);
    }
    

    let dob = null;
    const dobKeywords = ['DOB', 'dob', 'Date of Birth', 'date of birth', 'जन्म दिनांक', 'जन्मदिनांक', 'Date Of Birth'];
    const excludeDateKeywords = ['Download Date', 'download date', 'Issue Date', 'issue date', 'Download', 'Issue'];
    
    // First, find all dates in the text
    const dobRegex = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
    const allDates = [];
    let match;
    while ((match = dobRegex.exec(textBlocks)) !== null) {
      const dateStr = match[0];
      const dateIndex = match.index;
      
      // Get context around the date (50 chars before and after)
      const contextStart = Math.max(0, dateIndex - 50);
      const contextEnd = Math.min(textBlocks.length, dateIndex + dateStr.length + 50);
      const context = textBlocks.substring(contextStart, contextEnd).toLowerCase();
      
      // Check if this date is associated with excluded keywords
      const isExcluded = excludeDateKeywords.some(keyword => 
        context.includes(keyword.toLowerCase())
      );
      
      // Check if this date is associated with DOB keywords
      const isDobDate = dobKeywords.some(keyword => 
        context.includes(keyword.toLowerCase())
      );
      
      if (isDobDate && !isExcluded) {
        dob = dateStr;
        break; // Found the DOB, stop searching
      } else if (!isExcluded && !dob) {
        // If no DOB keyword found but date is not excluded, store as potential DOB
        // (fallback if DOB keyword is not detected)
        allDates.push({ date: dateStr, index: dateIndex, context });
      }
    }
    
    // If DOB not found with keywords, try to find date that's not near excluded keywords
    if (!dob && allDates.length > 0) {
      // Filter out dates that are near excluded keywords
      const validDates = allDates.filter(dateInfo => {
        const contextLower = dateInfo.context.toLowerCase();
        return !excludeDateKeywords.some(keyword => 
          contextLower.includes(keyword.toLowerCase())
        );
      });
      
      if (validDates.length > 0) {
        // Take the first valid date that's not excluded
        dob = validDates[0].date;
      }
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

    // Extract name - skip header text like "Government of India"
    let name = null;
    const excludeNamePatterns = [
      'government of india',
      'भारत सरकार',
      'भारत सरकार government of india',
      'government',
      'india',
      'aadhaar',
      'आधार',
      'enrolment',
      'my aadhaar',
      'my identity',
      'नನ್ನ ಆಧಾರ್',
      'ನನ್ನ ಗುರುತು'
    ];
    
    // First, try to find name using keywords
    const nameKeywords = ['Name', 'NAME', 'नाम', 'ಹೆಸರು'];
    for (const keyword of nameKeywords) {
      const keywordIndex = textBlocks.indexOf(keyword);
      if (keywordIndex !== -1) {
        const afterKeyword = textBlocks.substring(keywordIndex + keyword.length).trim();
        // Match name pattern: letters, spaces, and common name characters
        const nameMatch = afterKeyword.match(/^([A-Z][A-Za-z\s\.]{2,})/);
        if (nameMatch) {
          const candidateName = nameMatch[0].trim();
          // Check if it's not an excluded pattern
          const isExcluded = excludeNamePatterns.some(pattern => 
            candidateName.toLowerCase().includes(pattern.toLowerCase())
          );
          if (!isExcluded) {
            name = candidateName;
            break;
          }
        }
      }
    }

    // If name not found with keyword, try to extract from line blocks
    // Skip header text and look for person's name
    if (!name) {
      const lines = response.Blocks
        .filter(block => block.BlockType === 'LINE' && block.Confidence > 70)
        .map(block => ({
          text: block.Text.trim(),
          confidence: block.Confidence,
          geometry: block.Geometry
        }))
        .filter(block => {
          const text = block.text.toLowerCase();
          const originalText = block.text;
          
          // Filter out:
          // - Pure numbers
          // - Excluded patterns
          // - Very short text
          // - Text that looks like dates or Aadhaar numbers
          if (originalText.match(/^\d+$/) || originalText.length < 3) return false;
          if (originalText.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/)) return false;
          if (originalText.match(/^\d{4}\s+\d{4}\s+\d{4}$/)) return false;
          
          // Filter out excluded patterns
          if (excludeNamePatterns.some(pattern => text.includes(pattern))) return false;
          
          // Explicitly filter out "Government of India" and variations
          if (text.includes('government') && text.includes('india')) return false;
          if (text.includes('भारत') && text.includes('सरकार')) return false;

          if (originalText === originalText.toUpperCase() && originalText.length > 15) return false;
          
          // Filter out text that contains only common words (likely not a name)
          const commonWords = ['of', 'the', 'and', 'or', 'to', 'in', 'on', 'at', 'for', 'with'];
          const words = text.split(/\s+/);
          if (words.length > 1 && words.every(word => commonWords.includes(word))) return false;
          
          // Filter out text that starts with common header words
          const headerStartWords = ['government', 'भारत', 'india', 'aadhaar', 'आधार'];
          if (headerStartWords.some(word => text.startsWith(word))) return false;
          
          return true;
        })
        .sort((a, b) => b.confidence - a.confidence); 
      if (lines.length > 0) {
        // Look for lines that contain letters and spaces (likely names)
        const nameCandidates = lines.filter(block => {
          const text = block.text;
          if (text === text.toUpperCase() && text.length > 20) return false;
          
          return /^[A-Z][A-Za-z\s\.]{2,}$/.test(text) && text.length >= 3 && text.length <= 50;
        });
        
        if (nameCandidates.length > 0) {
          // Prefer names that appear before DOB or near Aadhaar number
          const aadhaarIndex = aadhaarNumber ? textBlocks.indexOf(aadhaarNumber) : -1;
          const dobIndex = dob ? textBlocks.indexOf(dob) : -1;
          
          for (const candidate of nameCandidates) {
            const candidateIndex = textBlocks.indexOf(candidate.text);
            
            // If we have Aadhaar number, prefer name that appears before it
            if (aadhaarIndex !== -1 && candidateIndex < aadhaarIndex) {
              name = candidate.text;
              break;
            }
            
            // If we have DOB, prefer name that appears before it
            if (dobIndex !== -1 && candidateIndex < dobIndex) {
              name = candidate.text;
              break;
            }
          }
          
          // If still no name, take the first valid candidate
          if (!name && nameCandidates.length > 0) {
            name = nameCandidates[0].text;
          }
        }
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

const extractPanData = async (imageBuffer) => {
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

    // Extract PAN number - format: 5 letters, 4 digits, 1 letter (e.g., ABCDE1234F)
    // PAN can appear with or without spaces, and may have OCR errors
    let panNumber = null;
    
    // More flexible patterns to handle OCR errors and various formats
    const panPatterns = [
      /\b[A-Z]{5}\s?\d{4}\s?[A-Z]\b/g,           // With optional spaces: ABCDE 1234 F or ABCDE1234F
      /\b[A-Z]{5}\d{4}[A-Z]\b/g,                 // Without spaces: ABCDE1234F
      /[A-Z]{5}[\s\-]?\d{4}[\s\-]?[A-Z]/g,        // With hyphens or spaces: ABCDE-1234-F
      /[A-Z0-9]{5}\d{4}[A-Z]/g                   // More lenient (handles OCR errors like 0 for O)
    ];

    const panCandidates = [];
    
    // Helper function to clean and validate PAN
    const cleanAndValidatePan = (text) => {
      // Remove all spaces, hyphens, and special characters
      let cleaned = text.replace(/[\s\-\.\_]/g, '').toUpperCase();
      
      // Fix common OCR errors: 0 -> O, 1 -> I, 5 -> S (but be careful with digits)
      // Only fix in letter positions (first 5 and last 1)
      if (cleaned.length === 10) {
        const firstFive = cleaned.substring(0, 5);
        const digits = cleaned.substring(5, 9);
        const lastOne = cleaned.substring(9);
        
        // Fix common OCR errors in letter positions only
        const fixedFirstFive = firstFive.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S');
        const fixedLastOne = lastOne.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S');
        cleaned = fixedFirstFive + digits + fixedLastOne;
      }
      
      // Validate format
      if (cleaned.length === 10 && /^[A-Z]{5}\d{4}[A-Z]$/.test(cleaned)) {
        return cleaned;
      }
      return null;
    };
    
    // Search in line blocks first (more accurate)
    lineBlocks.forEach(block => {
      const lineText = block.text;
      const lowerText = lineText.toLowerCase();
      
      // Skip lines that contain date keywords or other non-PAN text
      if (lowerText.includes('date') || lowerText.includes('issue') || 
          lowerText.includes('download') || lowerText.includes('qr')) {
        return;
      }
      
      // Try to find PAN in this line with all patterns
      panPatterns.forEach(pattern => {
        const matches = lineText.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const cleanedPan = cleanAndValidatePan(match);
            if (cleanedPan) {
              // Avoid duplicates
              if (!panCandidates.find(c => c.pan === cleanedPan)) {
                panCandidates.push({
                  pan: cleanedPan,
                  confidence: block.confidence,
                  source: 'line_block'
                });
              }
            }
          });
        }
      });
    });

    // Also search in full text blocks (more lenient search)
    panPatterns.forEach(pattern => {
      const matches = textBlocks.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleanedPan = cleanAndValidatePan(match);
          if (cleanedPan && !panCandidates.find(c => c.pan === cleanedPan)) {
            panCandidates.push({
              pan: cleanedPan,
              confidence: 0,
              source: 'full_text'
            });
          }
        });
      }
    });
    
    // If still no PAN found, try a more aggressive search without word boundaries
    if (panCandidates.length === 0) {
      const aggressivePattern = /[A-Z0-9]{5}[\s\-]?\d{1,4}[\s\-]?[A-Z0-9]{1}/g;
      const matches = textBlocks.match(aggressivePattern);
      if (matches) {
        matches.forEach(match => {
          const cleanedPan = cleanAndValidatePan(match);
          if (cleanedPan && !panCandidates.find(c => c.pan === cleanedPan)) {
            panCandidates.push({
              pan: cleanedPan,
              confidence: 0,
              source: 'aggressive_search'
            });
          }
        });
      }
    }
    
    // Special handling: Look for PAN near "Permanent Account Number" keyword
    // This handles cases where PAN is split like "DUBP K7528H" -> "DUBPK7528H"
    if (panCandidates.length === 0) {
      const panKeywordIndex = textBlocks.toLowerCase().indexOf('permanent account number');
      if (panKeywordIndex !== -1) {
        // Extract text after "Permanent Account Number" (up to 40 characters to catch split PANs)
        const afterKeyword = textBlocks.substring(
          panKeywordIndex + 'permanent account number'.length, 
          panKeywordIndex + 'permanent account number'.length + 40
        ).trim();
        
        // Pattern to catch "DUBP K7528H" or similar splits
        // Matches: 4-5 letters, space(s), then letter+digits+letter or digits+letter
        const splitPanPatterns = [
          /([A-Z]{4,5})\s+([A-Z]?\d{4}[A-Z])/i,  // "DUBP K7528H" or "ABCDE 1234F"
          /([A-Z]{4,5})\s+(\d{4}[A-Z])/i,         // "DUBP 7528H"
          /([A-Z]{5})\s+(\d{4}[A-Z])/i            // "ABCDE 1234F"
        ];
        
        for (const pattern of splitPanPatterns) {
          const match = afterKeyword.match(pattern);
          if (match) {
            const part1 = match[1].toUpperCase();
            const part2 = match[2].toUpperCase().replace(/\s/g, '');
            const reconstructed = part1 + part2;
            
            if (reconstructed.length === 10) {
              const cleanedPan = cleanAndValidatePan(reconstructed);
              if (cleanedPan && !panCandidates.find(c => c.pan === cleanedPan)) {
                panCandidates.push({
                  pan: cleanedPan,
                  confidence: 60, // High confidence for keyword-based reconstruction
                  source: 'keyword_reconstruction'
                });
                break; // Found valid PAN, no need to try other patterns
              }
            }
          }
        }
        
        // Also try direct extraction: remove all spaces and look for PAN pattern
        const noSpaces = afterKeyword.replace(/\s/g, '');
        const directPanMatch = noSpaces.match(/([A-Z]{5}\d{4}[A-Z])/i);
        if (directPanMatch) {
          const cleanedPan = cleanAndValidatePan(directPanMatch[1]);
          if (cleanedPan && !panCandidates.find(c => c.pan === cleanedPan)) {
            panCandidates.push({
              pan: cleanedPan,
              confidence: 55,
              source: 'direct_keyword_extraction'
            });
          }
        }
      }
    }
    
    // Final fallback: Look for any pattern that could be a PAN when spaces are removed
    // This specifically handles "DUBP K7528H" -> "DUBPK7528H"
    if (panCandidates.length === 0) {
      // Pattern: 4-5 letters, space, then rest (digit+letter or letter+digit+letter)
      const fallbackPattern = /\b([A-Z]{4,5})\s+([A-Z]?\d{1,4}[A-Z])\b/gi;
      const fallbackMatches = textBlocks.matchAll(fallbackPattern);
      
      for (const match of fallbackMatches) {
        const part1 = match[1].toUpperCase();
        const part2 = match[2].toUpperCase().replace(/\s/g, '');
        const combined = part1 + part2;
        
        // Check if combined could be a valid PAN
        if (combined.length === 10) {
          const cleanedPan = cleanAndValidatePan(combined);
          if (cleanedPan && !panCandidates.find(c => c.pan === cleanedPan)) {
            panCandidates.push({
              pan: cleanedPan,
              confidence: 30,
              source: 'fallback_reconstruction'
            });
          }
        } else if (combined.length === 9 || combined.length === 11) {
          // Try to extract valid PAN from it
          const panMatch = combined.match(/([A-Z]{5}\d{4}[A-Z])/);
          if (panMatch) {
            const cleanedPan = cleanAndValidatePan(panMatch[1]);
            if (cleanedPan && !panCandidates.find(c => c.pan === cleanedPan)) {
              panCandidates.push({
                pan: cleanedPan,
                confidence: 30,
                source: 'fallback_reconstruction'
              });
            }
          }
        }
      }
    }

    // Select the best PAN candidate
    if (panCandidates.length > 0) {
      if (panCandidates.length === 1) {
        panNumber = panCandidates[0].pan;
      } else {
        // Score candidates based on context and confidence
        const scoredCandidates = panCandidates.map(candidate => {
          const pan = candidate.pan;
          const matchIndex = textBlocks.indexOf(pan);
          const context = textBlocks.substring(Math.max(0, matchIndex - 50), matchIndex + 50).toLowerCase();
          let score = 0;
          
          // Add confidence score
          score += candidate.confidence / 10;
          
          // Higher score if it came from line block
          if (candidate.source === 'line_block') {
            score += 15;
          }
          
          // Higher score if it appears near "PAN" or "Permanent Account Number" keywords
          if (context.includes('pan') || context.includes('permanent account number') || 
              context.includes('स्थायी लेखा संख्या')) {
            score += 20;
          }
          
          // Lower score if it appears near date keywords
          if (context.includes('date') || context.includes('issue') || context.includes('download')) {
            score -= 15;
          }
          
          return { candidate: pan, score };
        });
        
        // Sort by score (highest first) and take the best one
        scoredCandidates.sort((a, b) => b.score - a.score);
        panNumber = scoredCandidates[0].candidate;
      }
    }

    // Extract DOB (various formats: DD/MM/YYYY, DD-MM-YYYY, etc.)
    let dob = null;
    const dobKeywords = ['DOB', 'dob', 'Date of Birth', 'date of birth', 'जन्म की तारीख', 'Date Of Birth'];
    const excludeDateKeywords = ['Download Date', 'download date', 'Issue Date', 'issue date', 'Download', 'Issue'];
    
    const dobRegex = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
    const allDates = [];
    let match;
    while ((match = dobRegex.exec(textBlocks)) !== null) {
      const dateStr = match[0];
      const dateIndex = match.index;
      
      const contextStart = Math.max(0, dateIndex - 50);
      const contextEnd = Math.min(textBlocks.length, dateIndex + dateStr.length + 50);
      const context = textBlocks.substring(contextStart, contextEnd).toLowerCase();
      
      const isExcluded = excludeDateKeywords.some(keyword => 
        context.includes(keyword.toLowerCase())
      );
      
      const isDobDate = dobKeywords.some(keyword => 
        context.includes(keyword.toLowerCase())
      );
      
      if (isDobDate && !isExcluded) {
        dob = dateStr;
        break;
      } else if (!isExcluded && !dob) {
        allDates.push({ date: dateStr, index: dateIndex, context });
      }
    }
    
    if (!dob && allDates.length > 0) {
      const validDates = allDates.filter(dateInfo => {
        const contextLower = dateInfo.context.toLowerCase();
        return !excludeDateKeywords.some(keyword => 
          contextLower.includes(keyword.toLowerCase())
        );
      });
      
      if (validDates.length > 0) {
        dob = validDates[0].date;
      }
    }

    // Extract name - skip header text like "Government of India", "Income Tax Department"
    let name = null;
    const excludeNamePatterns = [
      'government of india',
      'भारत सरकार',
      'income tax department',
      'आयकर विभाग',
      'permanent account number',
      'स्थायी लेखा संख्या',
      'pan card',
      'pan application',
      'digitally signed',
      'card not valid'
    ];
    
    // First, try to find name using keywords
    const nameKeywords = ['Name', 'NAME', 'नाम'];
    for (const keyword of nameKeywords) {
      const keywordIndex = textBlocks.indexOf(keyword);
      if (keywordIndex !== -1) {
        const afterKeyword = textBlocks.substring(keywordIndex + keyword.length).trim();
        const nameMatch = afterKeyword.match(/^([A-Z][A-Za-z\s\.]{2,})/);
        if (nameMatch) {
          const candidateName = nameMatch[0].trim();
          const isExcluded = excludeNamePatterns.some(pattern => 
            candidateName.toLowerCase().includes(pattern.toLowerCase())
          );
          if (!isExcluded) {
            name = candidateName;
            break;
          }
        }
      }
    }

    // If name not found with keyword, try to extract from line blocks
    if (!name) {
      const lines = response.Blocks
        .filter(block => block.BlockType === 'LINE' && block.Confidence > 70)
        .map(block => ({
          text: block.Text.trim(),
          confidence: block.Confidence,
          geometry: block.Geometry
        }))
        .filter(block => {
          const text = block.text.toLowerCase();
          const originalText = block.text;
          
          if (originalText.match(/^\d+$/) || originalText.length < 3) return false;
          if (originalText.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/)) return false;
          if (originalText.match(/^[A-Z]{5}\d{4}[A-Z]$/)) return false; // PAN number
          
          if (excludeNamePatterns.some(pattern => text.includes(pattern))) return false;
          
          if (text.includes('government') && text.includes('india')) return false;
          if (text.includes('income') && text.includes('tax')) return false;
          
          if (originalText === originalText.toUpperCase() && originalText.length > 20) return false;
          
          const commonWords = ['of', 'the', 'and', 'or', 'to', 'in', 'on', 'at', 'for', 'with'];
          const words = text.split(/\s+/);
          if (words.length > 1 && words.every(word => commonWords.includes(word))) return false;
          
          const headerStartWords = ['government', 'भारत', 'india', 'income', 'tax', 'pan', 'permanent'];
          if (headerStartWords.some(word => text.startsWith(word))) return false;
          
          return true;
        })
        .sort((a, b) => b.confidence - a.confidence);
      
      if (lines.length > 0) {
        const nameCandidates = lines.filter(block => {
          const text = block.text;
          if (text === text.toUpperCase() && text.length > 20) return false;
          return /^[A-Z][A-Za-z\s\.]{2,}$/.test(text) && text.length >= 3 && text.length <= 50;
        });
        
        if (nameCandidates.length > 0) {
          const panIndex = panNumber ? textBlocks.indexOf(panNumber) : -1;
          const dobIndex = dob ? textBlocks.indexOf(dob) : -1;
          
          for (const candidate of nameCandidates) {
            const candidateIndex = textBlocks.indexOf(candidate.text);
            
            if (panIndex !== -1 && candidateIndex < panIndex) {
              name = candidate.text;
              break;
            }
            
            if (dobIndex !== -1 && candidateIndex < dobIndex) {
              name = candidate.text;
              break;
            }
          }
          
          if (!name && nameCandidates.length > 0) {
            name = nameCandidates[0].text;
          }
        }
      }
    }

    return {
      success: true,
      pan_number: panNumber,
      name: name,
      dob: dob,
      rawText: textBlocks,
      blocks: response.Blocks
    };
  } catch (error) {
    console.error('Error extracting PAN data with Textract:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const extractPanPhoto = async (imageBuffer) => {
  try {
    // Convert buffer to base64
    const base64Photo = imageBuffer.toString('base64');
    // Return in data URL format for consistency
    // You can enhance this later to crop just the face region using Rekognition
    return base64Photo;
  } catch (error) {
    console.error('Error extracting PAN photo:', error);
    return null;
  }
};

module.exports = {
  extractAadhaarData,
  extractAadhaarPhoto,
  extractPanData,
  extractPanPhoto
};
