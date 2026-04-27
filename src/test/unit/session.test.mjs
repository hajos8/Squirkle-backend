import backend from '../../index.cjs';

const { generateSessionId } = backend;

describe('generateSessionId', () => {
    it('returns a 64-character hex string', () => {
        const sessionId = generateSessionId('0');

        expect(sessionId).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns different session ids for consecutive calls', () => {
        const firstSessionId = generateSessionId('0');
        const secondSessionId = generateSessionId('0');

        expect(firstSessionId).not.toBe(secondSessionId);
    });
});
