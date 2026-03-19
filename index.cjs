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

const ALLOWED_ITEM_TYPES = ['Weapon', 'Armor'];

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

function normalizeMetadataId(rawMetadataId) {
    return String(rawMetadataId ?? '').trim();
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

// coin management

app.post('/api/update-coins', (req, res) => {
    const sessionId = req.headers['authorization'];
    const { userId, amount } = req.body;

    console.log('Received update-coins request:', { userId, amount, sessionId });

    if (!userId || amount === undefined) {
        return res.status(400).json({ error: 'Missing userId or amount in request body' });
    }

    const sessionIdLocal = sessions[userId];
    console.log(`Session ID for userId ${userId}:`, sessionIdLocal);
    if (!sessionIdLocal || sessionIdLocal.sessionId !== sessionId) {
        return res.status(403).json({ error: 'Unauthorized or invalid session' });
    }

    if (typeof amount !== 'number' || amount <= 0 || amount > 1000) {
        return res.status(400).json({ error: 'Invalid coin amount. Must be between 1 and 1000.' });
    }

    const userRef = users.doc(userId);

    userRef.get()
        .then((doc) => {
            if (doc.exists) {
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

//base item handler endpoints


//metadata handler endpoints

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

app.get('/api/get-metadata/:metadataid', async (req, res) => {
    const metadataId = normalizeMetadataId(req.params.metadataid);

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

app.patch('/api/update-metadata/:metadataid', async (req, res) => {
    const metadataId = normalizeMetadataId(req.params.metadataid);
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

        await metadataRef.update(metadataUpdates);
        return res.status(200).json({ message: 'Metadata updated successfully' });
    } catch (error) {
        console.warn(`Error updating metadata ${metadataId}:`, error);
        return res.status(500).json({ error: 'Failed to update metadata' });
    }
});

app.delete('/api/delete-metadata/:metadataid', async (req, res) => {
    const metadataId = normalizeMetadataId(req.params.metadataid);
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

app.get('/api/get-all-items', async (req, res) => {
    try {
        const snapshot = await items.get();

        const itemsArray = await Promise.all(snapshot.docs.map(async (doc) => {
            const statsSnapshot = await doc.ref.collection('stats').get();
            const statsArray = [];

            statsSnapshot.forEach((statDoc) => {
                statsArray.push({ id: statDoc.id, ...statDoc.data() });
            });

            +
            return { id: doc.id, ...doc.data(), stats: statsArray.length > 0 ? statsArray[0] : null };
        }));

        return res.status(200).json({ items: itemsArray });
    } catch (error) {
        console.warn("Error getting all items:", error);
        return res.status(500).json({ error: "Failed to retrieve all items" });
    }
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


        const itemData = { ...snapshot.data(), stats: statsArray.length > 0 ? statsArray[0] : null };
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

app.patch('/api/update-item/:itemid', async (req, res) => {
    const itemId = req.params.itemid;
    const { userId, name, description, type, knockback, imageUrl, stats } = req.body;

    if (!await isAdmin(userId)) {
        return res.status(403).json({ error: "User does not have permission" });
    }

    if (!name && !description && !type && knockback === undefined && !imageUrl && !stats) {
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

//TODO CRUD for user items, equipped items, and inventory management

app.post('/api/add-user-item', async (req, res) => {
    const sessionId = req.headers['authorization'];
    const { itemId } = req.body;

    const userId = Object.keys(sessions).find(key => sessions[key].sessionId === sessionId);

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
            tx.set(userItemRef, { userId, itemId });
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

app.post('/api/equip-item', async (req, res) => {
    const sessionId = req.headers['authorization'];
    const { userId, userItemId, type } = req.body;

    if (!userId || userItemId === undefined || !type) {
        return res.status(400).json({ error: 'Missing userId, userItemId or type in request body' });
    }

    const sessionIdLocal = sessions[userId];
    if (!sessionIdLocal || sessionIdLocal.sessionId !== sessionId) {
        return res.status(403).json({ error: 'Unauthorized or invalid session' });
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
            await users.doc(userId).collection('equipped').doc(type).delete();
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

        const itemDoc = await items.doc(userItemData.itemId).get();
        if (!itemDoc.exists) {
            return res.status(404).json({ error: 'Base item not found for the provided user item' });
        }

        if (itemDoc.data().type !== type) {
            return res.status(400).json({ error: 'Provided type does not match user item type' });
        }

        await users.doc(userId).collection('equipped').doc(type).set({
            'user-item-id': userItemId,
        }, { merge: true });

        return res.status(200).json({ message: 'Item equipped successfully' });
    } catch (error) {
        console.warn(`Error equipping item ${userItemId} for user ${userId}:`, error);
        return res.status(500).json({ error: 'Failed to equip item' });
    }
});

//TODO test it and fix it
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
            const userItemId = doc.data()['user-item-id'];

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
        const inventoryItems = [];

        let promises = inventory.map(async (userItemId) => {
            console.log(`Processing inventory item ${userItemId} for user ${userId}`);

            const normalizedUserItemId = String(userItemId ?? '').trim();
            if (normalizedUserItemId === '') {
                console.warn(`Skipping invalid inventory item id for user ${userId}:`, userItemId);
                return;
            }

            const userItemDoc = await userItems.doc(normalizedUserItemId).get();
            if (userItemDoc.exists) {
                const userItemData = userItemDoc.data();
                const rawBaseItemId = userItemData.itemId ?? userItemData.baseItemId;
                const normalizedItemId = String(rawBaseItemId ?? '').trim();

                if (normalizedItemId === '') {
                    console.warn(`Skipping user item with invalid base item id for user ${userId}:`, normalizedUserItemId);
                    return;
                }

                const itemDoc = await items.doc(normalizedItemId).get();
                if (itemDoc.exists) {
                    const statsSnapshot = await itemDoc.ref.collection('stats').get();
                    const statsArray = [];
                    statsSnapshot.forEach((statDoc) => {
                        statsArray.push({ id: statDoc.id, ...statDoc.data() });
                    });

                    const hydratedStats = await hydrateStatsWithMetadata(statsArray[0] || null);

                    inventoryItems.push({
                        userItemId: normalizedUserItemId,
                        itemId: normalizedItemId,
                        name: itemDoc.data().name,
                        description: itemDoc.data().description,
                        type: itemDoc.data().type,
                        knockback: itemDoc.data().knockback,
                        imageUrl: itemDoc.data().imageUrl,
                        stats: hydratedStats,
                    });
                }
            }
        });

        await Promise.all(promises);


        res.status(200).json({ items: inventoryItems });
    }
    catch (error) {
        console.warn(`Error fetching inventory for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});


//listings - TODO test them

app.get('/api/get-all-listings', async (req, res) => {
    try {
        const snapshot = await db.collection('listings').get();
        const listingsArray = [];

        for (const doc of snapshot.docs) {
            const listingData = doc.data();
            const userDoc = await users.doc(listingData.userId).get();
            const itemDoc = await items.doc(listingData.itemId).get();
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

//TODO test
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

app.post('/api/create-listing', async (req, res) => {
    const { userId, itemId, price } = req.body;

    if (!userId || !itemId || price === undefined) {
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
        if (!inventory.includes(itemId)) {
            return res.status(403).json({ error: 'User does not own the specified item' });
        }

        // Create the listing
        await listings.add({ userId, itemId, price });
        res.status(201).json({ message: 'Listing created successfully' });
    }
    catch (error) {
        console.warn(`Error creating listing for user ${userId}:`, error);
        res.status(500).json({ error: 'Failed to create listing' });
    }
});

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

//image handling

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