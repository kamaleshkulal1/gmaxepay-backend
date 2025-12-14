# Slab & Sub-Slab System - Complete API Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Hierarchy Structure](#hierarchy-structure)
4. [API Endpoints](#api-endpoints)
5. [Request/Response Examples](#requestresponse-examples)
6. [Error Handling](#error-handling)
7. [Postman Collection](#postman-collection)

---

## System Overview

The Slab & Sub-Slab system provides a hierarchical commission management structure where:
- **Super Admin** creates global slab templates with upgrade amounts
- **Company (WhiteLabel Admin)** creates company-level sub-slabs
- **Master Distributors** and **Distributors** create their own sub-slabs with custom commercials
- Multiple users can be assigned to slabs/sub-slabs using array methods
- **Amount field** is used for package upgrade pricing

### Key Features
- ✅ Hierarchical slab inheritance
- ✅ Multiple user assignment via arrays
- ✅ Commercial management (commSlab, pgCommercials)
- ✅ Scope-based access (global vs private)
- ✅ User type filtering
- ✅ Package upgrade with amount deduction
- ✅ Company ID is always required (cannot be null)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SLAB SYSTEM HIERARCHY                          │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │   SUPER_ADMIN (1)   │
                    │  Creates Global     │
                    │  Slab Templates     │
                    │  (with amount)      │
                    └──────────┬──────────┘
                               │
                               │ Creates
                               ▼
                    ┌─────────────────────┐
                    │   GLOBAL SLABS     │
                    │  - Basic (₹1000)   │
                    │  - Gold (₹5000)    │
                    │  - Platinum (₹10K) │
                    │  companyId: req'd   │
                    │  slabScope: global │
                    └──────────┬──────────┘
                               │
                               │ References
                               ▼
        ┌──────────────────────────────────────────────┐
        │                                              │
        ▼                                              ▼
┌──────────────────┐                        ┌──────────────────┐
│ COMPANY ADMIN    │                        │ COMPANY ADMIN    │
│ (WhiteLabel)     │                        │ (WhiteLabel)     │
│ userType: 2/13  │                        │ userType: 2/13   │
└────────┬─────────┘                        └────────┬─────────┘
          │                                          │
          │ Creates                                  │ Creates
          ▼                                          ▼
┌──────────────────┐                        ┌──────────────────┐
│ COMPANY SUB-SLAB │                        │ COMPANY SUB-SLAB │
│ - Company.Basic  │                        │ - Company.Gold   │
│ userId: null     │                        │ userId: null     │
│ parentSlabId: 1  │                        │ parentSlabId: 2  │
└────────┬─────────┘                        └────────┬─────────┘
          │                                          │
          │                                          │
          ▼                                          ▼
┌──────────────────┐                        ┌──────────────────┐
│ MASTER DIST      │                        │ MASTER DIST      │
│ userType: 5      │                        │ userType: 5      │
└────────┬─────────┘                        └────────┬─────────┘
          │                                          │
          │ Creates                                  │ Creates
          ▼                                          ▼
┌──────────────────┐                        ┌──────────────────┐
│ MD SUB-SLAB      │                        │ MD SUB-SLAB      │
│ - MD101.Basic    │                        │ - MD102.Gold     │
│ userId: 101      │                        │ userId: 102      │
│ parentSlabId: 10 │                        │ parentSlabId: 11 │
└────────┬─────────┘                        └────────┬─────────┘
          │                                          │
          │                                          │
          ▼                                          ▼
┌──────────────────┐                        ┌──────────────────┐
│ DISTRIBUTOR      │                        │ DISTRIBUTOR      │
│ userType: 6      │                        │ userType: 6      │
└────────┬─────────┘                        └────────┬─────────┘
          │                                          │
          │ Creates                                  │ Creates
          ▼                                          ▼
┌──────────────────┐                        ┌──────────────────┐
│ DIST SUB-SLAB    │                        │ DIST SUB-SLAB    │
│ - D201.Basic     │                        │ - D202.Gold     │
│ userId: 201      │                        │ userId: 202      │
│ parentSlabId: 20 │                        │ parentSlabId: 21 │
└────────┬─────────┘                        └────────┬─────────┘
          │                                          │
          │ Assigns Users                           │ Assigns Users
          ▼                                          ▼
┌──────────────────┐                        ┌──────────────────┐
│ RETAILERS        │                        │ RETAILERS        │
│ (via users[])    │                        │ (via users[])    │
│ userType: 7      │                        │ userType: 7      │
└──────────────────┘                        └──────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ COMMERCIALS STRUCTURE                                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  SLAB/SUB-SLAB                                                           │
│       │                                                                  │
│       ├──► commSlab (Recharge/DTH/BBPS)                                 │
│       │    - operatorId, roleType, commAmt, commType, amtType            │
│       │                                                                  │
│       ├──► rangeCommission (Range-based commission)                     │
│       │    - rangeId, min, max, commAmt                                │
│       │                                                                  │
│       ├──► rangeCharges (Range-based charges)                           │
│       │    - rangeId, min, max, commAmt                                 │
│       │                                                                  │
│       └──► pgCommercials (Payment Gateway)                              │
│            - paymentInstrumentId, cardTypeId, commAmt                    │
│                                                                          │
│  SUB-SLAB COMMERCIALS (Separate tables)                                 │
│       │                                                                  │
│       ├──► subSlabComm (Recharge/DTH/BBPS)                              │
│       │                                                                  │
│       └──► subSlabPgCommercials (Payment Gateway)                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Hierarchy Structure

### User Types
- **1** - SUPER_ADMIN
- **2/13** - ADMIN / WHITELABEL_ADMIN (Company Admin)
- **5** - MASTER_DISTRIBUTOR
- **6** - DISTRIBUTOR
- **7** - RETAILER

### Slab Scope
- **global** - Can be used by multiple companies (but still requires companyId)
- **private** - Company-specific slab

### Slab Types
- **level** - Level-based commission structure
- **channel** - Channel-based commission structure

---

## API Endpoints

### Base URLs
- **Development**: `http://localhost:3000/api/v1`
- **Production**: `https://your-domain.com/api/v1`

### Authentication
All endpoints require Bearer token:
```
Authorization: Bearer <your_token>
```

---

## 1. ADMIN ROUTES (`/api/v1/admin/slabs`)

### 1.1 Create Global Slab (Super Admin Only)
**POST** `/admin/slabs`

**Description**: Creates a global slab template with upgrade amount. Company ID is required.

**Request Body:**
```json
{
  "slabName": "Basic",
  "slabType": "level",
  "slabScope": "global",
  "amount": 1000,
  "remark": "Global Basic slab template"
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "New Slab Created Successfully",
  "data": {
    "id": 1,
    "slabName": "Basic",
    "slabType": "level",
    "slabScope": "global",
    "companyId": 5,
    "amount": 1000,
    "users": [],
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 1.2 Get All Slabs (Paginated)
**GET** `/admin/slabs`

**Request Body:**
```json
{
  "query": {
    "slabType": "level"
  },
  "options": {
    "page": 1,
    "paginate": 10
  }
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Your request is successfully executed",
  "data": [
    {
      "id": 1,
      "slabName": "Basic",
      "slabType": "level",
      "slabScope": "global",
      "companyId": 5,
      "amount": 1000,
      "users": []
    }
  ],
  "total": 1
}
```

---

### 1.3 Get All Slabs (Simple List)
**GET** `/admin/slabs/all`

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Your request is successfully executed",
  "data": [
    {
      "id": 1,
      "slabName": "Basic",
      "slabType": "level",
      "slabScope": "global",
      "amount": 1000
    },
    {
      "id": 2,
      "slabName": "Gold",
      "slabType": "level",
      "slabScope": "global",
      "amount": 5000
    }
  ]
}
```

---

### 1.4 Get Single Slab
**GET** `/admin/slabs/:id`

**Response:**
```json
{
  "status": "SUCCESS",
  "data": {
    "id": 1,
    "slabName": "Basic",
    "slabType": "level",
    "slabScope": "global",
    "companyId": 5,
    "amount": 1000,
    "users": [],
    "isActive": true
  }
}
```

---

### 1.5 Update Slab Commission
**PUT** `/admin/slabs`

**Request Body:**
```json
{
  "slabId": 1,
  "operatorId": 5,
  "roleType": 5,
  "commAmt": 2.5,
  "commType": "com",
  "amtType": "per",
  "id": 150
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Data updated successfully!",
  "data": [
    {
      "id": 150,
      "slabId": 1,
      "operatorId": 5,
      "roleType": 5,
      "commAmt": 2.5,
      "commType": "com",
      "amtType": "per"
    }
  ]
}
```

---

### 1.6 Partial Update Slab
**PATCH** `/admin/slabs/:id`

**Request Body:**
```json
{
  "slabName": "Basic Updated",
  "amount": 1500,
  "remark": "Updated remark"
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "data": {
    "id": 1,
    "slabName": "Basic Updated",
    "amount": 1500
  }
}
```

---

### 1.7 Delete Slab (Soft Delete)
**DELETE** `/admin/slabs/:id`

**Response:**
```json
{
  "status": "SUCCESS",
  "msg": "Record has been deleted successfully",
  "data": [...]
}
```

---

### 1.8 Get Slab Commission (All)
**GET** `/admin/slabs/commission/all`

**Request Body:**
```json
{
  "query": {
    "slabId": 1
  },
  "options": {
    "page": 1,
    "paginate": 10
  }
}
```

---

### 1.9 Get BBPS Slab Commission
**GET** `/admin/slabs/commission/bbps`

---

### 1.10 Get Recharge Slab Commission
**GET** `/admin/slabs/commission/recharge`

---

### 1.11 Get Credit Card Slab Commission
**GET** `/admin/slabs/commission/credit-card`

---

### 1.12 Get Zaakpay Slab Commission
**GET** `/admin/slabs/commission/zaakpay`

---

### 1.13 Create Recharge Commission
**POST** `/admin/slabs/recharge`

**Request Body:**
```json
{
  "slabId": 1,
  "operatorId": 5,
  "roleType": 5,
  "commAmt": 2.5,
  "commType": "com",
  "amtType": "per"
}
```

---

### 1.14 Create DTH Commission
**POST** `/admin/slabs/dth`

**Request Body:**
```json
{
  "slabId": 1,
  "operatorId": 5,
  "roleType": 5,
  "commAmt": 2.5,
  "commType": "com",
  "amtType": "per"
}
```

---

### 1.15 Bulk Update Recharge Commission
**POST** `/admin/slabs/bulk-recharge`

**Request Body:**
```json
{
  "slabId": 1,
  "operatorType": "Prepaid",
  "roleType": 5,
  "commAmt": 2.5,
  "commType": "com",
  "amtType": "per"
}
```

---

### 1.16 Get Slab Users
**POST** `/admin/slabs/users`

**Request Body:**
```json
{
  "query": {
    "slabId": 1
  },
  "options": {
    "page": 1,
    "paginate": 10
  }
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Your request is successfully executed",
  "data": [
    {
      "id": 301,
      "name": "Retailer 1",
      "mobileNo": "9876543210"
    }
  ],
  "total": 1
}
```

---

### 1.17 Assign User to Slab
**PUT** `/admin/slabs/users/:id`

**Request Body:**
```json
{
  "userId": 301,
  "secureKey": "1234"
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "User slab updated successfully!",
  "data": [
    {
      "id": 301,
      "slab": "Basic"
    }
  ]
}
```

---

## 2. SUB-SLAB ROUTES (`/api/v1/admin/slabs/sub-slabs`)

### 2.1 Create Sub-Slab
**POST** `/admin/slabs/sub-slabs`

**Description**: Creates a sub-slab for Company, MD, or Distributor with custom commercials.

**Request Body:**
```json
{
  "subSlabName": "Company.Basic",
  "parentSlabId": 1,
  "slabType": "level",
  "remark": "Company level Basic slab"
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Sub-Slab Created Successfully",
  "data": {
    "id": 10,
    "subSlabName": "Company.Basic",
    "parentSlabId": 1,
    "companyId": 5,
    "userId": null,
    "userType": 13,
    "slabType": "level",
    "users": [],
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### 2.2 Get All Sub-Slabs
**GET** `/admin/slabs/sub-slabs`

**Query Parameters:**
- `parentSlabId` (optional): Filter by parent slab ID

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Sub-Slabs retrieved successfully",
  "data": [
    {
      "id": 10,
      "subSlabName": "Company.Basic",
      "parentSlabId": 1,
      "companyId": 5,
      "slabType": "level",
      "users": [],
      "parentSlab": {
        "id": 1,
        "slabName": "Basic",
        "slabType": "level",
        "slabScope": "global"
      }
    }
  ]
}
```

---

### 2.3 Get Single Sub-Slab
**GET** `/admin/slabs/sub-slabs/:id`

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Sub-Slab retrieved successfully",
  "data": {
    "id": 10,
    "subSlabName": "Company.Basic",
    "parentSlabId": 1,
    "companyId": 5,
    "userId": null,
    "userType": 13,
    "slabType": "level",
    "users": [],
    "parentSlab": {
      "id": 1,
      "slabName": "Basic",
      "slabType": "level"
    }
  }
}
```

---

### 2.4 Update Sub-Slab
**PUT** `/admin/slabs/sub-slabs/:id`

**Request Body:**
```json
{
  "subSlabName": "Company.Basic.Updated",
  "remark": "Updated remark"
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Sub-Slab updated successfully",
  "data": {
    "id": 10,
    "subSlabName": "Company.Basic.Updated"
  }
}
```

---

### 2.5 Delete Sub-Slab
**DELETE** `/admin/slabs/sub-slabs/:id`

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Sub-Slab deleted successfully",
  "data": {
    "id": 10,
    "isActive": false,
    "isDelete": true
  }
}
```

---

### 2.6 Assign Users to Sub-Slab
**POST** `/admin/slabs/sub-slabs/:id/assign-users`

**Request Body:**
```json
{
  "userIds": [301, 302, 303]
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Users assigned to Sub-Slab successfully",
  "data": {
    "id": 10,
    "users": [301, 302, 303]
  }
}
```

---

### 2.7 Remove Users from Sub-Slab
**POST** `/admin/slabs/sub-slabs/:id/remove-users`

**Request Body:**
```json
{
  "userIds": [302]
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Users removed from Sub-Slab successfully",
  "data": {
    "id": 10,
    "users": [301, 303]
  }
}
```

---

### 2.8 Update Sub-Slab Commercial
**POST** `/admin/slabs/sub-slabs/commercial`

**Request Body:**
```json
{
  "subSlabId": 10,
  "operatorId": 5,
  "roleType": 5,
  "commAmt": 2.5,
  "commType": "com",
  "amtType": "per",
  "id": 150
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Sub-Slab Commercial updated successfully!",
  "data": [...]
}
```

---

### 2.9 Update Sub-Slab PG Commercial
**POST** `/admin/slabs/sub-slabs/pg-commercial`

**Request Body:**
```json
{
  "subSlabId": 10,
  "operatorId": 5,
  "roleType": 5,
  "paymentInstrumentId": 1,
  "cardTypeId": 2,
  "commAmt": 1.5,
  "commType": "com",
  "amtType": "per",
  "id": 200
}
```

---

## 3. COMPANY ROUTES (`/api/v1/company/v1`)

### 3.1 Get All Slabs (Company)
**GET** `/company/v1/slabs`

Same as admin route but filtered by company.

---

### 3.2 Get All Slabs List (Company)
**POST** `/company/v1/all`

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Your request is successfully executed",
  "data": [
    {
      "id": 1,
      "slabName": "Basic",
      "slabType": "level",
      "slabScope": "global",
      "amount": 1000
    }
  ]
}
```

---

### 3.3 Get Single Slab (Company)
**GET** `/company/v1/slabs/:id`

---

### 3.4 Create Company Sub-Slab
**POST** `/company/v1/sub-slabs`

Same as admin sub-slab creation.

---

### 3.5 Get All Company Sub-Slabs
**GET** `/company/v1/sub-slabs`

---

### 3.6 Get Company Sub-Slab
**GET** `/company/v1/sub-slabs/:id`

---

### 3.7 Update Company Sub-Slab
**PUT** `/company/v1/sub-slabs/:id`

---

### 3.8 Delete Company Sub-Slab
**DELETE** `/company/v1/sub-slabs/:id`

---

### 3.9 Assign Users to Company Sub-Slab
**POST** `/company/v1/sub-slabs/:id/assign-users`

---

### 3.10 Remove Users from Company Sub-Slab
**POST** `/company/v1/sub-slabs/:id/remove-users`

---

### 3.11 Upgrade Package
**POST** `/company/v1/upgrade-package`

**Description**: Company admin upgrades package by assigning a slab. Amount is deducted from wallet if slab has amount > 0.

**Request Body:**
```json
{
  "slabId": 1
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Package upgraded successfully!",
  "data": {
    "slab": "Basic",
    "package": "Basic Package",
    "amountDeducted": 1000,
    "services": 5
  }
}
```

---

## 4. USER ROUTES (`/api/v1/user/v1`)

### 4.1 Get All Slabs (User)
**GET** `/user/v1/slabs`

---

### 4.2 Get All Slabs List (User)
**GET** `/user/v1/slabs/all`

---

### 4.3 Get Single Slab (User)
**GET** `/user/v1/slabs/:id`

---

### 4.4 Create User Sub-Slab (MD/Distributor)
**POST** `/user/v1/sub-slabs`

**Request Body:**
```json
{
  "subSlabName": "MD101.Basic",
  "parentSlabId": 10,
  "slabType": "level",
  "remark": "MD-101 Basic sub-slab"
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Sub-Slab Created Successfully",
  "data": {
    "id": 20,
    "subSlabName": "MD101.Basic",
    "parentSlabId": 10,
    "companyId": 5,
    "userId": 101,
    "userType": 5,
    "slabType": "level",
    "users": [],
    "isActive": true
  }
}
```

---

### 4.5 Get All User Sub-Slabs
**GET** `/user/v1/sub-slabs`

---

### 4.6 Get User Sub-Slab
**GET** `/user/v1/sub-slabs/:id`

---

### 4.7 Update User Sub-Slab
**PUT** `/user/v1/sub-slabs/:id`

---

### 4.8 Delete User Sub-Slab
**DELETE** `/user/v1/sub-slabs/:id`

---

### 4.9 Assign Users to User Sub-Slab
**POST** `/user/v1/sub-slabs/:id/assign-users`

---

### 4.10 Remove Users from User Sub-Slab
**POST** `/user/v1/sub-slabs/:id/remove-users`

---

## Error Handling

### 401 Unauthorized
```json
{
  "status": "FAILURE",
  "message": "User doesn't have Permission!",
  "data": null
}
```

### 404 Not Found
```json
{
  "status": "FAILURE",
  "message": "Sub-Slab not found",
  "data": null
}
```

### 400 Bad Request
```json
{
  "status": "FAILURE",
  "message": "userIds must be an array",
  "data": null
}
```

### 400 Company ID Required
```json
{
  "status": "FAILURE",
  "message": "Company ID is required",
  "data": null
}
```

### 400 Validation Error
```json
{
  "status": "FAILURE",
  "message": "slabType must be either \"level\" or \"channel\"",
  "data": null
}
```

---

## Postman Collection

### Complete Postman Collection JSON

```json
{
  "info": {
    "name": "Slab & Sub-Slab APIs - Complete",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    "description": "Complete API collection for Slab and Sub-Slab management system"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000/api/v1",
      "type": "string"
    },
    {
      "key": "token",
      "value": "your_bearer_token_here",
      "type": "string"
    }
  ],
  "item": [
    {
      "name": "Admin - Slabs",
      "item": [
        {
          "name": "Create Global Slab",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}",
                "type": "text"
              },
              {
                "key": "Content-Type",
                "value": "application/json",
                "type": "text"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"slabName\": \"Basic\",\n  \"slabType\": \"level\",\n  \"slabScope\": \"global\",\n  \"amount\": 1000,\n  \"remark\": \"Global Basic slab template\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/admin/slabs",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs"]
            }
          }
        },
        {
          "name": "Get All Slabs (Paginated)",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"query\": {},\n  \"options\": {\n    \"page\": 1,\n    \"paginate\": 10\n  }\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/admin/slabs",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs"]
            }
          }
        },
        {
          "name": "Get All Slabs (Simple)",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/admin/slabs/all",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs", "all"]
            }
          }
        },
        {
          "name": "Get Single Slab",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/admin/slabs/1",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs", "1"]
            }
          }
        },
        {
          "name": "Update Slab Commission",
          "request": {
            "method": "PUT",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"slabId\": 1,\n  \"operatorId\": 5,\n  \"roleType\": 5,\n  \"commAmt\": 2.5,\n  \"commType\": \"com\",\n  \"amtType\": \"per\",\n  \"id\": 150\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/admin/slabs",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs"]
            }
          }
        },
        {
          "name": "Partial Update Slab",
          "request": {
            "method": "PATCH",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"slabName\": \"Basic Updated\",\n  \"amount\": 1500\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/admin/slabs/1",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs", "1"]
            }
          }
        },
        {
          "name": "Delete Slab",
          "request": {
            "method": "DELETE",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/admin/slabs/1",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs", "1"]
            }
          }
        }
      ]
    },
    {
      "name": "Admin - Sub-Slabs",
      "item": [
        {
          "name": "Create Sub-Slab",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"subSlabName\": \"Company.Basic\",\n  \"parentSlabId\": 1,\n  \"slabType\": \"level\",\n  \"remark\": \"Company level Basic slab\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/admin/slabs/sub-slabs",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs", "sub-slabs"]
            }
          }
        },
        {
          "name": "Get All Sub-Slabs",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/admin/slabs/sub-slabs?parentSlabId=1",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs", "sub-slabs"],
              "query": [
                {
                  "key": "parentSlabId",
                  "value": "1"
                }
              ]
            }
          }
        },
        {
          "name": "Get Single Sub-Slab",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/admin/slabs/sub-slabs/10",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs", "sub-slabs", "10"]
            }
          }
        },
        {
          "name": "Update Sub-Slab",
          "request": {
            "method": "PUT",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"subSlabName\": \"Company.Basic.Updated\",\n  \"remark\": \"Updated remark\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/admin/slabs/sub-slabs/10",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs", "sub-slabs", "10"]
            }
          }
        },
        {
          "name": "Delete Sub-Slab",
          "request": {
            "method": "DELETE",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/admin/slabs/sub-slabs/10",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs", "sub-slabs", "10"]
            }
          }
        },
        {
          "name": "Assign Users to Sub-Slab",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"userIds\": [301, 302, 303]\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/admin/slabs/sub-slabs/10/assign-users",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs", "sub-slabs", "10", "assign-users"]
            }
          }
        },
        {
          "name": "Remove Users from Sub-Slab",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"userIds\": [302]\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/admin/slabs/sub-slabs/10/remove-users",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs", "sub-slabs", "10", "remove-users"]
            }
          }
        }
      ]
    },
    {
      "name": "Company - Slabs",
      "item": [
        {
          "name": "Get All Slabs",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/company/v1/slabs",
              "host": ["{{baseUrl}}"],
              "path": ["company", "v1", "slabs"]
            }
          }
        },
        {
          "name": "Get All Slabs List",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/company/v1/all",
              "host": ["{{baseUrl}}"],
              "path": ["company", "v1", "all"]
            }
          }
        },
        {
          "name": "Upgrade Package",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"slabId\": 1\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/company/v1/upgrade-package",
              "host": ["{{baseUrl}}"],
              "path": ["company", "v1", "upgrade-package"]
            }
          }
        }
      ]
    },
    {
      "name": "User - Sub-Slabs",
      "item": [
        {
          "name": "Create MD/Distributor Sub-Slab",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              },
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"subSlabName\": \"MD101.Basic\",\n  \"parentSlabId\": 10,\n  \"slabType\": \"level\",\n  \"remark\": \"MD-101 Basic sub-slab\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/user/v1/sub-slabs",
              "host": ["{{baseUrl}}"],
              "path": ["user", "v1", "sub-slabs"]
            }
          }
        }
      ]
    }
  ]
}
```

---

## Database Schema

### Slab Table
```sql
CREATE TABLE "Slab" (
  id SERIAL PRIMARY KEY,
  companyId INTEGER NOT NULL REFERENCES company(id),
  slabName VARCHAR NOT NULL UNIQUE,
  slabType VARCHAR NOT NULL CHECK (slabType IN ('level', 'channel')),
  slabScope VARCHAR NOT NULL DEFAULT 'private' CHECK (slabScope IN ('global', 'private')),
  amount FLOAT DEFAULT 0,
  remark TEXT,
  users INTEGER[] DEFAULT '{}',
  isActive BOOLEAN DEFAULT true,
  isDelete BOOLEAN DEFAULT false,
  addedBy INTEGER,
  updatedBy INTEGER,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

### SubSlabs Table
```sql
CREATE TABLE "subSlabs" (
  id SERIAL PRIMARY KEY,
  parentSlabId INTEGER REFERENCES "Slab"(id),
  companyId INTEGER NOT NULL REFERENCES company(id),
  userId INTEGER REFERENCES "user"(id),
  userType INTEGER,
  subSlabName VARCHAR NOT NULL UNIQUE,
  slabType VARCHAR NOT NULL CHECK (slabType IN ('level', 'channel')),
  users INTEGER[] DEFAULT '{}',
  remark TEXT,
  isActive BOOLEAN DEFAULT true,
  isDelete BOOLEAN DEFAULT false,
  addedBy INTEGER,
  updatedBy INTEGER,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

---

## Key Implementation Notes

1. **Company ID Requirement**: All slabs must have a `companyId` (cannot be null). Global slabs still require a companyId but can be accessed by multiple companies via `slabScope = 'global'`.

2. **Amount Field**: The `amount` field in slabs is used for package upgrade pricing. When a company admin upgrades a package, the amount is deducted from their wallet.

3. **User Assignment**: Users are assigned to slabs/sub-slabs using array methods:
   - **Assign**: `users = [...new Set([...currentUsers, ...userIds])]`
   - **Remove**: `users = currentUsers.filter(id => !userIds.includes(id))`

4. **Commercials**: Sub-slabs have separate commercial tables:
   - `subSlabComm` - For recharge/DTH/BBPS commissions
   - `subSlabPgCommercials` - For payment gateway commissions

5. **Hierarchy**: Sub-slabs reference parent slabs via `parentSlabId`, creating a hierarchical structure.

---

## Testing Checklist

- [ ] Create global slab as Super Admin with amount
- [ ] Verify companyId is required (cannot be null)
- [ ] Create company sub-slab as WhiteLabel Admin
- [ ] Create MD sub-slab as Master Distributor
- [ ] Create Distributor sub-slab as Distributor
- [ ] Assign multiple users to sub-slab
- [ ] Remove users from sub-slab
- [ ] Verify commercials are created for sub-slabs
- [ ] Verify user permissions are enforced
- [ ] Verify company filtering works correctly
- [ ] Test package upgrade with amount deduction
- [ ] Verify wallet history is created on upgrade

---

## Support

For issues or questions, please contact the development team.

**Last Updated**: 2024-01-01
**Version**: 1.0.0

