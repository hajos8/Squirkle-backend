process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    type: 'service_account',
    project_id: 'test-project',
    private_key: 'test-private-key',
    client_email: 'test@example.com',
});
process.env.FIREBASE_DATABASE_URL = 'https://test.firebaseio.com';
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';

vi.mock('dotenv', () => ({
    config: vi.fn(),
}));

vi.mock('cloudinary', () => ({
    v2: {
        config: vi.fn(() => ({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME })),
        uploader: {
            upload_stream: vi.fn(),
            destroy: vi.fn(),
        },
    },
}));

vi.mock('firebase-admin', () => {
    const documents = new Map();
    const calls = {
        set: [],
        update: [],
        delete: [],
    };

    const toKey = (collectionName, docId) => `${collectionName}/${docId}`;

    const normalize = (value) => {
        if (value === undefined || value === null) {
            return value;
        }

        if (Array.isArray(value)) {
            return value.map((entry) => normalize(entry));
        }

        if (typeof value === 'object') {
            const normalizedObject = {};
            Object.keys(value).forEach((key) => {
                normalizedObject[key] = normalize(value[key]);
            });
            return normalizedObject;
        }

        return value;
    };

    const applyFieldValue = (baseValue, updateValue) => {
        if (!updateValue || typeof updateValue !== 'object' || !updateValue.__op) {
            return normalize(updateValue);
        }

        if (updateValue.__op === 'increment') {
            return Number(baseValue || 0) + updateValue.value;
        }

        if (updateValue.__op === 'arrayUnion') {
            const current = Array.isArray(baseValue) ? [...baseValue] : [];
            updateValue.values.forEach((entry) => {
                if (!current.some((existing) => existing === entry)) {
                    current.push(entry);
                }
            });
            return current;
        }

        if (updateValue.__op === 'arrayRemove') {
            const current = Array.isArray(baseValue) ? [...baseValue] : [];
            return current.filter((entry) => !updateValue.values.some((toRemove) => toRemove === entry));
        }

        return normalize(updateValue);
    };

    const makeDocSnapshot = (collectionName, docId) => {
        const key = toKey(collectionName, docId);
        const data = documents.get(key);

        return {
            id: docId,
            exists: data !== undefined,
            data: () => data,
            ref: makeDocRef(collectionName, docId),
        };
    };

    const queryDocs = (collectionName, filters) => {
        const prefix = `${collectionName}/`;
        const snapshots = [];

        documents.forEach((value, key) => {
            if (!key.startsWith(prefix)) {
                return;
            }

            const docId = key.slice(prefix.length);
            if (docId.includes('/')) {
                return;
            }

            const passes = filters.every((filter) => {
                const fieldValue = value ? value[filter.field] : undefined;
                if (filter.op === '==') {
                    return fieldValue === filter.value;
                }
                return false;
            });

            if (passes) {
                snapshots.push({
                    id: docId,
                    data: () => value,
                    ref: makeDocRef(collectionName, docId),
                });
            }
        });

        return snapshots;
    };

    const makeQueryRef = (collectionName, filters, limitValue) => ({
        where: (field, op, value) => makeQueryRef(collectionName, [...filters, { field, op, value }], limitValue),
        limit: (count) => makeQueryRef(collectionName, filters, count),
        get: async () => {
            const docs = queryDocs(collectionName, filters);
            const limitedDocs = typeof limitValue === 'number' ? docs.slice(0, limitValue) : docs;

            return {
                empty: limitedDocs.length === 0,
                size: limitedDocs.length,
                docs: limitedDocs,
                forEach: (callback) => {
                    limitedDocs.forEach(callback);
                },
            };
        },
    });

    function makeDocRef(collectionName, docId) {
        const key = toKey(collectionName, docId);

        return {
            id: docId,
            path: key,
            collection: (subCollectionName) => makeCollectionRef(`${collectionName}/${docId}/${subCollectionName}`),
            get: async () => makeDocSnapshot(collectionName, docId),
            set: async (data, options = {}) => {
                const normalizedData = normalize(data);
                const currentData = documents.get(key) || {};
                const nextData = options.merge ? { ...currentData, ...normalizedData } : normalizedData;

                documents.set(key, nextData);
                calls.set.push({ collectionName, docId, data: normalizedData, options });
            },
            update: async (updates) => {
                const currentData = documents.get(key) || {};
                const nextData = { ...currentData };

                Object.keys(updates).forEach((field) => {
                    nextData[field] = applyFieldValue(nextData[field], updates[field]);
                });

                documents.set(key, nextData);
                calls.update.push({ collectionName, docId, updates: normalize(updates) });
            },
            delete: async () => {
                documents.delete(key);
                calls.delete.push({ collectionName, docId });
            },
        };
    }

    function makeCollectionRef(collectionName) {
        return {
            doc: (docId) => makeDocRef(collectionName, String(docId)),
            where: (field, op, value) => makeQueryRef(collectionName, [{ field, op, value }]),
            get: async () => {
                const docs = queryDocs(collectionName, []);
                return {
                    empty: docs.length === 0,
                    size: docs.length,
                    docs,
                    forEach: (callback) => {
                        docs.forEach(callback);
                    },
                };
            },
            add: async (data) => {
                const newId = `doc_${documents.size + 1}`;
                const ref = makeDocRef(collectionName, newId);
                await ref.set(data);
                return ref;
            },
        };
    }

    const firestoreDb = {
        collection: (collectionName) => makeCollectionRef(collectionName),
        getAll: async (...docRefs) => Promise.all(docRefs.map((docRef) => docRef.get())),
        runTransaction: async (operation) => {
            const tx = {
                set: (docRef, data) => docRef.set(data),
                update: (docRef, data) => docRef.update(data),
                delete: (docRef) => docRef.delete(),
                get: (docRef) => docRef.get(),
            };

            return operation(tx);
        },
    };

    const firestore = vi.fn(() => firestoreDb);
    firestore.FieldValue = {
        increment: (value) => ({ __op: 'increment', value }),
        arrayUnion: (...values) => ({ __op: 'arrayUnion', values }),
        arrayRemove: (...values) => ({ __op: 'arrayRemove', values }),
    };

    const reset = () => {
        documents.clear();
        calls.set.length = 0;
        calls.update.length = 0;
        calls.delete.length = 0;
    };

    return {
        initializeApp: vi.fn(() => ({ name: 'mock-firebase-app' })),
        credential: {
            cert: vi.fn(() => ({ projectId: 'mock-project' })),
        },
        firestore,
        __mock: {
            reset,
            getDoc: (collectionName, docId) => documents.get(toKey(collectionName, String(docId))),
            setDoc: (collectionName, docId, value) => {
                documents.set(toKey(collectionName, String(docId)), normalize(value));
            },
            calls,
        },
    };
});

beforeEach(() => {
    const admin = require('firebase-admin');
    admin.__mock.reset();
    vi.clearAllMocks();
});
