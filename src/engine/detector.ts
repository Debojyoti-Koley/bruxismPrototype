import { AudioFeatures } from './features';

export type DetectorThresholds = {
    zcrThreshold: number;
    flatnessThreshold: number;
    minBursts: number;
    minDurationMs: number;
    maxDurationMs: number;
};

// Temporary calibration values for the current recording. The logged
// candidates have lower ZCR and spectral-flatness values than the original
// generic defaults, so those defaults rejected every VAD candidate.
const DEFAULT_THRESHOLDS: DetectorThresholds = {
    zcrThreshold: 0.05,
    flatnessThreshold: 0.0005,
    minBursts: 1,
    minDurationMs: 500,
    maxDurationMs: 5000,
};

function scoreCandidate(
    features: AudioFeatures,
    thresholds: DetectorThresholds = DEFAULT_THRESHOLDS,
): boolean {
    return (
        features.zcr > thresholds.zcrThreshold &&
        features.spectralFlatness > thresholds.flatnessThreshold &&
        features.burstCount >= thresholds.minBursts &&
        features.durationMs >= thresholds.minDurationMs &&
        features.durationMs <= thresholds.maxDurationMs
    );
}

export { scoreCandidate, DEFAULT_THRESHOLDS };