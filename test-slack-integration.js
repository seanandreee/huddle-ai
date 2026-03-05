const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable } = require('firebase/functions');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDO-powe_hcrHTSqM5pX-1_QP6JRmRgGrc",
  authDomain: "huddleai-a812c.firebaseapp.com",
  projectId: "huddleai-a812c",
  storageBucket: "huddleai-a812c.firebasestorage.app",
  messagingSenderId: "785097766884",
  appId: "1:785097766884:web:cd6a17305b95d536d1f9f1",
  measurementId: "G-2458RJVZ5W"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

async function testSlackIntegration() {
  try {
    console.log('Testing Slack integration...');
    
    const manageSlackIntegration = httpsCallable(functions, 'manageSlackIntegration');
    
    // Test the webhook with a test message
    const result = await manageSlackIntegration({
      action: 'test',
      teamId: 'test-team-id',
      userId: 'test-user-id'
    });
    
    console.log('Test result:', result.data);
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testSlackIntegration(); 