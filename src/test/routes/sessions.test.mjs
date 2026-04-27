import request from 'supertest';
import backend from '../../index.cjs';

const { app } = backend;

describe('Session routes', () => {
    beforeEach(() => {
        backend.__test.reset();
    });

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

        const storedSessionDoc = backend.__test.getDoc('sessions', '0');
        expect(storedSessionDoc).toBeDefined();
        expect(storedSessionDoc.sessionId).toBe(response.body.sessionId);
    });
});
