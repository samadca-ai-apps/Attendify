import express from 'express';
import { createServer as createViteServer } from 'vite';
import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf-8'));

// Initialize Firebase Admin
let adminApp: admin.app.App;
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT;

try {
  // Check if there are already initialized apps
  if (admin.apps.length > 0) {
    adminApp = admin.app();
  } else {
    if (serviceAccountKey && serviceAccountKey.trim().startsWith('{')) {
      console.log('Initializing Firebase Admin with service account key...');
      try {
        adminApp = admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(serviceAccountKey)),
          projectId: firebaseConfig.projectId,
        });
      } catch (jsonError: any) {
        console.error('Invalid JSON in FIREBASE_SERVICE_ACCOUNT environment variable:', jsonError.message);
        console.log('Falling back to default credentials...');
        adminApp = admin.initializeApp({
          projectId: firebaseConfig.projectId,
        });
      }
    } else {
      if (serviceAccountKey) {
        console.warn('FIREBASE_SERVICE_ACCOUNT is set but does not appear to be a valid JSON object (it should start with "{").');
      }
      console.log('Initializing Firebase Admin with default credentials...');
      adminApp = admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
    }
  }
} catch (error: any) {
  console.error('Firebase Admin initialization error:', error);
  // Final fallback attempt: try to get the default app or initialize it with just the project ID
  try {
    adminApp = admin.apps.length > 0 ? admin.app() : admin.initializeApp({ projectId: firebaseConfig.projectId });
  } catch (e) {
    console.error('Critical: Could not initialize Firebase Admin app:', e);
    process.exit(1);
  }
}

// Use a getter for auth and db to ensure they are accessed only after initialization
const getAuthService = () => getAuth(adminApp);
const getDbService = () => getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post('/api/reset-password', async (req, res) => {
    const { uid, newPassword } = req.body;

    if (!uid || !newPassword) {
      return res.status(400).json({ error: 'Missing uid or newPassword' });
    }

    try {
      console.log(`Resetting password for user: ${uid}`);
      // 1. Update Auth Password
      try {
        await getAuthService().updateUser(uid, {
          password: newPassword,
        });
      } catch (authError: any) {
        if (authError.code === 'auth/user-not-found') {
          console.warn(`User ${uid} not found in Firebase Auth. Skipping password update.`);
        } else {
          throw authError;
        }
      }

      // 2. Set firstLogin flag in Firestore
      await getDbService().collection('users').doc(uid).set({
        firstLogin: true,
      }, { merge: true });

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error resetting password:', error);
      let errorMessage = error.message;
      
      if (error.code === 'auth/internal-error' || error.code === 'auth/network-error') {
        if (errorMessage.includes('identitytoolkit.googleapis.com')) {
          errorMessage = `
            The "Identity Toolkit API" is disabled or inaccessible. 
            
            To fix this:
            1. Go to Firebase Console > Project Settings > Service Accounts.
            2. Click "Generate new private key" and download the JSON file.
            3. In AI Studio, go to Settings > Environment Variables.
            4. Add a new variable named "FIREBASE_SERVICE_ACCOUNT".
            5. Paste the entire content of the JSON file as the value.
            6. Restart the server.
            
            Alternatively, try enabling the API here: https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview?project=${firebaseConfig.projectId}
          `.trim();
        }
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  app.post('/api/delete-user', async (req, res) => {
    const { uid } = req.body;

    if (!uid) {
      return res.status(400).json({ error: 'Missing uid' });
    }

    try {
      console.log(`Deleting user: ${uid}`);
      // 1. Delete Auth User
      try {
        await getAuthService().deleteUser(uid);
      } catch (authError: any) {
        if (authError.code === 'auth/user-not-found') {
          console.warn(`User ${uid} not found in Firebase Auth. Skipping auth deletion.`);
        } else {
          throw authError;
        }
      }

      // 2. Delete Firestore User Document
      await getDbService().collection('users').doc(uid).delete();

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      let errorMessage = error.message;
      
      if (error.code === 'auth/internal-error' || error.code === 'auth/network-error') {
        if (errorMessage.includes('identitytoolkit.googleapis.com')) {
          errorMessage = 'Identity Toolkit API error. Please ensure a Service Account Key is configured in the environment variables (FIREBASE_SERVICE_ACCOUNT).';
        }
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
