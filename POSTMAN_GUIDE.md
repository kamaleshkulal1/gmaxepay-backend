# Postman Guide: Upload Aadhar Documents

## Endpoint
`POST /api/company/:token/uploadAadharDocuments`

## Field Names Required
- **`front_photo`** - Front side of Aadhar card (NO SPACES before or after)
- **`back_photo`** - Back side of Aadhar card (NO SPACES before or after)

## Step-by-Step Instructions for Postman

### 1. Set Request Method and URL
- Method: **POST**
- URL: `http://your-domain.com/api/company/YOUR_TOKEN/uploadAadharDocuments`
- Replace `YOUR_TOKEN` with the actual onboarding token

### 2. Configure Body
1. Click on the **Body** tab
2. Select **form-data** (NOT x-www-form-urlencoded, NOT raw)
3. You will see key-value pairs

### 3. Add Files (IMPORTANT - Follow Exactly)

#### For front_photo:
1. Click **"Key"** field
2. Type exactly: `front_photo` (NO SPACES before or after)
3. Click on the dropdown next to the key field (it says "Text" by default)
4. Select **"File"** from the dropdown
5. Click **"Select Files"** button
6. Choose the front photo image file
7. **VERIFY**: The key should show exactly `front_photo` with no spaces

#### For back_photo:
1. Click **"Key"** field in a new row
2. Type exactly: `back_photo` (NO SPACES before or after)
3. Click on the dropdown next to the key field
4. Select **"File"** from the dropdown
5. Click **"Select Files"** button
6. Choose the back photo image file
7. **VERIFY**: The key should show exactly `back_photo` with no spaces

### 4. Set Headers (Auto-set by Postman)
- Postman automatically sets `Content-Type: multipart/form-data` when you use form-data
- **DO NOT** manually set `Content-Type` header - Postman will add the boundary automatically

### 5. Send Request
- Click **Send** button
- Check the response

## Common Mistakes to Avoid

### ❌ WRONG:
```
Key: " front_photo"  (space before)
Key: "front_photo "  (space after)
Key: "front photo"   (space in middle)
Key: "Front_Photo"   (wrong case)
Key: "frontPhoto"    (camelCase)
Key: "documents"     (wrong field name)
```

### ✅ CORRECT:
```
Key: "front_photo"   (exact match, no spaces)
Key: "back_photo"    (exact match, no spaces)
```

## Visual Guide

```
┌─────────────────────────────────────────┐
│ Body Tab → form-data                    │
├─────────────────────────────────────────┤
│ KEY          │ VALUE  │ TYPE            │
├─────────────────────────────────────────┤
│ front_photo  │ [File] │ File ▼         │
│ back_photo   │ [File] │ File ▼         │
└─────────────────────────────────────────┘
```

## Field Names Explanation

### Why `front_photo` and `back_photo`?
- These are the **exact field names** defined in the backend route configuration
- The backend uses `uploadFields([{ name: 'front_photo' }, { name: 'back_photo' }])`
- Multer (the file upload middleware) matches field names **exactly** (case-sensitive, space-sensitive)
- Any deviation (spaces, wrong case, wrong name) will result in "Unexpected file field" error

## Testing Tips

1. **Double-check field names**: After typing, verify there are no spaces
2. **Use copy-paste**: Copy `front_photo` and `back_photo` directly to avoid typos
3. **Check file type**: Only image files are allowed (jpeg, jpg, png, gif, webp)
4. **File size**: Maximum 10MB per file
5. **Both files required**: You must upload both front_photo and back_photo

## Example cURL Command

```bash
curl -X POST \
  'http://your-domain.com/api/company/YOUR_TOKEN/uploadAadharDocuments' \
  -F 'front_photo=@/path/to/front.jpg' \
  -F 'back_photo=@/path/to/back.jpg'
```

## Response Format

### Success:
```json
{
  "status": "SUCCESS",
  "message": "Aadhar documents processed successfully",
  "data": {
    "aadhaar_number": "1234 5678 9012",
    "photo": "base64_encoded_photo",
    "dob": "01/01/1990"
  }
}
```

### Error (Field Name Issue):
```json
{
  "status": "FAILURE",
  "message": "Unexpected file field \" front_photo\". The field name \" front_photo\" has extra spaces. Use \"front_photo\" instead (no leading/trailing spaces).",
  "receivedField": " front_photo",
  "trimmedField": "front_photo",
  "expectedFields": ["front_photo", "back_photo"],
  "hint": "Remove leading/trailing spaces from field names in your request"
}
```

## Troubleshooting

### Error: "Unexpected file field"
- **Solution**: Check for spaces in field names
- **Solution**: Verify field names are exactly `front_photo` and `back_photo`
- **Solution**: Make sure you selected "File" type, not "Text" type

### Error: "Front photo is required"
- **Solution**: Make sure the file was actually selected
- **Solution**: Check that the field name is exactly `front_photo`

### Error: "Only image files are allowed"
- **Solution**: Use image files (jpg, png, gif, webp)
- **Solution**: Check file extension and MIME type

### Error: "File size exceeds the maximum limit"
- **Solution**: Reduce file size to under 10MB
- **Solution**: Compress the images before uploading


