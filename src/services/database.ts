ls// import SQLite, { SQLiteDatabase } from 'react-native-sqlite-storage';

// const DATABASE_NAME = 'broxismDect.db';

// let database: SQLiteDatabase | null = null;
// let initializationPromise: Promise<SQLiteDatabase> | null = null;

// function openDatabase(): Promise<SQLiteDatabase> {
//     if (database) {
//         return Promise.resolve(database);
//     }

//     return new Promise((resolve, reject) => {
//         SQLite.openDatabase(
//             { name: DATABASE_NAME, location: 'default' },
//             (openedDatabase) => {
//                 database = openedDatabase;
//                 resolve(openedDatabase);
//             },
//             reject,
//         );
//     });
// }

// export function initializeDatabase(): Promise<SQLiteDatabase> {
//     if (initializationPromise) {
//         return initializationPromise;
//     }

//     initializationPromise = openDatabase().then((openedDatabase) => new Promise((resolve, reject) => {
//         openedDatabase.transaction(
//             (transaction) => {
//                 transaction.executeSql(`
// 					CREATE TABLE IF NOT EXISTS sessions (
//                       id INTEGER PRIMARY KEY AUTOINCREMENT,
//                         sourceFile TEXT NOT NULL,
//                         analyzedAt INTEGER NOT NULL,
//                         totalCandidates INTEGER NOT NULL,
//                         passedHeuristic INTEGER NOT NULL,
//                         confirmedGrind INTEGER,
//                         avgIntensity REAL,
//                         peakIntensity REAL
// 					);
// 				`);
//                 transaction.executeSql(`
// 					CREATE TABLE IF NOT EXISTS candidates (
//                           id INTEGER PRIMARY KEY AUTOINCREMENT,
//                           sessionId INTEGER NOT NULL,
//                             startMs INTEGER NOT NULL,
//                             endMs INTEGER NOT NULL,
//                             durationMs INTEGER NOT NULL,
//                             zcr REAL NOT NULL,
//                             spectralFlatness REAL NOT NULL,
//                             burstCount INTEGER NOT NULL,
//                             passedHeuristic INTEGER NOT NULL,
//                             userLabel TEXT,
//                             clipPath TEXT NOT NULL,
//                             createdAt INTEGER NOT NULL
// 					);
// 				`);
//             },
//             reject,
//             () => resolve(openedDatabase),
//         );
//     }));

//     initializationPromise.catch(() => {
//         initializationPromise = null;
//         database = null;
//     });

//     return initializationPromise;
// }

// export function getDatabase(): SQLiteDatabase {
//     if (!database) {
//         throw new Error('Database has not been initialized');
//     }

//     return database;
// }