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
                                    return res.status(200).json({ message: 'Username created successfully' });
                                })
                                .catch((error) => {
                                    console.log(`Failed to create username ${username} for userId ${userId}:`, error);
                                    return res.status(500).json({ error: 'Failed to create username' });
                                });

                        }
                        else {
                            console.log(`Username ${username} already exists`);
                            return res.status(400).json({ error: 'Username already exists' });
                        }
                    })
                    .catch((error) => {
                        console.log(`Failed to check username existence for ${username}:`, error);
                        return res.status(500).json({ error: 'Failed to check username existence' });
                    });
            }
            else {
                console.log(`UserId ${userId} already has a username`);
                return res.status(400).json({ error: 'User already has a username' });
            }
        });
});

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