import { scoreCandidate } from '../src/engine/detector';

describe('scoreCandidate', () => {
    it('accepts the observed bruxism candidate feature range', () => {
        expect(scoreCandidate({
            zcr: 0.099,
            spectralFlatness: 0.0046,
            burstCount: 3,
            durationMs: 1170,
        })).toBe(true);
    });
});