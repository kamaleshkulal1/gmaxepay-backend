# Slab & Sub-Slab Implementation Summary

## Overview
This implementation provides a hierarchical slab and sub-slab system where:
- **Super Admin** creates global slab templates
- **Company (WhiteLabel Admin)** creates company-level sub-slabs
- **Master Distributors** and **Distributors** create their own sub-slabs with custom commercials
- Multiple users can be assigned to slabs/sub-slabs using array methods

## Files Created/Modified

### Models
1. **`models/subSlabs.js`** (NEW)
   - Sub-slab model with `parentSlabId` reference
   - Supports hierarchical structure
   - Includes `users` array field for multiple user assignments

2. **`models/slab.js`** (MODIFIED)
   - Changed `companyId` to `allowNull: true` for global slabs

3. **`models/index.js`** (MODIFIED)
   - Added `subSlabs` model
   - Added relationships: subSlabs → slab, subSlabs → company, subSlabs → user

### Controllers
1. **`controller/admin/v1/subSlabController.js`** (NEW)
   - `createSubSlab`: Create sub-slabs with commercials
   - `getAllSubSlabs`: List all accessible sub-slabs
   - `getSubSlab`: Get single sub-slab
   - `updateSubSlab`: Update sub-slab details
   - `assignUsersToSubSlab`: Assign multiple users (array methods)
   - `removeUsersFromSubSlab`: Remove users (array methods)
   - `deleteSubSlab`: Soft delete sub-slab

2. **`controller/admin/v1/slabController.js`** (MODIFIED)
   - Fixed global slab creation (companyId = null)
   - Added sequelize import for where/cast operations

### Routes
1. **`routes/admin/v1/slabRoute.js`** (NEW)
   - Separate route file for all slab and sub-slab operations
   - Includes both slab and sub-slab endpoints

2. **`routes/admin/index.js`** (MODIFIED)
   - Replaced inline slab routes with route file reference
   - Removed subscription routes

3. **`routes/company/v1/slabRoute.js`** (NEW)
   - Company-level slab and sub-slab routes

4. **`routes/user/v1/slabRoute.js`** (NEW)
   - User-level (MD, Distributor, Retailer) slab and sub-slab routes

5. **`routes/company/index.js`** (MODIFIED)
   - Added slab routes

6. **`routes/user/index.js`** (MODIFIED)
   - Added slab routes

## API Endpoints

### Admin Routes (`/api/v1/admin/slabs`)
- `POST /` - Create global slab (Super Admin only)
- `GET /` - List all slabs
- `GET /all` - Get all slabs (simple list)
- `GET /:id` - Get single slab
- `PUT /:id` - Update slab
- `PATCH /:id` - Partial update slab
- `DELETE /:id` - Delete slab
- `POST /sub-slabs` - Create sub-slab
- `GET /sub-slabs` - List all sub-slabs
- `GET /sub-slabs/:id` - Get single sub-slab
- `PUT /sub-slabs/:id` - Update sub-slab
- `DELETE /sub-slabs/:id` - Delete sub-slab
- `POST /sub-slabs/:id/assign-users` - Assign users to sub-slab
- `POST /sub-slabs/:id/remove-users` - Remove users from sub-slab

### Company Routes (`/api/v1/company/v1`)
- `GET /slabs` - View accessible slabs
- `GET /slabs/all` - Get all slabs list
- `GET /slabs/:id` - Get single slab
- `POST /sub-slabs` - Create company sub-slab
- `GET /sub-slabs` - List company sub-slabs
- `GET /sub-slabs/:id` - Get company sub-slab
- `PUT /sub-slabs/:id` - Update company sub-slab
- `DELETE /sub-slabs/:id` - Delete company sub-slab
- `POST /sub-slabs/:id/assign-users` - Assign users
- `POST /sub-slabs/:id/remove-users` - Remove users

### User Routes (`/api/v1/user/v1`)
- Same as company routes, but filtered by user permissions

## Hierarchy Structure

```
SUPER_ADMIN
  └── Global Slabs (companyId = null)
      ├── Basic
      ├── Gold
      ├── Platinum
      └── Custom

COMPANY (WhiteLabel Admin)
  └── Company Sub-Slabs (userId = null, references global slab)
      ├── Company.Basic
      ├── Company.Gold
      ├── Company.Platinum
      └── Company.Custom

MASTER_DISTRIBUTOR
  └── MD Sub-Slabs (userId = MD ID, references company or global slab)
      ├── MD101.Basic
      ├── MD101.Gold
      └── MD101.Platinum

DISTRIBUTOR
  └── Distributor Sub-Slabs (userId = Distributor ID, references MD or company slab)
      ├── D201.Basic
      ├── D201.Gold
      └── D201.Platinum

RETAILER
  └── Assigned to a sub-slab (via users array)
```

## Key Features

1. **Hierarchical Inheritance**: Sub-slabs can reference parent slabs
2. **Multiple User Assignment**: Users array supports assigning multiple users to a slab/sub-slab
3. **Commercial Management**: Sub-slabs automatically create commercials (commSlab, pgCommercials) similar to slabs
4. **Scope-Based Access**: Global slabs (companyId = null) vs private slabs (companyId set)
5. **User Type Filtering**: MD/Distributor can only see/manage their own sub-slabs

## Array Methods Usage

### Assign Users
```javascript
// Uses array spread and Set to avoid duplicates
const uniqueUserIds = [...new Set([...currentUsers, ...userIds])];
```

### Remove Users
```javascript
// Uses filter to remove specific user IDs
const filteredUsers = currentUsers.filter(id => !userIds.includes(id));
```

## Database Schema

### SubSlabs Table
- `id` - Primary key
- `parentSlabId` - Foreign key to Slab (nullable)
- `companyId` - Foreign key to Company (required)
- `userId` - Foreign key to User (nullable for company-level)
- `userType` - User type (5=MD, 6=Distributor, etc.)
- `subSlabName` - Unique name
- `slabType` - 'level' or 'channel'
- `users` - ARRAY[INTEGER] for assigned user IDs
- Standard audit fields (addedBy, updatedBy, createdAt, etc.)

### Commercials
- Uses existing `commSlab` and `pgCommercials` tables
- `slabId` references sub-slab ID (same structure as regular slabs)

## Testing Checklist

- [ ] Create global slab as Super Admin
- [ ] Create company sub-slab as WhiteLabel Admin
- [ ] Create MD sub-slab as Master Distributor
- [ ] Create Distributor sub-slab as Distributor
- [ ] Assign multiple users to sub-slab
- [ ] Remove users from sub-slab
- [ ] Verify commercials are created for sub-slabs
- [ ] Verify user permissions are enforced
- [ ] Verify company filtering works correctly

## Postman Collection

See `POSTMAN_SLAB_API_DOCUMENTATION.md` for complete API documentation with JSON examples.

