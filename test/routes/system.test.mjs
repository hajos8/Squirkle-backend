import request from 'supertest';
import backend from '../../index.cjs';

const { app } = backend;

describe('System routes', () => {
    beforeEach(() => {
        backend.__test.reset();
    });

    it('GET /api/hello returns hello world', async () => {
        const response = await request(app)
            .get('/api/hello')
            .expect(200);

        expect(response.body).toEqual({ message: 'Hello world!' });
    });

    it('GET /api/server-time returns seconds offset from baseline', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:10Z'));

        const response = await request(app)
            .get('/api/server-time')
            .expect(200);

        expect(response.body).toEqual({ serverTime: 10 });

        vi.useRealTimers();
    });
});
