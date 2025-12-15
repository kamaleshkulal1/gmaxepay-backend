# Service APIs - Postman Request Data

**Base URL:** `http://localhost:3000/admin/services`  
(Replace with your actual base URL and port)

**Common Header:**
```
Authorization: Bearer YOUR_AUTH_TOKEN_HERE
```

---

## 1. CREATE SERVICE (with image)

**Method:** `POST`  
**URL:** `http://localhost:3000/admin/services`

**Headers:**
```
Authorization: Bearer YOUR_AUTH_TOKEN_HERE
```
(Don't set Content-Type manually - Postman will set it automatically for form-data)

**Body (form-data):**
```
Key: serviceName
Value: Mobile Recharge
Type: Text

Key: image
Value: [SELECT FILE]
Type: File
```

---

## 2. CREATE SERVICE (without image)

**Method:** `POST`  
**URL:** `http://localhost:3000/admin/services`

**Headers:**
```
Authorization: Bearer YOUR_AUTH_TOKEN_HERE
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "serviceName": "Mobile Recharge"
}
```

---

## 3. GET ALL SERVICES

**Method:** `GET`  
**URL:** `http://localhost:3000/admin/services`

**Headers:**
```
Authorization: Bearer YOUR_AUTH_TOKEN_HERE
```

**Body:** None

---

## 4. GET SINGLE SERVICE BY ID

**Method:** `GET`  
**URL:** `http://localhost:3000/admin/services/service/1`
(Replace `1` with actual service ID)

**Headers:**
```
Authorization: Bearer YOUR_AUTH_TOKEN_HERE
```

**Body:** None

---

## 5. UPDATE SERVICE (with new image)

**Method:** `PATCH`  
**URL:** `http://localhost:3000/admin/services/service/1`
(Replace `1` with actual service ID)

**Headers:**
```
Authorization: Bearer YOUR_AUTH_TOKEN_HERE
```
(Don't set Content-Type manually - Postman will set it automatically for form-data)

**Body (form-data):**
```
Key: serviceName
Value: DTH Recharge
Type: Text

Key: image
Value: [SELECT FILE]
Type: File
```

**Note:** Old image will be automatically deleted from S3 when new image is uploaded.

---

## 6. UPDATE SERVICE (without image - only serviceName)

**Method:** `PATCH`  
**URL:** `http://localhost:3000/admin/services/service/1`
(Replace `1` with actual service ID)

**Headers:**
```
Authorization: Bearer YOUR_AUTH_TOKEN_HERE
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "serviceName": "DTH Recharge"
}
```

---

## 7. DELETE SERVICE

**Method:** `DELETE`  
**URL:** `http://localhost:3000/admin/services/service/1`
(Replace `1` with actual service ID)

**Headers:**
```
Authorization: Bearer YOUR_AUTH_TOKEN_HERE
```

**Body:** None

**Note:** Service image will be automatically deleted from S3.

---

## 8. REGISTER SERVICE PACKAGE

**Method:** `POST`  
**URL:** `http://localhost:3000/admin/services/packages`

**Headers:**
```
Authorization: Bearer YOUR_AUTH_TOKEN_HERE
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "packageId": 1,
  "serviceId": 1,
  "isActive": true
}
```

---

## 9. GET SERVICES BY PACKAGE ID

**Method:** `GET`  
**URL:** `http://localhost:3000/admin/services/1`
(Replace `1` with package ID)

**Headers:**
```
Authorization: Bearer YOUR_AUTH_TOKEN_HERE
```

**Body:** None

---

## 10. UPDATE USER PACKAGE

**Method:** `PUT`  
**URL:** `http://localhost:3000/admin/services/1`
(Replace `1` with user ID)

**Headers:**
```
Authorization: Bearer YOUR_AUTH_TOKEN_HERE
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "packageId": 1,
  "cost": 1000
}
```

---

## 11. LIST USER PACKAGE

**Method:** `GET`  
**URL:** `http://localhost:3000/admin/services/1/packages`
(Replace `1` with user ID)

**Headers:**
```
Authorization: Bearer YOUR_AUTH_TOKEN_HERE
```

**Body:** None

---

## 12. UPDATE USER SERVICE

**Method:** `PUT`  
**URL:** `http://localhost:3000/admin/services/1/update`
(Replace `1` with user ID)

**Headers:**
```
Authorization: Bearer YOUR_AUTH_TOKEN_HERE
Content-Type: application/json
```

**Body (raw JSON) - Activate all services:**
```json
{
  "allTrue": true
}
```

**Body (raw JSON) - Update specific service:**
```json
{
  "serviceId": 1,
  "isActive": false
}
```

---

## Example Service Names:
- Mobile Recharge
- DTH Recharge
- Electricity Bill Payment
- Gas Bill Payment
- Water Bill Payment
- Credit Card Payment
- Insurance Payment
- Fastag Recharge
- Postpaid Bill Payment
- Broadband Bill Payment

---

## Notes:
1. **Image Upload:**
   - Supported formats: JPEG, JPG, PNG, GIF, WEBP
   - Maximum file size: 10MB
   - Image is optional for create/update
   - Old image is automatically deleted when updating with new image

2. **Permissions:**
   - Permission ID 9 (write) required for create/update/delete
   - Permission ID 9 (read) required for get operations
   - Permission ID 28 required for user package operations

3. **Response Format:**
   - Services with images will include `imageUrl` field in response
   - Image URLs use CDN for public access

