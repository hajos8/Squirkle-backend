const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const dotenv = require('dotenv');

//pnpm install express cors firebase
//run command: node --env-file=.env .\index.cjs

dotenv.config();

app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT).toString('utf8')
);

const firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.firestore();
const users = db.collection('users');
const items = db.collection('items');

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
                console.log(`Checking if username ${username} already exists`);

                users.where("username", "==", username).get()
                    .then((snapshot) => {
                        if (snapshot.empty) {
                            users.doc(userId).set({ username })
                                .then(() => {
                                    console.log(`Username ${username} created for userId ${userId}`);
                                    return res.status(201).json({ message: 'Username created successfully' });
                                })
                                .catch((error) => {
                                    console.log(`Failed to create username ${username} for userId ${userId}:`, error);
                                    return res.status(500).json({ error: 'Failed to create username' });
                                });

                        }
                        else {
                            console.log(`Username ${username} already exists`);
                            return res.status(409).json({ error: 'Username already exists' });
                        }
                    })
                    .catch((error) => {
                        console.warn(`Failed to check username existence for ${username}:`, error);
                        return res.status(500).json({ error: 'Failed to check username existence' });
                    });
            }
            else {
                console.log(`UserId ${userId} already has a username`);
                return res.status(409).json({ error: 'User already has a username' });
            }
        });
});


app.get('/api/get-all-items', (req, res) => {
    items.get()
        .then((snapshot) => {
            snapshot.forEach(async (doc) => {
                const itemsArray = [];
                console.log(`Item found for itemId ${doc.id}:`, doc.data());

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
            console.log("Error getting all items:", error);
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
            console.log(`Stat found for itemId ${itemId}, statId ${statDoc.id}:`, statDoc.data());
            statsArray.push({ id: statDoc.id, ...statDoc.data() });
        });

        const itemData = { ...snapshot.data(), stats: statsArray[0] };
        res.status(200).json({ item: itemData });
    } catch (error) {
        console.log("Error getting item:", error);
        res.status(500).json({ error: "Failed to retrieve item" });
    }
});

app.delete('/api/delete-item/:itemid', async (req, res) => {
    const itemId = req.params.itemid;
    try {
        await items.doc(itemId).delete();
        res.status(200).json({ message: "Item deleted successfully" });
    } catch (error) {
        console.log("Error deleting item:", error);
        res.status(500).json({ error: "Failed to delete item" });
    }
});

//app.

app.get('/api/hello', (req, res) => {
    console.log('Received hello request');
    res.status(200).json({ message: 'Hello world!' });
});

const port = 3333;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log('firebaseApp initialized:', !!firebaseApp);
    console.log('serviceAccount loaded:', !!serviceAccount);
})