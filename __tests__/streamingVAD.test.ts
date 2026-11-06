import { StreamingVAD } from '../src/types/streamingVAD';

describe('StreamingVAD', () => {
    it('tracks segments across chunk boundaries', () => {
        const vad = new StreamingVAD(8000, {
            frameMs: 30,
            baselineWindowMs: 90000,
            marginFactor: 2.5,
            preRollMs: 0,
            hangoverMs: 0,
            minDurationMs: 0,
        });

        const silentChunk = new Float32Array(240).map(() => 0.01);
        const activeChunk = new Float32Array(240).map((_, idx) => (idx < 120 ? 0.9 : 0.05));

        vad.processChunk(silentChunk);
        vad.processChunk(activeChunk);

        const segments = vad.flush();
        expect(segments.length).toBeGreaterThan(0);
        expect(segments[0].startMs).toBeGreaterThanOrEqual(0);
    });
});
