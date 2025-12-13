# Slab & Sub-Slab API Documentation

## Base URL
- Development: `http://localhost:3000/api/v1`
- Production: `https://your-domain.com/api/v1`

## Authentication
All endpoints (except public ones) require Bearer token in header:
```
Authorization: Bearer <your_token>
```

---

## 1. GLOBAL SLABS (Super Admin Only)

### 1.1 Create Global Slab Template
**POST** `/admin/slabs`

**Headers:**
```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```

**Body (raw JSON):**
```json
{
  "slabName": "Basic",
  "slabType": "level",
  "slabScope": "global",
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
    "companyId": null,
    "users": [],
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Postman Collection:**
```json
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
      "raw": "{\n  \"slabName\": \"Basic\",\n  \"slabType\": \"level\",\n  \"slabScope\": \"global\",\n  \"remark\": \"Global Basic slab template\"\n}"
    },
    "url": {
      "raw": "{{baseUrl}}/admin/slabs",
      "host": ["{{baseUrl}}"],
      "path": ["admin", "slabs"]
    }
  }
}
```

### 1.2 Get All Global Slabs
**GET** `/admin/slabs/all`

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Your request is successfully executed",
  "data": [
    {
      "id": 1,
      "slabName": "Basic"
    },
    {
      "id": 2,
      "slabName": "Gold"
    }
  ]
}
```

---

## 2. COMPANY SLABS (WhiteLabel Admin)

### 2.1 Create Company Sub-Slab
**POST** `/company/v1/sub-slabs`

**Headers:**
```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```

**Body (raw JSON):**
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

**Postman Collection:**
```json
{
  "name": "Create Company Sub-Slab",
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
      "raw": "{{baseUrl}}/company/v1/sub-slabs",
      "host": ["{{baseUrl}}"],
      "path": ["company", "v1", "sub-slabs"]
    }
  }
}
```

### 2.2 Get All Company Sub-Slabs
**GET** `/company/v1/sub-slabs`

**Query Parameters (optional):**
- `parentSlabId`: Filter by parent slab ID

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

## 3. MASTER DISTRIBUTOR SUB-SLABS

### 3.1 Create MD Sub-Slab
**POST** `/user/v1/sub-slabs`

**Headers:**
```json
{
  "Authorization": "Bearer <token>",
  "Content-Type": "application/json"
}
```

**Body (raw JSON):**
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

### 3.2 Assign Users to MD Sub-Slab
**POST** `/user/v1/sub-slabs/:id/assign-users`

**URL Parameters:**
- `id`: Sub-slab ID (e.g., 20)

**Body (raw JSON):**
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
    "id": 20,
    "users": [301, 302, 303]
  }
}
```

**Postman Collection:**
```json
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
      "raw": "{{baseUrl}}/user/v1/sub-slabs/20/assign-users",
      "host": ["{{baseUrl}}"],
      "path": ["user", "v1", "sub-slabs", "20", "assign-users"]
    }
  }
}
```

---

## 4. DISTRIBUTOR SUB-SLABS

### 4.1 Create Distributor Sub-Slab
**POST** `/user/v1/sub-slabs`

**Body (raw JSON):**
```json
{
  "subSlabName": "D201.Basic",
  "parentSlabId": 20,
  "slabType": "level",
  "remark": "Distributor D-201 Basic sub-slab"
}
```

**Response:**
```json
{
  "status": "SUCCESS",
  "message": "Sub-Slab Created Successfully",
  "data": {
    "id": 30,
    "subSlabName": "D201.Basic",
    "parentSlabId": 20,
    "companyId": 5,
    "userId": 201,
    "userType": 6,
    "slabType": "level",
    "users": [],
    "isActive": true
  }
}
```

### 4.2 Remove Users from Sub-Slab
**POST** `/user/v1/sub-slabs/:id/remove-users`

**Body (raw JSON):**
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
    "id": 30,
    "users": [301, 303]
  }
}
```

---

## 5. UPDATE SUB-SLAB COMMERCIALS

### 5.1 Update Commission for Sub-Slab
**POST** `/admin/slabs/recharge`

**Body (raw JSON):**
```json
{
  "slabId": 20,
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
  "message": "Data is updated Successfully!",
  "data": [
    {
      "id": 150,
      "slabId": 20,
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

## 6. GET SLAB USERS

### 6.1 Get Users Assigned to Slab
**POST** `/admin/slabs/users`

**Body (raw JSON):**
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

## 7. UPDATE SLAB ASSIGNMENT

### 7.1 Assign User to Slab
**PUT** `/admin/slabs/users/:id`

**URL Parameters:**
- `id`: User ID (e.g., 301)

**Body (raw JSON):**
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
      "slab": "MD101.Basic"
    }
  ]
}
```

---

## Complete Postman Collection

```json
{
  "info": {
    "name": "Slab & Sub-Slab APIs",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000/api/v1"
    },
    {
      "key": "token",
      "value": "your_bearer_token_here"
    }
  ],
  "item": [
    {
      "name": "Global Slabs",
      "item": [
        {
          "name": "Create Global Slab",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"slabName\": \"Basic\",\n  \"slabType\": \"level\",\n  \"slabScope\": \"global\",\n  \"remark\": \"Global Basic slab\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/admin/slabs",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs"]
            }
          }
        },
        {
          "name": "Get All Global Slabs",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/admin/slabs/all",
              "host": ["{{baseUrl}}"],
              "path": ["admin", "slabs", "all"]
            }
          }
        }
      ]
    },
    {
      "name": "Company Sub-Slabs",
      "item": [
        {
          "name": "Create Company Sub-Slab",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"subSlabName\": \"Company.Basic\",\n  \"parentSlabId\": 1,\n  \"slabType\": \"level\",\n  \"remark\": \"Company Basic slab\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/company/v1/sub-slabs",
              "host": ["{{baseUrl}}"],
              "path": ["company", "v1", "sub-slabs"]
            }
          }
        },
        {
          "name": "Get All Company Sub-Slabs",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/company/v1/sub-slabs",
              "host": ["{{baseUrl}}"],
              "path": ["company", "v1", "sub-slabs"]
            }
          }
        }
      ]
    },
    {
      "name": "MD/Distributor Sub-Slabs",
      "item": [
        {
          "name": "Create MD Sub-Slab",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"subSlabName\": \"MD101.Basic\",\n  \"parentSlabId\": 10,\n  \"slabType\": \"level\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/user/v1/sub-slabs",
              "host": ["{{baseUrl}}"],
              "path": ["user", "v1", "sub-slabs"]
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
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"userIds\": [301, 302, 303]\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/user/v1/sub-slabs/20/assign-users",
              "host": ["{{baseUrl}}"],
              "path": ["user", "v1", "sub-slabs", "20", "assign-users"]
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
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"userIds\": [302]\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/user/v1/sub-slabs/20/remove-users",
              "host": ["{{baseUrl}}"],
              "path": ["user", "v1", "sub-slabs", "20", "remove-users"]
            }
          }
        }
      ]
    }
  ]
}
```

---

## Notes

1. **Global Slabs**: Created by SUPER_ADMIN only, `companyId` is `null`, `slabScope` is `"global"`
2. **Company Sub-Slabs**: Created by ADMIN/WHITELABEL_ADMIN, `userId` is `null`, references parent global slab
3. **MD Sub-Slabs**: Created by MASTER_DISTRIBUTOR, `userId` is the MD's user ID
4. **Distributor Sub-Slabs**: Created by DISTRIBUTOR, `userId` is the Distributor's user ID
5. **Users Array**: Uses array methods (push, filter) to manage assigned users
6. **Commercials**: Sub-slabs use the same `commSlab` and `pgCommercials` tables as slabs, referenced by `slabId`

---

## Error Responses

**401 Unauthorized:**
```json
{
  "status": "FAILURE",
  "message": "User doesn't have Permission!",
  "data": null
}
```

**404 Not Found:**
```json
{
  "status": "FAILURE",
  "message": "Sub-Slab not found",
  "data": null
}
```

**400 Bad Request:**
```json
{
  "status": "FAILURE",
  "message": "userIds must be an array",
  "data": null
}
```

