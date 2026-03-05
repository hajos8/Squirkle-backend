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

const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT).toString('utf8')
);

const firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.firestore();
const users = db.collection('users');
const admins = db.collection('admins');
const items = db.collection('items');


const sessions = {};

//server time

app.get('/api/server-time', (req, res) => {
    const serverTime = Math.floor((Date.now() - new Date('2026-01-01').getTime()) / 1000);
    res.status(200).json({ serverTime });
});

//server sessions
app.post('/api/create-session', (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'Missing request body' });
    }

    const sessionId = generateSessionId(userId);
    sessions[userId] = { sessionId };
    console.log(sessions);
    res.status(201).json({ sessionId });
});

function generateSessionId(userId) {
    const timestamp = Date.now();

    const randomSalt = crypto.randomBytes(16).toString('hex');
    const dataString = `${userId}-${timestamp}-${randomSalt}`;

    return crypto.createHash('sha256').update(dataString).digest('hex');
}

//user handler endpoints
/* TODO
    Admin page endpoints for user management
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

//TODO make it secure 
app.post('/api/update-coins', (req, res) => {
    // We expect an authorization header with the session ID, and an 'amount' to add
    const sessionId = req.headers['authorization'];
    const { userId, amount } = req.body;

    if (!userId || amount === undefined) {
        return res.status(400).json({ error: 'Missing userId or amount in request body' });
    }

    // 1. Verify Authentication: Check if session exists and matches the user
    const session = sessions[sessionId];
    if (!session || session.userId !== userId) {
        return res.status(403).json({ error: 'Unauthorized or invalid session' });
    }

    // 2. Validate Input: Prevent giving negative coins or absurdly huge amounts
    if (typeof amount !== 'number' || amount <= 0 || amount > 1000) {
        return res.status(400).json({ error: 'Invalid coin amount. Must be between 1 and 1000.' });
    }

    const userRef = users.doc(userId);

    userRef.get()
        .then((doc) => {
            if (doc.exists) {
                // 3. Atomic Increment: Safely add to the existing total in Firestore
                userRef.update({
                    coins: admin.firestore.FieldValue.increment(amount)
                })
                    .then(() => {
                        res.status(200).json({ message: 'Coins updated successfully' });
                    })
                    .catch((error) => {
                        console.warn(`Error updating coins for userId ${userId}:`, error);
                        res.status(500).json({ error: 'Failed to update coins' });
                    });
            } else {
                res.status(404).json({ error: 'User not found' });
            }
        })
        .catch((error) => {
            console.warn(`Error getting user for coin update ${userId}:`, error);
            res.status(500).json({ error: 'Failed to retrieve user' });
        });
});

//item handler endpoints
/* TODO
    Add PATCH
*/

app.get('/api/get-all-items', (req, res) => {
    items.get()
        .then((snapshot) => {
            snapshot.forEach(async (doc) => {
                const itemsArray = [];
                //console.log(`Item found for itemId ${doc.id}:`, doc.data());

                const statsSnapshot = await doc.ref.collection('stats').get();
                const statsArray = [];
                statsSnapshot.forEach((statDoc) => {
                    console.log(`Stat found for itemId ${doc.id}, statId ${statDoc.id}:`, statDoc.data());
                    statsArray.push({ id: statDoc.id, ...statDoc.data() });
                });

                itemsArray.push({ id: doc.id, ...doc.data(), stats: statsArray[0] });

                res.status(200).json({ items: itemsArray });
            });
        })
        .catch((error) => {
            console.warn("Error getting all items:", error);
            res.status(500).json({ error: "Failed to retrieve all items" });
        });
});

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

        const itemData = { ...snapshot.data(), stats: statsArray[0] };
        res.status(200).json({ item: itemData });
    } catch (error) {
        console.warn("Error getting item:", error);
        res.status(500).json({ error: "Failed to retrieve item" });
    }
});

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

app.post('/api/create-item', async (req, res) => {
    try {
        const { userId, id, name, description, knockback, imageUrl, stats } = req.body;

        if (!userId || !id || !name || !description || knockback === undefined || knockback === null || !imageUrl || !stats) {
            return res.status(400).json({ error: "Missing required fields in request body" });
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

        await itemRef.set({ name, description, knockback, imageUrl });

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

app.patch('/api/update-item/:itemid', async (req, res) => {
    const itemId = req.params.itemid;
    const { userId, name, description, knockback, imageUrl, stats } = req.body;

    if (!await isAdmin(userId)) {
        return res.status(403).json({ error: "User does not have permission" });
    }

    if (!name && !description && knockback === undefined && !imageUrl && !stats) {
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
        if (knockback !== undefined) {
            if (typeof knockback !== 'number') {
                return res.status(400).json({ error: "Knockback must be a number" });
            }
            itemUpdates.knockback = knockback;
        }
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

//test endpoint

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