import RNFS from 'react-native-fs';
const trendDataPath = `${RNFS.DocumentDirectoryPath}/data.json`;
async function loadTrendData() {
    if (await RNFS.exists(trendDataPath)) {
        try {
            return JSON.parse(await RNFS.readFile(trendDataPath, 'utf8'));
        }
        catch (error) {
            throw new Error(`Failed to load trend data from ${trendDataPath}: ${error}`);
        }
    }
    else {
        return [];
    }
}

async function saveTrendData(candidatePassed: number, sourceFile: string) {
    const trendData = await loadTrendData();
    const newEntry = {
        candidatePassed,
        sourceFile,
        analyzedAt: Date.now(),
    };
    trendData.push(newEntry);
    try {
        await RNFS.writeFile(trendDataPath,
            JSON.stringify(trendData), 'utf8'
        );
        console.log('Data saved')
    }
    catch (error) {
        throw new Error(`Failed to update data: ${error}`);
    }
}

export { loadTrendData, saveTrendData };