const request = require('supertest');

const admin = require('firebase-admin');
const { app } = require('../../index.cjs');

describe('Session routes', () => {
    it('POST /api/create-session returns 400 when userId is missing', async () => {
        const response = await request(app)
            .post('/api/create-session')
            .send({})
            .expect(400);

        expect(response.body).toEqual({ error: 'Missing request body' });
    });

    it('POST /api/create-session stores session and returns sessionId', async () => {
        const response = await request(app)
            .post('/api/create-session')
            .send({ userId: '0' })
            .expect(201);

        expect(response.body.sessionId).toMatch(/^[a-f0-9]{64}$/);

        const storedSessionDoc = admin.__mock.getDoc('sessions', '0');
        expect(storedSessionDoc).toBeDefined();
        expect(storedSessionDoc.sessionId).toBe(response.body.sessionId);

        expect(admin.__mock.calls.set).toContainEqual(
            expect.objectContaining({ collectionName: 'sessions', docId: '0' })
        );
    });
});
