const express = require('express');
const cors = require('cors');
const firebase = require('firebase/app');

require('firebase/auth');
require('firebase/database');

app = express();

app.use(express.json());
app.use(cors());

const firebaseConfig = {};

app.post('/api/inventory-check', (req, res) => {
    const { auth_id } = req.body;

    console.log('Received inventory check request for auth_id:', auth_id);

    res.status(200).json({ test: true });
});

const port = 3333;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})