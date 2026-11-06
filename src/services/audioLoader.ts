import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';
import { AudioChunkHandler, AudioInfo } from '../types/audio';

const INITIAL_HEADER_SCAN_BYTES = 4096;
const MAX_HEADER_SCAN_BYTES = 1024 * 1024; // 1MB cap - covers any reasonable metadata size

// Converts one PCM sample from raw WAV bytes into a normalized float value in the range [-1, 1].
function readSampleValue(buffer: Buffer, offset: number, bitsPerSample: number, audioFormat: number): number {
    if (audioFormat === 1) {
        if (bitsPerSample === 8) {
            return buffer.readUInt8(offset) / 128 - 1;
        }
        if (bitsPerSample === 16) {
            return buffer.readInt16LE(offset) / 32768;
        }
        if (bitsPerSample === 24) {
            const raw =
                buffer.readUInt8(offset) |
                (buffer.readUInt8(offset + 1) << 8) |
                (buffer.readUInt8(offset + 2) << 16);
            const signed = (raw << 8) >> 8;
            return signed / 8388608;
        }
        if (bitsPerSample === 32) {
            return buffer.readInt32LE(offset) / 2147483648;
        }
    }
    if (audioFormat === 3 && bitsPerSample === 32) {
        return buffer.readFloatLE(offset);
    }
    throw new Error(
        `Unsupported WAV format: audioFormat=${audioFormat}, bitsPerSample=${bitsPerSample}`,
    );
}

type ParsedHeader = {
    audioFormat: number;
    numChannels: number;
    sampleRate: number;
    bitsPerSample: number;
    dataOffset: number; // absolute byte offset in the file
    dataSize: number;
};

export type AudioSlice = {
    samples: Float32Array;
    sampleRate: number;
};

/**
 * Scans the WAV header to find the fmt and data chunk metadata.
 * It identifies format, channels, sample rate, and where the PCM payload starts,
 * without loading the full audio file into memory.
 */
async function parseWavHeader(filePath: string): Promise<ParsedHeader> {
    let scanBytes = INITIAL_HEADER_SCAN_BYTES;

    while (scanBytes <= MAX_HEADER_SCAN_BYTES) {
        const base64 = await RNFS.read(filePath, scanBytes, 0, 'base64');
        const buffer = Buffer.from(base64, 'base64');

        if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
            throw new Error('Unsupported file: expected RIFF header');
        }
        if (buffer.toString('ascii', 8, 12) !== 'WAVE') {
            throw new Error('Unsupported file: expected WAVE header');
        }

        let audioFormat = 0;
        let numChannels = 0;
        let sampleRate = 0;
        let bitsPerSample = 0;

        let offset = 12;
        while (offset + 8 <= buffer.length) {
            const chunkId = buffer.toString('ascii', offset, offset + 4);
            const chunkSize = buffer.readUInt32LE(offset + 4);
            const chunkDataStart = offset + 8;

            if (chunkId === 'fmt ') {
                audioFormat = buffer.readUInt16LE(chunkDataStart);
                numChannels = buffer.readUInt16LE(chunkDataStart + 2);
                sampleRate = buffer.readUInt32LE(chunkDataStart + 4);
                bitsPerSample = buffer.readUInt16LE(chunkDataStart + 14);
            }

            if (chunkId === 'data') {
                // Found it within our scanned prefix - we have everything we need.
                if (audioFormat === 0 || numChannels === 0 || sampleRate === 0 || bitsPerSample === 0) {
                    throw new Error('Unsupported WAV file: data chunk found before fmt chunk');
                }
                return {
                    audioFormat,
                    numChannels,
                    sampleRate,
                    bitsPerSample,
                    dataOffset: chunkDataStart,
                    dataSize: chunkSize,
                };
            }

            offset = chunkDataStart + chunkSize + (chunkSize % 2);
        }

        // 'data' chunk not found within this prefix - the file has more
        // metadata than expected. Scan a larger prefix and try again.
        scanBytes *= 4;
    }

    throw new Error(
        `Unsupported WAV file: could not locate 'data' chunk within first ${MAX_HEADER_SCAN_BYTES} bytes`,
    );
}

/**
 * Loads a WAV file in manageable frame chunks and emits each chunk through the callback.
 * This keeps memory usage low and lets the app process audio progressively for VAD or analysis.
 */
export async function loadAudioAsPCM(
    filePath: string,
    onHeader: (info: AudioInfo) => void = () => undefined,
    onChunk: AudioChunkHandler = () => undefined,
    chunkFrames: number = 8192,
    onProgress: (progress: number) => void = () => undefined,
): Promise<AudioInfo> {
    console.log(`Loading audio file: ${filePath} in chunks of ${chunkFrames} frames`);

    if (!Number.isFinite(chunkFrames) || chunkFrames <= 0) {
        throw new Error('chunkFrames must be greater than 0');
    }

    const { audioFormat, numChannels, sampleRate, bitsPerSample, dataOffset, dataSize } =
        await parseWavHeader(filePath);

    const bytesPerSample = bitsPerSample / 8;
    const bytesPerFrame = numChannels * bytesPerSample;
    const totalFrames = Math.floor(dataSize / bytesPerFrame);

    const headerInfo: AudioInfo = {
        sampleRate,
        channels: numChannels,
        bitsPerSample,
        totalFrames,
    };

    // Fires before the loop below - caller can set up anything that needs
    // sampleRate now, before the first chunk arrives.
    onHeader(headerInfo);
    onProgress(0);

    let frameIndex = 0;

    while (frameIndex < totalFrames) {
        const remainingFrames = totalFrames - frameIndex;
        const currentChunkFrames = Math.min(chunkFrames, remainingFrames);
        const chunkByteLength = currentChunkFrames * bytesPerFrame;
        const chunkByteOffset = dataOffset + frameIndex * bytesPerFrame;

        // Read ONLY this chunk's bytes from disk - not the whole file.
        const base64 = await RNFS.read(filePath, chunkByteLength, chunkByteOffset, 'base64');
        const chunkBuffer = Buffer.from(base64, 'base64');

        const chunkSamples = new Float32Array(currentChunkFrames);

        for (let i = 0; i < currentChunkFrames; i += 1) {
            let monoSample = 0;

            for (let channel = 0; channel < numChannels; channel += 1) {
                // Offset is LOCAL to this small chunk buffer, not the whole file.
                const sampleOffset = (i * numChannels + channel) * bytesPerSample;
                monoSample += readSampleValue(chunkBuffer, sampleOffset, bitsPerSample, audioFormat);
            }

            chunkSamples[i] = numChannels > 1 ? monoSample / numChannels : monoSample;
        }

        await onChunk({
            samples: chunkSamples,
            startFrame: frameIndex,
        });

        frameIndex += currentChunkFrames;
        onProgress(frameIndex / totalFrames);
    }

    return headerInfo;
}

/** Re-reads one time-bounded WAV slice and decodes it to mono PCM samples. */
export async function readAudioSliceAsPCM(
    filePath: string,
    startMs: number,
    endMs: number,
): Promise<AudioSlice> {
    const header = await parseWavHeader(filePath);
    const bytesPerSample = header.bitsPerSample / 8;
    const bytesPerFrame = header.numChannels * bytesPerSample;
    const startFrame = Math.max(0, Math.floor((startMs / 1000) * header.sampleRate));
    const endFrame = Math.min(
        Math.floor(header.dataSize / bytesPerFrame),
        Math.ceil((endMs / 1000) * header.sampleRate),
    );
    const frameCount = Math.max(0, endFrame - startFrame);

    if (frameCount === 0) {
        return {
            samples: new Float32Array(0),
            sampleRate: header.sampleRate,
        };
    }

    const byteOffset = header.dataOffset + startFrame * bytesPerFrame;
    const byteLength = frameCount * bytesPerFrame;
    const base64 = await RNFS.read(filePath, byteLength, byteOffset, 'base64');
    const buffer = Buffer.from(base64, 'base64');
    const samples = new Float32Array(frameCount);

    for (let frame = 0; frame < frameCount; frame += 1) {
        let monoSample = 0;

        for (let channel = 0; channel < header.numChannels; channel += 1) {
            const sampleOffset = (frame * header.numChannels + channel) * bytesPerSample;
            monoSample += readSampleValue(buffer, sampleOffset, header.bitsPerSample, header.audioFormat);
        }

        samples[frame] = header.numChannels > 1
            ? monoSample / header.numChannels
            : monoSample;
    }

    return {
        samples,
        sampleRate: header.sampleRate,
    };
}