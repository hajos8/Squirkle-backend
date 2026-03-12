# Squirkle Backend API

Base URL (local): `http://localhost:3333`

## Auth notes

- Session is created by `POST /api/create-session`.
- Protected endpoints expect header: `Authorization: <sessionId>`.
- Admin-only endpoints check admin membership from Firestore `admins` collection.

## Endpoints

### Health / server

#### GET `/api/hello`
- Description: Test endpoint.
- Success: `200 { "message": "Hello world!" }`

#### GET `/api/server-time`
- Description: Returns server time offset in seconds from `2026-01-01`.
- Success: `200 { "serverTime": <number> }`

#### POST `/api/create-session`
- Body: `userId`
- Success: `201 { "sessionId": "<hash>" }`

---

### User

#### GET `/api/get-username-exists/:username`
- Params: `username`
- Success: `200 { "exists": false }`
- Conflict: `409 { "exists": true }`

#### GET `/api/get-username/:userid`
- Params: `userid`
- Success: `200 { "username": "<username>" }`
- Not found: `404 { "error": "User not found" }`

#### POST `/api/create-username`
- Body: `userId`, `username`
- Success: `201 { "message": "Username created successfully" }`
- Conflict:
  - `409 { "error": "Username already exists" }`
  - `409 { "error": "User already has a username" }`

#### GET `/api/get-permissions/:userid`
- Params: `userid`
- Success: `200 { "isAdmin": true | false }`

#### GET `/api/get-coins/:userid`
- Params: `userid`
- Success: `200 { "coins": <number> }`
- Not found: `404 { "error": "User not found" }`

#### POST `/api/update-coins`
- Headers: `Authorization`
- Body: `userId`, `amount`
- Rules: `amount` must be number between `1` and `1000`.
- Success: `200 { "message": "Coins updated successfully" }`

---

### Base items (admin)

#### GET `/api/get-all-items`
- Description: Returns all base items with first stats document.
- Success: `200 { "items": [...] }`

#### GET `/api/get-item/:itemid`
- Params: `itemid`
- Success: `200 { "item": { ... } }`
- Not found: `404 { "error": "Item not found" }`

#### POST `/api/create-item`
- Body:
  - `userId` (admin)
  - `id`, `name`, `description`, `type`, `knockback`, `imageUrl`
  - `stats` with `circleDamage`, `squareDamage`, `triangleDamage`, `critChance`, `critDamage`, `metadata`
- Rules:
  - `type` must be `weapon` or `armor`
  - `knockback` must be number
- Success: `201 { "message": "Item created successfully", "itemId": "...", "statsId": "..." }`

#### PATCH `/api/update-item/:itemid`
- Params: `itemid`
- Body: `userId` (admin) + any fields to update:
  - item: `name`, `description`, `type`, `knockback`, `imageUrl`
  - stats object: any of `circleDamage`, `squareDamage`, `triangleDamage`, `critChance`, `critDamage`, `metadata`, optional `id`
- Success: `200 { "message": "Item updated successfully" }`

#### DELETE `/api/delete-item/:itemid`
- Params: `itemid`
- Body: `userId` (admin)
- Success: `200 { "message": "Item deleted successfully" }`

---

### User items / equipment / inventory

#### POST `/api/add-user-item`
- Headers: `Authorization`
- Body: `itemId`
- Description: Creates a `user-items` entry for the session user.
- Success: `201 { "message": "Item added to user successfully" }`

#### POST `/api/equip-item`
- Headers: `Authorization`
- Body: `userId`, `userItemId`, `type`
- Rules:
  - `type` must be `weapon` or `armor`
  - user must own the `userItemId`
  - user item base item type must match `type`
- Success: `200 { "message": "Item equipped successfully" }`

#### GET `/api/get-equipped-items/:userId`
- Params: `userId`
- Success: `200 { "items": [{ "type": "weapon|armor", "userItemId": "...", ...userItemData }] }`

#### GET `/api/get-inventory/:userId`
- Params: `userId`
- Success: `200 { "items": [{ "userItemId", "itemId", "name", "description", "type", "knockback", "imageUrl" }] }`
- Note: Invalid inventory entries are skipped.

---

### Listings

#### GET `/api/get-all-listings`
- Success: `200 { "listings": [{ "id", "userId", "itemId", "price", "username", "itemName", "itemImageUrl" }] }`

#### GET `/api/get-user-listings/:userId`
- Params: `userId`
- Success: `200 { "listings": [{ "id", "userId", "itemId", "price", "itemName", "itemImageUrl" }] }`

#### POST `/api/create-listing`
- Body: `userId`, `itemId`, `price`
- Rules: `price > 0`, user must own the provided `itemId`.
- Success: `201 { "message": "Listing created successfully" }`

#### DELETE `/api/delete-listing/:listingId`
- Params: `listingId`
- Body: `userId`
- Rule: requesting user must own listing.
- Success: `200 { "message": "Listing deleted successfully" }`

---

### Image handling (admin)

#### POST `/api/upload-image`
- Content-Type: `multipart/form-data`
- Body fields: `userId`, `file`
- Success: `201 { "url": "<cloudinary_secure_url>" }`

#### DELETE `/api/delete-image`
- Body: `userId`, `filename`
- Success: `200 { "message": "Image deleted successfully", "result": <cloudinary_result> }`