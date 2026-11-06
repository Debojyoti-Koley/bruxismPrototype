export type AudioChunk = {
    samples: Float32Array;
    startFrame: number;
};

export type AudioInfo = {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    totalFrames: number;
};

export type AudioChunkHandler = (
    chunk: AudioChunk,
) => void | Promise<void>;