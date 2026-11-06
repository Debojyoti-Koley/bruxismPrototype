export type StreamingVADOptions = {
    frameMs?: number;
    baselineWindowMs?: number;
    marginFactor?: number;
    preRollMs?: number;
    hangoverMs?: number;
    minDurationMs?: number;
};

export type SegmentCandidate = {
    startMs: number;
    endMs: number;
    startFrame: number;
    endFrame: number;
};

export type EnergyStats = {
    min: number;
    max: number;
    mean: number;
    frameCount: number;
};

type ActiveSegment = {
    startFrame: number;
    lastActiveFrame: number;
    gapCount: number;
};

export function computeRMS(frame: Float32Array): number {
    if (frame.length === 0) {
        return 0;
    }

    let sumSq = 0;
    for (let i = 0; i < frame.length; i += 1) {
        sumSq += frame[i] * frame[i];
    }
    return Math.sqrt(sumSq / frame.length);
}

export class StreamingVAD {
    private readonly sampleRate: number;
    private readonly frameMs: number;
    private readonly baselineWindowMs: number;
    private readonly marginFactor: number;
    private readonly preRollMs: number;
    private readonly hangoverMs: number;
    private readonly minDurationMs: number;

    private readonly baselineWindow: number[] = [];
    private runningSum = 0;
    private leftoverSamples = new Float32Array(0);
    private activeSegment: ActiveSegment | null = null;
    private completedSegments: SegmentCandidate[] = [];
    private globalFrameIndex = 0;
    private minEnergy = Number.POSITIVE_INFINITY;
    private maxEnergy = Number.NEGATIVE_INFINITY;
    private totalEnergy = 0;
    private energyFrameCount = 0;

    constructor(sampleRate: number, options: StreamingVADOptions = {}) {
        this.sampleRate = sampleRate;
        this.frameMs = options.frameMs ?? 20;
        this.baselineWindowMs = options.baselineWindowMs ?? 45000;
        this.marginFactor = options.marginFactor ?? 1.5;
        this.preRollMs = options.preRollMs ?? 250;
        this.hangoverMs = options.hangoverMs ?? 800;
        this.minDurationMs = options.minDurationMs ?? 500;
        console.log('StreamingVAD hangoverMs =', this.hangoverMs);
    }

    private get frameSize(): number {
        return Math.max(1, Math.floor((this.frameMs / 1000) * this.sampleRate));
    }

    private get baselineFrames(): number {
        return Math.max(1, Math.floor(this.baselineWindowMs / this.frameMs));
    }

    private get preRollFrames(): number {
        return Math.max(0, Math.ceil(this.preRollMs / this.frameMs));
    }

    private get hangoverFrames(): number {
        return Math.max(0, Math.ceil(this.hangoverMs / this.frameMs));
    }

    getEnergyStats(): EnergyStats {
        if (this.energyFrameCount === 0) {
            return { min: 0, max: 0, mean: 0, frameCount: 0 };
        }

        return {
            min: this.minEnergy,
            max: this.maxEnergy,
            mean: this.totalEnergy / this.energyFrameCount,
            frameCount: this.energyFrameCount,
        };
    }

    private finalizeSegment(endFrame: number): void {
        if (!this.activeSegment) {
            return;
        }

        const startFrame = Math.max(0, this.activeSegment.startFrame - this.preRollFrames);
        const finalEndFrame = Math.min(endFrame, this.activeSegment.lastActiveFrame + this.hangoverFrames);
        const startMs = startFrame * this.frameMs;
        const endMs = (finalEndFrame + 1) * this.frameMs;

        if (endMs - startMs >= this.minDurationMs) {
            this.completedSegments.push({
                startMs,
                endMs,
                startFrame,
                endFrame: finalEndFrame,
            });
        }

        this.activeSegment = null;
    }

    processChunk(samples: Float32Array): SegmentCandidate[] {
        const merged = new Float32Array(this.leftoverSamples.length + samples.length);
        merged.set(this.leftoverSamples, 0);
        merged.set(samples, this.leftoverSamples.length);

        const frameSize = this.frameSize;
        const fullFrameCount = Math.floor(merged.length / frameSize);
        const usableLength = fullFrameCount * frameSize;

        for (let i = 0; i < fullFrameCount; i += 1) {
            const frameStart = i * frameSize;
            const frame = merged.subarray(frameStart, frameStart + frameSize);
            const energy = computeRMS(frame);

            this.minEnergy = Math.min(this.minEnergy, energy);
            this.maxEnergy = Math.max(this.maxEnergy, energy);
            this.totalEnergy += energy;
            this.energyFrameCount += 1;

            const baseline = this.baselineWindow.length > 0 ? this.runningSum / this.baselineWindow.length : energy;
            const isActive = energy > baseline * this.marginFactor + 1e-4;
            const currentFrame = this.globalFrameIndex;

            if (isActive) {
                if (!this.activeSegment) {
                    this.activeSegment = {
                        startFrame: currentFrame,
                        lastActiveFrame: currentFrame,
                        gapCount: 0,
                    };
                } else {
                    this.activeSegment.lastActiveFrame = currentFrame;
                    this.activeSegment.gapCount = 0;
                }
            } else if (this.activeSegment) {
                this.activeSegment.gapCount += 1;
                if (this.activeSegment.gapCount > this.hangoverFrames) {
                    this.finalizeSegment(currentFrame - 1);
                }
            }

            this.baselineWindow.push(energy);
            this.runningSum += energy;

            if (this.baselineWindow.length > this.baselineFrames) {
                const removed = this.baselineWindow.shift();
                if (removed !== undefined) {
                    this.runningSum -= removed;
                }
            }

            this.globalFrameIndex += 1;
        }

        const remainder = merged.length - usableLength;
        if (remainder > 0) {
            const tail = merged.subarray(usableLength, merged.length);
            this.leftoverSamples = new Float32Array(tail.length);
            this.leftoverSamples.set(tail, 0);
        } else {
            this.leftoverSamples = new Float32Array(0);
        }

        const result = this.completedSegments.slice();
        this.completedSegments = [];
        return result;
    }

    flush(): SegmentCandidate[] {
        if (this.activeSegment) {
            this.finalizeSegment(this.globalFrameIndex - 1);
        }

        const result = this.completedSegments.slice();
        this.completedSegments = [];
        return result;
    }
}