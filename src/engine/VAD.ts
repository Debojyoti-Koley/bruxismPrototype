type VADOptions = {
    frameMs?: number;
    baselineWindowMs?: number;
    marginFactor?: number;
    preRollMs?: number;
    hangoverMs?: number;
    minDurationMs?: number;
};

type SegmentCandidate = {
    startMs: number;
    endMs: number;
};

function computeRMS(frame: Float32Array): number {
    if (frame.length === 0) {
        return 0;
    }

    let sumSq = 0;
    for (let i = 0; i < frame.length; i += 1) {
        sumSq += frame[i] * frame[i];
    }

    return Math.sqrt(sumSq / frame.length);
}

/**
 * Batch VAD gate, per the spec's Section 4.
 *
 * 1. Frame the audio into small fixed windows.
 * 2. Measure loudness (RMS) per frame.
 * 3. Maintain a rolling baseline energy (adaptive noise floor) instead of
 *    a fixed threshold, so a constant fan/AC hum gets absorbed into "quiet"
 *    rather than being read as an event.
 * 4. Mark a frame "active" only if it's meaningfully above the *current*
 *    baseline, not above absolute silence.
 * 5. Group consecutive active frames into segments.
 * 6. Pad each segment with pre-roll/hangover so onsets/tails aren't clipped.
 */
function segmentCandidates(
    samples: Float32Array,
    sampleRate: number,
    opts: VADOptions = {},
): SegmentCandidate[] {
    const frameMs = opts.frameMs ?? 30;
    const baselineWindowMs = opts.baselineWindowMs ?? 45000;
    const baselineFrames = Math.max(1, Math.floor(baselineWindowMs / frameMs));
    const marginFactor = opts.marginFactor ?? 1.5;
    const preRollMs = opts.preRollMs ?? 250;
    const hangoverMs = opts.hangoverMs ?? 800;
    const minDurationMs = opts.minDurationMs ?? 200;

    if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isFinite(frameMs) || frameMs <= 0) {
        throw new Error('sampleRate and frameMs must be greater than 0');
    }

    const frameSize = Math.max(1, Math.floor((frameMs / 1000) * sampleRate));

    const numFrames = Math.floor(samples.length / frameSize);
    const energies: number[] = new Array(numFrames);
    for (let i = 0; i < numFrames; i += 1) {
        const frame = samples.subarray(i * frameSize, (i + 1) * frameSize);
        energies[i] = computeRMS(frame);
    }

    // Rolling baseline: a simple causal moving average over the trailing
    // window. (A true rolling median would be more robust to short loud
    // bursts skewing the baseline, but a moving average is far cheaper to
    // compute and is a reasonable starting point to tune against.)
    let sum = 0;
    const window: number[] = [];
    const activeFrames: boolean[] = new Array(numFrames).fill(false);

    for (let i = 0; i < numFrames; i += 1) {
        if (window.length === 0) {
            // The first frame has no history, so it establishes the initial noise floor.
            window.push(energies[i]);
            sum += energies[i];
            continue;
        }

        const baseline = sum / window.length;
        activeFrames[i] = energies[i] > baseline * marginFactor + 1e-4;

        window.push(energies[i]);
        sum += energies[i];
        if (window.length > baselineFrames) {
            const removedEnergy = window.shift();
            if (removedEnergy !== undefined) {
                sum -= removedEnergy;
            }
        }
    }

    // Group active frames into segments, allowing a short hangover gap
    // before closing a segment out.
    const preRollFrames = Math.ceil(preRollMs / frameMs);
    const hangoverFrames = Math.ceil(hangoverMs / frameMs);
    const segments: SegmentCandidate[] = [];
    let i = 0;
    while (i < numFrames) {
        if (activeFrames[i]) {
            let end = i;
            let gap = 0;
            let j = i + 1;
            while (j < numFrames) {
                if (activeFrames[j]) {
                    end = j;
                    gap = 0;
                } else {
                    gap++;
                    if (gap > hangoverFrames) break;
                }
                j++;
            }
            const startFrame = Math.max(0, i - preRollFrames);
            const endFrame = Math.min(numFrames - 1, end + hangoverFrames);
            const startMs = startFrame * frameMs;
            const endMs = (endFrame + 1) * frameMs;
            if (endMs - startMs >= minDurationMs) {
                segments.push({ startMs, endMs });
            }
            i = j;
        } else {
            i++;
        }
    }

    return segments;
}

export { segmentCandidates, computeRMS };