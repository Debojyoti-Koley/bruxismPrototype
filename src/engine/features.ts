const FFT = require('fft-js').fft;
const fftUtil = require('fft-js').util;

export type FeatureSegment = {
    startMs: number;
    endMs: number;
};

export type AudioFeatures = {
    zcr: number;
    spectralFlatness: number;
    burstCount: number;
    durationMs: number;
};

function nextPowerOfTwo(value: number): number {
    if (value <= 1) {
        return 1;
    }

    return 2 ** Math.ceil(Math.log2(value));
}

/** Measures waveform roughness by counting sign changes per sample. */
function zeroCrossingRate(frame: Float32Array): number {
    if (frame.length < 2) {
        return 0;
    }

    let crossings = 0;
    for (let i = 1; i < frame.length; i += 1) {
        if ((frame[i] >= 0) !== (frame[i - 1] >= 0)) {
            crossings += 1;
        }
    }

    return crossings / (frame.length - 1);
}

/** Measures whether a frame is noise-like or dominated by tonal frequencies. */
function spectralFlatness(frame: Float32Array): number {
    if (frame.length === 0) {
        return 0;
    }

    const fftSize = nextPowerOfTwo(frame.length);
    const padded = new Array<number>(fftSize).fill(0);
    for (let i = 0; i < frame.length; i += 1) {
        padded[i] = frame[i];
    }

    const phasors = FFT(padded);
    const magnitudes: number[] = fftUtil.fftMag(phasors).slice(0, fftSize / 2);
    const power = magnitudes.map((magnitude) => magnitude * magnitude + 1e-12);
    const logSum = power.reduce((sum, value) => sum + Math.log(value), 0);
    const geometricMean = Math.exp(logSum / power.length);
    const arithmeticMean = power.reduce((sum, value) => sum + value, 0) / power.length;

    return arithmeticMean === 0 ? 0 : geometricMean / arithmeticMean;
}

/** Counts separate short energy bursts inside a candidate audio window. */
function countBursts(
    samples: Float32Array,
    sampleRate: number,
    subFrameMs: number = 20,
    marginFactor: number = 1.4,
): number {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0 || subFrameMs <= 0) {
        return 0;
    }

    const subFrameSize = Math.max(1, Math.floor((subFrameMs / 1000) * sampleRate));
    const numSubFrames = Math.floor(samples.length / subFrameSize);
    if (numSubFrames < 2) {
        return 0;
    }

    const energies: number[] = [];
    for (let i = 0; i < numSubFrames; i += 1) {
        const frame = samples.subarray(i * subFrameSize, (i + 1) * subFrameSize);
        let sumSq = 0;
        for (let j = 0; j < frame.length; j += 1) {
            sumSq += frame[j] * frame[j];
        }
        energies.push(Math.sqrt(sumSq / frame.length));
    }

    const meanEnergy = energies.reduce((sum, energy) => sum + energy, 0) / energies.length;
    const threshold = meanEnergy * marginFactor;
    let bursts = 0;
    let aboveThreshold = false;

    for (const energy of energies) {
        if (energy > threshold && !aboveThreshold) {
            bursts += 1;
            aboveThreshold = true;
        } else if (energy <= threshold) {
            aboveThreshold = false;
        }
    }

    return bursts;
}

/** Extracts all detector features from the samples covered by one VAD segment. */
function extractFeatures(
    samples: Float32Array,
    sampleRate: number,
    segment: FeatureSegment,
): AudioFeatures {
    const startSample = Math.max(0, Math.floor((segment.startMs / 1000) * sampleRate));
    const endSample = Math.min(samples.length, Math.floor((segment.endMs / 1000) * sampleRate));
    const clip = startSample < endSample ? samples.subarray(startSample, endSample) : new Float32Array(0);

    return {
        zcr: zeroCrossingRate(clip),
        spectralFlatness: spectralFlatness(clip),
        burstCount: countBursts(clip, sampleRate),
        durationMs: Math.max(0, segment.endMs - segment.startMs),
    };
}

export { extractFeatures, zeroCrossingRate, spectralFlatness, countBursts };