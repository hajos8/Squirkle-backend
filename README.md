# Squirkle Backend API

Backend service for Squirkle, built with Express + Firebase Firestore.

## Local base URL

`http://localhost:3333`

## Tech stack

- Node.js
- Express 5
- Firebase Admin SDK (Firestore)
- Cloudinary
- Multer

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Create a `.env` file with:

```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
FIREBASE_DATABASE_URL=https://<your-project>.firebaseio.com

CLOUDINARY_CLOUD_NAME=<cloudinary_cloud_name>
CLOUDINARY_API_KEY=<cloudinary_api_key>
CLOUDINARY_API_SECRET=<cloudinary_api_secret>
```

Notes:
- `FIREBASE_SERVICE_ACCOUNT` must be valid JSON in a single environment variable.
- The app starts only if Firebase credentials are valid.

3. Start server:

```bash
node index.cjs
```

## Authentication and authorization

- Session token is created with `POST /api/create-session`.
- Protected user endpoints expect `Authorization: <sessionId>` header.
- Admin-only endpoints check if `admins/<userId>` exists in Firestore.

## Core rules

- Allowed item types are case-sensitive: `Weapon`, `Armor`.
- Coin updates accept only positive numeric amounts from 1 to 1000.

## API endpoints

### Health and server

#### `GET /api/hello`
Returns test response.

Success:
```json
{ "message": "Hello world!" }
```

#### `GET /api/server-time`
Returns seconds elapsed since `2026-01-01`.

Success:
```json
{ "serverTime": 12345 }
```

#### `POST /api/create-session`
Body:
```json
{ "userId": "user_123" }
```

Success:
```json
{ "sessionId": "<sha256_hash>" }
```

### Users

#### `GET /api/get-username-exists/:username`
- `200`: `{ "exists": false }`
- `409`: `{ "exists": true }`

#### `GET /api/get-username/:userid`
- `200`: `{ "username": "player1" }`
- `404`: `{ "error": "User not found" }`

#### `POST /api/create-username`
Body:
```json
{ "userId": "user_123", "username": "player1" }
```

- `201`: created
- `409`: username exists or user already has a username

#### `GET /api/get-permissions/:userid`
Success:
```json
{ "isAdmin": true }
```

#### `GET /api/get-coins/:userid`
- `200`: `{ "coins": 0 }`
- `404`: `{ "error": "User not found" }`

#### `POST /api/update-coins`
Headers:
- `Authorization: <sessionId>`

Body:
```json
{ "userId": "user_123", "amount": 50 }
```

- `200`: `{ "message": "Coins updated successfully" }`
- `403`: invalid session
- `400`: invalid amount

### Metadata (admin)

#### `GET /api/get-all-metadatas`
Returns all metadata documents.

#### `GET /api/get-metadata/:metadataid`
- `200`: `{ "metadata": { "id": "...", ... } }`
- `404`: metadata not found

#### `POST /api/create-metadata`
Body:
```json
{
  "userId": "admin_user",
  "id": "rare",
  "title": "Rare",
  "description": "Rare tier",
  "backgroundColor": "#112233",
  "textColor": "#ffffff"
}
```

#### `PATCH /api/update-metadata/:metadataid`
Intended to update any of:
- `title`
- `description`
- `backgroundColor`
- `textColor`

#### `DELETE /api/delete-metadata/:metadataid`
Deletes metadata document.

### Items (admin)

#### `GET /api/get-all-items`
Returns all base items with first `stats` subdocument attached as `stats`.

#### `GET /api/get-item/:itemid`
- `200`: `{ "item": { ... } }`
- `404`: item not found

#### `POST /api/create-item`
Body fields:
- `userId`, `id`, `name`, `description`, `type`, `knockback`, `imageName`, `imageUrl`
- `stats`: `circleDamage`, `squareDamage`, `triangleDamage`, `critChance`, `critDamage`, `metadata`

#### `PATCH /api/update-item/:itemid`
Updatable item fields:
- `name`, `description`, `type`, `knockback`, `imageName`, `imageUrl`

Optional `stats` object supports partial updates.

#### `DELETE /api/delete-item/:itemid`
Body:
```json
{ "userId": "admin_user" }
```

### User items and equipment

#### `POST /api/add-user-item`
Headers:
- `Authorization: <sessionId>`

Body:
```json
{ "itemId": "base_item_1" }
```

Creates a new document in `user-items` and appends its id to user inventory.

#### `POST /api/equip-item`
Headers:
- `Authorization: <sessionId>`

Body:
```json
{ "userId": "user_123", "userItemId": "abc123", "type": "Weapon" }
```

Notes:
- Pass `userItemId: null` to unequip a type.
- `type` must match the base item type and must be `Weapon` or `Armor`.

#### `GET /api/get-equipped-items/:userId`
Returns currently equipped items that still exist in inventory.

#### `GET /api/get-inventory/:userId`
Returns hydrated inventory entries with base item data.

### Listings

#### `GET /api/get-all-listings`
Returns marketplace list with seller username and item preview data.

#### `GET /api/get-user-listings/:userId`
Returns listings created by one user.

#### `GET /api/get-listed-user-item-ids/:userId`
Returns unique `userItemId` values currently listed by the user.

#### `POST /api/create-listing`
Currently active handler expects:

```json
{
  "userId": "user_123",
  "itemId": "base_item_1",
  "userItemId": "user_item_1",
  "price": 500
}
```

Creates listing with `active: true`.

#### `DELETE /api/delete-listing/:listingId`
Body:
```json
{ "userId": "user_123" }
```

Only listing owner can delete.

### Image handling (admin)

#### `POST /api/upload-image`
Content type:
- `multipart/form-data`

Form fields:
- `userId`
- `file`

Uploads to Cloudinary with `public_id = original file name`.

#### `DELETE /api/delete-image`
Body:
```json
{ "userId": "admin_user", "filename": "file_public_id" }
```

## Firestore collections used

- `users`
- `user-items`
- `admins`
- `items` (with `stats` subcollection)
- `listings`
- `metadatas`

## Known issues in current code

- `POST /api/create-listing` is defined twice in code. The first definition handles requests.
- `PATCH /api/update-metadata/:metadataid` currently references `metadataUpdates` without defining it.
- `GET /api/get-inventory/:userId` calls `hydrateStatsWithMetadata`, which is not defined in the current file.