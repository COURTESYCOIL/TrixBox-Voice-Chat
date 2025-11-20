import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// ============ GLOBAL STATE ============
window.db = null;
window.auth = null;
window.userId = null;
window.appId = null;
window.localStream = null;
window.peerConnections = new Map();
window.micEnabled = true;
window.speakerEnabled = true;
window.connectedPeers = new Set();
window.audioAnalyzer = null;
window.isSpeaking = false;
window.unsubscribers = [];

const STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

const ROOM_ID = 'general';

// ============ UI ELEMENTS ============
const UI = {
    userIdDisplay: document.getElementById('user-id-display'),
    globalStatus: document.getElementById('global-status'),
    globalStatusText: document.getElementById('global-status-text'),
    usersGrid: document.getElementById('users-grid'),
    micBtn: document.getElementById('mic-btn'),
    speakerBtn: document.getElementById('speaker-btn'),
    leaveBtn: document.getElementById('leave-btn'),
    roomStatus: document.getElementById('room-status'),
    peersCount: document.getElementById('peers-count'),
    connectionInfo: document.getElementById('connection-info'),
};

// ============ UTILITY FUNCTIONS ============
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `message-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function updateGlobalStatus(state, message) {
    UI.globalStatus.className = `status-indicator ${state}`;
    UI.globalStatusText.textContent = message;
}

window.copyToClipboard = function(element) {
    const text = element.textContent;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
};

// ============ AUDIO ANALYSIS ============
function setupAudioAnalyzer() {
    if (!window.localStream) return;
    
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(window.localStream);
        source.connect(analyser);
        
        window.audioAnalyzer = analyser;
        monitorAudioLevel();
    } catch (e) {
        console.error("Audio analyzer setup error:", e);
    }
}

function monitorAudioLevel() {
    if (!window.audioAnalyzer) return;
    
    const dataArray = new Uint8Array(window.audioAnalyzer.frequencyBinCount);
    window.audioAnalyzer.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const isSpeaking = average > 30 && window.micEnabled;
    
    if (isSpeaking !== window.isSpeaking) {
        window.isSpeaking = isSpeaking;
        updateUserCardStatus(window.userId, isSpeaking ? 'speaking' : (window.micEnabled ? 'idle' : 'muted'));
    }
    
    requestAnimationFrame(monitorAudioLevel);
}

// ============ USER INTERFACE ============
function updateUserCardStatus(peerId, status) {
    const card = document.querySelector(`[data-peer-id="${peerId}"]`);
    if (!card) return;
    
    const statusEl = card.querySelector('.user-status');
    if (!statusEl) return;
    
    statusEl.className = 'user-status';
    if (status === 'speaking') {
        statusEl.classList.add('speaking');
    } else if (status === 'muted') {
        statusEl.classList.add('muted');
    } else {
        statusEl.classList.add('idle');
    }
}

function renderUserCard(peerId, isLocal = false) {
    const card = document.createElement('div');
    card.className = 'user-card';
    card.setAttribute('data-peer-id', peerId);
    
    const shortId = peerId.substring(0, 6).toUpperCase();
    const initials = shortId.substring(0, 2);
    
    card.innerHTML = `
        <div class="user-avatar">
            ${initials}
            <div class="user-status ${isLocal && !window.micEnabled ? 'muted' : 'idle'}"></div>
        </div>
        <div class="user-name">${isLocal ? 'You' : shortId}</div>
        <div class="user-info">${isLocal ? 'Local' : 'Connected'}</div>
    `;
    
    return card;
}

function updateUsersGrid() {
    const grid = UI.usersGrid;
    const existingCards = new Set(Array.from(grid.querySelectorAll('[data-peer-id]')).map(el => el.getAttribute('data-peer-id')));
    
    if (!existingCards.has(window.userId)) {
        grid.innerHTML = '';
        grid.appendChild(renderUserCard(window.userId, true));
        existingCards.add(window.userId);
    }
    
    for (const peerId of window.connectedPeers) {
        if (!existingCards.has(peerId)) {
            grid.appendChild(renderUserCard(peerId, false));
            existingCards.add(peerId);
        }
    }
    
    for (const peerId of existingCards) {
        if (peerId !== window.userId && !window.connectedPeers.has(peerId)) {
            const card = grid.querySelector(`[data-peer-id="${peerId}"]`);
            if (card) card.remove();
        }
    }
    
    UI.peersCount.textContent = window.connectedPeers.size;
    UI.roomStatus.textContent = window.connectedPeers.size === 0 
        ? 'Waiting for peers...' 
        : `${window.connectedPeers.size} peer${window.connectedPeers.size !== 1 ? 's' : ''} connected`;
}

// ============ WEBRTC CORE ============
async function getLocalMedia() {
    try {
        window.localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: true },
            video: false 
        });
        setupAudioAnalyzer();
        showToast('Microphone access granted', 'success');
        return window.localStream;
    } catch (e) {
        console.error("Error accessing microphone:", e);
        showToast('Microphone access denied', 'error');
        throw e;
    }
}

function createPeerConnection(peerId) {
    const peerConnection = new RTCPeerConnection({
        iceServers: STUN_SERVERS
    });

    if (window.localStream) {
        window.localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, window.localStream);
        });
    }

    peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
            await sendSignal(peerId, 'candidate', {
                candidate: event.candidate.toJSON()
            });
        }
    };

    peerConnection.ontrack = (event) => {
        console.log('Received remote track from', peerId);
        if (event.streams && event.streams[0]) {
            const audio = new Audio();
            audio.srcObject = event.streams[0];
            audio.autoplay = true;
            audio.id = `audio-${peerId}`;
            document.getElementById('remote-audio-container').appendChild(audio);
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state with ${peerId}:`, peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
            disconnectPeer(peerId);
        }
    };

    window.peerConnections.set(peerId, peerConnection);
    return peerConnection;
}

async function sendSignal(peerId, type, payload) {
    try {
        const signalId = `${window.userId}_${peerId}_${type}_${Date.now()}`;
        const docRef = doc(window.db, `artifacts/${window.appId}/public/data/signals`, signalId);
        
        await setDoc(docRef, {
            type: type,
            sender: window.userId,
            receiver: peerId,
            room: ROOM_ID,
            timestamp: Date.now(),
            payload: JSON.stringify(payload),
            ttl: Date.now() + 60000
        });
        
        console.log(`Signal '${type}' sent to ${peerId}`);
    } catch (e) {
        console.error("Error sending signal:", e);
    }
}

async function handleOffer(peerId, offerSdp) {
    try {
        let pc = window.peerConnections.get(peerId);
        if (!pc) {
            pc = createPeerConnection(peerId);
        }

        const offer = new RTCSessionDescription({ type: 'offer', sdp: offerSdp });
        await pc.setRemoteDescription(offer);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await sendSignal(peerId, 'answer', { sdp: answer.sdp });
        
        window.connectedPeers.add(peerId);
        updateUsersGrid();
        showToast(`Connected to peer ${peerId.substring(0, 6)}`, 'success');
    } catch (e) {
        console.error("Error handling offer:", e);
    }
}

async function handleAnswer(peerId, answerSdp) {
    try {
        const pc = window.peerConnections.get(peerId);
        if (!pc) return;

        const answer = new RTCSessionDescription({ type: 'answer', sdp: answerSdp });
        await pc.setRemoteDescription(answer);
        
        window.connectedPeers.add(peerId);
        updateUsersGrid();
        showToast(`Peer ${peerId.substring(0, 6)} accepted connection`, 'success');
    } catch (e) {
        console.error("Error handling answer:", e);
    }
}

async function handleCandidate(peerId, candidateData) {
    try {
        const pc = window.peerConnections.get(peerId);
        if (!pc) return;

        const candidate = new RTCIceCandidate(candidateData.candidate);
        await pc.addIceCandidate(candidate);
    } catch (e) {
        console.error("Error adding ICE candidate:", e);
    }
}

function disconnectPeer(peerId) {
    const pc = window.peerConnections.get(peerId);
    if (pc) {
        pc.close();
        window.peerConnections.delete(peerId);
    }
    
    const audio = document.getElementById(`audio-${peerId}`);
    if (audio) audio.remove();
    
    window.connectedPeers.delete(peerId);
    updateUsersGrid();
    showToast(`Disconnected from ${peerId.substring(0, 6)}`, 'success');
}

function listenForSignals() {
    try {
        const signalsRef = collection(window.db, `artifacts/${window.appId}/public/data/signals`);
        const q = query(
            signalsRef,
            where('receiver', '==', window.userId),
            where('room', '==', ROOM_ID),
            orderBy('timestamp', 'desc'),
            limit(100)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    const peerId = data.sender;
                    
                    if (data.type === 'offer') {
                        const payload = JSON.parse(data.payload);
                        handleOffer(peerId, payload.sdp);
                    } else if (data.type === 'answer') {
                        const payload = JSON.parse(data.payload);
                        handleAnswer(peerId, payload.sdp);
                    } else if (data.type === 'candidate') {
                        const payload = JSON.parse(data.payload);
                        handleCandidate(peerId, payload);
                    }
                }
            });
        });

        window.unsubscribers.push(unsubscribe);
    } catch (e) {
        console.error("Error setting up signal listener:", e);
    }
}

async function initializeRoom() {
    try {
        await getLocalMedia();
        updateUsersGrid();
        listenForSignals();
        
        updateGlobalStatus('online', 'Connected');
        UI.leaveBtn.disabled = false;
        
        showToast('Room initialized! Share your ID to invite others', 'success');
    } catch (e) {
        console.error("Error initializing room:", e);
        updateGlobalStatus('error', 'Failed to initialize');
        showToast('Failed to initialize room', 'error');
    }
}

// ============ CONTROL FUNCTIONS ============
window.toggleMicrophone = function() {
    if (!window.localStream) return;
    
    window.micEnabled = !window.micEnabled;
    window.localStream.getAudioTracks().forEach(track => {
        track.enabled = window.micEnabled;
    });

    UI.micBtn.classList.toggle('active', window.micEnabled);
    const status = window.micEnabled ? 'idle' : 'muted';
    updateUserCardStatus(window.userId, status);
    showToast(window.micEnabled ? 'Microphone enabled' : 'Microphone muted', 'success');
};

window.toggleSpeaker = function() {
    window.speakerEnabled = !window.speakerEnabled;
    UI.speakerBtn.classList.toggle('active', window.speakerEnabled);
    
    const audios = document.querySelectorAll('#remote-audio-container audio');
    audios.forEach(audio => {
        audio.muted = !window.speakerEnabled;
    });
    
    showToast(window.speakerEnabled ? 'Speaker enabled' : 'Speaker muted', 'success');
};

window.leaveRoom = function() {
    window.unsubscribers.forEach(unsub => unsub());
    window.unsubscribers = [];
    
    window.peerConnections.forEach((pc, peerId) => {
        pc.close();
    });
    window.peerConnections.clear();
    window.connectedPeers.clear();
    
    if (window.localStream) {
        window.localStream.getTracks().forEach(track => track.stop());
        window.localStream = null;
    }
    
    document.getElementById('remote-audio-container').innerHTML = '';
    updateUsersGrid();
    updateGlobalStatus('connecting', 'Disconnected');
    UI.leaveBtn.disabled = true;
    showToast('Left the room', 'success');
};

// ============ FIREBASE INITIALIZATION ============
async function initFirebase() {
    try {
        // Try to get config from global variables first, then use hardcoded config
        let firebaseConfig = {};
        
        if (typeof __firebase_config !== 'undefined') {
            firebaseConfig = JSON.parse(__firebase_config);
        } else {
            // Use the provided Firebase config
            firebaseConfig = {
                apiKey: "AIzaSyC2vPpRp_RDuIF8jXAiyAshsyAam6ZbeFs",
                authDomain: "trixbox-voice-chat.firebaseapp.com",
                projectId: "trixbox-voice-chat",
                storageBucket: "trixbox-voice-chat.firebasestorage.app",
                messagingSenderId: "476286352040",
                appId: "1:476286352040:web:aa9b1eab74a6ec00c1609d",
                measurementId: "G-Z2W6SH40CW"
            };
        }
        
        window.appId = typeof __app_id !== 'undefined' ? __app_id : firebaseConfig.projectId || 'default-voice-chat-app-id';
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

        if (!firebaseConfig.apiKey) {
            throw new Error("Firebase config not found. Cannot initialize application.");
        }

        const app = initializeApp(firebaseConfig);
        window.db = getFirestore(app);
        window.auth = getAuth(app);

        updateGlobalStatus('connecting', 'Authenticating...');

        if (initialAuthToken) {
            await signInWithCustomToken(window.auth, initialAuthToken);
        } else {
            await signInAnonymously(window.auth);
        }

        onAuthStateChanged(window.auth, async (user) => {
            if (user) {
