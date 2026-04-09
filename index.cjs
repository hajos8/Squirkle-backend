const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const crypto = require('crypto');
const upload = multer({ storage: multer.memoryStorage() });

dotenv.config();

app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('Cloudinary configuration:', {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: !!process.env.CLOUDINARY_API_KEY,
    api_secret: !!process.env.CLOUDINARY_API_SECRET,
});

const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT).toString('utf8')
);

const firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.firestore();
const users = db.collection('users');
const userItems = db.collection('user-items');
const admins = db.collection('admins');
const items = db.collection('items');
const listings = db.collection('listings');
const metadatas = db.collection('metadatas');
const sessions = db.collection('sessions');

const ALLOWED_ITEM_TYPES = ['Weapon', 'Armor'];

const itemsInQueue = [];

//server time

/**
 * GET /api/server-time
 * @route GET /api/server-time
 * @endpoint /api/server-time
 * @summary Get server time offset in seconds.
 * @tags System
 * @response {object} 200 - Returns the current server time value.
 * @description Returns server time in seconds relative to the configured baseline date.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {},
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "serverTime": 1234567
 * }
 * ```
 */
app.get('/api/server-time', (req, res) => {
    const serverTime = Math.floor((Date.now() - new Date('2026-01-01').getTime()) / 1000);
    res.status(200).json({ serverTime });
});

//server sessions

/**
 * POST /api/create-session
 * @route POST /api/create-session
 * @endpoint /api/create-session
 * @summary Create a session token for a user.
 * @tags Sessions
 * @response {object} 201 - Returns the newly generated session ID.
 * @response {object} 400 - Missing required request body fields.
 * @response {object} 500 - Failed to create session.
 * @description Creates and stores a new session identifier for the provided user.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {},
 *   "body": {
 *     "userId": "user_123"
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "sessionId": "<sha256_session_id>"
 * }
 * ```
 */
app.post('/api/create-session', async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'Missing request body' });
    }

    const sessionId = generateSessionId(userId);
    try {
        await sessions.doc(userId).set({ sessionId });
        console.log(`Created session for userId: ${userId}`);
        res.status(201).json({ sessionId });
    } catch (error) {
        console.warn(`Error creating session for userId ${userId}:`, error);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

/**
 * Generates a unique session ID for a user based on their user ID,
 * current timestamp, and a random salt.
 *
 * @param {string} userId - The ID of the user.
 * @returns {string} The generated SHA-256 session ID.
 */
function generateSessionId(userId) {
    const timestamp = Date.now();

    const randomSalt = crypto.randomBytes(16).toString('hex');
    const dataString = `${userId}-${timestamp}-${randomSalt}`;

    return crypto.createHash('sha256').update(dataString).digest('hex');
}


//user handler endpoints

/**
 * GET /api/get-username-exists/:username
 * @route GET /api/get-username-exists/:username
 * @endpoint /api/get-username-exists/:username
 * @summary Check username availability.
 * @tags Users
 * @param {string} req.params.username - Username to validate.
 * @response {object} 200 - Indicates whether the username is available.
 * @response {object} 400 - Missing username in request parameters.
 * @response {object} 409 - Username already exists.
 * @response {object} 500 - Failed to check username existence.
 * @description Checks whether a username is already taken.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "username": "player1"
 *   },
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "exists": false
 * }
 * ```
 */
app.get('/api/get-username-exists/:username', (req, res) => {
    const username = req.params.username;

    console.log('Received get-username-exists request for username:', username);

    if (!username) {
        return res.status(400).json({ error: 'Missing username in request parameters' });
    }

    users.where("username", "==", username).get()
        .then((snapshot) => {
            if (snapshot.empty) {
                res.status(200).json({ exists: false });
            }
            else {
                res.status(409).json({ exists: true });
            }
        })
        .catch((error) => {
            console.warn(`Error checking username existence for ${username}:`, error);
            res.status(500).json({ error: 'Failed to check username existence' });
        });
});

/**
 * GET /api/get-username/:userid
 * @route GET /api/get-username/:userid
 * @endpoint /api/get-username/:userid
 * @summary Get username by user ID.
 * @tags Users
 * @param {string} req.params.userid - User identifier.
 * @response {object} 200 - Returns the username for the given user ID.
 * @response {object} 400 - Missing userId in request parameters.
 * @response {object} 404 - User not found.
 * @response {object} 500 - Failed to retrieve username.
 * @description Fetches a user's username by their user identifier.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "userid": "user_123"
 *   },
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "username": "player1"
 * }
 * ```
 */
app.get('/api/get-username/:userid', (req, res) => {
    const userId = req.params.userid;

    console.log('Received get-username request for userId:', userId);

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId in request parameters' });
    }

    users.doc(userId).get()
        .then((doc) => {
            if (doc.exists) {
                res.status(200).json({ username: doc.data().username });
            } else {
                res.status(404).json({ error: 'User not found' });
            }
        })
        .catch((error) => {
            console.warn(`Error getting username for userId ${userId}:`, error);
            res.status(500).json({ error: 'Failed to retrieve username' });
        });
});

/**
 * POST /api/create-username
 * @route POST /api/create-username
 * @endpoint /api/create-username
 * @summary Create username for a user.
 * @tags Users
 * @response {object} 201 - Confirms username creation.
 * @response {object} 400 - Missing required request body fields.
 * @response {object} 409 - Username already exists or user already has a username.
 * @response {object} 500 - Failed to create username.
 * @description Creates a unique username for a user who does not already have one.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {},
 *   "body": {
 *     "userId": "user_123",
 *     "username": "player1"
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "message": "Username created successfully"
 * }
 * ```
 */
app.post('/api/create-username', (req, res) => {
    const { userId, username } = req.body;

    console.log('Received create-username request:', { userId, username });

    if (!userId || !username) {
        return res.status(400).json({ error: 'Missing userId or username in request body' });
    }

    //console.log(`Creating username for userId ${userId} with username ${username}`);

    users.doc(userId).get()
        .then((doc) => {
            if (!doc.exists) {
                //console.log(`Checking if username ${username} already exists`);

                users.where("username", "==", username).get()
                    .then((snapshot) => {
                        if (snapshot.empty) {
                            users.doc(userId).set({ username })
                                .then(() => {
                                    //console.log(`Username ${username} created for userId ${userId}`);
                                    return res.status(201).json({ message: 'Username created successfully' });
                                })
                                .catch((error) => {
                                    console.warn(`Failed to create username ${username} for userId ${userId}:`, error);
                                    return res.status(500).json({ error: 'Failed to create username' });
                                });

                        }
                        else {
                            console.warn(`Username ${username} already exists`);
                            return res.status(409).json({ error: 'Username already exists' });
                        }
                    })
                    .catch((error) => {
                        console.warn(`Failed to check username existence for ${username}:`, error);
                        return res.status(500).json({ error: 'Failed to check username existence' });
                    });
            }
            else {
                console.warn(`UserId ${userId} already has a username`);
                return res.status(409).json({ error: 'User already has a username' });
            }
        });
});

/**
 * GET /api/get-permissions/:userid
 * @route GET /api/get-permissions/:userid
 * @endpoint /api/get-permissions/:userid
 * @summary Check whether a user is admin.
 * @tags Users, Admin
 * @param {string} req.params.userid - User identifier.
 * @response {object} 200 - Returns whether the user has admin permissions.
 * @response {object} 400 - Missing userId in request parameters.
 * @response {object} 500 - Failed to check permissions.
 * @description Checks if the specified user is an admin.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "userid": "user_123"
 *   },
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "isAdmin": true
 * }
 * ```
 */
app.get('/api/get-permissions/:userid', async (req, res) => {
    const userId = req.params.userid;

    console.log('Received get-permissions request for userId:', userId);

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId in request parameters' });
    }

    if (await isAdmin(userId)) {
        res.status(200).json({ isAdmin: true });
    }
    else {
        res.status(200).json({ isAdmin: false });
    }
});

/**
 * GET /api/get-coins/:userid
 * @route GET /api/get-coins/:userid
 * @endpoint /api/get-coins/:userid
 * @summary Get coin balance for a user.
 * @tags Users, Coins
 * @param {string} req.params.userid - User identifier.
 * @response {object} 200 - Returns the user's current coin balance.
 * @response {object} 400 - Missing userId in request parameters.
 * @response {object} 404 - User not found.
 * @response {object} 500 - Failed to retrieve coins.
 * @description Retrieves the coin amount stored for a user.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "userid": "user_123"
 *   },
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "coins": 1200
 * }
 * ```
 */
app.get('/api/get-coins/:userid', (req, res) => {
    const userId = req.params.userid;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId in request parameters' });
    }

    users.doc(userId).get()
        .then((doc) => {
            if (doc.exists) {
                res.status(200).json({ coins: doc.data().coins || 0 });
            } else {
                res.status(404).json({ error: 'User not found' });
            }
        })
        .catch((error) => {
            console.warn(`Error getting coins for userId ${userId}:`, error);
            res.status(500).json({ error: 'Failed to retrieve coins' });
        });
})

// coin management

/**
 * POST /api/update-coins/:sessionId
 * @route POST /api/update-coins/:sessionId
 * @endpoint /api/update-coins/:sessionId
 * @summary Add coins for an authenticated user session.
 * @tags Coins, Sessions
 * @param {string} req.params.sessionId - Session identifier.
 * @response {object} 200 - Confirms coin balance update.
 * @response {object} 400 - Missing or invalid request body fields.
 * @response {object} 403 - Unauthorized or invalid session.
 * @response {object} 404 - User not found.
 * @response {object} 500 - Failed to process coin update.
 * @description Adds a validated amount of coins for an authenticated session.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "sessionId": "<session_id>"
 *   },
 *   "body": {
 *     "userId": "user_123",
 *     "amount": 50
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "message": "Coins updated successfully"
 * }
 * ```
 */
app.post('/api/update-coins/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    const { userId, amount } = req.body;

    console.log('Received update-coins request:', { userId, amount, sessionId });

    if (!userId || amount === undefined) {
        return res.status(400).json({ error: 'Missing userId or amount in request body' });
    }

    try {
        const sessionDoc = await sessions.doc(userId).get();
        const sessionIdLocal = sessionDoc.exists ? sessionDoc.data() : null;
        console.log(`Session ID for userId ${userId}:`, sessionIdLocal);
        if (!sessionIdLocal || sessionIdLocal.sessionId !== sessionId) {
            return res.status(403).json({ error: 'Unauthorized or invalid session' });
        }

        if (typeof amount !== 'number' || amount <= 0 || amount > 1000) {
            return res.status(400).json({ error: 'Invalid coin amount. Must be between 1 and 1000.' });
        }

        const userRef = users.doc(userId);

        const doc = await userRef.get();
        if (doc.exists) {
            await userRef.update({
                coins: admin.firestore.FieldValue.increment(amount)
            });
            res.status(200).json({ message: 'Coins updated successfully' });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.warn(`Error updating coins for userId ${userId}:`, error);
        res.status(500).json({ error: 'Failed to process coin update' });
    }
});

//base item handler endpoints


//metadata handler endpoints

/**
 * GET /api/get-all-metadatas
 * @route GET /api/get-all-metadatas
 * @endpoint /api/get-all-metadatas
 * @summary List all metadata entries.
 * @tags Metadata
 * @response {object} 200 - Returns all metadata entries.
 * @response {object} 500 - Failed to retrieve all metadatas.
 * @description Lists every metadata record available in the database.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {},
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "metadatas": [
 *     {
 *       "id": "rare",
 *       "title": "Rare",
 *       "description": "Rare tier",
 *       "backgroundColor": "#112233",
 *       "textColor": "#ffffff"
 *     }
 *   ]
 * }
 * ```
 */
app.get('/api/get-all-metadatas', async (req, res) => {
    try {
        const snapshot = await metadatas.get();
        const metadatasArray = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        return res.status(200).json({ metadatas: metadatasArray });
    } catch (error) {
        console.warn('Error getting all metadatas:', error);
        return res.status(500).json({ error: 'Failed to retrieve all metadatas' });
    }
});

/**
 * GET /api/get-metadata/:metadataid
 * @route GET /api/get-metadata/:metadataid
 * @endpoint /api/get-metadata/:metadataid
 * @summary Get one metadata entry by ID.
 * @tags Metadata
 * @param {string} req.params.metadataid - Metadata identifier.
 * @response {object} 200 - Returns the requested metadata object.
 * @response {object} 400 - Missing metadataId in request parameters.
 * @response {object} 404 - Metadata not found.
 * @response {object} 500 - Failed to retrieve metadata.
 * @description Fetches a single metadata entry by ID.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "metadataid": "rare"
 *   },
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "metadata": {
 *     "id": "rare",
 *     "title": "Rare",
 *     "description": "Rare tier",
 *     "backgroundColor": "#112233",
 *     "textColor": "#ffffff"
 *   }
 * }
 * ```
 */
app.get('/api/get-metadata/:metadataid', async (req, res) => {
    const metadataId = req.params.metadataid;

    if (!metadataId) {
        return res.status(400).json({ error: 'Missing metadataId in request parameters' });
    }

    try {
        const metadataDoc = await metadatas.doc(metadataId).get();

        if (!metadataDoc.exists) {
            return res.status(404).json({ error: 'Metadata not found' });
        }

        return res.status(200).json({ metadata: { id: metadataDoc.id, ...metadataDoc.data() } });
    } catch (error) {
        console.warn(`Error getting metadata ${metadataId}:`, error);
        return res.status(500).json({ error: 'Failed to retrieve metadata' });
    }
});

/**
 * POST /api/create-metadata
 * @route POST /api/create-metadata
 * @endpoint /api/create-metadata
 * @summary Create metadata entry.
 * @tags Metadata, Admin
 * @response {object} 201 - Confirms metadata creation and ID.
 * @response {object} 400 - Missing required request body fields.
 * @response {object} 403 - User does not have permission.
 * @response {object} 409 - Metadata already exists.
 * @response {object} 500 - Failed to create metadata.
 * @description Creates a new metadata entry for authorized admin users.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {},
 *   "body": {
 *     "userId": "admin_1",
 *     "id": "rare",
 *     "title": "Rare",
 *     "description": "Rare tier",
 *     "backgroundColor": "#112233",
 *     "textColor": "#ffffff"
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "message": "Metadata created successfully",
 *   "metadataId": "rare"
 * }
 * ```
 */
app.post('/api/create-metadata', async (req, res) => {
    const { userId, id, title, description, backgroundColor, textColor } = req.body;

    if (!userId || !id) {
        return res.status(400).json({ error: 'Missing userId or id in request body' });
    }

    if (!title || !description || !backgroundColor || !textColor) {
        return res.status(400).json({ error: 'Missing required metadata fields in request body' });
    }
    if (!await isAdmin(userId)) {
        return res.status(403).json({ error: 'User does not have permission' });
    }

    try {
        const metadataRef = metadatas.doc(id);
        const existingMetadata = await metadataRef.get();

        if (existingMetadata.exists) {
            return res.status(409).json({ error: 'Metadata already exists' });
        }

        await metadataRef.set({ title, description, backgroundColor, textColor });
        return res.status(201).json({ message: 'Metadata created successfully', metadataId: id });
    } catch (error) {
        console.warn(`Error creating metadata ${id}:`, error);
        return res.status(500).json({ error: 'Failed to create metadata' });
    }
});

/**
 * PATCH /api/update-metadata/:metadataid
 * @route PATCH /api/update-metadata/:metadataid
 * @endpoint /api/update-metadata/:metadataid
 * @summary Update metadata entry fields.
 * @tags Metadata, Admin
 * @param {string} req.params.metadataid - Metadata identifier.
 * @response {object} 200 - Confirms metadata update.
 * @response {object} 400 - Missing identifiers or no fields provided to update.
 * @response {object} 403 - User does not have permission.
 * @response {object} 404 - Metadata not found.
 * @response {object} 500 - Failed to update metadata.
 * @description Updates one or more fields of an existing metadata entry.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "metadataid": "rare"
 *   },
 *   "body": {
 *     "userId": "admin_1",
 *     "title": "Rare+",
 *     "description": "Updated tier",
 *     "backgroundColor": "#223344",
 *     "textColor": "#eeeeee"
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "message": "Metadata updated successfully"
 * }
 * ```
 */
app.patch('/api/update-metadata/:metadataid', async (req, res) => {
    const metadataId = req.params.metadataid;
    const { userId, title, description, backgroundColor, textColor } = req.body;

    if (!userId || !metadataId) {
        return res.status(400).json({ error: 'Missing userId or metadataId' });
    }

    if (Object.keys({ title, description, backgroundColor, textColor }).length === 0) {
        return res.status(400).json({ error: 'No metadata fields to update provided in request body' });
    }

    if (!await isAdmin(userId)) {
        return res.status(403).json({ error: 'User does not have permission' });
    }

    try {
        const metadataRef = metadatas.doc(metadataId);
        const metadataDoc = await metadataRef.get();

        if (!metadataDoc.exists) {
            return res.status(404).json({ error: 'Metadata not found' });
        }

        const metadataUpdates = {};

        if (title !== undefined) metadataUpdates.title = title;
        if (description !== undefined) metadataUpdates.description = description;
        if (backgroundColor !== undefined) metadataUpdates.backgroundColor = backgroundColor;
        if (textColor !== undefined) metadataUpdates.textColor = textColor;

        await metadataRef.update(metadataUpdates);

        return res.status(200).json({ message: 'Metadata updated successfully' });
    } catch (error) {
        console.warn(`Error updating metadata ${metadataId}:`, error);
        return res.status(500).json({ error: 'Failed to update metadata' });
    }
});

/**
 * DELETE /api/delete-metadata/:metadataid
 * @route DELETE /api/delete-metadata/:metadataid
 * @endpoint /api/delete-metadata/:metadataid
 * @summary Delete metadata entry.
 * @tags Metadata, Admin
 * @param {string} req.params.metadataid - Metadata identifier.
 * @response {object} 200 - Confirms metadata deletion.
 * @response {object} 400 - Missing userId or metadataId.
 * @response {object} 403 - User does not have permission.
 * @response {object} 404 - Metadata not found.
 * @response {object} 500 - Failed to delete metadata.
 * @description Deletes a metadata entry for authorized admin users.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "metadataid": "rare"
 *   },
 *   "body": {
 *     "userId": "admin_1"
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "message": "Metadata deleted successfully"
 * }
 * ```
 */
app.delete('/api/delete-metadata/:metadataid', async (req, res) => {
    const metadataId = req.params.metadataid;
    const { userId } = req.body;

    if (!userId || !metadataId) {
        return res.status(400).json({ error: 'Missing userId or metadataId' });
    }

    if (!await isAdmin(userId)) {
        return res.status(403).json({ error: 'User does not have permission' });
    }

    try {
        const metadataRef = metadatas.doc(metadataId);
        const metadataDoc = await metadataRef.get();

        if (!metadataDoc.exists) {
            return res.status(404).json({ error: 'Metadata not found' });
        }

        await metadataRef.delete();
        return res.status(200).json({ message: 'Metadata deleted successfully' });
    } catch (error) {
        console.warn(`Error deleting metadata ${metadataId}:`, error);
        return res.status(500).json({ error: 'Failed to delete metadata' });
    }
});

/**
 * GET /api/get-all-items
 * @route GET /api/get-all-items
 * @endpoint /api/get-all-items
 * @summary List all base items.
 * @tags Items
 * @response {object} 200 - Returns all base items with stats.
 * @response {object} 500 - Failed to retrieve all items.
 * @description Lists all items and includes their first available stats document.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {},
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "items": [
 *     {
 *       "id": "sword_1",
 *       "name": "Iron Sword",
 *       "type": "Weapon",
 *       "stats": {
 *         "circleDamage": 10,
 *         "squareDamage": 9,
 *         "triangleDamage": 11,
 *         "critChance": 0.1,
 *         "critDamage": 1.5,
 *         "metadata": "rare"
 *       }
 *     }
 *   ]
 * }
 * ```
 */
app.get('/api/get-all-items', async (req, res) => {
    try {
        const snapshot = await items.get();

        const itemsArray = await Promise.all(snapshot.docs.map(async (doc) => {
            const statsSnapshot = await doc.ref.collection('stats').get();
            const statsArray = [];

            statsSnapshot.forEach((statDoc) => {
                statsArray.push({ id: statDoc.id, ...statDoc.data() });
            });

            return { id: doc.id, ...doc.data(), stats: statsArray.length > 0 ? statsArray[0] : null };
        }));

        return res.status(200).json({ items: itemsArray });
    } catch (error) {
        console.warn("Error getting all items:", error);
        return res.status(500).json({ error: "Failed to retrieve all items" });
    }
});

/**
 * GET /api/get-item/:itemid
 * @route GET /api/get-item/:itemid
 * @endpoint /api/get-item/:itemid
 * @summary Get one base item by ID.
 * @tags Items
 * @param {string} req.params.itemid - Item identifier.
 * @response {object} 200 - Returns a single item and its stats.
 * @response {object} 404 - Item not found.
 * @response {object} 500 - Failed to retrieve item.
 * @description Fetches a base item by ID with its stats payload.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "itemid": "sword_1"
 *   },
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "item": {
 *     "name": "Iron Sword",
 *     "type": "Weapon",
 *     "stats": {
 *       "circleDamage": 10,
 *       "squareDamage": 9,
 *       "triangleDamage": 11,
 *       "critChance": 0.1,
 *       "critDamage": 1.5,
 *       "metadata": "rare"
 *     }
 *   }
 * }
 * ```
 */
app.get('/api/get-item/:itemid', async (req, res) => {
    const itemId = req.params.itemid;

    try {
        const snapshot = await items.doc(itemId).get();

        if (!snapshot.exists) {
            console.warn(`Item found for itemId ${itemId}: not found`);
            return res.status(404).json({ error: "Item not found" });
        }

        const statsSnapshot = await snapshot.ref.collection('stats').get();
        const statsArray = [];
        statsSnapshot.forEach((statDoc) => {
            //console.log(`Stat found for itemId ${itemId}, statId ${statDoc.id}:`, statDoc.data());
            statsArray.push({ id: statDoc.id, ...statDoc.data() });
        });


        const itemData = { ...snapshot.data(), stats: statsArray.length > 0 ? statsArray[0] : null };
        res.status(200).json({ item: itemData });
    } catch (error) {
        console.warn("Error getting item:", error);
        res.status(500).json({ error: "Failed to retrieve item" });
    }
});

/**
 * DELETE /api/delete-item/:itemid
 * @route DELETE /api/delete-item/:itemid
 * @endpoint /api/delete-item/:itemid
 * @summary Delete base item.
 * @tags Items, Admin
 * @param {string} req.params.itemid - Item identifier.
 * @response {object} 200 - Confirms item deletion.
 * @response {object} 400 - Missing userId in request body.
 * @response {object} 403 - User does not have permission.
 * @response {object} 500 - Failed to delete item.
 * @description Deletes a base item for authorized admin users.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "itemid": "sword_1"
 *   },
 *   "body": {
 *     "userId": "admin_1"
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "message": "Item deleted successfully"
 * }
 * ```
 */
app.delete('/api/delete-item/:itemid', async (req, res) => {
    const itemId = req.params.itemid;
    const userId = req.body.userId;

    if (!userId) {
        return res.status(400).json({ error: "Missing userId in request body" });
    }

    if (!await isAdmin(userId)) {
        return res.status(403).json({ error: "User does not have permission" });
    }

    try {
        await items.doc(itemId).delete();
        res.status(200).json({ message: "Item deleted successfully" });
    } catch (error) {
        console.warn("Error deleting item:", error);
        res.status(500).json({ error: "Failed to delete item" });
    }
});

/**
 * POST /api/create-item
 * @route POST /api/create-item
 * @endpoint /api/create-item
 * @summary Create base item and stats.
 * @tags Items, Admin
 * @response {object} 201 - Confirms item and stats creation.
 * @response {object} 400 - Missing or invalid request body fields.
 * @response {object} 403 - User does not have permission.
 * @response {object} 409 - Item already exists.
 * @response {object} 500 - Failed to create item.
 * @description Creates a new base item with its associated stats document.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {},
 *   "body": {
 *     "userId": "admin_1",
 *     "id": "sword_1",
 *     "name": "Iron Sword",
 *     "description": "Starter weapon",
 *     "type": "Weapon",
 *     "knockback": 2,
 *     "imageName": "sword.png",
 *     "imageUrl": "https://example.com/sword.png",
 *     "stats": {
 *       "id": "stats",
 *       "circleDamage": 10,
 *       "squareDamage": 9,
 *       "triangleDamage": 11,
 *       "critChance": 0.1,
 *       "critDamage": 1.5,
 *       "metadata": "rare"
 *     }
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "message": "Item created successfully",
 *   "itemId": "sword_1",
 *   "statsId": "stats"
 * }
 * ```
 */
app.post('/api/create-item', async (req, res) => {
    try {
        const { userId, id, name, description, type, knockback, imageName, imageUrl, stats } = req.body;

        if (!userId || !id || !name || !description || !type || knockback === undefined || knockback === null || !imageName || !imageUrl || !stats) {
            return res.status(400).json({ error: "Missing required fields in request body" });
        }

        if (!ALLOWED_ITEM_TYPES.includes(type)) {
            return res.status(400).json({ error: "Invalid type. Must be weapon or armor" });
        }

        if (typeof knockback !== 'number') {
            return res.status(400).json({ error: "Knockback must be a number" });
        }

        if (
            stats.circleDamage === undefined ||
            stats.squareDamage === undefined ||
            stats.triangleDamage === undefined ||
            stats.critChance === undefined ||
            stats.critDamage === undefined ||
            stats.metadata === undefined
        ) {
            return res.status(400).json({ error: "Missing required stats fields in request body" });
        }

        if (!await isAdmin(userId)) {
            return res.status(403).json({ error: "User does not have permission" });
        }

        const itemRef = items.doc(id);
        const existingItem = await itemRef.get();
        if (existingItem.exists) {
            return res.status(409).json({ error: "Item already exists" });
        }

        await itemRef.set({ name, description, type, knockback, imageName, imageUrl });

        const statsRef = itemRef.collection('stats').doc(stats.id || 'stats');
        await statsRef.set({
            circleDamage: stats.circleDamage,
            squareDamage: stats.squareDamage,
            triangleDamage: stats.triangleDamage,
            critChance: stats.critChance,
            critDamage: stats.critDamage,
            metadata: stats.metadata,
        });

        return res.status(201).json({ message: "Item created successfully", itemId: itemRef.id, statsId: statsRef.id });
    } catch (error) {
        console.warn("Error creating item:", error);
        return res.status(500).json({ error: "Failed to create item" });
    }
});

/**
 * PATCH /api/update-item/:itemid
 * @route PATCH /api/update-item/:itemid
 * @endpoint /api/update-item/:itemid
 * @summary Update base item and/or stats.
 * @tags Items, Admin
 * @param {string} req.params.itemid - Item identifier.
 * @response {object} 200 - Confirms item update.
 * @response {object} 400 - Invalid update payload or field values.
 * @response {object} 403 - User does not have permission.
 * @response {object} 404 - Item not found.
 * @response {object} 500 - Failed to update item.
 * @description Updates selected base item fields and/or stats fields.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "itemid": "sword_1"
 *   },
 *   "body": {
 *     "userId": "admin_1",
 *     "name": "Iron Sword+",
 *     "knockback": 3,
 *     "stats": {
 *       "circleDamage": 12,
 *       "metadata": "epic"
 *     }
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "message": "Item updated successfully"
 * }
 * ```
 */
app.patch('/api/update-item/:itemid', async (req, res) => {
    const itemId = req.params.itemid;
    const { userId, name, description, type, knockback, imageUrl, imageName, stats } = req.body;

    if (!await isAdmin(userId)) {
        return res.status(403).json({ error: "User does not have permission" });
    }

    if (!name && !description && !type && knockback === undefined && !imageUrl && !imageName && !stats) {
        return res.status(400).json({ error: "No fields to update provided in request body" });
    }

    try {
        const itemRef = items.doc(itemId);
        const itemDoc = await itemRef.get();

        if (!itemDoc.exists) {
            return res.status(404).json({ error: "Item not found" });
        }

        const itemUpdates = {};
        if (name !== undefined) itemUpdates.name = name;
        if (description !== undefined) itemUpdates.description = description;
        if (type !== undefined) {
            if (!ALLOWED_ITEM_TYPES.includes(type)) {
                return res.status(400).json({ error: "Invalid type. Must be weapon or armor" });
            }
            itemUpdates.type = type;
        }
        if (knockback !== undefined) {
            if (typeof knockback !== 'number') {
                return res.status(400).json({ error: "Knockback must be a number" });
            }
            itemUpdates.knockback = knockback;
        }
        if (imageName !== undefined) itemUpdates.imageName = imageName;
        if (imageUrl !== undefined) itemUpdates.imageUrl = imageUrl;

        if (Object.keys(itemUpdates).length > 0) {
            await itemRef.update(itemUpdates);
        }

        if (stats !== undefined) {
            const statsRef = itemRef.collection('stats').doc(stats.id || 'stats');
            const statsUpdates = {};

            if (stats.circleDamage !== undefined) statsUpdates.circleDamage = stats.circleDamage;
            if (stats.squareDamage !== undefined) statsUpdates.squareDamage = stats.squareDamage;
            if (stats.triangleDamage !== undefined) statsUpdates.triangleDamage = stats.triangleDamage;
            if (stats.critChance !== undefined) statsUpdates.critChance = stats.critChance;
            if (stats.critDamage !== undefined) statsUpdates.critDamage = stats.critDamage;
            if (stats.metadata !== undefined) statsUpdates.metadata = stats.metadata;

            if (Object.keys(statsUpdates).length === 0) {
                return res.status(400).json({ error: "No stats fields provided to update" });
            }

            await statsRef.set(statsUpdates, { merge: true });
        }

        return res.status(200).json({ message: "Item updated successfully" });
    } catch (error) {
        console.warn("Error updating item:", error);
        return res.status(500).json({ error: "Failed to update item" });
    }
});

//CRUD for user items, equip items, inventory management

/**
 * POST /api/add-user-item/:sessionId
 * @route POST /api/add-user-item/:sessionId
 * @endpoint /api/add-user-item/:sessionId
 * @summary Add a base item instance to user inventory.
 * @tags Inventory, Sessions
 * @param {string} req.params.sessionId - Session identifier.
 * @response {object} 201 - Confirms inventory item creation.
 * @response {object} 400 - Missing itemId in request body.
 * @response {object} 403 - Unauthorized or invalid session.
 * @response {object} 404 - User or base item not found.
 * @response {object} 500 - Failed to authenticate session or add item.
 * @description Adds a base item instance to the authenticated user's inventory.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "sessionId": "<session_id>"
 *   },
 *   "body": {
 *     "itemId": "sword_1"
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "message": "Item added to user successfully",
 *   "userItemId": "user_item_123"
 * }
 * ```
 */
app.post('/api/add-user-item/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    const { itemId } = req.body;

    let userId = null;
    try {
        const sessionsSnapshot = await sessions.where('sessionId', '==', sessionId).limit(1).get();
        if (!sessionsSnapshot.empty) {
            userId = sessionsSnapshot.docs[0].id;
        }
    } catch (error) {
        console.warn('Error fetching session:', error);
        return res.status(500).json({ error: 'Failed to authenticate session' });
    }

    console.log('Received add-user-item request:', { userId, itemId, sessionId });

    if (!userId) {
        return res.status(403).json({ error: 'Unauthorized or invalid session' });
    }

    if (itemId == null) {
        return res.status(400).json({ error: 'Missing itemId in request body' });
    }

    try {
        const userRef = users.doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const itemDoc = await items.doc(itemId).get();
        if (!itemDoc.exists) {
            return res.status(404).json({ error: 'Base item not found' });
        }

        const userItemRef = userItems.doc();
        await db.runTransaction(async (tx) => {
            tx.set(userItemRef, { userId, baseItemId: itemId });
            tx.update(userRef, {
                inventory: admin.firestore.FieldValue.arrayUnion(userItemRef.id),
            });
        });

        return res.status(201).json({
            message: 'Item added to user successfully',
            userItemId: userItemRef.id,
        });
    } catch (error) {
        console.warn(`Error adding item ${itemId} to user ${userId}:`, error);
        return res.status(500).json({ error: 'Failed to add item to user' });
    }
});

/**
 * POST /api/equip-item/:sessionId
 * @route POST /api/equip-item/:sessionId
 * @endpoint /api/equip-item/:sessionId
 * @summary Equip or unequip a user item.
 * @tags Inventory, Equipment, Sessions
 * @param {string} req.params.sessionId - Session identifier.
 * @response {object} 200 - Confirms equip or unequip action.
 * @response {object} 400 - Missing or invalid request fields.
 * @response {object} 403 - Unauthorized session or item ownership violation.
 * @response {object} 404 - User, user item, or base item not found.
 * @response {object} 500 - Failed to authenticate session or equip item.
 * @description Equips or unequips a user-owned item for the selected slot type.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "sessionId": "<session_id>"
 *   },
 *   "body": {
 *     "userId": "user_123",
 *     "userItemId": "user_item_123",
 *     "type": "Weapon"
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "message": "Item equipped successfully"
 * }
 * ```
 */
app.post('/api/equip-item/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    const { userId, userItemId, type } = req.body;

    if (!userId || userItemId === undefined || !type) {
        return res.status(400).json({ error: 'Missing userId, userItemId or type in request body' });
    }

    try {
        const sessionDoc = await sessions.doc(userId).get();
        const sessionIdLocal = sessionDoc.exists ? sessionDoc.data() : null;
        if (!sessionIdLocal || sessionIdLocal.sessionId !== sessionId) {
            return res.status(403).json({ error: 'Unauthorized or invalid session' });
        }
    } catch (error) {
        console.warn('Error fetching session:', error);
        return res.status(500).json({ error: 'Failed to authenticate session' });
    }

    if (!ALLOWED_ITEM_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Invalid type. Must be weapon or armor' });
    }

    try {
        const userDoc = await users.doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (userItemId === null) {
            //create equipped subcollection if it doesn't exist and set the equipped item for the type

            if (!(await users.doc(userId).collection('equipped').doc(type).get()).exists) {
                await users.doc(userId).collection('equipped').doc(type).set({});
            }

            await users.doc(userId).collection('equipped').doc(type).set({ userItemId: null }, { merge: true });
            return res.status(200).json({ message: 'Item unequipped successfully' });
        }

        const inventory = userDoc.data().inventory || [];
        if (!inventory.includes(userItemId)) {
            return res.status(403).json({ error: 'User does not own the specified user item' });
        }

        const userItemDoc = await userItems.doc(userItemId).get();
        if (!userItemDoc.exists) {
            return res.status(404).json({ error: 'User item not found' });
        }

        const userItemData = userItemDoc.data();
        if (userItemData.userId !== userId) {
            return res.status(403).json({ error: 'User does not own the specified user item' });
        }

        const itemDoc = await items.doc(userItemData.baseItemId).get();
        if (!itemDoc.exists) {
            return res.status(404).json({ error: 'Base item not found for the provided user item' });
        }
        if (itemDoc.data().type !== type) {
            return res.status(400).json({ error: 'Provided type does not match user item type' });
        }

        //create equipped subcollection if it doesn't exist and set the equipped item for the type

        if (!(await users.doc(userId).collection('equipped').doc(type).get()).exists) {
            await users.doc(userId).collection('equipped').doc(type).set({});
        }

        await users.doc(userId).collection('equipped').doc(type).set({ userItemId }, { merge: true });

        return res.status(200).json({ message: 'Item equipped successfully' });
    } catch (error) {
        console.warn(`Error equipping item ${userItemId} for user ${userId}:`, error);
        return res.status(500).json({ error: 'Failed to equip item' });
    }
});

/**
 * GET /api/get-equipped-items/:userId
 * @route GET /api/get-equipped-items/:userId
 * @endpoint /api/get-equipped-items/:userId
 * @summary Get equipped user items.
 * @tags Inventory, Equipment
 * @param {string} req.params.userId - User identifier.
 * @response {object} 200 - Returns currently equipped user items.
 * @response {object} 400 - Missing userId in request parameters.
 * @response {object} 404 - User not found.
 * @response {object} 500 - Failed to fetch equipped items.
 * @description Retrieves equipped items that are still present in the user's inventory.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "userId": "user_123"
 *   },
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "items": [
 *     {
 *       "type": "Weapon",
 *       "userItemId": "user_item_123",
 *       "userId": "user_123",
 *       "baseItemId": "sword_1"
 *     }
 *   ]
 * }
 * ```
 */
app.get('/api/get-equipped-items/:userId', async (req, res) => {
    const userId = req.params.userId;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId in request parameters' });
    }

    try {
        const userDoc = await users.doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const inventory = userDoc.data().inventory || [];
        const equippedSnapshot = await users.doc(userId).collection('equipped').get();
        const equippedItems = [];

        for (const doc of equippedSnapshot.docs) {
            const type = doc.id; // e.g., 'armor', 'weapon'
            const userItemId = doc.data()['userItemId'];

            // Check if there is an item equipped and if the user actually owns it in their inventory
            if (userItemId && inventory.includes(userItemId)) {
                const userItemDoc = await userItems.doc(userItemId).get();
                if (userItemDoc.exists) {
                    equippedItems.push({
                        type,
                        userItemId: userItemId,
                        ...userItemDoc.data()
                    });
                }
            } else if (userItemId) {
                console.warn(`User ${userId} has item ${userItemId} equipped but it is not in their inventory.`);
            }
        }

        res.status(200).json({ items: equippedItems });
    } catch (error) {
        console.warn(`Error fetching equipped items for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to fetch equipped items' });
    }
});

//inventory

/**
 * GET /api/get-inventory/:userId
 * @route GET /api/get-inventory/:userId
 * @endpoint /api/get-inventory/:userId
 * @summary Get resolved inventory for a user.
 * @tags Inventory
 * @param {string} req.params.userId - User identifier.
 * @response {object} 200 - Returns resolved inventory entries.
 * @response {object} 400 - Missing userId in request parameters.
 * @response {object} 404 - User not found.
 * @response {object} 500 - Failed to fetch inventory.
 * @description Returns a user's inventory enriched with base item data and stats.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "userId": "user_123"
 *   },
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "items": [
 *     {
 *       "userItemId": "user_item_123",
 *       "itemId": "sword_1",
 *       "name": "Iron Sword",
 *       "type": "Weapon",
 *       "stats": {
 *         "circleDamage": 10,
 *         "squareDamage": 9,
 *         "triangleDamage": 11,
 *         "critChance": 0.1,
 *         "critDamage": 1.5,
 *         "metadata": "rare"
 *       }
 *     }
 *   ]
 * }
 * ```
 */
app.get('/api/get-inventory/:userId', async (req, res) => {
    const userId = req.params.userId;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId in request parameters' });
    }

    try {
        const userDoc = await users.doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        const inventory = userDoc.data().inventory || [];

        const normalizedInventoryIds = inventory
            .map((userItemId) => String(userItemId ?? '').trim())
            .filter((userItemId) => userItemId !== '');

        console.log(`User ${userId} inventory:`, normalizedInventoryIds);

        if (normalizedInventoryIds.length === 0) {
            return res.status(200).json({ items: [] });
        }

        const uniqueInventoryUserItemIds = [...new Set(normalizedInventoryIds)];

        const userItemRefs = uniqueInventoryUserItemIds.map((userItemId) => userItems.doc(userItemId));
        const userItemDocs = await db.getAll(...userItemRefs);

        const userItemToBaseItemCandidatesMap = new Map();
        const baseItemIdSet = new Set();

        console.log(`Fetched user item documents for user ${userId}:`, userItemDocs.map(doc => ({ id: doc.id, exists: doc.exists })));

        userItemDocs.forEach((userItemDoc) => {
            console.log(`Processing user item document for user ${userId}: userItemId ${userItemDoc.id}, exists: ${userItemDoc.exists}`);
            if (!userItemDoc.exists) {
                console.warn(`Inventory references missing user-item document for user ${userId}:`, userItemDoc.id);
                return;
            }

            const userItemData = userItemDoc.data();
            const candidateBaseItemIds = [
                userItemData.baseItemId,
                userItemData['base-item-id'],
                userItemData.itemId,
                userItemData['item-id'],
            ]
                .map((value) => String(value ?? '').trim())
                .filter((value) => value !== '');

            if (candidateBaseItemIds.length === 0) {
                console.warn(
                    `Skipping user item with no usable base item reference for user ${userId}:`,
                    { userItemId: userItemDoc.id, fields: userItemData }
                );
                return;
            }

            const uniqueCandidates = [...new Set(candidateBaseItemIds)];
            userItemToBaseItemCandidatesMap.set(userItemDoc.id, uniqueCandidates);

            uniqueCandidates.forEach((candidateId) => {
                baseItemIdSet.add(candidateId);
            });
        });


        const uniqueBaseItemIds = [...baseItemIdSet];
        if (uniqueBaseItemIds.length === 0) {
            console.log(`Inventory response for user ${userId}: 0 items (no valid base items found).`);
            return res.status(200).json({ items: [] });
        }

        console.log(`Unique base item IDs for user ${userId}:`, uniqueBaseItemIds);

        const baseItemRefs = uniqueBaseItemIds.map((baseItemId) => items.doc(baseItemId));
        console.log(`Fetching base item documents for user ${userId} with references:`, baseItemRefs.map(ref => ref.path));
        const baseItemDocs = await db.getAll(...baseItemRefs);
        console.log(`Fetched base item documents for user ${userId}:`, baseItemDocs.map(doc => ({ id: doc.id, exists: doc.exists })));

        console.log(`Fetched base item documents for user ${userId}:`, baseItemDocs.map(doc => ({ id: doc.id, exists: doc.exists })));

        const baseItemById = new Map();
        await Promise.all(baseItemDocs.map(async (itemDoc) => {
            if (!itemDoc.exists) {
                return;
            }

            const statsSnapshot = await itemDoc.ref.collection('stats').limit(1).get();
            const firstStatDoc = statsSnapshot.docs[0];

            const stats = firstStatDoc ? {
                circleDamage: firstStatDoc.data().circleDamage,
                squareDamage: firstStatDoc.data().squareDamage,
                triangleDamage: firstStatDoc.data().triangleDamage,
                critChance: firstStatDoc.data().critChance,
                critDamage: firstStatDoc.data().critDamage,
                metadata: firstStatDoc.data().metadata,
            } : null;

            baseItemById.set(itemDoc.id, {
                name: itemDoc.data().name,
                description: itemDoc.data().description,
                type: itemDoc.data().type,
                knockback: itemDoc.data().knockback,
                imageUrl: itemDoc.data().imageUrl,
                stats,
            });
        }));

        // Keep response order consistent with the user's inventory ordering.
        const inventoryItems = [];
        normalizedInventoryIds.forEach((userItemId) => {
            const candidateBaseItemIds = userItemToBaseItemCandidatesMap.get(userItemId) || [];
            const resolvedBaseItemId = candidateBaseItemIds.find((candidateId) => baseItemById.has(candidateId));
            const baseItem = resolvedBaseItemId ? baseItemById.get(resolvedBaseItemId) : null;

            console.log(
                `Mapped user item ${userItemId} using candidates ${JSON.stringify(candidateBaseItemIds)} to base item ${resolvedBaseItemId} for user ${userId}:`,
                baseItem
            );

            if (!baseItem) {
                console.warn(
                    `No existing base item found for user item ${userItemId} (user ${userId}) with candidates:`,
                    candidateBaseItemIds
                );
                return;
            }

            console.log(`Adding inventory item for user ${userId}: userItemId ${userItemId}, baseItemId ${resolvedBaseItemId}`);

            inventoryItems.push({
                userItemId,
                itemId: resolvedBaseItemId,
                name: baseItem.name,
                description: baseItem.description,
                type: baseItem.type,
                knockback: baseItem.knockback,
                imageUrl: baseItem.imageUrl,
                stats: baseItem.stats,
            });
        });

        console.log(
            `Inventory response for user ${userId}: returned ${inventoryItems.length} item entries from ${normalizedInventoryIds.length} inventory references.`
        );

        return res.status(200).json({ items: inventoryItems });
    }
    catch (error) {
        console.warn(`Error fetching inventory for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});


//listings

/**
 * GET /api/get-all-active-listings
 * @route GET /api/get-all-active-listings
 * @endpoint /api/get-all-active-listings
 * @summary List all active marketplace listings.
 * @tags Listings, Marketplace
 * @response {object} 200 - Returns all active marketplace listings.
 * @response {object} 500 - Failed to fetch all listings.
 * @description Lists active listings enriched with seller and item details.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {},
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "listings": [
 *     {
 *       "id": "listing_1",
 *       "userId": "seller_1",
 *       "itemId": "sword_1",
 *       "price": 500,
 *       "username": "seller",
 *       "itemName": "Iron Sword",
 *       "itemImageUrl": "https://example.com/sword.png"
 *     }
 *   ]
 * }
 * ```
 */
app.get('/api/get-all-active-listings', async (req, res) => {
    try {
        const snapshot = await db.collection('listings').where('active', '==', true).get();
        const listingsArray = [];

        console.log(`Fetched ${snapshot.size} listings from database.`);

        for (const doc of snapshot.docs) {
            const listingData = doc.data();
            const userDoc = await users.doc(listingData.userId).get();
            const itemDoc = await items.doc(listingData.itemId).get();

            console.log(`Processing listing ${doc.id}: userId ${listingData.userId}, itemId ${listingData.itemId}`);
            console.log(`User document for listing ${doc.id}: exists ${userDoc.exists}`);
            console.log(`Item document for listing ${doc.id}: exists ${itemDoc.exists}`);

            if (userDoc.exists && itemDoc.exists) {
                listingsArray.push({
                    id: doc.id,
                    userId: listingData.userId,
                    itemId: listingData.itemId,
                    price: listingData.price,
                    username: userDoc.data().username,
                    itemName: itemDoc.data().name,
                    itemImageUrl: itemDoc.data().imageUrl
                });
            }
        }
        res.status(200).json({ listings: listingsArray });
    }
    catch (error) {
        console.warn(`Error fetching all listings:`, error);
        res.status(500).json({ error: 'Failed to fetch all listings' });
    }
});

/**
 * GET /api/get-all-inactive-listings
 * @route GET /api/get-all-inactive-listings
 * @endpoint /api/get-all-inactive-listings
 * @summary List all inactive marketplace listings.
 * @tags Listings, Marketplace
 * @response {object} 200 - Returns all inactive marketplace listings.
 * @response {object} 500 - Failed to fetch all listings.
 * @description Lists inactive listings enriched with seller and item details.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {},
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "listings": [
 *     {
 *       "id": "listing_2",
 *       "userId": "seller_1",
 *       "itemId": "armor_1",
 *       "price": 800,
 *       "username": "seller",
 *       "itemName": "Iron Armor",
 *       "itemImageUrl": "https://example.com/armor.png"
 *     }
 *   ]
 * }
 * ```
 */
app.get('/api/get-all-inactive-listings', async (req, res) => {
    try {
        const snapshot = await db.collection('listings').where('active', '==', false).get();
        const listingsArray = [];

        console.log(`Fetched ${snapshot.size} listings from database.`);

        for (const doc of snapshot.docs) {
            const listingData = doc.data();
            const userDoc = await users.doc(listingData.userId).get();
            const itemDoc = await items.doc(listingData.itemId).get();

            console.log(`Processing listing ${doc.id}: userId ${listingData.userId}, itemId ${listingData.itemId}`);
            console.log(`User document for listing ${doc.id}: exists ${userDoc.exists}`);
            console.log(`Item document for listing ${doc.id}: exists ${itemDoc.exists}`);

            if (userDoc.exists && itemDoc.exists) {
                listingsArray.push({
                    id: doc.id,
                    userId: listingData.userId,
                    itemId: listingData.itemId,
                    price: listingData.price,
                    username: userDoc.data().username,
                    itemName: itemDoc.data().name,
                    itemImageUrl: itemDoc.data().imageUrl
                });
            }
        }
        res.status(200).json({ listings: listingsArray });
    }
    catch (error) {
        console.warn(`Error fetching all listings:`, error);
        res.status(500).json({ error: 'Failed to fetch all listings' });
    }
});

/**
 * GET /api/get-user-listings/:userId
 * @route GET /api/get-user-listings/:userId
 * @endpoint /api/get-user-listings/:userId
 * @summary List all listings created by a user.
 * @tags Listings, Marketplace
 * @param {string} req.params.userId - User identifier.
 * @response {object} 200 - Returns all listings created by the user.
 * @response {object} 400 - Missing userId in request parameters.
 * @response {object} 500 - Failed to fetch user listings.
 * @description Fetches marketplace listings that belong to a specific user.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "userId": "seller_1"
 *   },
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "listings": [
 *     {
 *       "id": "listing_1",
 *       "userId": "seller_1",
 *       "itemId": "sword_1",
 *       "price": 500,
 *       "itemName": "Iron Sword",
 *       "itemImageUrl": "https://example.com/sword.png"
 *     }
 *   ]
 * }
 * ```
 */
app.get('/api/get-user-listings/:userId', async (req, res) => {
    const userId = req.params.userId;
    if (!userId) {
        return res.status(400).json({ error: 'Missing userId in request parameters' });
    }

    try {
        const snapshot = await db.collection('listings').where('userId', '==', userId).get();
        const listingsArray = [];

        for (const doc of snapshot.docs) {
            const listingData = doc.data();
            const itemDoc = await items.doc(listingData.itemId).get();
            if (itemDoc.exists) {
                listingsArray.push({
                    id: doc.id,
                    userId: listingData.userId,
                    itemId: listingData.itemId,
                    price: listingData.price,
                    itemName: itemDoc.data().name,
                    itemImageUrl: itemDoc.data().imageUrl
                });
            }
        }
        res.status(200).json({ listings: listingsArray });
    }
    catch (error) {
        console.warn(`Error fetching listings for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to fetch user listings' });
    }
});

/**
 * GET /api/get-listed-user-item-ids/:userId
 * @route GET /api/get-listed-user-item-ids/:userId
 * @endpoint /api/get-listed-user-item-ids/:userId
 * @summary Get listed user-item IDs for a user.
 * @tags Listings, Marketplace
 * @param {string} req.params.userId - User identifier.
 * @response {object} 200 - Returns unique listed user-item IDs.
 * @response {object} 400 - Missing userId in request parameters.
 * @response {object} 500 - Failed to fetch listed userItemIds.
 * @description Retrieves the set of user item IDs currently referenced by a user's listings.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "userId": "seller_1"
 *   },
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "userItemIds": [
 *     "user_item_123",
 *     "user_item_456"
 *   ]
 * }
 * ```
 */
app.get('/api/get-listed-user-item-ids/:userId', async (req, res) => {
    const userId = req.params.userId;

    if (!userId) {
        return res.status(400).json({ error: 'Missing userId in request parameters' });
    }

    try {
        const snapshot = await listings.where('userId', '==', userId).get();
        const userItemIds = [];

        snapshot.forEach((doc) => {
            const rawUserItemId = doc.data().userItemId;
            const normalizedUserItemId = String(rawUserItemId ?? '').trim();

            if (normalizedUserItemId !== '') {
                userItemIds.push(normalizedUserItemId);
            }
        });

        const uniqueUserItemIds = [...new Set(userItemIds)];
        return res.status(200).json({ userItemIds: uniqueUserItemIds });
    }
    catch (error) {
        console.warn('Error fetching listed userItemIds:', error);
        return res.status(500).json({ error: 'Failed to fetch listed userItemIds' });
    }
});

/**
 * POST /api/create-listing
 * @route POST /api/create-listing
 * @endpoint /api/create-listing
 * @summary Create marketplace listing.
 * @tags Listings, Marketplace
 * @response {object} 201 - Confirms listing creation.
 * @response {object} 400 - Missing required fields or invalid price.
 * @response {object} 403 - User does not own the specified item.
 * @response {object} 404 - User not found.
 * @response {object} 500 - Failed to create listing.
 * @description Creates a new active marketplace listing for a user-owned item.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {},
 *   "body": {
 *     "userId": "seller_1",
 *     "itemId": "sword_1",
 *     "userItemId": "user_item_123",
 *     "price": 500
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "message": "Listing created successfully"
 * }
 * ```
 */
app.post('/api/create-listing', async (req, res) => {
    const { userId, itemId, userItemId, price } = req.body;

    if (!userId || !itemId || !userItemId || !price) {
        return res.status(400).json({ error: 'Missing required fields in request body' });
    }

    if (price <= 0) {
        return res.status(400).json({ error: 'Price must be greater than 0' });
    }

    try {
        const userDoc = await users.doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if the user owns the item
        const inventory = userDoc.data().inventory || [];
        if (!inventory.includes(userItemId)) {
            return res.status(403).json({ error: 'User does not own the specified item' });
        }

        // Create the listing
        await listings.add({ userId, itemId, userItemId, price, active: true });
        res.status(201).json({ message: 'Listing created successfully' });
    }
    catch (error) {
        console.warn(`Error creating listing for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to create listing' });
    }
});

/**
 * DELETE /api/delete-listing/:listingId
 * @route DELETE /api/delete-listing/:listingId
 * @endpoint /api/delete-listing/:listingId
 * @summary Delete marketplace listing.
 * @tags Listings, Marketplace
 * @param {string} req.params.listingId - Listing identifier.
 * @response {object} 200 - Confirms listing deletion.
 * @response {object} 400 - Missing userId or listingId.
 * @response {object} 403 - User is not the owner of the listing.
 * @response {object} 404 - User or listing not found.
 * @response {object} 500 - Failed to delete listing.
 * @description Deletes a listing when requested by its owner.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "listingId": "listing_1"
 *   },
 *   "body": {
 *     "userId": "seller_1"
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "message": "Listing deleted successfully"
 * }
 * ```
 */
app.delete('/api/delete-listing/:listingId', async (req, res) => {
    const { userId } = req.body;
    const listingId = req.params.listingId;

    if (!userId || !listingId) {
        return res.status(400).json({ error: 'Missing userId or listingId in request body' });
    }

    try {
        const userDoc = await users.doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const listingDoc = await listings.doc(listingId).get();
        if (!listingDoc.exists) {
            return res.status(404).json({ error: 'Listing not found' });
        }
        if (listingDoc.data().userId !== userId) {
            return res.status(403).json({ error: 'User is not the owner of the listing' });
        }

        await listings.doc(listingId).delete();
        res.status(200).json({ message: 'Listing deleted successfully' });
    }
    catch (error) {
        console.warn(`Error deleting listing ${listingId} for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to delete listing' });
    }
});

/**
 * POST /api/buy-listing/:listingId
 * @route POST /api/buy-listing/:listingId
 * @endpoint /api/buy-listing/:listingId
 * @summary Buy an active marketplace listing.
 * @tags Listings, Marketplace
 * @param {string} req.params.listingId - Listing identifier.
 * @response {object} 200 - Confirms successful listing purchase.
 * @response {object} 400 - Missing request fields, inactive listing, insufficient coins, or item in queue.
 * @response {object} 404 - Buyer, seller, or listing not found.
 * @response {object} 500 - Failed to buy listing.
 * @description Purchases an active listing and transfers item ownership and coins.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {
 *     "listingId": "listing_1"
 *   },
 *   "body": {
 *     "userId": "buyer_1"
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "message": "Listing bought successfully"
 * }
 * ```
 */
app.post('/api/buy-listing/:listingId', async (req, res) => {
    const { userId } = req.body;
    const listingId = req.params.listingId;

    if (!userId || !listingId) {
        return res.status(400).json({ error: 'Missing userId or listingId in request body' });
    }

    try {
        const buyerDoc = await users.doc(userId).get();

        if (!buyerDoc.exists) {
            return res.status(404).json({ error: 'Buyer user not found' });
        }

        const listingDoc = await listings.doc(listingId).get();

        if (!listingDoc.exists) {
            return res.status(404).json({ error: 'Listing not found' });
        }
        const listingData = listingDoc.data();

        if (!listingData.active) {
            return res.status(400).json({ error: 'Listing is no longer active' });
        }

        const sellerDoc = await users.doc(listingData.userId).get();

        if (!sellerDoc.exists) {
            return res.status(404).json({ error: 'Seller user not found' });
        }

        const buyerData = buyerDoc.data();

        if (buyerData.coins < listingData.price) {
            return res.status(400).json({ error: 'Buyer does not have enough coins' });
        }

        if (itemsInQueue.includes(listingData.userItemId)) {
            return res.status(400).json({ error: 'This item is currently in the process of being bought by another user. Please try again later.' });
        }

        itemsInQueue.push(listingData.userItemId);

        //remove item from seller's inventory, add to buyer's inventory, transfer coins, and deactivate listing and add a sellerId to the listing
        await db.runTransaction(async (tx) => {
            //remove item from seller and add coins
            tx.update(users.doc(listingData.userId), {
                inventory: admin.firestore.FieldValue.arrayRemove(listingData.userItemId),
                coins: admin.firestore.FieldValue.increment(listingData.price),
            });
            //add item to buyer and remove coins
            tx.update(users.doc(userId), {
                inventory: admin.firestore.FieldValue.arrayUnion(listingData.userItemId),
                coins: admin.firestore.FieldValue.increment(-listingData.price),
            });
            //deactivate listing and add sellerId
            tx.update(listings.doc(listingId), {
                active: false,
                sellerId: listingData.userId,
            });
        });

    }
    catch (error) {
        console.warn(`Error buying listing ${listingId} for user ${userId}:`, error);
        return res.status(500).json({ error: 'Failed to buy listing' });
    }

});

//image handling

/**
 * POST /api/upload-image
 * @route POST /api/upload-image
 * @endpoint /api/upload-image
 * @summary Upload image to Cloudinary.
 * @tags Images, Admin
 * @response {object} 201 - Returns uploaded image URL.
 * @response {object} 400 - Missing userId or file.
 * @response {object} 403 - User does not have permission.
 * @response {object} 500 - Failed to upload image.
 * @description Uploads an image file to Cloudinary for authorized admin users.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {},
 *   "body": {
 *     "userId": "admin_1",
 *     "file": "<multipart_binary_file>"
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "url": "https://res.cloudinary.com/<cloud>/image/upload/<file>"
 * }
 * ```
 */
app.post('/api/upload-image', upload.single('file'), async (req, res) => {
    try {
        const { userId } = req.body;
        const file = req.file;
        if (!userId || !file || !file.originalname) {
            return res.status(400).json({ error: 'Missing userId or file' });
        }

        if (!await isAdmin(userId)) {
            return res.status(403).json({ error: 'User does not have permission' });
        }

        const uploadFromBuffer = () =>
            new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { public_id: file.originalname },
                    (error, result) => {
                        if (error) return reject(error);
                        resolve(result);
                    }
                );
                stream.end(file.buffer);
            });

        const result = await uploadFromBuffer();
        return res.status(201).json({ url: result.secure_url });
    }
    catch (err) {
        console.warn('Error uploading image:', err);
        return res.status(500).json({ error: 'Failed to upload image' });
    }
});

/**
 * DELETE /api/delete-image
 * @route DELETE /api/delete-image
 * @endpoint /api/delete-image
 * @summary Delete image from Cloudinary.
 * @tags Images, Admin
 * @response {object} 200 - Confirms image deletion result.
 * @response {object} 400 - Missing userId or filename.
 * @response {object} 403 - User does not have permission.
 * @response {object} 500 - Failed to delete image.
 * @description Deletes an uploaded image from Cloudinary for authorized admin users.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {},
 *   "body": {
 *     "userId": "admin_1",
 *     "filename": "sword.png"
 *   }
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "message": "Image deleted successfully",
 *   "result": "ok"
 * }
 * ```
 */
app.delete('/api/delete-image', async (req, res) => {
    const { userId, filename } = req.body;

    if (!userId || !filename) {
        return res.status(400).json({ error: "Missing userId or filename in request body" });
    }

    if (!await isAdmin(userId)) {
        return res.status(403).json({ error: "User does not have permission" });
    }

    try {
        const result = await cloudinary.uploader.destroy(filename);
        console.log(result);
        res.status(200).json({ message: "Image deleted successfully", result });
    } catch (error) {
        console.warn("Error deleting image:", error);
        res.status(500).json({ error: "Failed to delete image" });
    }
});


/**
 * Checks if a given user is an admin by querying the `admins` collection.
 *
 * @param {string} userId - The ID of the user to check.
 * @returns {Promise<boolean>} A promise resolving to true if the user is an admin, false otherwise.
 */
async function isAdmin(userId) {
    return admins.doc(userId).get()
        .then((adminDoc) => {
            console.log(`Checking permissions for userId ${userId}:`, adminDoc.exists);
            return adminDoc.exists;
        })
        .catch((error) => {
            console.warn('Error checking permissions:', error);
            throw new Error('Failed to check permissions');
        });
}

/**
 * GET /api/hello
 * @route GET /api/hello
 * @endpoint /api/hello
 * @summary Health check endpoint.
 * @tags System
 * @response {object} 200 - Returns hello message.
 * @description Health-check endpoint that responds with a static greeting.
 * Request (placeholder JSON):
 * ```json
 * {
 *   "params": {},
 *   "body": {}
 * }
 * ```
 * Response (placeholder JSON):
 * ```json
 * {
 *   "message": "Hello world!"
 * }
 * ```
 */
app.get('/api/hello', (req, res) => {
    console.log('Received hello request');
    res.status(200).json({ message: 'Hello world!' });
});

const port = 3333;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log('firebaseApp initialized:', !!firebaseApp);
    console.log('serviceAccount loaded:', !!serviceAccount);
    console.log('Cloudinary configured:', !!cloudinary.config().cloud_name);
})
