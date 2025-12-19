import { useState, useEffect, useRef } from "react";
import "./App.css";
import {
    doc,
    setDoc,
    getDoc,
    updateDoc,
    onSnapshot,
    serverTimestamp,
    arrayUnion,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";

function App() {
    // --------------------------
    // BASIC STATE
    // --------------------------
    const [deviceInfo, setDeviceInfo] = useState({ name: "" });
    const [editableName, setEditableName] = useState("");
    const [username, setUsername] = useState("");

    const [currentSession, setCurrentSession] = useState(null);
    const [sessionName, setSessionName] = useState("");
    const [sessionId, setSessionId] = useState("");
    const [isInSession, setIsInSession] = useState(false);
    const [sessionParticipants, setSessionParticipants] = useState([]);

    // Audio recording state
    const [isRecording, setIsRecording] = useState(false);
    const [audioBlob, setAudioBlob] = useState(null);
    const [audioUrl, setAudioUrl] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState("");

    const [recordCountdown, setRecordCountdown] = useState(null);

    // UI status for horn / recording flow
    const [hornStatus, setHornStatus] = useState("");

    // --------------------------
    // REFS
    // --------------------------
    const mediaRecorderRef = useRef(null);
    const recordingStartedRef = useRef(false);
    const recordingStartTimeRef = useRef(null);

    // session ID ref used for saving even after state cleanup
    const sessionIdRef = useRef(null);

    // Horn detection refs
    const hornListenerActiveRef = useRef(false);
    const hornStreamRef = useRef(null);
    const audioCtxRef = useRef(null);
    const analyserRef = useRef(null);
    const scriptNodeRef = useRef(null);
    const hornEventsRef = useRef([]); // stores timestamps of blasts
    const lastHornTimeRef = useRef(0);

    // Spectrogram
    const spectrogramCanvasRef = useRef(null);
    const spectrogramActiveRef = useRef(false);
    const triggerMarkPendingRef = useRef(false);

    // --------------------------
    // CONSTANTS
    // --------------------------
    const RECORD_SECONDS = 15;

    // Horn detection constants (WebAudio, float range [-1, 1])
    const HORN_FFT_SIZE = 2048;
    const AMP_THRESHOLD = 0.08; // more realistic threshold
    const DEBOUNCE_MS = 300; // ignore repeats within 300 ms
    const WINDOW_MS = 2000; // two blasts within 2 seconds
    const HORN_BAND_LOW = 300; // Hz
    const HORN_BAND_HIGH = 2000; // Hz
    const MIN_RATIO = 0.15; // at least 15% energy in horn band

    // --------------------------
    // DEVICE INFO
    // --------------------------
    const detectDeviceInfo = () => {
        const userAgent = navigator.userAgent;
        let deviceName = "Unknown Device";

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

        setDeviceInfo({ name: deviceNameWithBrowser });
        setEditableName(deviceNameWithBrowser);
    };

    // --------------------------
    // SESSION UTIL
    // --------------------------
    const makeSessionId = (name) => {
        if (!name) return "";
        return name
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9\-_.]/g, "")
            .slice(0, 80);
    };

    const generateAudioFileName = (sessionName, userName) => {
        const timeToUse = new Date();
        const date = timeToUse.toISOString().split("T")[0]; // YYYY-MM-DD
        const time = timeToUse.toTimeString().slice(0, 5); // HH:MM
        const cleanSessionName = sessionName
            ? sessionName.trim().replace(/[^a-zA-Z0-9]/g, "_")
            : "general";
        const cleanUserName = userName
            ? userName.trim().replace(/[^a-zA-Z0-9]/g, "_")
            : "anonymous";

        // No extension here; we'll add ".wav" when uploading
        return `${cleanSessionName}_${cleanUserName}_${date}_${time}`;
    };

    // --------------------------
    // WAV ENCODING HELPERS
    // --------------------------
    const writeString = (view, offset, str) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    const encodeWav = (audioBuffer) => {
        // Mono: use first channel
        const channelData = audioBuffer.getChannelData(0);
        const numChannels = 1;
        const sampleRate = audioBuffer.sampleRate;
        const numFrames = channelData.length;

        const blockAlign = numChannels * 2; // 16-bit
        const byteRate = sampleRate * blockAlign;
        const dataSize = numFrames * blockAlign;

        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        // RIFF header
        writeString(view, 0, "RIFF");
        view.setUint32(4, 36 + dataSize, true);
        writeString(view, 8, "WAVE");

        // fmt chunk
        writeString(view, 12, "fmt ");
        view.setUint32(16, 16, true); // chunk size
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true); // bits per sample

        // data chunk
        writeString(view, 36, "data");
        view.setUint32(40, dataSize, true);

        // PCM samples
        let offset = 44;
        for (let i = 0; i < numFrames; i++) {
            let sample = channelData[i];
            sample = Math.max(-1, Math.min(1, sample));
            view.setInt16(
                offset,
                sample < 0 ? sample * 0x8000 : sample * 0x7fff,
                true
            );
            offset += 2;
        }

        return new Blob([view], { type: "audio/wav" });
    };

    const convertWebMToWav = async (webmBlob) => {
        const arrayBuffer = await webmBlob.arrayBuffer();
        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContextClass();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const wavBlob = encodeWav(audioBuffer);
        ctx.close();
        return wavBlob;
    };

    // --------------------------
    // SPECTROGRAM
    // --------------------------
    const getSpectrogramColor = (intensity) => {
        const grey = Math.floor(255 * intensity);
        return `rgb(${grey}, ${grey}, ${grey})`; // grayscale
    };

    const startSpectrogram = (analyser) => {
        const canvas = spectrogramCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;

        const freqBins = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(freqBins);

        spectrogramActiveRef.current = true;

        const draw = () => {
            if (!spectrogramActiveRef.current) return;
            requestAnimationFrame(draw);

            analyser.getByteFrequencyData(dataArray);

            // Shift image left by 1 pixel
            const imageData = ctx.getImageData(1, 0, width - 1, height);
            ctx.putImageData(imageData, 0, 0);

            // Clear rightmost column (white background)
            ctx.fillStyle = "#fff";
            ctx.fillRect(width - 1, 0, 1, height);

            // Draw new spectrum column at right edge
            for (let i = 0; i < freqBins; i++) {
                const value = dataArray[i]; // 0..255
                const intensity = value / 255;
                const y = height - Math.floor((i / freqBins) * height);
                ctx.fillStyle = getSpectrogramColor(intensity);
                ctx.fillRect(width - 1, y, 1, 1);
            }

            // If horn triggered this frame, draw a vertical red line at the right edge
            if (triggerMarkPendingRef.current) {
                ctx.strokeStyle = "red";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(width - 1, 0);
                ctx.lineTo(width - 1, height);
                ctx.stroke();
                triggerMarkPendingRef.current = false;
            }
        };

        draw();
    };

    // --------------------------
    // HORN DETECTION
    // --------------------------
    const stopHornListener = () => {
        if (scriptNodeRef.current) {
            scriptNodeRef.current.disconnect();
            scriptNodeRef.current.onaudioprocess = null;
            scriptNodeRef.current = null;
        }
        if (analyserRef.current) {
            analyserRef.current.disconnect();
            analyserRef.current = null;
        }
        if (audioCtxRef.current) {
            audioCtxRef.current.close();
            audioCtxRef.current = null;
        }
        if (hornStreamRef.current) {
            hornStreamRef.current.getTracks().forEach((t) => t.stop());
            hornStreamRef.current = null;
        }
        hornListenerActiveRef.current = false;
        hornEventsRef.current = [];
        lastHornTimeRef.current = 0;

        spectrogramActiveRef.current = false;
    };

    const startHornListener = async () => {
        try {
            if (hornListenerActiveRef.current) {
                console.log("Horn listener already active.");
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });

            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;
            const audioCtx = new AudioContextClass();
            if (audioCtx.state === "suspended") {
                await audioCtx.resume();
            }

            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = HORN_FFT_SIZE;
            const scriptNode = audioCtx.createScriptProcessor(
                HORN_FFT_SIZE,
                1,
                1
            );

            hornStreamRef.current = stream;
            audioCtxRef.current = audioCtx;
            analyserRef.current = analyser;
            scriptNodeRef.current = scriptNode;
            hornListenerActiveRef.current = true;
            hornEventsRef.current = [];
            lastHornTimeRef.current = 0;

            setHornStatus("Listening for horn (2 blasts)...");
            spectrogramCanvasRef.current =
                document.getElementById("spectrogram");
            startSpectrogram(analyser);

            source.connect(analyser);
            analyser.connect(scriptNode);
            scriptNode.connect(audioCtx.destination);

            const freqData = new Uint8Array(analyser.frequencyBinCount);

            scriptNode.onaudioprocess = (event) => {
                if (!hornListenerActiveRef.current) return;
                if (recordingStartedRef.current) return; // already triggered

                const input = event.inputBuffer.getChannelData(0);
                let peak = 0;
                for (let i = 0; i < input.length; i++) {
                    const v = Math.abs(input[i]);
                    if (v > peak) peak = v;
                }

                // Amplitude gate
                if (peak < AMP_THRESHOLD) return;

                // Frequency band check
                analyser.getByteFrequencyData(freqData);
                let totalEnergy = 0;
                let bandEnergy = 0;
                const sampleRate = audioCtx.sampleRate;
                const binHz = sampleRate / analyser.fftSize;

                for (let i = 0; i < freqData.length; i++) {
                    const freq = i * binHz;
                    const val = freqData[i]; // 0..255
                    const energy = val + 1e-6;
                    totalEnergy += energy;
                    if (freq >= HORN_BAND_LOW && freq <= HORN_BAND_HIGH) {
                        bandEnergy += energy;
                    }
                }

                const ratio = bandEnergy / (totalEnergy + 1e-6);
                if (ratio < MIN_RATIO) return;

                const now = performance.now();

                // Debounce to avoid duplicate triggers from same blast
                if (now - lastHornTimeRef.current < DEBOUNCE_MS) return;
                lastHornTimeRef.current = now;

                // Blast timing logic:
                // If no previous blast or previous blast older than WINDOW_MS,
                // treat this as a NEW first blast and discard any old one.
                const lastBlast =
                    hornEventsRef.current.length > 0
                        ? hornEventsRef.current[hornEventsRef.current.length - 1]
                        : null;

                if (!lastBlast || now - lastBlast > WINDOW_MS) {
                    // New first blast
                    hornEventsRef.current = [now];
                    setHornStatus("First horn blast detected...");
                    console.log(
                        "🔊 First horn blast detected",
                        "peak=",
                        peak.toFixed(3),
                        "ratio=",
                        ratio.toFixed(3)
                    );
                    return;
                }

                // Second blast within WINDOW_MS → trigger
                hornEventsRef.current.push(now);
                setHornStatus(
                    `${hornEventsRef.current.length} horn blasts detected...`
                );
                console.log(
                    "🔊 Second horn blast detected",
                    hornEventsRef.current.length,
                    "peak=",
                    peak.toFixed(3),
                    "ratio=",
                    ratio.toFixed(3)
                );

                if (hornEventsRef.current.length >= 2) {
                    console.log("🚀 Horn trigger confirmed (2 blasts)!");
                    triggerMarkPendingRef.current = true; // mark on spectrogram
                    recordingStartedRef.current = true;
                    setHornStatus("Trigger confirmed – starting recording...");
                    stopHornListener(); // stop listening + spectrogram
                    startRecording();
                }
            };

            console.log("Horn listener started. Blast twice to trigger.");
        } catch (err) {
            console.error("Failed to start horn listener:", err);
            alert(
                "Could not access microphone for horn detection. Check permissions."
            );
        }
    };

    // --------------------------
    // RECORDING
    // --------------------------
    const startRecording = async () => {
        try {
            if (isRecording) return;

            console.log("Starting recording (horn-triggered)...");
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
            });

            const recorder = new MediaRecorder(stream);
            const chunks = [];

            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    chunks.push(event.data);
                }
            };

            recorder.onstop = async () => {
                try {
                    console.log("MediaRecorder stopped, assembling WAV...");

                    const webmBlob = new Blob(chunks, { type: "audio/webm" });
                    const wavBlob = await convertWebMToWav(webmBlob);

                    const url = URL.createObjectURL(wavBlob);
                    setAudioBlob(wavBlob);
                    setAudioUrl(url);

                    // Stop tracks
                    stream.getTracks().forEach((t) => t.stop());

                    setIsRecording(false);
                    setRecordCountdown(null);
                    setHornStatus(
                        "Recording finished — saving to session and ending..."
                    );

                    // Save WAV to Firebase + end session
                    await saveRecordingToSession(wavBlob); // upload first
                    setHornStatus("Recording uploaded — ending session...");
                    await endSessionAfterSave(); // end AFTER upload
                } catch (err) {
                    console.error("Error processing recording:", err);
                    setHornStatus("Error while processing recording.");
                }
            };

            mediaRecorderRef.current = recorder;
            setIsRecording(true);
            recordingStartTimeRef.current = new Date().toISOString();

            setHornStatus("Recording (15s)...");
            spectrogramActiveRef.current = false; // hide spectrogram
            setRecordCountdown(RECORD_SECONDS);

            let remaining = RECORD_SECONDS;
            const countdownInterval = setInterval(() => {
                remaining -= 1;
                setRecordCountdown(remaining);
                if (remaining <= 0) {
                    clearInterval(countdownInterval);
                }
            }, 1000);

            recorder.start();
            console.log("MediaRecorder started.");

            // Stop after fixed duration
            setTimeout(() => {
                if (recorder.state === "recording") {
                    recorder.stop();
                }
            }, RECORD_SECONDS * 1000);
        } catch (err) {
            console.error("Error starting recording:", err);
            alert("Failed to start recording. Check microphone permissions.");
        }
    };

    // --------------------------
    // SAVE TO SESSION (WAV)
    // --------------------------
    const saveRecordingToSession = async (blobToSave) => {
        const blob = blobToSave || audioBlob;

        if (!blob) {
            alert("No recording to save.");
            return;
        }

        // Use stable session ID captured in sessionIdRef
        const sessionIdForSave =
            sessionIdRef.current || currentSession || sessionName || sessionId;

        if (!sessionIdForSave) {
            console.error("No valid session ID to save into.");
            setSaveMessage("❌ No valid session to save into.");
            return;
        }

        try {
            setSaving(true);
            setSaveMessage("");

            const fileName = generateAudioFileName(
                sessionIdForSave,
                username || "Anonymous"
            );
            const audioRef = ref(storage, `sessions/${fileName}.wav`);
            await uploadBytes(audioRef, blob);
            const downloadUrl = await getDownloadURL(audioRef);

            const sessionRef = doc(db, "sessions", sessionIdForSave);
            await updateDoc(sessionRef, {
                events: arrayUnion({
                    type: "recording_uploaded",
                    by: username.trim() || "Anonymous",
                    timestamp: new Date().toISOString(),
                    audioUrl: downloadUrl,
                    recordingStart: recordingStartTimeRef.current,
                    format: "wav",
                }),
            });

            setSaveMessage("✅ Recording (WAV) uploaded to session.");
        } catch (e) {
            console.error("Error uploading recording:", e);
            setSaveMessage("❌ Failed to upload recording.");
        } finally {
            setSaving(false);
        }
    };

    const clearRecording = () => {
        if (audioUrl) {
            try {
                URL.revokeObjectURL(audioUrl);
            } catch (_) {}
        }
        setAudioBlob(null);
        setAudioUrl(null);
        setSaveMessage("");
    };

    // --------------------------
    // END SESSION AFTER SAVE
    // --------------------------
    const cleanupLocalSessionState = () => {
        stopHornListener();
        setCurrentSession(null);
        setIsInSession(false);
        setSessionId("");
        setSessionName("");
        setSessionParticipants([]);
        sessionIdRef.current = null;
        recordingStartedRef.current = false;
        setHornStatus("");
    };

    const endSessionAfterSave = async () => {
        const sessionIdForSave =
            sessionIdRef.current || currentSession || sessionName || sessionId;

        if (!sessionIdForSave) {
            cleanupLocalSessionState();
            return;
        }

        try {
            const sessionRef = doc(db, "sessions", sessionIdForSave);
            await updateDoc(sessionRef, {
                status: "finished",
                events: arrayUnion({
                    type: "session_finished",
                    by: username.trim() || "Anonymous",
                    timestamp: new Date().toISOString(),
                }),
            });
        } catch (err) {
            console.error("Error ending session:", err);
        }

        cleanupLocalSessionState();
    };

    // --------------------------
    // SESSION MGMT
    // --------------------------
    const listenToSession = (sessionId) => {
        const sessionRef = doc(db, "sessions", sessionId);
        return onSnapshot(sessionRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setSessionParticipants(data.participants || []);
            }
        });
    };

    const createSession = async () => {
        if (!sessionName.trim()) {
            alert("Please enter a session name!");
            return;
        }
        if (!username.trim()) {
            alert("Please enter a username!");
            return;
        }

        try {
            const sessionIdFromName = makeSessionId(sessionName);
            const sessionRef = doc(db, "sessions", sessionIdFromName);
            const existing = await getDoc(sessionRef);
            if (existing.exists()) {
                alert(
                    "A session with this name already exists. Choose a different name."
                );
                return;
            }

            const nowIso = new Date().toISOString();

            const sessionData = {
                name: sessionName.trim(),
                createdAt: serverTimestamp(),
                participants: [
                    {
                        username: username.trim() || "Anonymous",
                        deviceName:
                            editableName.trim() || deviceInfo.name || "",
                        joinedAt: nowIso,
                        isActive: true,
                    },
                ],
                events: [
                    {
                        type: "created",
                        by: username.trim() || "Anonymous",
                        timestamp: nowIso,
                    },
                ],
                status: "active",
            };

            await setDoc(sessionRef, sessionData);

            setCurrentSession(sessionIdFromName);
            sessionIdRef.current = sessionIdFromName;
            setIsInSession(true);
            listenToSession(sessionIdFromName);
            recordingStartedRef.current = false;
            setHornStatus("");
            startHornListener();

            alert(
                `Session "${sessionName}" created.\nHorn-trigger is now active.`
            );
        } catch (err) {
            console.error("Error creating session:", err);
            alert("Failed to create session. Check console for details.");
        }
    };

    const joinSession = async () => {
        if (!sessionId.trim()) {
            alert("Please enter a session name to join!");
            return;
        }
        if (!username.trim()) {
            alert("Please enter a username!");
            return;
        }

        try {
            const sessionIdFromName = makeSessionId(sessionId.trim());
            const sessionRef = doc(db, "sessions", sessionIdFromName);
            const snap = await getDoc(sessionRef);

            if (!snap.exists()) {
                alert("Session not found. Check the session name.");
                return;
            }

            const data = snap.data();
            const nowIso = new Date().toISOString();
            const participants = data.participants || [];

            const newParticipant = {
                username: username.trim() || "Anonymous",
                deviceName: editableName.trim() || deviceInfo.name || "",
                joinedAt: nowIso,
                isActive: true,
            };

            await updateDoc(sessionRef, {
                participants: [...participants, newParticipant],
                events: arrayUnion({
                    type: "joined",
                    by: username.trim() || "Anonymous",
                    timestamp: nowIso,
                }),
            });

            setCurrentSession(sessionIdFromName);
            sessionIdRef.current = sessionIdFromName;
            setIsInSession(true);
            listenToSession(sessionIdFromName);
            recordingStartedRef.current = false;
            setHornStatus("");
            startHornListener();

            alert(
                `Joined session "${data.name || sessionIdFromName}". Horn-trigger is active.`
            );
        } catch (err) {
            console.error("Error joining session:", err);
            alert("Failed to join session. Check console for details.");
        }
    };

    const leaveSession = async () => {
        if (!currentSession && !sessionIdRef.current) {
            cleanupLocalSessionState();
            return;
        }

        const sessionToUse =
            sessionIdRef.current || currentSession || sessionName || sessionId;

        try {
            const sessionRef = doc(db, "sessions", sessionToUse);
            const snap = await getDoc(sessionRef);
            if (snap.exists()) {
                const data = snap.data();
                const participants = data.participants || [];
                const updated = participants.map((p) =>
                    p.username === (username.trim() || "Anonymous")
                        ? { ...p, isActive: false }
                        : p
                );

                await updateDoc(sessionRef, {
                    participants: updated,
                    events: arrayUnion({
                        type: "left",
                        by: username.trim() || "Anonymous",
                        timestamp: new Date().toISOString(),
                    }),
                });
            }
        } catch (err) {
            console.warn("Error updating session on leave:", err);
        }

        stopHornListener();
        setCurrentSession(null);
        sessionIdRef.current = null;
        setIsInSession(false);
        setSessionId("");
        setSessionName("");
        setSessionParticipants([]);
        recordingStartedRef.current = false;
        clearRecording();
        setHornStatus("");
    };

    // --------------------------
    // EFFECTS
    // --------------------------
    useEffect(() => {
        detectDeviceInfo();
        return () => {
            stopHornListener();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --------------------------
    // RENDER
    // --------------------------
    return (
        <div className="app">
            <header className="app-header">
                <h1>🔊 Horn-Triggered Session Recorder</h1>
                <p>
                    Create or join a session, then blast the horn twice (within
                    2 seconds) to start a 15s recording. Recording is saved as
                    WAV and the session ends automatically.
                </p>
            </header>

            <main className="main-content">
                <div className="session-section">
                    <h3>🎯 Session Management</h3>

                    {!isInSession ? (
                        <div className="session-controls">
                            <div className="session-form">
                                <div className="form-group">
                                    <label htmlFor="session-name">
                                        Session Name:
                                    </label>
                                    <input
                                        type="text"
                                        id="session-name"
                                        value={sessionName}
                                        onChange={(e) =>
                                            setSessionName(e.target.value)
                                        }
                                        placeholder="Enter session name"
                                        className="form-input"
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="creator-username">
                                        Your Username:
                                    </label>
                                    <input
                                        type="text"
                                        id="creator-username"
                                        value={username}
                                        onChange={(e) =>
                                            setUsername(e.target.value)
                                        }
                                        placeholder="Enter your username"
                                        className="form-input"
                                    />
                                </div>

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
                                        className="form-input"
                                    />
                                </div>

                                <div className="session-buttons">
                                    <button
                                        className="session-btn create"
                                        onClick={createSession}
                                    >
                                        🎯 Create Session
                                    </button>
                                </div>
                            </div>

                            <div className="join-session">
                                <div className="form-group">
                                    <label htmlFor="join-session-id">
                                        Join Session Name:
                                    </label>
                                    <input
                                        type="text"
                                        id="join-session-id"
                                        value={sessionId}
                                        onChange={(e) =>
                                            setSessionId(e.target.value)
                                        }
                                        placeholder="Enter existing session name"
                                        className="form-input"
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="join-username">
                                        Your Username:
                                    </label>
                                    <input
                                        type="text"
                                        id="join-username"
                                        value={username}
                                        onChange={(e) =>
                                            setUsername(e.target.value)
                                        }
                                        placeholder="Enter your username"
                                        className="form-input"
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="join-device-name">
                                        Device Name:
                                    </label>
                                    <input
                                        type="text"
                                        id="join-device-name"
                                        value={editableName}
                                        onChange={(e) =>
                                            setEditableName(e.target.value)
                                        }
                                        className="form-input"
                                    />
                                </div>

                                <button
                                    className="session-btn join"
                                    onClick={joinSession}
                                >
                                    🔗 Join Session
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="active-session">
                            <div className="session-info">
                                <h4>📡 Active Session</h4>
                                <p>
                                    <strong>Session:</strong>{" "}
                                    {currentSession || sessionIdRef.current}
                                </p>
                                <p>
                                    <strong>User:</strong>{" "}
                                    {username || "Anonymous"}
                                </p>
                                <p>
                                    <strong>Device:</strong>{" "}
                                    {editableName || deviceInfo.name}
                                </p>
                                <p>
                                    <strong>Status:</strong>{" "}
                                    {hornStatus ||
                                        (isRecording
                                            ? "🎤 Recording (15s)..."
                                            : recordingStartedRef.current
                                            ? "✅ Recording finished."
                                            : "⏳ Waiting for horn (2 blasts)...")}
                                </p>
                            </div>

                            <div className="participants-list">
                                <h4>👥 Participants</h4>
                                {sessionParticipants.length === 0 && (
                                    <p>No participants yet.</p>
                                )}
                                {sessionParticipants.map(
                                    (participant, index) => (
                                        <div
                                            key={index}
                                            className={`participant ${
                                                participant.isActive
                                                    ? "active"
                                                    : "inactive"
                                            }`}
                                        >
                                            <div className="participant-main">
                                                <strong>
                                                    {participant.username}
                                                </strong>
                                                <span className="device-name">
                                                    ({participant.deviceName})
                                                </span>
                                            </div>
                                            <div className="participant-location">
                                                <small>
                                                    joined at{" "}
                                                    {participant.joinedAt
                                                        ? new Date(
                                                              participant.joinedAt
                                                          ).toLocaleTimeString()
                                                        : "unknown"}
                                                </small>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>

                            <button
                                className="session-btn leave"
                                onClick={leaveSession}
                            >
                                🚪 Leave Session
                            </button>

                            {/* Real-time spectrogram while horn listener is active */}
                            {!isRecording ? (
                                <div className="spectrogram-wrapper">
                                    <h4>📈 Live Spectrogram (detection view)</h4>
                                    <canvas
                                        id="spectrogram"
                                        ref={spectrogramCanvasRef}
                                        width={600}
                                        height={200}
                                        style={{
                                            border: "1px solid #444",
                                            borderRadius: "6px",
                                            marginTop: "10px",
                                            background: "#fff",
                                            maxWidth: "100%",
                                        }}
                                    ></canvas>
                                    <p className="spectrogram-note">
                                        Time flows left → right. Frequency
                                        bottom → top. A red vertical line marks
                                        the trigger moment.
                                    </p>
                                </div>
                            ) : (
                                <div className="record-countdown">
                                    <h3>
                                        🎤 Recording…{" "}
                                        {recordCountdown ?? RECORD_SECONDS}s
                                        remaining
                                    </h3>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* AUDIO PLAYBACK & STATUS */}
                {audioBlob && (
                    <div className="audio-playback">
                        <h4>🎵 Last Recorded Audio (WAV)</h4>
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
                                disabled={saving}
                            >
                                🗑️ Clear Recording
                            </button>
                        </div>
                    </div>
                )}

                {saveMessage && (
                    <div
                        className={`save-message ${
                            saveMessage.includes("✅") ? "success" : "error"
                        }`}
                    >
                        {saveMessage}
                    </div>
                )}
            </main>

            <footer className="app-footer">
                <p>Built for horn-triggered, WAV-based multi-device recording</p>
            </footer>
        </div>
    );
}

export default App;
