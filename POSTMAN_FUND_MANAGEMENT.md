# Fund Management API - Postman Collection

## Base URL
```
{{baseUrl}}/api
```

## Authentication
All endpoints require Bearer token in Authorization header:
```
Authorization: Bearer {{token}}
```

---

## 1. Create Fund Request
**Endpoint:** `POST /admin/foundManagement/request`  
**Endpoint:** `POST /company/foundManagement/request`  
**Endpoint:** `POST /user/foundManagement/request`

**Description:** User creates a fund request from their superior

**Content-Type:** `multipart/form-data`

**Request Body (Form Data):**
- `amount` (required): Number - Amount requested (e.g., 1000.50)
- `paymentMode` (required): String - Payment mode. Must be one of:
  - `"IMPS / NEFT / UPI"`
  - `"CASH DEPOSIT"`
  - `"CASH IN HAND"`
- `payDate` (required): String - Payment date in ISO format (e.g., "2024-12-15T12:30:00.000Z")
- `remark` (required): String - Remarks/description
- `bankId` (optional): Number - Selected bank account ID from superior's bank list
- `refNo` (optional): String - Reference number for the payment
- `paySlip` (optional): File - Payslip image file (JPG, PNG, GIF, WEBP - max 10MB)

**Example Request (cURL):**
```bash
curl -X POST "{{baseUrl}}/api/admin/foundManagement/request" \
  -H "Authorization: Bearer {{token}}" \
  -F "amount=1000.50" \
  -F "paymentMode=IMPS / NEFT / UPI" \
  -F "payDate=2024-12-15T12:30:00.000Z" \
  -F "remark=Need funds for business operations" \
  -F "bankId=1" \
  -F "refNo=REF123456" \
  -F "paySlip=@/path/to/payslip.jpg"
```

**Response:**
```json
{
  "status": "success",
  "message": "Fund request created successfully",
  "data": {
    "id": 1,
    "requestUserId": 123,
    "superiorUserId": 456,
    "companyId": 1,
    "amount": 1000.50,
    "bankId": 1,
    "paymentMode": "IMPS / NEFT / UPI",
    "payDate": "2024-12-15T12:30:00.000Z",
    "refNo": "REF123456",
    "paySlip": "images/1/123/fundManagement/payslip/1234567890_abc123.jpg",
    "paySlipUrl": "https://s3.amazonaws.com/bucket/images/1/123/fundManagement/payslip/1234567890_abc123.jpg",
    "transactionId": "COMPANY2412151230ABC123",
    "status": "Pending",
    "remark": "Need funds for business operations",
    "createdAt": "2024-12-15T12:30:00.000Z",
    "updatedAt": "2024-12-15T12:30:00.000Z"
  }
}
```

**Error Responses:**
```json
{
  "status": "failure",
  "message": "Valid amount is required"
}
```

```json
{
  "status": "failure",
  "message": "Payment mode is required"
}
```

```json
{
  "status": "failure",
  "message": "Payment date is required"
}
```

```json
{
  "status": "failure",
  "message": "Remark is required"
}
```

```json
{
  "status": "failure",
  "message": "Invalid payment mode. Must be one of: IMPS / NEFT / UPI, CASH DEPOSIT, CASH IN HAND"
}
```

---

## 2. Get Fund Requests for Approval
**Endpoint:** `POST /admin/foundManagement/approval/list`  
**Endpoint:** `POST /company/foundManagement/approval/list`  
**Endpoint:** `POST /user/foundManagement/approval/list`

**Description:** Get all pending fund requests where current user is the superior (approver)

**Request Body:**
```json
{
  "options": {
    "limit": 10,
    "offset": 0
  }
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Fund requests retrieved successfully",
  "data": [
    {
      "id": 1,
      "requestUserId": 123,
      "superiorUserId": 456,
      "companyId": 1,
      "amount": 1000.50,
      "transactionId": "COMPANY2412151230ABC123",
      "status": "Pending",
      "requestUser": {
        "id": 123,
        "name": "John Doe",
        "mobileNo": "9876543210",
        "userRole": 4,
        "userId": "COMPANYDI01"
      },
      "superiorUser": {
        "id": 456,
        "name": "Jane Smith",
        "mobileNo": "9876543211",
        "userRole": 3,
        "userId": "COMPANYMD01"
      },
      "superiorBanks": [
        {
          "id": 1,
          "bankName": "HDFC Bank",
          "accountNumber": "1234567890",
          "ifsc": "HDFC0001234",
          "beneficiaryName": "Jane Smith"
        }
      ],
      "superiorWalletBalance": 50000.00,
      "bankId": 1,
      "paymentMode": "IMPS / NEFT / UPI",
      "payDate": "2024-12-15T12:30:00.000Z",
      "refNo": "REF123456",
      "paySlip": "images/1/123/fundManagement/payslip/1234567890_abc123.jpg",
      "paySlipUrl": "https://s3.amazonaws.com/bucket/images/1/123/fundManagement/payslip/1234567890_abc123.jpg",
      "selectedBank": {
        "id": 1,
        "bankName": "HDFC Bank",
        "accountNumber": "1234567890",
        "ifsc": "HDFC0001234",
        "beneficiaryName": "Jane Smith"
      }
    }
  ]
}
```

---

## 3. Get My Fund Requests
**Endpoint:** `POST /admin/foundManagement/my-requests`  
**Endpoint:** `POST /company/foundManagement/my-requests`  
**Endpoint:** `POST /user/foundManagement/my-requests`

**Description:** Get all fund requests created by current user

**Request Body:**
```json
{
  "options": {
    "limit": 10,
    "offset": 0
  }
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Fund requests retrieved successfully",
  "data": [
    {
      "id": 1,
      "requestUserId": 123,
      "superiorUserId": 456,
      "companyId": 1,
      "amount": 1000.50,
      "transactionId": "COMPANY2412151230ABC123",
      "status": "Approved",
      "message": "Approved for business operations",
      "approvedBy": 456,
      "approvedAt": "2024-12-15T13:00:00.000Z",
      "bankId": 1,
      "paymentMode": "IMPS / NEFT / UPI",
      "payDate": "2024-12-15T12:30:00.000Z",
      "refNo": "REF123456",
      "paySlip": "images/1/123/fundManagement/payslip/1234567890_abc123.jpg",
      "paySlipUrl": "https://s3.amazonaws.com/bucket/images/1/123/fundManagement/payslip/1234567890_abc123.jpg",
      "selectedBank": {
        "id": 1,
        "bankName": "HDFC Bank",
        "accountNumber": "1234567890",
        "ifsc": "HDFC0001234",
        "beneficiaryName": "Jane Smith"
      },
      "requestUser": {
        "id": 123,
        "name": "John Doe",
        "mobileNo": "9876543210",
        "userRole": 4,
        "userId": "COMPANYDI01"
      },
      "approver": {
        "id": 456,
        "name": "Jane Smith",
        "mobileNo": "9876543211",
        "userRole": 3,
        "userId": "COMPANYMD01"
      }
    }
  ]
}
```

---

## 4. Approve Fund Request
**Endpoint:** `POST /admin/foundManagement/:id/approve`  
**Endpoint:** `POST /company/foundManagement/:id/approve`  
**Endpoint:** `POST /user/foundManagement/:id/approve`

**Description:** Superior approves fund request and transfers money from their wallet to requester's wallet

**URL Parameters:**
- `id`: Fund request ID

**Request Body:**
```json
{
  "message": "Approved for business operations"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Fund request approved and money transferred successfully",
  "data": {
    "fundRequest": {
      "id": 1,
      "requestUserId": 123,
      "superiorUserId": 456,
      "companyId": 1,
      "amount": 1000.50,
      "transactionId": "COMPANY2412151230ABC123",
      "status": "Approved",
      "message": "Approved for business operations",
      "approvedBy": 456,
      "approvedAt": "2024-12-15T13:00:00.000Z"
    },
    "superiorNewBalance": 49000.00,
    "requesterNewBalance": 1500.50
  }
}
```

**Error Response (Insufficient Balance):**
```json
{
  "status": "failure",
  "message": "Insufficient balance in superior wallet. Request will remain pending until sufficient funds are available.",
  "data": {
    "required": 1000.50,
    "available": 500.00,
    "status": "Pending"
  }
}
```

**Note:** If insufficient balance, the request remains in "Pending" status and is not automatically rejected. The superior can manually reject it later if needed, or approve it once sufficient funds are available.

---

## 5. Reject Fund Request
**Endpoint:** `POST /admin/foundManagement/:id/reject`  
**Endpoint:** `POST /company/foundManagement/:id/reject`  
**Endpoint:** `POST /user/foundManagement/:id/reject`

**Description:** Superior rejects fund request

**URL Parameters:**
- `id`: Fund request ID

**Request Body:**
```json
{
  "message": "Insufficient funds available at the moment"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Fund request rejected successfully",
  "data": {
    "id": 1,
    "requestUserId": 123,
    "superiorUserId": 456,
    "companyId": 1,
    "amount": 1000.50,
    "transactionId": "COMPANY2412151230ABC123",
    "status": "Rejected",
    "message": "Insufficient funds available at the moment",
    "rejectedBy": 456,
    "rejectedAt": "2024-12-15T13:00:00.000Z"
  }
}
```

---

## 6. Get Downline Users
**Endpoint:** `POST /admin/foundManagement/downline`  
**Endpoint:** `POST /company/foundManagement/downline`  
**Endpoint:** `POST /user/foundManagement/downline`

**Description:** Get all users who report to current user (downline users)

**Request Body:**
```json
{
  "options": {
    "limit": 10,
    "offset": 0
  }
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Downline users retrieved successfully",
  "data": [
    {
      "id": 123,
      "name": "John Doe",
      "mobileNo": "9876543210",
      "userRole": 4,
      "userId": "COMPANYDI01",
      "reportingTo": 456,
      "companyId": 1,
      "wallet": {
        "id": 1,
        "mainWallet": 500.00,
        "apesWallet": 0.00
      },
      "company": {
        "id": 1,
        "companyName": "Test Company"
      }
    }
  ]
}
```

---

## 7. Get Superior Bank List
**Endpoint:** `POST /admin/foundManagement/superior/banks`  
**Endpoint:** `POST /company/foundManagement/superior/banks`  
**Endpoint:** `POST /user/foundManagement/superior/banks`

**Description:** Get bank accounts of the superior user (or company admin if reportingTo is null)

**Request Body:**
```json
{}
```

**Response:**
```json
{
  "status": "success",
  "message": "Superior bank list retrieved successfully",
  "data": {
    "superiorUser": {
      "id": 456,
      "name": "Jane Smith",
      "mobileNo": "9876543211",
      "userRole": 3,
      "userId": "COMPANYMD01"
    },
    "banks": [
      {
        "id": 1,
        "bankName": "HDFC Bank",
        "accountNumber": "1234567890",
        "ifsc": "HDFC0001234",
        "beneficiaryName": "Jane Smith",
        "city": "Mumbai",
        "branch": "Andheri"
      },
      {
        "id": 2,
        "bankName": "ICICI Bank",
        "accountNumber": "0987654321",
        "ifsc": "ICIC0000987",
        "beneficiaryName": "Jane Smith",
        "city": "Mumbai",
        "branch": "Bandra"
      }
    ],
    "walletBalance": 50000.00
  }
}
```

---

## 8. Get Fund Request History
**Endpoint:** `GET /admin/foundManagement/history/:fundManagementId`  
**Endpoint:** `GET /company/foundManagement/history/:fundManagementId`  
**Endpoint:** `GET /user/foundManagement/history/:fundManagementId`

**Description:** Get history of a specific fund request

**URL Parameters:**
- `fundManagementId`: Fund request ID

**Request Body:**
```json
{
  "options": {
    "limit": 10,
    "offset": 0
  }
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Fund request history retrieved successfully",
  "data": [
    {
      "id": 1,
      "fundManagementId": 1,
      "requestUserId": 123,
      "superiorUserId": 456,
      "companyId": 1,
      "amount": 1000.50,
      "transactionId": "COMPANY2412151230ABC123",
      "status": "Pending",
      "action": "Requested",
      "performedBy": 123,
      "createdAt": "2024-12-15T12:30:00.000Z"
    },
    {
      "id": 2,
      "fundManagementId": 1,
      "requestUserId": 123,
      "superiorUserId": 456,
      "companyId": 1,
      "amount": 1000.50,
      "transactionId": "COMPANY2412151230ABC123",
      "status": "Approved",
      "action": "Approved",
      "message": "Approved for business operations",
      "performedBy": 456,
      "oldAmount": 50000.00,
      "newAmount": 49000.00,
      "requesterOldAmount": 500.00,
      "requesterNewAmount": 1500.50,
      "createdAt": "2024-12-15T13:00:00.000Z"
    }
  ]
}
```

---

## Notes

1. **Superior Determination:**
   - If `reportingTo` is null, the company admin (userRole = 2) is considered the superior
   - Super admin (userRole = 1) can approve/reject any request

2. **Transaction Flow:**
   - When approved, money is transferred from superior's `mainWallet` to requester's `mainWallet`
   - Ledger entries are created for both superior (debit) and requester (credit)
   - Wallet history entries are created for both users
   - Fund management history is updated
   - If insufficient balance during approval, request remains in "Pending" status (not auto-rejected)

3. **Status Values:**
   - `Pending`: Request is waiting for approval
   - `Approved`: Request approved and money transferred
   - `Rejected`: Request rejected by superior

4. **Payment Modes:**
   - `"IMPS / NEFT / UPI"`: Online payment methods
   - `"CASH DEPOSIT"`: Cash deposited to bank
   - `"CASH IN HAND"`: Cash payment

5. **Required Fields:**
   - `amount`: Required, must be greater than 0
   - `paymentMode`: Required, must be one of the valid payment modes
   - `payDate`: Required, must be a valid date
   - `remark`: Required, description/remarks

6. **Optional Fields:**
   - `bankId`: Optional, selected bank account ID from superior's bank list
   - `refNo`: Optional, reference number for the payment
   - `paySlip`: Optional, payslip image file (JPG, PNG, GIF, WEBP - max 10MB)

7. **File Upload:**
   - Payslip is uploaded to S3 storage
   - File size limit: 10MB
   - Supported formats: JPG, PNG, GIF, WEBP
   - File is stored with path: `images/{companyId}/{userId}/fundManagement/payslip/{filename}`

8. **User Roles:**
   - `1`: Super Admin
   - `2`: Company Admin (Whitelabel)
   - `3`: Master Distributor
   - `4`: Distributor
   - `5`: Retailer

9. **Error Handling:**
   - All endpoints return appropriate error messages
   - Insufficient balance check is performed before approval
   - If insufficient balance, request remains pending (not auto-rejected)
   - Authorization checks ensure only superior can approve/reject
   - Bank ID validation ensures selected bank belongs to superior

