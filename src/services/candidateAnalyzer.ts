import { extractFeatures, AudioFeatures, FeatureSegment } from '../engine/features';
import { scoreCandidate } from '../engine/detector';
import { readAudioSliceAsPCM } from './audioLoader';
import { loadAudioAsPCM } from './audioLoader';
import { StreamingVAD } from '../types/streamingVAD';

export type CandidateAnalysis = {
    startMs: number;
    endMs: number;
    features: AudioFeatures;
    passedHeuristic: boolean;
};

type VADCandidate = FeatureSegment;

export type AnalysisProgress = {
    phase: 'loading' | 'analyzing';
    progress: number;
};

/** Reads, extracts, and scores each VAD candidate without loading the full file. */
export async function analyzeCandidates(
    filePath: string,
    candidates: VADCandidate[],
    onProgress: (progress: number) => void = () => undefined,
): Promise<CandidateAnalysis[]> {
    const analyses: CandidateAnalysis[] = [];

    onProgress(candidates.length === 0 ? 1 : 0);

    for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const slice = await readAudioSliceAsPCM(filePath, candidate.startMs, candidate.endMs);
        const features = extractFeatures(
            slice.samples,
            slice.sampleRate,
            { startMs: 0, endMs: candidate.endMs - candidate.startMs },
        );

        analyses.push({
            startMs: candidate.startMs,
            endMs: candidate.endMs,
            features,
            passedHeuristic: scoreCandidate(features),
        });

        onProgress((index + 1) / candidates.length);
    }

    return analyses;
}

/** Streams a file through VAD, then extracts and scores every detected candidate. */
export async function analyzeAudioFile(
    filePath: string,
    onProgress: (progress: AnalysisProgress) => void = () => undefined,
): Promise<CandidateAnalysis[]> {
    let vad: StreamingVAD | null = null;
    const candidates: VADCandidate[] = [];

    await loadAudioAsPCM(
        filePath,
        (header) => {
            vad = new StreamingVAD(header.sampleRate);
            onProgress({ phase: 'loading', progress: 0 });
        },
        (chunk) => {
            if (!vad) {
                throw new Error('Audio header must be loaded before audio chunks are processed');
            }

            candidates.push(...vad.processChunk(chunk.samples));
        },
        8192,
        (progress) => onProgress({ phase: 'loading', progress }),
    );

    if (!vad) {
        throw new Error('Could not initialize VAD because the WAV header was not loaded');
    }

    const initializedVad = vad as StreamingVAD;
    candidates.push(...initializedVad.flush());
    candidates.sort((left, right) => left.startMs - right.startMs);

    onProgress({ phase: 'loading', progress: 1 });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    return analyzeCandidates(filePath, candidates, (progress) =>
        onProgress({ phase: 'analyzing', progress }),
    );
}