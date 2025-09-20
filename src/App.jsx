import { useState, useEffect } from "react";
import "./App.css";
import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    updateDoc,
    doc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";

function App() {
    const [location, setLocation] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [deviceInfo, setDeviceInfo] = useState({ name: "" });
    const [editableName, setEditableName] = useState("");
    const [username, setUsername] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState("");

    // Audio recording states
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState(null);
    const [audioUrl, setAudioUrl] = useState(null);
    const [mediaRecorder, setMediaRecorder] = useState(null);
    const [audioChunks, setAudioChunks] = useState([]);

    // Function to detect device information
    const detectDeviceInfo = () => {
        const userAgent = navigator.userAgent;
        let deviceName = "Unknown Device";

        // Detect device type and browser
        if (
            /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                userAgent
            )
        ) {
            if (/iPhone|iPad|iPod/i.test(userAgent)) {
                deviceName = "iOS Device";
            } else if (/Android/i.test(userAgent)) {
                deviceName = "Android Device";
            } else {
                deviceName = "Mobile Device";
            }
        } else if (/Windows/i.test(userAgent)) {
            deviceName = "Windows PC";
        } else if (/Mac/i.test(userAgent)) {
            deviceName = "Mac";
        } else if (/Linux/i.test(userAgent)) {
            deviceName = "Linux PC";
        }

        // Detect browser
        let browser = "";
        if (/Chrome/i.test(userAgent) && !/Edge/i.test(userAgent)) {
            browser = "Chrome";
        } else if (/Firefox/i.test(userAgent)) {
            browser = "Firefox";
        } else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) {
            browser = "Safari";
        } else if (/Edge/i.test(userAgent)) {
            browser = "Edge";
        } else {
            browser = "Browser";
        }

        const deviceNameWithBrowser = `${deviceName} (${browser})`;

        setDeviceInfo({
            name: deviceNameWithBrowser,
        });
        setEditableName(deviceNameWithBrowser);
    };

    // Generate device info when component mounts
    useEffect(() => {
        detectDeviceInfo();
        checkFirebaseConfig();
    }, []);

    const getCurrentLocation = () => {
        if (!navigator.geolocation) {
            setError("Geolocation is not supported by this browser.");
            return;
        }

        setLoading(true);
        setError(null);

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: new Date(position.timestamp).toLocaleString(),
                });
                setLoading(false);
            },
            (error) => {
                let errorMessage = "An unknown error occurred.";
                let suggestion = "";

                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = "Geolocation access denied.";
                        suggestion =
                            "Please allow location access in your browser settings, or try running on localhost instead of --host mode.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = "Location information is unavailable.";
                        suggestion =
                            "Please check your GPS/WiFi connection and try again.";
                        break;
                    case error.TIMEOUT:
                        errorMessage =
                            "The request to get user location timed out.";
                        suggestion = "Please try again in a moment.";
                        break;
                }
                setError(`${errorMessage} ${suggestion}`);
                setLoading(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0,
            }
        );
    };

    const copyToClipboard = (text) => {
        navigator.clipboard
            .writeText(text)
            .then(() => {
                alert("Coordinates copied to clipboard!");
            })
            .catch(() => {
                alert("Failed to copy to clipboard");
            });
    };

    // Audio recording functions
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });
            const recorder = new MediaRecorder(stream);
            const chunks = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunks.push(event.data);
                }
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: "audio/webm" });
                setAudioBlob(blob);
                const url = URL.createObjectURL(blob);
                setAudioUrl(url);
                setAudioChunks(chunks);
                stream.getTracks().forEach((track) => track.stop());
            };

            recorder.start();
            setMediaRecorder(recorder);
            setIsRecording(true);
            setIsPaused(false);
            setRecordingTime(0);
            setAudioChunks([]);
        } catch (error) {
            console.error("Error starting recording:", error);
            alert("Error accessing microphone. Please check permissions.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            setIsRecording(false);
            setIsPaused(false);
        }
    };

    const pauseRecording = () => {
        if (mediaRecorder && isRecording && !isPaused) {
            mediaRecorder.pause();
            setIsPaused(true);
        }
    };

    const resumeRecording = () => {
        if (mediaRecorder && isRecording && isPaused) {
            mediaRecorder.resume();
            setIsPaused(false);
        }
    };

    const clearRecording = () => {
        setAudioBlob(null);
        setAudioUrl(null);
        setRecordingTime(0);
        setAudioChunks([]);
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
        }
    };

    // Timer effect for recording
    useEffect(() => {
        let interval = null;
        if (isRecording && !isPaused) {
            interval = setInterval(() => {
                setRecordingTime((time) => time + 1);
            }, 1000);
        } else if (!isRecording || isPaused) {
            clearInterval(interval);
        }
        return () => clearInterval(interval);
    }, [isRecording, isPaused]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs
            .toString()
            .padStart(2, "0")}`;
    };

    // Check Firebase configuration
    const checkFirebaseConfig = () => {
        const config = {
            apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
            authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
            storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: import.meta.env
                .VITE_FIREBASE_MESSAGING_SENDER_ID,
            appId: import.meta.env.VITE_FIREBASE_APP_ID,
        };

        console.log("Firebase Config Check:", {
            hasApiKey: !!config.apiKey,
            hasAuthDomain: !!config.authDomain,
            hasProjectId: !!config.projectId,
            hasStorageBucket: !!config.storageBucket,
            hasMessagingSenderId: !!config.messagingSenderId,
            hasAppId: !!config.appId,
        });

        const missingConfigs = Object.entries(config)
            .filter(([key, value]) => !value || value.includes("your_"))
            .map(([key]) => key);

        if (missingConfigs.length > 0) {
            console.error("Missing Firebase configuration:", missingConfigs);
            return false;
        }

        return true;
    };

    const saveToDatabase = async () => {
        if (!location) {
            setSaveMessage("Please get your location first!");
            return;
        }

        if (!username.trim()) {
            setSaveMessage("Please enter a username!");
            return;
        }

        setSaving(true);
        setSaveMessage("");

        try {
            let audioUrl = null;

            // Upload audio file if available
            if (audioBlob) {
                console.log("Starting audio upload...", {
                    blobSize: audioBlob.size,
                    blobType: audioBlob.type,
                    username: username.trim(),
                });

                const audioFileName = `audio_${username.trim()}_${Date.now()}.webm`;
                const audioRef = ref(storage, `audio/${audioFileName}`);

                console.log("Uploading to Firebase Storage:", audioFileName);
                await uploadBytes(audioRef, audioBlob);
                console.log("Audio uploaded successfully");

                audioUrl = await getDownloadURL(audioRef);
                console.log("Audio URL generated:", audioUrl);
            }

            const locationData = {
                username: username.trim(),
                name: editableName.trim() || deviceInfo.name,
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy,
                timestamp: location.timestamp,
                savedAt: new Date().toISOString(),
                audioUrl: audioUrl,
                hasAudio: !!audioBlob,
            };

            // 🔎 Check if username already exists
            const q = query(
                collection(db, "locations"),
                where("username", "==", username.trim())
            );
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                // update existing document
                const existingDoc = querySnapshot.docs[0];
                const docRef = doc(db, "locations", existingDoc.id);
                await updateDoc(docRef, locationData);
                setSaveMessage("✅ Location and audio updated successfully!");
            } else {
                // create new document
                await addDoc(collection(db, "locations"), locationData);
                setSaveMessage("✅ Location and audio saved successfully!");
            }
        } catch (error) {
            console.error("Error saving location:", error);

            // More specific error messages
            let errorMessage = "❌ Failed to save location.";

            if (error.code === "storage/unauthorized") {
                errorMessage =
                    "❌ Storage access denied. Check Firebase Storage rules.";
            } else if (error.code === "storage/canceled") {
                errorMessage = "❌ Upload was canceled.";
            } else if (error.code === "storage/unknown") {
                errorMessage =
                    "❌ Unknown storage error. Check Firebase config.";
            } else if (error.code === "storage/invalid-argument") {
                errorMessage = "❌ Invalid audio file format.";
            } else if (error.code === "storage/object-not-found") {
                errorMessage = "❌ Storage object not found.";
            } else if (
                error.message.includes("CORS") ||
                error.message.includes("cors")
            ) {
                errorMessage =
                    "❌ CORS Error: Update Firebase Storage rules to allow public access.";
            } else if (error.message.includes("Firebase")) {
                errorMessage = `❌ Firebase error: ${error.message}`;
            } else if (error.message.includes("network")) {
                errorMessage =
                    "❌ Network error. Check your internet connection.";
            } else {
                errorMessage = `❌ Error: ${error.message}`;
            }

            setSaveMessage(errorMessage);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="app">
            <header className="app-header">
                <h1>📍 Location & Audio Recorder</h1>
                <p>Get your current coordinates and record audio</p>
            </header>

            <main className="main-content">
                <button
                    className="get-location-btn"
                    onClick={getCurrentLocation}
                    disabled={loading}
                >
                    {loading ? "Getting Location..." : "Get My Location"}
                </button>

                {/* Audio Recording Section */}
                <div className="audio-section">
                    <h3>🎤 Audio Recording</h3>

                    {!isRecording && !audioBlob && (
                        <button
                            className="record-btn start"
                            onClick={startRecording}
                        >
                            🎤 Start Recording
                        </button>
                    )}

                    {isRecording && (
                        <div className="recording-controls">
                            <div className="recording-timer">
                                <span className="timer-icon">⏱️</span>
                                <span className="timer-text">
                                    {formatTime(recordingTime)}
                                </span>
                            </div>
                            <div className="recording-buttons">
                                {!isPaused ? (
                                    <button
                                        className="record-btn pause"
                                        onClick={pauseRecording}
                                    >
                                        ⏸️ Pause
                                    </button>
                                ) : (
                                    <button
                                        className="record-btn resume"
                                        onClick={resumeRecording}
                                    >
                                        ▶️ Resume
                                    </button>
                                )}
                                <button
                                    className="record-btn stop"
                                    onClick={stopRecording}
                                >
                                    ⏹️ Stop
                                </button>
                            </div>
                        </div>
                    )}

                    {audioBlob && (
                        <div className="audio-playback">
                            <h4>🎵 Recorded Audio</h4>
                            <audio
                                controls
                                src={audioUrl}
                                className="audio-player"
                            >
                                Your browser does not support the audio element.
                            </audio>
                            <div className="audio-actions">
                                <button
                                    className="action-btn"
                                    onClick={clearRecording}
                                >
                                    🗑️ Clear Recording
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="error-message">
                        <h3>❌ Error</h3>
                        <p>{error}</p>
                    </div>
                )}

                {location && (
                    <div className="location-info">
                        <h3>✅ Location Found!</h3>
                        <div className="coordinates">
                            <div className="coordinate-item">
                                <label>Latitude:</label>
                                <span className="coordinate-value">
                                    {location.latitude.toFixed(6)}
                                </span>
                                <button
                                    className="copy-btn"
                                    onClick={() =>
                                        copyToClipboard(
                                            location.latitude.toString()
                                        )
                                    }
                                >
                                    📋
                                </button>
                            </div>
                            <div className="coordinate-item">
                                <label>Longitude:</label>
                                <span className="coordinate-value">
                                    {location.longitude.toFixed(6)}
                                </span>
                                <button
                                    className="copy-btn"
                                    onClick={() =>
                                        copyToClipboard(
                                            location.longitude.toString()
                                        )
                                    }
                                >
                                    📋
                                </button>
                            </div>
                            <div className="coordinate-item">
                                <label>Accuracy:</label>
                                <span className="coordinate-value">
                                    {location.accuracy.toFixed(2)} meters
                                </span>
                            </div>
                            <div className="coordinate-item">
                                <label>Timestamp:</label>
                                <span className="coordinate-value">
                                    {location.timestamp}
                                </span>
                            </div>
                        </div>

                        <div className="actions">
                            <button
                                className="action-btn"
                                onClick={() =>
                                    copyToClipboard(
                                        `${location.latitude}, ${location.longitude}`
                                    )
                                }
                            >
                                Copy Coordinates
                            </button>
                            <button
                                className="action-btn"
                                onClick={() =>
                                    window.open(
                                        `https://www.google.com/maps?q=${location.latitude},${location.longitude}`,
                                        "_blank"
                                    )
                                }
                            >
                                Open in Google Maps
                            </button>
                        </div>

                        <div className="save-section">
                            <h3>💾 Save to Database</h3>
                            <div className="device-info">
                                <div className="form-group">
                                    <label htmlFor="device-name">
                                        Device Name:
                                    </label>
                                    <input
                                        type="text"
                                        id="device-name"
                                        value={editableName}
                                        onChange={(e) =>
                                            setEditableName(e.target.value)
                                        }
                                        placeholder="Enter custom device name"
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="username">Username:</label>
                                    <input
                                        type="text"
                                        id="username"
                                        value={username}
                                        onChange={(e) =>
                                            setUsername(e.target.value)
                                        }
                                        placeholder="Enter your username"
                                        className="form-input"
                                    />
                                </div>
                            </div>
                            <button
                                className="save-btn"
                                onClick={saveToDatabase}
                                disabled={saving}
                            >
                                {saving
                                    ? "Saving..."
                                    : audioBlob
                                    ? "💾 Save Location & Audio"
                                    : "💾 Save/Update Location"}
                            </button>
                            {saveMessage && (
                                <div
                                    className={`save-message ${
                                        saveMessage.includes("✅")
                                            ? "success"
                                            : "error"
                                    }`}
                                >
                                    {saveMessage}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

            <footer className="app-footer">
                <p>Built with React + Vite</p>
            </footer>
        </div>
    );
}

export default App;
