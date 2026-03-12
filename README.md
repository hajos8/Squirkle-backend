# Squirkle-backend

## API sablon

### GET

- Endpoint: `https://squirkle-backend.vercel.app/api/hello`
	- Válasz (200): `{ "message": "Hello world!" }`

- Endpoint: `https://squirkle-backend.vercel.app/api/get-username-exists/:username`
	- Path param: `username`
	- Válasz (200): `{ "exists": false }`
	- Válasz (409): `{ "exists": true }`

- Endpoint: `https://squirkle-backend.vercel.app/api/get-username/:userid`
	- Path param: `userid`
	- Válasz (200): `{ "username": "<username>" }`
	- Válasz (404): `{ "error": "User not found" }`

- Endpoint: `https://squirkle-backend.vercel.app/api/get-permissions/:userid`
	- Path param: `userid`
	- Válasz (200): `{ "isAdmin": true/false }`

### POST

- Endpoint: `https://squirkle-backend.vercel.app/api/create-username`
	- Required body: `userId`, `username`
	- Válasz (201): `{ "message": "Username created successfully" }`
	- Válasz (409): `{ "error": "Username already exists" }` vagy `{ "error": "User already has a username" }`

---

## Képek

### POST

- Endpoint: `https://squirkle-backend.vercel.app/api/upload-image`
	- Required body/form-data: `userId`, `file`
	- Megjegyzés: csak admin felhasználó tölthet fel képet.
	- Válasz (201): `{ "url": "<cloudinary_secure_url>" }`

### DELETE

- Endpoint: `https://squirkle-backend.vercel.app/api/delete-image`
	- Required body: `userId`, `filename`
	- Megjegyzés: csak admin felhasználó törölhet képet.
	- Válasz (200): `{ "message": "Image deleted successfully", "result": <cloudinary_result> }`