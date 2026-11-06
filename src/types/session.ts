export type SessionStatus = 'completed' | 'recording' | 'incomplete' | 'failed';

export interface SleepSession {
    id: string;
    startTime: number;
    endTime: number | null;
    sessionStatus: SessionStatus;
    filePath: string;
}