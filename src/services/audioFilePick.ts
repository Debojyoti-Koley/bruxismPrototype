import {
    errorCodes,
    isErrorWithCode,
    pick,
    types,
} from '@react-native-documents/picker';

export default async function audioFilePick() {
    try {
        const [pickedFile] = await pick({
            type: [types.audio],
            mode: 'import',
        });
        console.log('Picked file:', pickedFile);
        return pickedFile;
    }
    catch (err) {
        if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
            console.log('User cancelled the picker');
        } else {
            console.error('Error picking file:', err);
        }
    }
}