import { useState } from 'react';
import { Button, PermissionsAndroid, Platform, StyleSheet, Text, View } from 'react-native';
import RNFS from 'react-native-fs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { startSession, stopSession } from '../services/SleepSessionRecorder';
import audioFilePick from '../services/audioFilePick';
import { SleepSession } from '../types/session';
import { AnalysisProgress, analyzeAudioFile } from '../services/candidateAnalyzer';
import { convertToWav } from 'react-native-audio-converter';
import { Buffer } from 'buffer';
import { Alert } from 'react-native';
import { saveTrendData } from '../services/trendStore';
import TrendChart, { TrendPoint } from '../components/TrendChart';
import { loadTrendData } from '../services/trendStore';

type PickedAudioFile = {
    name?: string | null;
    uri: string;
};

function formatTimestamp(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const millis = milliseconds % 1000;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

export default function RecordingScreen() {
    const [currentSession, setCurrentSession] = useState<SleepSession | null>(null);
    const [selectedFile, setSelectedFile] = useState<PickedAudioFile | null>(null);
    const [recordingStatus, setRecordingStatus] = useState('not recording');
    const [audioFileUploaded, setAudioFileUploaded] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
    const [trend, setTrend] = useState<TrendPoint[]>([]);

    const isProcessing = analysisProgress !== null;

    async function analyzeAndLogAudio(audioFilePath: string) {
        setAnalysisProgress({ phase: 'loading', progress: 0 });
        console.log('Analysis started:', audioFilePath);

        try {
            const analyses = await analyzeAudioFile(audioFilePath, setAnalysisProgress);
            const candidatesFound = analyses.length;
            const candidatesPassed = analyses.filter((analysis) => analysis.passedHeuristic).length;
            const candidatesRejected = candidatesFound - candidatesPassed;

            console.log(`Analysis completed.
                 Final candidate count: ${candidatesFound},
                 Passed candidates: ${candidatesPassed}`);
            // analyses.forEach((analysis, index) => {
            //     console.log(`Candidate ${ index + 1} scored result: `, {
            //         startMs: analysis.startMs,
            //         endMs: analysis.endMs,
            //         startTimestamp: formatTimestamp(analysis.startMs),
            //         endTimestamp: formatTimestamp(analysis.endMs),
            //         features: analysis.features,
            //         passedHeuristic: analysis.passedHeuristic,
            //     });
            // });

            // console.log('Analysis summary:', {
            //     candidatesFound,
            //     candidatesPassed,
            //     candidatesRejected,
            // });
            // console.log(
            //     'Passed candidates:',
            //     passedCandidates.map(({ analysis, index }) => ({
            //         candidate: index + 1,
            //         // startTimestamp: formatTimestamp(analysis.startMs),
            //         // endTimestamp: formatTimestamp(analysis.endMs),
            //         startMs: analysis.startMs,
            //         endMs: analysis.endMs,
            //         durationMs: analysis.features.durationMs,
            //     })),
            // );

            setAudioFileUploaded(true);
            return { candidatesFound, candidatesPassed };
        } finally {
            setAnalysisProgress(null);
        }
    }

    async function handlePermission() {
        if (Platform.OS === 'android') {
            const permission = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                {
                    title: 'Audio recording permission',
                    message: 'This app needs access to your microphone to record audio.',
                    buttonPositive: 'Allow',
                    buttonNegative: 'Deny',
                },
            );

            if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
                setRecordingStatus('microphone permission denied');
                return false;
            }
        }
        return true;
    }

    async function handleStartSession() {
        const hasPermission = await handlePermission();
        if (!hasPermission) {
            console.log('Microphone permission denied');
            return;
        }
        console.log('Starting recording...');
        const session = await startSession();
        setCurrentSession(session);
        setRecordingStatus(session.sessionStatus);
    }

    async function handleStopSession() {
        console.log('Stopping recording...');
        if (!currentSession) return;

        const stoppedSession = await stopSession(currentSession);
        await analyzeAndLogAudio(stoppedSession.filePath);
        setCurrentSession(stoppedSession);
        setRecordingStatus(stoppedSession.sessionStatus);
    }

    // async function handlePickAudioFile() {
    //     const pickedFile = await audioFilePick();

    //     if (!pickedFile) {
    //         return;
    //     }

    //     setSelectedFile(pickedFile);
    //     setRecordingStatus('audio file selected');

    //     const localPath = `${ RNFS.DocumentDirectoryPath }/picked_${Date.now()}.wav`;

    //     try {
    //         await RNFS.copyFile(pickedFile.uri, localPath);
    //         await analyzeAndLogAudio(localPath);
    //     } finally {
    //         try {
    //             await RNFS.unlink(localPath);
    //         } catch (error) {
    //             console.warn('Could not remove temporary audio copy:', error);
    //         }
    //     }
    // }

    function showAlertAndSave(candidatesFound: number, candidatesPassed: number): Promise<boolean> {
        return new Promise((resolve) => {
            Alert.alert('Analysis completed', `Candidates found: ${candidatesFound}\nCandidates passed: ${candidatesPassed}`,
                [
                    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                    { text: 'Save', onPress: () => resolve(true) },
                ],
                { cancelable: false }
            )
        }
        )
    }

    async function handlePickAudioFile() {
        const pickedFile = await audioFilePick();
        if (!pickedFile) return;

        setSelectedFile(pickedFile);
        setRecordingStatus('audio file selected');

        const ext = pickedFile.name?.split('.').pop()?.toLowerCase() ?? 'mp3';
        const localPath = `${RNFS.DocumentDirectoryPath}/picked_${Date.now()}.${ext}`;
        let wavPath: string | null = null;

        try {
            console.log('Upload started:', pickedFile.name ?? pickedFile.uri);
            await RNFS.copyFile(pickedFile.uri, localPath);            // 1. copy original
            wavPath = await convertToWav(localPath, { channels: 1 });  // 2. convert (no sampleRate)

            // temporary verification: header check
            const head = Buffer.from(await RNFS.read(wavPath, 44, 0, 'base64'), 'base64');
            console.log('WAV header:', head.toString('ascii', 0, 4), head.toString('ascii', 8, 12),
                'sampleRate:', head.readUInt32LE(24), 'size:', (await RNFS.stat(wavPath)).size);

            const { candidatesFound, candidatesPassed } =
                await analyzeAndLogAudio(wavPath);
            // 3. analyze converted file
            if (await showAlertAndSave(candidatesFound, candidatesPassed)) {
                await saveTrendData(candidatesPassed, pickedFile?.name ?? `Unknown-${Date.now()}`);
                setTrend(await loadTrendData());
                Alert.alert('Data saved');
            }
        } finally {
            for (const p of [localPath, wavPath]) {                    // 4. delete both temp files
                if (!p) continue;
                try { await RNFS.unlink(p); } catch (e) { console.warn('cleanup failed:', p, e); }
            }
        }
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <Text style={styles.title}>Sleep session</Text>
                <Text style={styles.label}>Status</Text>
                <Text style={styles.status}>{recordingStatus}</Text>
                {analysisProgress && (
                    <View style={styles.progressSection}>
                        <Text style={styles.progressLabel}>
                            {analysisProgress.phase === 'loading' ? 'Loading audio' : 'Analyzing audio'}
                        </Text>
                        <View style={styles.progressTrack}>
                            <View
                                style={[
                                    styles.progressFill,
                                    {
                                        width: `${Math.round(analysisProgress.progress * 100)}%`,
                                    },
                                ]}
                            />
                        </View>
                        <Text style={styles.progressValue}>
                            {Math.round(analysisProgress.progress * 100)}%
                        </Text>
                    </View>
                )}
                <Text style={styles.fileName} numberOfLines={1}>
                    {selectedFile?.name ?? 'No audio file selected'}
                    {audioFileUploaded && <Text> (Audio file uploaded)</Text>}
                </Text>
                <View style={styles.buttonGroup}>
                    <Button title="Choose audio file" onPress={handlePickAudioFile} disabled={isProcessing} />
                    <Button title="Start recording" onPress={handleStartSession} disabled={isProcessing} />
                    <Button title="Stop recording" onPress={handleStopSession} disabled={!currentSession || isProcessing} />
                </View>
                <TrendChart data={trend} />
            </View>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: 24,
    },
    title: {
        color: '#172033',
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 32,
        textAlign: 'center',
    },
    label: {
        color: '#667085',
        fontSize: 14,
        marginBottom: 8,
        textAlign: 'center',
    },
    status: {
        color: '#172033',
        fontSize: 22,
        fontWeight: '600',
        marginBottom: 32,
        textAlign: 'center',
    },
    progressSection: {
        marginBottom: 24,
    },
    progressLabel: {
        color: '#475467',
        fontSize: 14,
        marginBottom: 8,
        textAlign: 'center',
    },
    progressTrack: {
        backgroundColor: '#e4e7ec',
        borderRadius: 4,
        height: 10,
        overflow: 'hidden',
    },
    progressFill: {
        backgroundColor: '#2e90fa',
        height: '100%',
    },
    progressValue: {
        color: '#172033',
        fontSize: 14,
        fontWeight: '600',
        marginTop: 6,
        textAlign: 'center',
    },
    fileName: {
        color: '#475467',
        fontSize: 16,
        marginBottom: 24,
        textAlign: 'center',
    },
    buttonGroup: {
        gap: 12,
    },
});