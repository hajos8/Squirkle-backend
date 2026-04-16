# Squirkle Backend API

Backend service for Squirkle built with Express, Firebase Firestore, and Cloudinary.

## Overview

- Runtime: Node.js (CommonJS)
- Framework: Express 5
- Database: Firebase Firestore (via `firebase-admin`)
- File storage: Cloudinary
- Upload parser: Multer (memory storage)
- Local default URL: `http://localhost:3333`

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

2. Create `.env`:

```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
FIREBASE_DATABASE_URL=https://<your-project>.firebaseio.com

CLOUDINARY_CLOUD_NAME=<cloudinary_cloud_name>
CLOUDINARY_API_KEY=<cloudinary_api_key>
CLOUDINARY_API_SECRET=<cloudinary_api_secret>
```

3. Start server:

```bash
node index.cjs
```

Notes:
- `FIREBASE_SERVICE_ACCOUNT` must be valid JSON encoded into one env var.
- The current port is hardcoded to `3333`.
- Available scripts:
	- `pnpm start` runs `node index.cjs`
	- `pnpm dev` runs `node --watch index.cjs`

## Authentication and Authorization Model

This API uses two access patterns:

1. Session-based actions
- Create a session with `POST /api/create-session`.
- Some endpoints require `:sessionId` in the URL and validate it against `sessions/<userId>.sessionId`.

2. Admin-gated actions
- Admin checks are performed by verifying document existence in `admins/<userId>`.
- Admin-only endpoints return `403` when the user is not authorized.

## API Conventions

- Base prefix: `/api`
- JSON for most endpoints
- Error shape (typical):

```json
{
	"error": "Human-readable error message"
}
```

- Some endpoints use explicit business-status codes:
	- Username exists check returns `409` with `{ "exists": true }`
	- Several validation failures return `400`

## Business Rules

- Allowed item `type` values are case-sensitive: `Weapon`, `Armor`
- Coin update amount constraints in `POST /api/update-coins/:sessionId`:
	- Numeric
	- Greater than `0`
	- Less than or equal to `1000`

## Firestore Data Model

Collections used:

- `users`
	- user profile fields (`username`, `coins`, `inventory`)
	- equipped items subcollection: `users/<userId>/equipped/<type>`
- `sessions`
	- `sessions/<userId> { sessionId }`
- `admins`
	- admin users by document ID
- `items`
	- base item data and nested stats subcollection `items/<itemId>/stats/<statsId>`
- `user-items`
	- per-user owned item instances
- `listings`
	- marketplace listings (`active`, `price`, `userId`, `itemId`, `userItemId`, etc.)
- `metadatas`
	- shared metadata entries for item styling/rarity-like data
- `areas`
	- purchasable world/zone entries (`name`, `imageUrl`, `price`)

## Endpoint Reference

### System

#### `GET /api/hello`
- Summary: Health check endpoint.
- Responses: `200`

#### `GET /api/server-time`
- Summary: Get server time offset in seconds.
- Responses: `200`

### Sessions

#### `POST /api/create-session`
- Summary: Create a session token for a user.
- Body:

```json
{
	"userId": "user_123"
}
```

- Responses: `201`, `400`, `500`

### Users and Coins

#### `GET /api/get-username-exists/:username`
- Summary: Check username availability.
- Params: `username`
- Responses: `200`, `400`, `409`, `500`

#### `GET /api/get-username/:userid`
- Summary: Get username by user ID.
- Params: `userid`
- Responses: `200`, `400`, `404`, `500`

#### `POST /api/create-username`
- Summary: Create username for a user.
- Body:

```json
{
	"userId": "user_123",
	"username": "player1"
}
```

- Responses: `201`, `400`, `409`, `500`

#### `GET /api/get-permissions/:userid`
- Summary: Check whether a user is admin.
- Params: `userid`
- Responses: `200`, `400`, `500`

#### `GET /api/get-coins/:userid`
- Summary: Get coin balance for a user.
- Params: `userid`
- Responses: `200`, `400`, `404`, `500`

#### `POST /api/update-coins/:sessionId`
- Summary: Add coins for an authenticated user session.
- Params: `sessionId`
- Body:

```json
{
	"userId": "user_123",
	"amount": 50
}
```

- Responses: `200`, `400`, `403`, `404`, `500`

### Metadata

#### `GET /api/get-all-metadatas`
- Summary: List all metadata entries.
- Responses: `200`, `500`

#### `GET /api/get-metadata/:metadataid`
- Summary: Get one metadata entry by ID.
- Params: `metadataid`
- Responses: `200`, `400`, `404`, `500`

#### `POST /api/create-metadata`
- Summary: Create metadata entry.
- Authorization: Admin required
- Responses: `201`, `400`, `403`, `409`, `500`

#### `PATCH /api/update-metadata/:metadataid`
- Summary: Update metadata entry fields.
- Authorization: Admin required
- Params: `metadataid`
- Responses: `200`, `400`, `403`, `404`, `500`

#### `DELETE /api/delete-metadata/:metadataid`
- Summary: Delete metadata entry.
- Authorization: Admin required
- Params: `metadataid`
- Responses: `200`, `400`, `403`, `404`, `500`

### Items

#### `GET /api/get-all-items`
- Summary: List all base items.
- Responses: `200`, `500`

#### `GET /api/get-item/:itemid`
- Summary: Get one base item by ID.
- Params: `itemid`
- Responses: `200`, `404`, `500`

#### `POST /api/create-item`
- Summary: Create base item and stats.
- Authorization: Admin required
- Responses: `201`, `400`, `403`, `409`, `500`

#### `PATCH /api/update-item/:itemid`
- Summary: Update base item and/or stats.
- Authorization: Admin required
- Params: `itemid`
- Responses: `200`, `400`, `403`, `404`, `500`

#### `DELETE /api/delete-item/:itemid`
- Summary: Delete base item.
- Authorization: Admin required
- Params: `itemid`
- Responses: `200`, `400`, `403`, `500`

### Inventory and Equipment

#### `POST /api/add-user-item/:sessionId`
- Summary: Add a base item instance to user inventory.
- Params: `sessionId`
- Responses: `201`, `400`, `403`, `404`, `500`

#### `POST /api/equip-item/:sessionId`
- Summary: Equip or unequip a user item.
- Params: `sessionId`
- Responses: `200`, `400`, `403`, `404`, `500`

#### `GET /api/get-equipped-items/:userId`
- Summary: Get equipped user items.
- Params: `userId`
- Responses: `200`, `400`, `404`, `500`

#### `GET /api/get-inventory/:userId`
- Summary: Get resolved inventory for a user.
- Params: `userId`
- Responses: `200`, `400`, `404`, `500`

### Listings and Marketplace

#### `GET /api/get-all-active-listings`
- Summary: List all active marketplace listings.
- Responses: `200`, `500`

#### `GET /api/get-all-inactive-listings`
- Summary: List all inactive marketplace listings.
- Responses: `200`, `500`

#### `GET /api/get-user-listings/:userId`
- Summary: List all listings created by a user.
- Params: `userId`
- Responses: `200`, `400`, `500`

#### `GET /api/get-listed-user-item-ids/:userId`
- Summary: Get listed user-item IDs for a user.
- Params: `userId`
- Responses: `200`, `400`, `500`

#### `POST /api/create-listing`
- Summary: Create marketplace listing.
- Responses: `201`, `400`, `403`, `404`, `500`

#### `DELETE /api/delete-listing/:listingId`
- Summary: Delete marketplace listing.
- Params: `listingId`
- Responses: `200`, `400`, `403`, `404`, `500`

#### `POST /api/buy-listing/:listingId`
- Summary: Buy an active marketplace listing.
- Params: `listingId`
- Responses (documented): `200`, `400`, `404`, `500`

### Areas

#### `GET /api/get-all-area`
- Summary: List all available areas.
- Responses: `200`, `500`

#### `GET /api/get-user-areas/:userId`
- Summary: Get owned areas for a user.
- Params: `userId`
- Responses: `200`, `400`, `404`, `500`

#### `POST /api/purchase-area/:areaId`
- Summary: Purchase an area for a user.
- Params: `areaId`
- Body:

```json
{
	"userId": "user_123"
}
```

- Responses: `200`, `400`, `404`, `500`

### Images

#### `POST /api/upload-image`
- Summary: Upload image to Cloudinary.
- Authorization: Admin required
- Content-Type: `multipart/form-data`
- Form fields:
	- `userId` (text)
	- `file` (binary)
- Responses: `201`, `400`, `403`, `500`

#### `DELETE /api/delete-image`
- Summary: Delete image from Cloudinary.
- Authorization: Admin required
- Body:

```json
{
	"userId": "admin_1",
	"filename": "sword.png"
}
```

- Responses: `200`, `400`, `403`, `500`

## Example Request Flow

Typical player flow:

1. Create session
	 - `POST /api/create-session`
2. Ensure username exists
	 - `POST /api/create-username`
3. Query inventory state
	 - `GET /api/get-inventory/:userId`
4. Perform authenticated mutation
	 - `POST /api/add-user-item/:sessionId`
	 - `POST /api/equip-item/:sessionId`

Typical admin flow:

1. Confirm admin permission
	 - `GET /api/get-permissions/:userid`
2. Upload item image
	 - `POST /api/upload-image`
3. Create metadata and base item
	 - `POST /api/create-metadata`
	 - `POST /api/create-item`

## Operational Notes

- CORS is enabled globally.
- Request payload parsing supports JSON and URL-encoded bodies.
- Cloudinary and Firebase configuration values are logged at startup (without exposing secret values directly).

## Future Improvements (Optional)

- Add request validation middleware to centralize schema checks
- Add automated tests and an OpenAPI export
- Add endpoint rate limiting and structured logging
