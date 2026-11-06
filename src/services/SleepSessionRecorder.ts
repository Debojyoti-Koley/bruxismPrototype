import RNFS from 'react-native-fs';
import { SleepSession } from '../types/session';
import Sound from 'react-native-nitro-sound';

export async function startSession(): Promise<SleepSession> {
    const timeStamp = Date.now();
    const id = `session-${timeStamp}`;
    const filePath = `${RNFS.DocumentDirectoryPath}/sleep_session_${timeStamp}.mp3`;
    const options = {
        // You can specify additional options here if needed
    };

    await Sound.startRecorder(filePath, options);

    const sleepSession: SleepSession = {
        id: id,
        startTime: timeStamp,
        endTime: null,
        sessionStatus: 'recording',
        filePath: filePath,
    };
    return sleepSession;
}

export async function stopSession(session: SleepSession): Promise<SleepSession> {
    try {
        const timeStamp = Date.now();
        await Sound.stopRecorder();
        session = {
            ...session,
            endTime: timeStamp,
            sessionStatus: 'completed',
        }
        return session;
    }
    catch (error) {
        console.error('Error stopping the recording:', error);
        session = {
            ...session,
            endTime: Date.now(),
            sessionStatus: 'failed',
        }
        return session;
    }
}