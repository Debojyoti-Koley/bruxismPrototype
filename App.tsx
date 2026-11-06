import { StatusBar, StyleSheet, View } from 'react-native';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RecordingScreen from './src/screens/dummy';
// import { initializeDatabase } from './src/services/database';

function App() {
  // useEffect(() => {
  //   initializeDatabase().catch((error) => {
  //     console.error('Database initialization failed:', error);
  //   });
  // }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <RecordingScreen />

      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
});

export default App;
