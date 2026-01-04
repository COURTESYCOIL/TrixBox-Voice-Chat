# You have been compromised! You can't just put your gh pat token out in the internet! Add jarivivi on discord for help fixing.

# TrixBox Voice Chat - P2P Discord-like Voice Room

A modern, fully peer-to-peer voice chat application with a Discord-inspired UI. Perfect for embedding in websites, web apps, or running standalone.

## ✨ Features

- **Peer-to-Peer Architecture**: Direct WebRTC connections between users with Firestore signaling
- **Multi-User Support**: Multiple peers can connect to the same voice room simultaneously
- **Discord-like UI**: Modern, dark-themed interface inspired by Discord
- **Voice Activity Detection**: Real-time visual indicators showing who's speaking
- **Mute/Unmute Controls**: Toggle microphone and speaker independently
- **User Presence**: See all connected peers with status indicators
- **Embeddable**: Can be embedded as an iframe in any website
- **No Backend Required**: Uses Firebase for signaling only (peer connections are direct)
- **Responsive Design**: Works on desktop and mobile browsers

## 🚀 Quick Start

### Prerequisites

1. **Firebase Project**: Create a Firebase project at [firebase.google.com](https://firebase.google.com)
2. **Enable Services**:
   - Authentication (Anonymous)
   - Firestore Database
3. **Get Your Config**: Copy your Firebase config from Project Settings

### Setup

1. Clone or download this repository
2. Open `index.html` in a modern web browser
3. The app will prompt you to provide Firebase configuration

### Configuration

The app looks for Firebase config in three ways (in order):

1. **Global Variables** (for embedding):
   ```javascript
   window.__app_id = 'your-app-id';
   window.__firebase_config = JSON.stringify({
     apiKey: "YOUR_API_KEY",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "YOUR_SENDER_ID",
     appId: "YOUR_APP_ID"
   });
   ```

2. **Environment Variables**: Set before loading the page

3. **Default**: Uses a demo configuration (limited functionality)

## 📱 How to Use

1. **Join a Room**: Open the app - you'll automatically join the "General" voice channel
2. **Share Your ID**: Your unique ID appears in the right panel - share it with others
3. **Connect to Peers**: When others join with your ID, they'll automatically connect
4. **Control Audio**:
   - 🎙️ **Mic Button**: Toggle microphone on/off
   - 🔊 **Speaker Button**: Toggle speaker/mute
   - 📞 **Leave Button**: Disconnect from the room
5. **See Status**: User cards show:
   - 🟢 Green: Online/Idle
   - 🟡 Yellow: Speaking
   - 🔴 Red: Muted

## 🔧 Technical Architecture

### WebRTC Signaling Flow

```
User A                          Firestore                      User B
  |                                |                              |
  |------ Create Offer ----------->|                              |
  |                                |------- Send Offer -------->  |
  |                                |                              |
  |                                |<----- Create Answer ---------|
  |<------ Receive Answer ---------|                              |
  |                                |                              |
  |------ ICE Candidates --------->|------- ICE Candidates ----->|
  |                                |                              |
  |========== Direct P2P Connection (Audio Stream) =============>|
```

### File Structure

```
├── index.html          # Main HTML structure & styling
├── app.js             # Core application logic
└── README.md          # This file
```

### Key Technologies

- **WebRTC**: Peer-to-peer audio streaming
- **Firebase Firestore**: Signaling and peer discovery
- **Web Audio API**: Voice activity detection
- **Tailwind CSS**: Responsive styling

## 🎯 Embedding in Your Website

### As an iframe

```html
<iframe 
  src="https://your-domain.com/trixbox-voice-chat/"
  width="100%"
  height="600"
  frameborder="0"
  allow="microphone"
></iframe>
```

### As a Module

```html
<div id="voice-chat-container"></div>

<script>
  window.__app_id = 'your-app-id';
  window.__firebase_config = JSON.stringify({...});
</script>

<script type="module" src="app.js"></script>
```

## 🔐 Security & Privacy

- **No Server Storage**: Audio is never stored on servers
- **Direct P2P**: Audio streams go directly between peers
- **Anonymous Auth**: Uses Firebase anonymous authentication
- **Firestore Rules**: Implement proper Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{appId}/public/data/signals/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 🐛 Troubleshooting

### No Microphone Access
- Check browser permissions
- Ensure HTTPS is used (required for getUserMedia)
- Try a different browser

### Can't Connect to Peers
- Verify Firebase config is correct
- Check Firestore security rules
- Ensure both users are in the same room
- Check browser console for errors

### Audio Not Working
- Verify microphone is not muted at OS level
- Check speaker volume
- Try toggling speaker button
- Restart the app

### High Latency
- Check internet connection
- Try using a TURN server (add to STUN_SERVERS in app.js)
- Reduce number of simultaneous connections

## 🌐 Deployment

### Netlify / Vercel
1. Push to GitHub
2. Connect repository to Netlify/Vercel
3. Set environment variables if needed
4. Deploy

### Self-Hosted
1. Serve files over HTTPS
2. Configure CORS if needed
3. Update Firebase security rules

## 📊 Performance

- **Latency**: Typically 50-200ms (depends on network)
- **Bandwidth**: ~50-100 kbps per peer connection
- **Max Peers**: Tested with 10+ simultaneous peers
- **Browser Support**: Chrome, Firefox, Safari, Edge (latest versions)

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📄 License

MIT License - feel free to use in your projects

## 🙋 Support

For issues or questions:
1. Check the Troubleshooting section
2. Review browser console for errors
3. Verify Firebase configuration
4. Check Firestore rules and data

## 🎉 Features Coming Soon

- [ ] Screen sharing
- [ ] Text chat
- [ ] Recording
- [ ] Multiple channels
- [ ] User profiles
- [ ] Persistent user list
- [ ] Mobile app
- [ ] Video support

---

**Made with ❤️ by TriX Team**
