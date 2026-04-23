# Squirkle Backend API

Backend service for Squirkle built with Express, Firebase Firestore, and Cloudinary.

## Overview

- Runtime: Node.js (CommonJS)
- Framework: Express 5
- Database: Firebase Firestore (via `firebase-admin`)
- File storage: Cloudinary
- Upload parser: Multer (memory storage)
- Local default URL: `http://localhost:3333`

## Related Repositories

- Frontend: https://github.com/SagiBeno/Squirkle-frontend
- Game: https://github.com/KristoffRed/Squirkle-Unity

## Deployment

- Backend URL: https://squirkle-backend.vercel.app/

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
	- `pnpm test` runs the Vitest suite once
	- `pnpm test:watch` runs Vitest in watch mode
	- `pnpm test:coverage` runs Vitest with coverage output

## Testing (Vitest)

This project uses Vitest with a Node environment and module mocks for Firebase Admin, Cloudinary, and dotenv.

Run tests:

```bash
pnpm test
```

Run in watch mode:

```bash
pnpm test:watch
```

Run with coverage:

```bash
pnpm test:coverage
```

Current baseline test scope:
- Session utility: `generateSessionId`
- System routes: `GET /api/hello`, `GET /api/server-time`
- Session route: `POST /api/create-session`

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

### Firestore Structure Diagram

![Firestore data structure diagram](backend.png)

## Function Reference

### `generateSessionId(userId)` => `string`

Generates a unique session ID for a user based on their user ID,
current timestamp, and a random salt.

**Kind**: global function
**Returns**: `string` - The generated SHA-256 session ID.

| Param  | Type     | Description         |
| ------ | -------- | ------------------- |
| userId | `string` | The ID of the user. |

### `isAdmin(userId)` => `Promise<boolean>`

Checks if a given user is an admin by querying the `admins` collection.

**Kind**: global function
**Returns**: `Promise<boolean>` - Resolves to `true` if the user is an admin, `false` otherwise.

| Param  | Type     | Description                  |
| ------ | -------- | ---------------------------- |
| userId | `string` | The ID of the user to check. |

## Endpoint Reference

Conventions for placeholders in this section:
- Placeholder JSON is illustrative and not a strict schema contract.
- Field names and nested structures can vary by route implementation.
- Error payloads typically follow `{ "error": "message" }`.

### System

#### `GET /api/hello` => `HelloResponse`
Summary: Health check endpoint.

**Kind**: endpoint
**Auth**: Public

Request placeholder:

```json
{}
```

| Status | Meaning           | Response Shape          | Notes                     |
| ------ | ----------------- | ----------------------- | ------------------------- |
| 200    | Service reachable | `{ "message": string }` | Basic API liveness check. |

Response placeholder (200):

```json
{
	"message": "Hello from Squirkle API"
}
```

#### `GET /api/server-time` => `ServerTimeResponse`
Summary: Get server time offset in seconds.

**Kind**: endpoint
**Auth**: Public

Request placeholder:

```json
{}
```

| Status | Meaning                | Response Shape             | Notes                                     |
| ------ | ---------------------- | -------------------------- | ----------------------------------------- |
| 200    | Time metadata returned | `{ "serverTime": number }` | Value is server-side time representation. |

Response placeholder (200):

```json
{
	"serverTime": 1713866400
}
```

### Sessions

#### `POST /api/create-session` => `CreateSessionResponse`
Summary: Create a session token for a user.

**Kind**: endpoint
**Auth**: Public

| Body Field | Type     | Required | Description                     |
| ---------- | -------- | -------- | ------------------------------- |
| userId     | `string` | Yes      | User ID for session generation. |

Request placeholder:

```json
{
	"userId": "user_123"
}
```

| Status | Meaning          | Response Shape            | Notes                                     |
| ------ | ---------------- | ------------------------- | ----------------------------------------- |
| 201    | Session created  | `{ "sessionId": string }` | Session stored under `sessions/<userId>`. |
| 400    | Validation error | `{ "error": string }`     | Missing or invalid `userId`.              |
| 500    | Internal error   | `{ "error": string }`     | Firestore write or server failure.        |

Response placeholder (201):

```json
{
	"sessionId": "3db6eb7c3f8cf95b8b28d37b1ec35516..."
}
```

Response placeholder (error):

```json
{
	"error": "Missing userId"
}
```

### Users

#### `GET /api/get-username-exists/:username` => `UsernameExistsResponse`
Summary: Check username availability.

**Kind**: endpoint
**Auth**: Public

| Param    | Type     | Required | Description       |
| -------- | -------- | -------- | ----------------- |
| username | `string` | Yes      | Username to test. |

Request placeholder:

Path example:

`GET /api/get-username-exists/player1`

| Status | Meaning                 | Response Shape        | Notes                              |
| ------ | ----------------------- | --------------------- | ---------------------------------- |
| 200    | Username available      | `{ "exists": false }` | Can be used for account setup.     |
| 409    | Username already exists | `{ "exists": true }`  | Explicit business-status conflict. |
| 400    | Validation error        | `{ "error": string }` | Missing/invalid param.             |
| 500    | Internal error          | `{ "error": string }` | Query failure.                     |

Response placeholder (200):

```json
{
	"exists": false
}
```

Response placeholder (409):

```json
{
	"exists": true
}
```

#### `GET /api/get-username/:userid` => `GetUsernameResponse`
Summary: Get username by user ID.

**Kind**: endpoint
**Auth**: Public

| Param  | Type     | Required | Description                  |
| ------ | -------- | -------- | ---------------------------- |
| userid | `string` | Yes      | User document ID in `users`. |

Request placeholder:

Path example:

`GET /api/get-username/user_123`

| Status | Meaning          | Response Shape           | Notes                         |
| ------ | ---------------- | ------------------------ | ----------------------------- |
| 200    | Username found   | `{ "username": string }` | User exists and has username. |
| 404    | User not found   | `{ "error": string }`    | No matching user record.      |
| 400    | Validation error | `{ "error": string }`    | Missing/invalid `userid`.     |
| 500    | Internal error   | `{ "error": string }`    | Firestore read failure.       |

Response placeholder (200):

```json
{
	"username": "player1"
}
```

Response placeholder (error):

```json
{
	"error": "User not found"
}
```

#### `POST /api/create-username` => `CreateUsernameResponse`
Summary: Create username for a user.

**Kind**: endpoint
**Auth**: Public

| Body Field | Type     | Required | Description       |
| ---------- | -------- | -------- | ----------------- |
| userId     | `string` | Yes      | Target user ID.   |
| username   | `string` | Yes      | Desired username. |

Request placeholder:

```json
{
	"userId": "user_123",
	"username": "player1"
}
```

| Status | Meaning           | Response Shape                            | Notes                               |
| ------ | ----------------- | ----------------------------------------- | ----------------------------------- |
| 201    | Username created  | `{ "success": true, "username": string }` | Username persisted on user profile. |
| 409    | Username conflict | `{ "error": string }`                     | Username already taken.             |
| 400    | Validation error  | `{ "error": string }`                     | Missing fields or invalid format.   |
| 500    | Internal error    | `{ "error": string }`                     | Write/query failure.                |

Response placeholder (201):

```json
{
	"success": true,
	"username": "player1"
}
```

### Admin

#### `GET /api/get-permissions/:userid` => `PermissionsResponse`
Summary: Check whether a user is admin.

**Kind**: endpoint
**Auth**: Public

| Param  | Type     | Required | Description          |
| ------ | -------- | -------- | -------------------- |
| userid | `string` | Yes      | User ID to evaluate. |

Request placeholder:

Path example:

`GET /api/get-permissions/user_123`

| Status | Meaning                   | Response Shape           | Notes                                 |
| ------ | ------------------------- | ------------------------ | ------------------------------------- |
| 200    | Permission state returned | `{ "isAdmin": boolean }` | Based on `admins/<userid>` existence. |
| 400    | Validation error          | `{ "error": string }`    | Missing or invalid user ID.           |
| 500    | Internal error            | `{ "error": string }`    | Permission check failed.              |

Response placeholder (200):

```json
{
	"isAdmin": false
}
```

#### `GET /api/check-admin/:userId` => `CheckAdminResponse`
Summary: Check admin status for a user by ID.

**Kind**: endpoint
**Auth**: Public

| Param  | Type     | Required | Description          |
| ------ | -------- | -------- | -------------------- |
| userId | `string` | Yes      | User ID to evaluate. |

Request placeholder:

Path example:

`GET /api/check-admin/user_123`

| Status | Meaning               | Response Shape           | Notes                               |
| ------ | --------------------- | ------------------------ | ----------------------------------- |
| 200    | Admin status returned | `{ "isAdmin": boolean }` | Alternate endpoint for admin check. |
| 400    | Validation error      | `{ "error": string }`    | Missing or invalid path param.      |
| 500    | Internal error        | `{ "error": string }`    | Permission lookup failed.           |

Response placeholder (200):

```json
{
	"isAdmin": true
}
```

### Coins

#### `GET /api/get-coins/:userid` => `GetCoinsResponse`
Summary: Get coin balance for a user.

**Kind**: endpoint
**Auth**: Public

| Param  | Type     | Required | Description      |
| ------ | -------- | -------- | ---------------- |
| userid | `string` | Yes      | User ID to load. |

Request placeholder:

Path example:

`GET /api/get-coins/user_123`

| Status | Meaning          | Response Shape        | Notes                               |
| ------ | ---------------- | --------------------- | ----------------------------------- |
| 200    | Coins retrieved  | `{ "coins": number }` | Coin balance returned from profile. |
| 404    | User not found   | `{ "error": string }` | User document missing.              |
| 400    | Validation error | `{ "error": string }` | Invalid/missing `userid`.           |
| 500    | Internal error   | `{ "error": string }` | Read failure.                       |

Response placeholder (200):

```json
{
	"coins": 1250
}
```

#### `POST /api/update-coins/:sessionId` => `UpdateCoinsResponse`
Summary: Add coins for an authenticated user session.

**Kind**: endpoint
**Auth**: Session required (`:sessionId`)

| Param     | Type     | Required | Description           |
| --------- | -------- | -------- | --------------------- |
| sessionId | `string` | Yes      | Active session token. |

| Body Field | Type     | Required | Description                           |
| ---------- | -------- | -------- | ------------------------------------- |
| userId     | `string` | Yes      | User receiving coins.                 |
| amount     | `number` | Yes      | Positive increment value (`<= 1000`). |

Request placeholder:

Path example:

`POST /api/update-coins/session_abc123`

Body placeholder:

```json
{
	"userId": "user_123",
	"amount": 50
}
```

| Status | Meaning                | Response Shape        | Notes                                   |
| ------ | ---------------------- | --------------------- | --------------------------------------- |
| 200    | Coins updated          | `{ "coins": number }` | Returns updated balance.                |
| 403    | Session unauthorized   | `{ "error": string }` | Session does not match user.            |
| 404    | User/session not found | `{ "error": string }` | Missing user or missing session record. |
| 400    | Validation error       | `{ "error": string }` | `amount` must be positive and <= 1000.  |
| 500    | Internal error         | `{ "error": string }` | Update failure.                         |

Response placeholder (200):

```json
{
	"coins": 1300
}
```

### Metadata

#### `GET /api/get-all-metadatas` => `GetAllMetadatasResponse`
Summary: List all metadata entries.

**Kind**: endpoint
**Auth**: Public

Request placeholder:

```json
{}
```

| Status | Meaning                | Response Shape              | Notes                           |
| ------ | ---------------------- | --------------------------- | ------------------------------- |
| 200    | Metadata list returned | `{ "metadatas": object[] }` | Returns all metadata documents. |
| 500    | Internal error         | `{ "error": string }`       | Query failure.                  |

Response placeholder (200):

```json
{
	"metadatas": [
		{
			"id": "meta_rare",
			"name": "Rare",
			"color": "#3abf7a"
		}
	]
}
```

#### `GET /api/get-metadata/:metadataid` => `GetMetadataResponse`
Summary: Get one metadata entry by ID.

**Kind**: endpoint
**Auth**: Public

| Param      | Type     | Required | Description           |
| ---------- | -------- | -------- | --------------------- |
| metadataid | `string` | Yes      | Metadata document ID. |

Request placeholder:

Path example:

`GET /api/get-metadata/meta_rare`

| Status | Meaning          | Response Shape           | Notes                             |
| ------ | ---------------- | ------------------------ | --------------------------------- |
| 200    | Metadata found   | `{ "metadata": object }` | Matching metadata entry returned. |
| 404    | Not found        | `{ "error": string }`    | No matching metadata ID.          |
| 400    | Validation error | `{ "error": string }`    | Missing or invalid `metadataid`.  |
| 500    | Internal error   | `{ "error": string }`    | Read failure.                     |

Response placeholder (200):

```json
{
	"metadata": {
		"id": "meta_rare",
		"name": "Rare",
		"color": "#3abf7a"
	}
}
```

#### `POST /api/create-metadata` => `CreateMetadataResponse`
Summary: Create metadata entry.

**Kind**: endpoint
**Auth**: Admin required

| Body Field | Type     | Required | Description                     |
| ---------- | -------- | -------- | ------------------------------- |
| userId     | `string` | Yes      | Admin user ID.                  |
| name       | `string` | Yes      | Metadata display name.          |
| color      | `string` | No       | Optional color or style marker. |

Request placeholder:

```json
{
	"userId": "admin_1",
	"name": "Rare",
	"color": "#3abf7a"
}
```

| Status | Meaning          | Response Shape                         | Notes                                   |
| ------ | ---------------- | -------------------------------------- | --------------------------------------- |
| 201    | Metadata created | `{ "id": string, "metadata": object }` | New metadata entry created.             |
| 403    | Forbidden        | `{ "error": string }`                  | Requesting user is not admin.           |
| 409    | Conflict         | `{ "error": string }`                  | Duplicate metadata key/name constraint. |
| 400    | Validation error | `{ "error": string }`                  | Missing required fields.                |
| 500    | Internal error   | `{ "error": string }`                  | Write failure.                          |

Response placeholder (201):

```json
{
	"id": "meta_rare",
	"metadata": {
		"name": "Rare",
		"color": "#3abf7a"
	}
}
```

#### `PATCH /api/update-metadata/:metadataid` => `UpdateMetadataResponse`
Summary: Update metadata entry fields.

**Kind**: endpoint
**Auth**: Admin required

| Param      | Type     | Required | Description                    |
| ---------- | -------- | -------- | ------------------------------ |
| metadataid | `string` | Yes      | Metadata document ID to patch. |

| Body Field | Type     | Required | Description         |
| ---------- | -------- | -------- | ------------------- |
| userId     | `string` | Yes      | Admin user ID.      |
| name       | `string` | No       | New metadata name.  |
| color      | `string` | No       | New metadata color. |

Request placeholder:

Path example:

`PATCH /api/update-metadata/meta_rare`

Body placeholder:

```json
{
	"userId": "admin_1",
	"name": "Epic"
}
```

| Status | Meaning          | Response Shape        | Notes                               |
| ------ | ---------------- | --------------------- | ----------------------------------- |
| 200    | Metadata updated | `{ "success": true }` | At least one mutable field updated. |
| 403    | Forbidden        | `{ "error": string }` | Admin check failed.                 |
| 404    | Not found        | `{ "error": string }` | Metadata ID does not exist.         |
| 400    | Validation error | `{ "error": string }` | Invalid ID or no valid fields.      |
| 500    | Internal error   | `{ "error": string }` | Update failure.                     |

Response placeholder (200):

```json
{
	"success": true
}
```

#### `DELETE /api/delete-metadata/:metadataid` => `DeleteMetadataResponse`
Summary: Delete metadata entry.

**Kind**: endpoint
**Auth**: Admin required

| Param      | Type     | Required | Description                     |
| ---------- | -------- | -------- | ------------------------------- |
| metadataid | `string` | Yes      | Metadata document ID to delete. |

| Body Field | Type     | Required | Description    |
| ---------- | -------- | -------- | -------------- |
| userId     | `string` | Yes      | Admin user ID. |

Request placeholder:

Path example:

`DELETE /api/delete-metadata/meta_rare`

Body placeholder:

```json
{
	"userId": "admin_1"
}
```

| Status | Meaning          | Response Shape        | Notes                           |
| ------ | ---------------- | --------------------- | ------------------------------- |
| 200    | Metadata deleted | `{ "success": true }` | Document removed.               |
| 403    | Forbidden        | `{ "error": string }` | Admin check failed.             |
| 404    | Not found        | `{ "error": string }` | Metadata not found.             |
| 400    | Validation error | `{ "error": string }` | Invalid metadata ID or user ID. |
| 500    | Internal error   | `{ "error": string }` | Delete failure.                 |

Response placeholder (200):

```json
{
	"success": true
}
```

### Items

#### `GET /api/get-all-items` => `GetAllItemsResponse`
Summary: List all base items.

**Kind**: endpoint
**Auth**: Public

Request placeholder:

```json
{}
```

| Status | Meaning        | Response Shape          | Notes                                             |
| ------ | -------------- | ----------------------- | ------------------------------------------------- |
| 200    | Items returned | `{ "items": object[] }` | Includes base fields and optional metadata links. |
| 500    | Internal error | `{ "error": string }`   | Query failure.                                    |

Response placeholder (200):

```json
{
	"items": [
		{
			"id": "item_sword_001",
			"name": "Iron Sword",
			"type": "Weapon"
		}
	]
}
```

#### `GET /api/get-item/:itemid` => `GetItemResponse`
Summary: Get one base item by ID.

**Kind**: endpoint
**Auth**: Public

| Param  | Type     | Required | Description            |
| ------ | -------- | -------- | ---------------------- |
| itemid | `string` | Yes      | Base item document ID. |

Request placeholder:

Path example:

`GET /api/get-item/item_sword_001`

| Status | Meaning        | Response Shape        | Notes                                |
| ------ | -------------- | --------------------- | ------------------------------------ |
| 200    | Item found     | `{ "item": object }`  | Returns item and related stats data. |
| 404    | Not found      | `{ "error": string }` | No matching item ID.                 |
| 500    | Internal error | `{ "error": string }` | Read failure.                        |

Response placeholder (200):

```json
{
	"item": {
		"id": "item_sword_001",
		"name": "Iron Sword",
		"type": "Weapon",
		"stats": {
			"attack": 12
		}
	}
}
```

#### `POST /api/create-item` => `CreateItemResponse`
Summary: Create base item and stats.

**Kind**: endpoint
**Auth**: Admin required

| Body Field | Type     | Required | Description                        |
| ---------- | -------- | -------- | ---------------------------------- |
| userId     | `string` | Yes      | Admin user ID.                     |
| name       | `string` | Yes      | Item name.                         |
| type       | `string` | Yes      | Allowed values: `Weapon`, `Armor`. |
| metadataId | `string` | No       | Optional metadata relation.        |
| stats      | `object` | No       | Optional initial stats object.     |

Request placeholder:

```json
{
	"userId": "admin_1",
	"name": "Iron Sword",
	"type": "Weapon",
	"metadataId": "meta_rare",
	"stats": {
		"attack": 12
	}
}
```

| Status | Meaning          | Response Shape                     | Notes                                      |
| ------ | ---------------- | ---------------------------------- | ------------------------------------------ |
| 201    | Item created     | `{ "id": string, "item": object }` | Base item and optional stats created.      |
| 403    | Forbidden        | `{ "error": string }`              | Admin check failed.                        |
| 409    | Conflict         | `{ "error": string }`              | Duplicate unique item constraints.         |
| 400    | Validation error | `{ "error": string }`              | Invalid `type` or required fields missing. |
| 500    | Internal error   | `{ "error": string }`              | Write failure.                             |

Response placeholder (201):

```json
{
	"id": "item_sword_001",
	"item": {
		"name": "Iron Sword",
		"type": "Weapon"
	}
}
```

#### `PATCH /api/update-item/:itemid` => `UpdateItemResponse`
Summary: Update base item and/or stats.

**Kind**: endpoint
**Auth**: Admin required

| Param  | Type     | Required | Description            |
| ------ | -------- | -------- | ---------------------- |
| itemid | `string` | Yes      | Base item document ID. |

| Body Field | Type     | Required | Description                          |
| ---------- | -------- | -------- | ------------------------------------ |
| userId     | `string` | Yes      | Admin user ID.                       |
| name       | `string` | No       | New item name.                       |
| type       | `string` | No       | New item type (`Weapon` or `Armor`). |
| metadataId | `string` | No       | New metadata relation.               |
| stats      | `object` | No       | Stats fields to merge/update.        |

Request placeholder:

Path example:

`PATCH /api/update-item/item_sword_001`

Body placeholder:

```json
{
	"userId": "admin_1",
	"name": "Steel Sword",
	"stats": {
		"attack": 16
	}
}
```

| Status | Meaning          | Response Shape        | Notes                               |
| ------ | ---------------- | --------------------- | ----------------------------------- |
| 200    | Item updated     | `{ "success": true }` | One or more mutable fields updated. |
| 403    | Forbidden        | `{ "error": string }` | Admin check failed.                 |
| 404    | Not found        | `{ "error": string }` | Item does not exist.                |
| 400    | Validation error | `{ "error": string }` | Invalid data or no update fields.   |
| 500    | Internal error   | `{ "error": string }` | Update failure.                     |

Response placeholder (200):

```json
{
	"success": true
}
```

#### `DELETE /api/delete-item/:itemid` => `DeleteItemResponse`
Summary: Delete base item.

**Kind**: endpoint
**Auth**: Admin required

| Param  | Type     | Required | Description            |
| ------ | -------- | -------- | ---------------------- |
| itemid | `string` | Yes      | Base item document ID. |

| Body Field | Type     | Required | Description    |
| ---------- | -------- | -------- | -------------- |
| userId     | `string` | Yes      | Admin user ID. |

Request placeholder:

Path example:

`DELETE /api/delete-item/item_sword_001`

Body placeholder:

```json
{
	"userId": "admin_1"
}
```

| Status | Meaning          | Response Shape        | Notes                           |
| ------ | ---------------- | --------------------- | ------------------------------- |
| 200    | Item deleted     | `{ "success": true }` | Base item removed from catalog. |
| 403    | Forbidden        | `{ "error": string }` | Admin check failed.             |
| 400    | Validation error | `{ "error": string }` | Invalid IDs.                    |
| 500    | Internal error   | `{ "error": string }` | Delete failure.                 |

Response placeholder (200):

```json
{
	"success": true
}
```

### Equipment

#### `POST /api/equip-item/:sessionId` => `EquipItemResponse`
Summary: Equip or unequip a user item.

**Kind**: endpoint
**Auth**: Session required (`:sessionId`)

| Param     | Type     | Required | Description                |
| --------- | -------- | -------- | -------------------------- |
| sessionId | `string` | Yes      | Active user session token. |

| Body Field | Type     | Required | Description                      |
| ---------- | -------- | -------- | -------------------------------- |
| userId     | `string` | Yes      | Target user ID.                  |
| userItemId | `string` | Yes      | Owned item instance ID.          |
| type       | `string` | Yes      | Slot type (`Weapon` or `Armor`). |

Request placeholder:

Path example:

`POST /api/equip-item/session_abc123`

Body placeholder:

```json
{
	"userId": "user_123",
	"userItemId": "uitem_987",
	"type": "Weapon"
}
```

| Status | Meaning             | Response Shape                            | Notes                                  |
| ------ | ------------------- | ----------------------------------------- | -------------------------------------- |
| 200    | Equip state changed | `{ "success": true, "equipped": object }` | Handles equip and unequip behavior.    |
| 403    | Forbidden           | `{ "error": string }`                     | Session mismatch or invalid ownership. |
| 404    | Not found           | `{ "error": string }`                     | User or item instance not found.       |
| 400    | Validation error    | `{ "error": string }`                     | Invalid/missing fields.                |
| 500    | Internal error      | `{ "error": string }`                     | Update failure.                        |

Response placeholder (200):

```json
{
	"success": true,
	"equipped": {
		"Weapon": "uitem_987"
	}
}
```

#### `GET /api/get-equipped-items/:userId` => `GetEquippedItemsResponse`
Summary: Get equipped user items.

**Kind**: endpoint
**Auth**: Public

| Param  | Type     | Required | Description                       |
| ------ | -------- | -------- | --------------------------------- |
| userId | `string` | Yes      | User ID to resolve equipment for. |

Request placeholder:

Path example:

`GET /api/get-equipped-items/user_123`

| Status | Meaning                 | Response Shape           | Notes                                   |
| ------ | ----------------------- | ------------------------ | --------------------------------------- |
| 200    | Equipped items returned | `{ "equipped": object }` | Includes current slots and linked data. |
| 404    | User not found          | `{ "error": string }`    | User record missing.                    |
| 400    | Validation error        | `{ "error": string }`    | Missing path param.                     |
| 500    | Internal error          | `{ "error": string }`    | Read/resolve failure.                   |

Response placeholder (200):

```json
{
	"equipped": {
		"Weapon": {
			"userItemId": "uitem_987",
			"name": "Iron Sword"
		}
	}
}
```

### Inventory

#### `POST /api/add-user-item/:sessionId` => `AddUserItemResponse`
Summary: Add a base item instance to user inventory.

**Kind**: endpoint
**Auth**: Session required (`:sessionId`)

| Param     | Type     | Required | Description                |
| --------- | -------- | -------- | -------------------------- |
| sessionId | `string` | Yes      | Active user session token. |

| Body Field | Type     | Required | Description                  |
| ---------- | -------- | -------- | ---------------------------- |
| userId     | `string` | Yes      | Target user ID.              |
| itemId     | `string` | Yes      | Base item ID to instantiate. |

Request placeholder:

Path example:

`POST /api/add-user-item/session_abc123`

Body placeholder:

```json
{
	"userId": "user_123",
	"itemId": "item_sword_001"
}
```

| Status | Meaning                | Response Shape             | Notes                                  |
| ------ | ---------------------- | -------------------------- | -------------------------------------- |
| 201    | Inventory item created | `{ "userItemId": string }` | New user-owned item reference created. |
| 403    | Forbidden              | `{ "error": string }`      | Session mismatch for user.             |
| 404    | Not found              | `{ "error": string }`      | User or base item missing.             |
| 400    | Validation error       | `{ "error": string }`      | Missing fields or invalid IDs.         |
| 500    | Internal error         | `{ "error": string }`      | Write failure.                         |

Response placeholder (201):

```json
{
	"userItemId": "uitem_987"
}
```

#### `GET /api/get-inventory/:userId` => `GetInventoryResponse`
Summary: Get resolved inventory for a user.

**Kind**: endpoint
**Auth**: Public

| Param  | Type     | Required | Description       |
| ------ | -------- | -------- | ----------------- |
| userId | `string` | Yes      | User ID to query. |

Request placeholder:

Path example:

`GET /api/get-inventory/user_123`

| Status | Meaning            | Response Shape              | Notes                                       |
| ------ | ------------------ | --------------------------- | ------------------------------------------- |
| 200    | Inventory returned | `{ "inventory": object[] }` | User items resolved against base item data. |
| 404    | User not found     | `{ "error": string }`       | User missing or no inventory root.          |
| 400    | Validation error   | `{ "error": string }`       | Invalid user ID.                            |
| 500    | Internal error     | `{ "error": string }`       | Resolution/read failure.                    |

Response placeholder (200):

```json
{
	"inventory": [
		{
			"userItemId": "uitem_987",
			"itemId": "item_sword_001",
			"name": "Iron Sword"
		}
	]
}
```

### Listings

#### `GET /api/get-all-active-listings` => `GetAllActiveListingsResponse`
Summary: List all active marketplace listings.

**Kind**: endpoint
**Auth**: Public

Request placeholder:

```json
{}
```

| Status | Meaning                  | Response Shape             | Notes                      |
| ------ | ------------------------ | -------------------------- | -------------------------- |
| 200    | Active listings returned | `{ "listings": object[] }` | Filters by `active: true`. |
| 500    | Internal error           | `{ "error": string }`      | Query failure.             |

Response placeholder (200):

```json
{
	"listings": [
		{
			"id": "listing_1",
			"itemId": "item_sword_001",
			"price": 300,
			"active": true
		}
	]
}
```

#### `GET /api/get-all-inactive-listings` => `GetAllInactiveListingsResponse`
Summary: List all inactive marketplace listings.

**Kind**: endpoint
**Auth**: Public

Request placeholder:

```json
{}
```

| Status | Meaning                    | Response Shape             | Notes                       |
| ------ | -------------------------- | -------------------------- | --------------------------- |
| 200    | Inactive listings returned | `{ "listings": object[] }` | Filters by `active: false`. |
| 500    | Internal error             | `{ "error": string }`      | Query failure.              |

Response placeholder (200):

```json
{
	"listings": [
		{
			"id": "listing_2",
			"itemId": "item_armor_001",
			"price": 500,
			"active": false
		}
	]
}
```

#### `GET /api/get-user-listings/:userId` => `GetUserListingsResponse`
Summary: List all listings created by a user.

**Kind**: endpoint
**Auth**: Public

| Param  | Type     | Required | Description            |
| ------ | -------- | -------- | ---------------------- |
| userId | `string` | Yes      | Listing owner user ID. |

Request placeholder:

Path example:

`GET /api/get-user-listings/user_123`

| Status | Meaning                | Response Shape             | Notes                                         |
| ------ | ---------------------- | -------------------------- | --------------------------------------------- |
| 200    | User listings returned | `{ "listings": object[] }` | Active and inactive listings may be included. |
| 400    | Validation error       | `{ "error": string }`      | Invalid user ID.                              |
| 500    | Internal error         | `{ "error": string }`      | Query failure.                                |

Response placeholder (200):

```json
{
	"listings": [
		{
			"id": "listing_1",
			"userId": "user_123",
			"price": 300,
			"active": true
		}
	]
}
```

#### `GET /api/get-listed-user-item-ids/:userId` => `GetListedUserItemIdsResponse`
Summary: Get listed user-item IDs for a user.

**Kind**: endpoint
**Auth**: Public

| Param  | Type     | Required | Description            |
| ------ | -------- | -------- | ---------------------- |
| userId | `string` | Yes      | Listing owner user ID. |

Request placeholder:

Path example:

`GET /api/get-listed-user-item-ids/user_123`

| Status | Meaning          | Response Shape                | Notes                                         |
| ------ | ---------------- | ----------------------------- | --------------------------------------------- |
| 200    | IDs returned     | `{ "userItemIds": string[] }` | Used to prevent duplicate listing operations. |
| 400    | Validation error | `{ "error": string }`         | Invalid user ID.                              |
| 500    | Internal error   | `{ "error": string }`         | Query failure.                                |

Response placeholder (200):

```json
{
	"userItemIds": ["uitem_987", "uitem_654"]
}
```

#### `POST /api/create-listing` => `CreateListingResponse`
Summary: Create marketplace listing.

**Kind**: endpoint
**Auth**: Session/business validation

| Body Field | Type     | Required | Description                      |
| ---------- | -------- | -------- | -------------------------------- |
| userId     | `string` | Yes      | Seller user ID.                  |
| sessionId  | `string` | Yes      | Active session token for seller. |
| userItemId | `string` | Yes      | Owned item instance ID.          |
| itemId     | `string` | Yes      | Base item ID.                    |
| price      | `number` | Yes      | Listing price in coins.          |

Request placeholder:

```json
{
	"userId": "user_123",
	"sessionId": "session_abc123",
	"userItemId": "uitem_987",
	"itemId": "item_sword_001",
	"price": 300
}
```

| Status | Meaning          | Response Shape            | Notes                                       |
| ------ | ---------------- | ------------------------- | ------------------------------------------- |
| 201    | Listing created  | `{ "listingId": string }` | Listing marked active.                      |
| 403    | Forbidden        | `{ "error": string }`     | Session mismatch or unauthorized ownership. |
| 404    | Not found        | `{ "error": string }`     | User, item, or user item missing.           |
| 400    | Validation error | `{ "error": string }`     | Invalid payload or price.                   |
| 500    | Internal error   | `{ "error": string }`     | Write failure.                              |

Response placeholder (201):

```json
{
	"listingId": "listing_1"
}
```

#### `DELETE /api/delete-listing/:listingId` => `DeleteListingResponse`
Summary: Delete marketplace listing.

**Kind**: endpoint
**Auth**: Session/business validation

| Param     | Type     | Required | Description          |
| --------- | -------- | -------- | -------------------- |
| listingId | `string` | Yes      | Listing document ID. |

| Body Field | Type     | Required | Description                 |
| ---------- | -------- | -------- | --------------------------- |
| userId     | `string` | Yes      | Listing owner user ID.      |
| sessionId  | `string` | Yes      | Active owner session token. |

Request placeholder:

Path example:

`DELETE /api/delete-listing/listing_1`

Body placeholder:

```json
{
	"userId": "user_123",
	"sessionId": "session_abc123"
}
```

| Status | Meaning          | Response Shape        | Notes                                   |
| ------ | ---------------- | --------------------- | --------------------------------------- |
| 200    | Listing deleted  | `{ "success": true }` | Removes or deactivates listing record.  |
| 403    | Forbidden        | `{ "error": string }` | Session mismatch or ownership mismatch. |
| 404    | Not found        | `{ "error": string }` | Listing not found.                      |
| 400    | Validation error | `{ "error": string }` | Missing params/body fields.             |
| 500    | Internal error   | `{ "error": string }` | Delete failure.                         |

Response placeholder (200):

```json
{
	"success": true
}
```

#### `POST /api/buy-listing/:listingId` => `BuyListingResponse`
Summary: Buy an active marketplace listing.

**Kind**: endpoint
**Auth**: Session/business validation

| Param     | Type     | Required | Description          |
| --------- | -------- | -------- | -------------------- |
| listingId | `string` | Yes      | Listing to purchase. |

| Body Field  | Type     | Required | Description                 |
| ----------- | -------- | -------- | --------------------------- |
| buyerUserId | `string` | Yes      | Buyer user ID.              |
| sessionId   | `string` | Yes      | Active buyer session token. |

Request placeholder:

Path example:

`POST /api/buy-listing/listing_1`

Body placeholder:

```json
{
	"buyerUserId": "user_456",
	"sessionId": "session_buyer_123"
}
```

| Status | Meaning            | Response Shape                             | Notes                                                   |
| ------ | ------------------ | ------------------------------------------ | ------------------------------------------------------- |
| 200    | Purchase completed | `{ "success": true, "listingId": string }` | Transfers ownership and updates balances/listing state. |
| 404    | Not found          | `{ "error": string }`                      | Listing, buyer, or seller references missing.           |
| 400    | Validation error   | `{ "error": string }`                      | Invalid purchase conditions or payload.                 |
| 500    | Internal error     | `{ "error": string }`                      | Transaction/update failure.                             |

Response placeholder (200):

```json
{
	"success": true,
	"listingId": "listing_1"
}
```

### Areas

#### `GET /api/get-all-areas` => `GetAllAreasResponse`
Summary: List all available areas.

**Kind**: endpoint
**Auth**: Public

Request placeholder:

```json
{}
```

| Status | Meaning        | Response Shape          | Notes                                  |
| ------ | -------------- | ----------------------- | -------------------------------------- |
| 200    | Areas returned | `{ "areas": object[] }` | Includes purchasable area definitions. |
| 500    | Internal error | `{ "error": string }`   | Query failure.                         |

Response placeholder (200):

```json
{
	"areas": [
		{
			"id": "area_001",
			"name": "Green Plains",
			"price": 800
		}
	]
}
```

#### `GET /api/get-user-areas/:userId` => `GetUserAreasResponse`
Summary: Get owned areas for a user.

**Kind**: endpoint
**Auth**: Public

| Param  | Type     | Required | Description                     |
| ------ | -------- | -------- | ------------------------------- |
| userId | `string` | Yes      | User ID to fetch ownership for. |

Request placeholder:

Path example:

`GET /api/get-user-areas/user_123`

| Status | Meaning              | Response Shape          | Notes                                 |
| ------ | -------------------- | ----------------------- | ------------------------------------- |
| 200    | Owned areas returned | `{ "areas": object[] }` | User-specific owned area IDs/details. |
| 404    | User not found       | `{ "error": string }`   | User record missing.                  |
| 400    | Validation error     | `{ "error": string }`   | Invalid user ID.                      |
| 500    | Internal error       | `{ "error": string }`   | Query failure.                        |

Response placeholder (200):

```json
{
	"areas": [
		{
			"id": "area_001",
			"name": "Green Plains"
		}
	]
}
```

#### `POST /api/purchase-area/:areaId` => `PurchaseAreaResponse`
Summary: Purchase an area for a user.

**Kind**: endpoint
**Auth**: Session/business validation

| Param  | Type     | Required | Description                   |
| ------ | -------- | -------- | ----------------------------- |
| areaId | `string` | Yes      | Area document ID to purchase. |

| Body Field | Type     | Required | Description                                        |
| ---------- | -------- | -------- | -------------------------------------------------- |
| userId     | `string` | Yes      | Buyer user ID.                                     |
| sessionId  | `string` | No       | If required by implementation, user session token. |

Request placeholder:

Path example:

`POST /api/purchase-area/area_001`

Body placeholder:

```json
{
	"userId": "user_123"
}
```

| Status | Meaning          | Response Shape                          | Notes                                      |
| ------ | ---------------- | --------------------------------------- | ------------------------------------------ |
| 200    | Area purchased   | `{ "success": true, "areaId": string }` | Deducts coins and stores ownership.        |
| 404    | Not found        | `{ "error": string }`                   | Area or user missing.                      |
| 400    | Validation error | `{ "error": string }`                   | Missing params/body or insufficient coins. |
| 500    | Internal error   | `{ "error": string }`                   | Transaction/update failure.                |

Response placeholder (200):

```json
{
	"success": true,
	"areaId": "area_001"
}
```

### Images

#### `POST /api/upload-image` => `UploadImageResponse`
Summary: Upload image to Cloudinary.

**Kind**: endpoint
**Auth**: Admin required
**Content-Type**: `multipart/form-data`

| Form Field | Type     | Required | Description         |
| ---------- | -------- | -------- | ------------------- |
| userId     | `string` | Yes      | Admin user ID.      |
| file       | `binary` | Yes      | Image file payload. |

Request placeholder:

```json
{
	"formData": {
		"userId": "admin_1",
		"file": "<binary image>"
	}
}
```

| Status | Meaning          | Response Shape                          | Notes                        |
| ------ | ---------------- | --------------------------------------- | ---------------------------- |
| 201    | Image uploaded   | `{ "url": string, "publicId": string }` | Cloudinary upload succeeded. |
| 403    | Forbidden        | `{ "error": string }`                   | Admin check failed.          |
| 400    | Validation error | `{ "error": string }`                   | Missing file or user ID.     |
| 500    | Internal error   | `{ "error": string }`                   | Upload provider failure.     |

Response placeholder (201):

```json
{
	"url": "https://res.cloudinary.com/demo/image/upload/v1713/sword.png",
	"publicId": "sword"
}
```

#### `DELETE /api/delete-image` => `DeleteImageResponse`
Summary: Delete image from Cloudinary.

**Kind**: endpoint
**Auth**: Admin required

| Body Field | Type     | Required | Description                             |
| ---------- | -------- | -------- | --------------------------------------- |
| userId     | `string` | Yes      | Admin user ID.                          |
| filename   | `string` | Yes      | Image filename or identifier to delete. |

Request placeholder:

```json
{
	"userId": "admin_1",
	"filename": "sword.png"
}
```

| Status | Meaning          | Response Shape        | Notes                        |
| ------ | ---------------- | --------------------- | ---------------------------- |
| 200    | Image deleted    | `{ "success": true }` | Cloudinary resource removed. |
| 403    | Forbidden        | `{ "error": string }` | Admin check failed.          |
| 400    | Validation error | `{ "error": string }` | Missing user ID or filename. |
| 500    | Internal error   | `{ "error": string }` | Delete provider failure.     |

Response placeholder (200):

```json
{
	"success": true
}
```

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

