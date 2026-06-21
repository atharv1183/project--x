const admin = require('firebase-admin');
const config = require('../firebase-applet-config.json');

admin.initializeApp({
  projectId: config.projectId
});

const db = admin.firestore();

async function run() {
  try {
    const docRef = db.collection('users').doc('OHNenlf3RDfdJ4myjwpjsZDw8QJ3');
    const doc = await docRef.get();
    if (!doc.exists) {
      console.log('No such user!');
    } else {
      console.log('User data:', JSON.stringify(doc.data(), null, 2));
    }
  } catch (error) {
    console.error('Error fetching user:', error);
  }
}

run();
