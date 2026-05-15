const admin = require('firebase-admin');

const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

if (firebaseConfig.projectId && firebaseConfig.privateKey && firebaseConfig.clientEmail) {
  admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig)
  });
  console.log('Firebase Admin initialized successfully using environment variables');
} else {
  console.warn('Firebase credentials not found in .env. Push notifications will be disabled.');
}


const sendPushNotification = async (deviceToken, title, body, imageUrl = null, data = {}) => {
  if (!admin.apps.length) {
    console.warn('Firebase Admin not initialized. Skipping push notification.');
    return;
  }

  if (!deviceToken) {
    return;
  }

  const message = {
    notification: {
      title: title,
      body: body
    },
    data: data,
    token: deviceToken
  };

  if (imageUrl) {
    message.notification.imageUrl = imageUrl;
    message.notification.image = imageUrl;
  }

  console.log('Sending push notification:', JSON.stringify(message, null, 2));

  try {
    const response = await admin.messaging().send(message);
    return response;
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
};

module.exports = {
  sendPushNotification
};
