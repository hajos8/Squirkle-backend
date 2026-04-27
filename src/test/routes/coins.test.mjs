import request from 'supertest';
import backend from '../../index.cjs';

const { app } = backend;

describe('Coins routes', () => {
    beforeEach(() => {
        backend.__test.reset();
    });

    it('POST /api/update-coins/:sessionId updates coins when session is valid', async () => {
        backend.__test.setDoc('sessions', '0', { sessionId: 'session-0' });
        backend.__test.setDoc('users', '0', { coins: 5 });

        const response = await request(app)
            .post('/api/update-coins/session-0')
            .send({ userId: '0', amount: 7 })
            .expect(200);

        expect(response.body).toEqual({ message: 'Coins updated successfully' });
        expect(backend.__test.getDoc('users', '0').coins).toBe(12);
    });

    it('POST /api/update-coins/:sessionId returns 403 when session is invalid', async () => {
        backend.__test.setDoc('sessions', '0', { sessionId: 'expected-session' });
        backend.__test.setDoc('users', '0', { coins: 5 });

        const response = await request(app)
            .post('/api/update-coins/wrong-session')
            .send({ userId: '0', amount: 7 })
            .expect(403);

        expect(response.body).toEqual({ error: 'Unauthorized or invalid session' });
        expect(backend.__test.getDoc('users', '0').coins).toBe(5);
    });
});
