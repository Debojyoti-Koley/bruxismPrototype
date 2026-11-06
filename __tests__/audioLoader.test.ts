import RNFS from 'react-native-fs';
import { loadAudioAsPCM } from '../src/services/audioLoader';

jest.mock('react-native-fs', () => ({
    readFile: jest.fn(),
}));

function createWav16Mono(samples: number[]): string {
    const sampleBytes = Buffer.alloc(samples.length * 2);

    for (let i = 0; i < samples.length; i += 1) {
        const value = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32768)));
        sampleBytes.writeInt16LE(value, i * 2);
    }

    const buffer = Buffer.alloc(44 + sampleBytes.length);
    buffer.write('RIFF', 0, 4, 'ascii');
    buffer.writeUInt32LE(36 + sampleBytes.length, 4);
    buffer.write('WAVE', 8, 4, 'ascii');
    buffer.write('fmt ', 12, 4, 'ascii');
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(8000, 24);
    buffer.writeUInt32LE(8000 * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36, 4, 'ascii');
    buffer.writeUInt32LE(sampleBytes.length, 40);
    sampleBytes.copy(buffer, 44);

    return buffer.toString('base64');
}

describe('loadAudioAsPCM', () => {
    it('reads a WAV file and emits PCM chunks', async () => {
        const samples = [0, 0.5, -0.5, 0.25];
        const readFileMock = RNFS.readFile as jest.Mock;

        readFileMock.mockResolvedValue(createWav16Mono(samples));

        const emitted: number[] = [];
        const info = await loadAudioAsPCM('/tmp/test.wav', (chunk) => {
            emitted.push(...Array.from(chunk.samples));
        }, 2);

        expect(info).toMatchObject({
            sampleRate: 8000,
            channels: 1,
            bitsPerSample: 16,
            totalFrames: 4,
        });

        expect(emitted).toEqual(samples);
    });
});
