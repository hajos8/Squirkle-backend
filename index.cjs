const express = require('express');
const cors = require('cors');
const firebase = require('firebase/app');

//pnpm install express cors firebase
//run command: node --env-file=.env .\index.cjs

require('firebase/auth');
require('firebase/database');

app = express();

app.use(express.json());
app.use(cors());

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_apiKey,
    authDomain: process.env.VITE_FIREBASE_authDomain,
    projectId: process.env.VITE_FIREBASE_projectId,
    storageBucket: process.env.VITE_FIREBASE_storageBucket,
    messagingSenderId: process.env.VITE_FIREBASE_messagingSenderId,
    appId: process.env.VITE_FIREBASE_appId
};

app.post('/api/inventory-check', (req, res) => {
    const { auth_id } = req.body;

    console.log('Received inventory check request for auth_id:', auth_id);

    res.status(200).json({ test: true });
});

const port = 3333;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log('Firebase config:', firebaseConfig);
})