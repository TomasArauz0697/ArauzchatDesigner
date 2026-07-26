import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyATjLBF_zePUGT8HWkGEvNWJfYAz57eziU',
  authDomain: 'tachatonline.firebaseapp.com',
  projectId: 'tachatonline',
  storageBucket: 'tachatonline.firebasestorage.app',
  messagingSenderId: '335321885321',
  appId: '1:335321885321:web:69beeecedec87d3d667458',
  measurementId: 'G-NXK31PTKXJ',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
