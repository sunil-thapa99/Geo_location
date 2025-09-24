import { useState, useEffect, useRef } from "react";
import "./App.css";
import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    setDoc,
    updateDoc,
    doc,
    onSnapshot,
    serverTimestamp,
    orderBy,
    getDoc,
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

    // Use ref to persist MediaRecorder instance across renders
    const mediaRecorderRef = useRef(null);

    // Session states
    const [currentSession, setCurrentSession] = useState(null);
    const [sessionId, setSessionId] = useState("");
    const [sessionName, setSessionName] = useState("");
    const [sessionStartTime, setSessionStartTime] = useState("");
    const [sessionParticipants, setSessionParticipants] = useState([]);
    const [isInSession, setIsInSession] = useState(false);
    const [autoRecordCountdown, setAutoRecordCountdown] = useState(0);
    const [isAutoRecording, setIsAutoRecording] = useState(false);
    const [autoRecordingTime, setAutoRecordingTime] = useState(0);
    const [sessionRecordings, setSessionRecordings] = useState([]);
    const [sessionStartTimeData, setSessionStartTimeData] = useState(null);
    const [countdownIntervalId, setCountdownIntervalId] = useState(null);
    const [autoRecordingTriggered, setAutoRecordingTriggered] = useState(false);
    const [recordingIntervalId, setRecordingIntervalId] = useState(null);
    const [autoRecordingCompleted, setAutoRecordingCompleted] = useState(false);

    // Clock state to show current time on the right side
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const id = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(id);
    }, []);

    // Computed flag: has the scheduled session start time passed?
    const sessionHasStarted = sessionStartTimeData
        ? new Date(sessionStartTimeData).getTime() <= currentTime.getTime()
        : false;

    // Helper function to get current time + 5 minutes in HH:MM format
    const getCurrentTimePlusFive = () => {
        const now = new Date();
        now.setMinutes(now.getMinutes() + 5);
        return now.toTimeString().slice(0, 5); // Get HH:MM format
    };

    // Request location and microphone permissions and return location info
    const requestLocationAndMic = async () => {
        // request location via Promise wrapper
        const getPosition = () =>
            new Promise((resolve, reject) => {
                if (!navigator.geolocation) {
                    reject(new Error('Geolocation not supported'));
                    return;
                }
                navigator.geolocation.getCurrentPosition(
                    (pos) => resolve(pos),
                    (err) => reject(err),
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                );
            });

        try {
            const position = await getPosition();

            // request microphone permission (prompt) - then stop tracks immediately
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                // stop tracks immediately - we only need permission
                stream.getTracks().forEach((t) => t.stop());
            } catch (micErr) {
                // microphone permission denied or not available
                console.warn('Microphone permission not granted or unavailable', micErr);
                // still continue if location is available
            }

            return {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: new Date(position.timestamp).toISOString(),
            };
        } catch (err) {
            throw err;
        }
    };

    // Create a safe session document ID from a session name
    const makeSessionId = (name) => {
        if (!name) return "";
        return name
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9\-_.]/g, "")
            .slice(0, 80);
    };

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
        // Set default session start time to current time + 5 minutes
        setSessionStartTime(getCurrentTimePlusFive());
    }, []);

    // Periodic check for auto-recording when in session
    useEffect(() => {
        if (
            !isInSession ||
            !currentSession ||
            isAutoRecording ||
            autoRecordCountdown > 0 ||
            autoRecordingCompleted
        )
            return;
        // Poll session document periodically to check start time and trigger countdown
        const interval = setInterval(async () => {
            try {
                const sessionRef = doc(db, "sessions", currentSession);
                const sessionSnap = await getDoc(sessionRef);
                if (sessionSnap.exists()) {
                    const data = sessionSnap.data();
                    checkAutoRecordTime(data.startTime);
                }
            } catch (err) {
                console.error("Error checking session for auto-record:", err);
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [
        isInSession,
        currentSession,
        isAutoRecording,
        autoRecordCountdown,
        autoRecordingCompleted,
    ]);

    // Cleanup intervals on component unmount
    useEffect(() => {
        return () => {
            if (countdownIntervalId) {
                clearInterval(countdownIntervalId);
            }
            if (recordingIntervalId) {
                clearInterval(recordingIntervalId);
            }
        };
    }, [countdownIntervalId, recordingIntervalId]);

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
            console.log("Starting recording...");
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
                console.log("MediaRecorder stopped, creating blob");
                const blob = new Blob(chunks, { type: "audio/wav" });
                setAudioBlob(blob);
                const url = URL.createObjectURL(blob);
                setAudioUrl(url);
                setAudioChunks(chunks);
                stream.getTracks().forEach((track) => track.stop());
            };

            recorder.start();
            console.log("MediaRecorder started, state:", recorder.state);
            setMediaRecorder(recorder);
            mediaRecorderRef.current = recorder; // Store in ref for reliable access
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
        const currentRecorder = mediaRecorderRef.current;
        console.log("stopRecording called", {
            mediaRecorder: !!currentRecorder,
            mediaRecorderState: currentRecorder?.state,
            isRecording,
            isAutoRecording,
        });
        if (currentRecorder && currentRecorder.state === "recording") {
            console.log("Stopping media recorder");
            currentRecorder.stop();
            setIsRecording(false);
            setIsPaused(false);
            mediaRecorderRef.current = null; // Clear the ref
        } else {
            console.log(
                "Cannot stop recording - mediaRecorder state:",
                currentRecorder?.state,
                "isRecording:",
                isRecording
            );
        }
    };

    const pauseRecording = () => {
        const currentRecorder = mediaRecorderRef.current;
        if (currentRecorder && isRecording && !isPaused) {
            currentRecorder.pause();
            setIsPaused(true);
        }
    };

    const resumeRecording = () => {
        const currentRecorder = mediaRecorderRef.current;
        if (currentRecorder && isRecording && isPaused) {
            currentRecorder.resume();
            setIsPaused(false);
        }
    };

    const clearRecording = () => {
        setAudioBlob(null);
        setAudioUrl(null);
        setRecordingTime(0);
        setAudioChunks([]);
        mediaRecorderRef.current = null; // Clear the ref
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

    // Session Management Functions
    const createSession = async () => {
        if (!sessionName.trim()) {
            alert("Please enter a session name!");
            return;
        }

        if (!sessionStartTime) {
            alert("Please set a start time!");
            return;
        }

        try {
            // Convert time-only input to full datetime (today + selected time)
            const today = new Date();
            const [hours, minutes] = sessionStartTime.split(":");
            const sessionDateTime = new Date(today);
            sessionDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);


            const sessionIdFromName = makeSessionId(sessionName);

            const sessionRef = doc(db, "sessions", sessionIdFromName);

            // Check if a session with the same ID/name already exists
            const existing = await getDoc(sessionRef);
            if (existing.exists()) {
                alert("A session with this name already exists. Choose a different name.");
                return;
            }

            // Request creator's location and microphone permission
            let creatorLocation = null;
            try {
                creatorLocation = await requestLocationAndMic();
            } catch (err) {
                alert("Please allow location access to create a session.");
                return;
            }
            // set global location so Save to DB area can use it
            setLocation({
                latitude: creatorLocation.latitude,
                longitude: creatorLocation.longitude,
                accuracy: creatorLocation.accuracy,
                timestamp: new Date(creatorLocation.timestamp).toLocaleString(),
            });

            const sessionData = {
                name: sessionName.trim(),
                startTime: sessionDateTime.toISOString(),
                createdAt: serverTimestamp(),
                createdBy: username.trim() || "Anonymous",
                participants: [
                    {
                        username: username.trim() || "Anonymous",
                        deviceName: editableName.trim() || deviceInfo.name,
                        joinedAt: new Date().toISOString(),
                        isActive: true,
                        location: creatorLocation,
                    },
                ],
                status: "active",
                recordings: [],
            };

            // Use setDoc to create the document with the session name as ID
            await setDoc(sessionRef, sessionData);

            setCurrentSession(sessionIdFromName);
            setSessionId(sessionIdFromName);
            setIsInSession(true);
            setAutoRecordingCompleted(false); // Reset auto-recording completion flag for new session

            // Start listening to session updates
            listenToSession(sessionIdFromName);

            // Automatically get location when creating session
            if (!location) {
                getCurrentLocation();
            }

            alert(
                `Session "${sessionName}" created successfully! Session ID/Name: ${sessionIdFromName}`
            );
        } catch (error) {
            console.error("Error creating session:", error);
            alert("Failed to create session. Please try again.");
        }
    };

    const joinSession = async () => {
        if (!sessionId.trim()) {
            alert("Please enter a session ID!");
            return;
        }

        try {
            // treat the entered sessionId as a session name; convert to slug
            const sessionIdFromName = makeSessionId(sessionId.trim());
            const sessionRef = doc(db, "sessions", sessionIdFromName);

            const sessionDoc = await getDoc(sessionRef);
            if (!sessionDoc.exists()) {
                alert("Session not found! Please check the session name.");
                return;
            }

            // Prevent joining if session start time has already passed
            const sessionStart = sessionDoc.data().startTime;
            if (sessionStart) {
                const startDate = new Date(sessionStart);
                if (new Date().getTime() >= startDate.getTime()) {
                    alert('Cannot join: session has already started or completed.');
                    return;
                }
            }

            // Request participant's location and microphone permission
            let participantLocation = null;
            try {
                participantLocation = await requestLocationAndMic();
            } catch (err) {
                alert("Please allow location access to join the session.");
                return;
            }

            // set global location state
            setLocation({
                latitude: participantLocation.latitude,
                longitude: participantLocation.longitude,
                accuracy: participantLocation.accuracy,
                timestamp: new Date(participantLocation.timestamp).toLocaleString(),
            });

            // Add participant to session (read-modify-write)
            const participantData = {
                username: username.trim() || "Anonymous",
                deviceName: editableName.trim() || deviceInfo.name,
                joinedAt: new Date().toISOString(),
                isActive: true,
                location: participantLocation,
            };

            const currentParticipants = sessionDoc.data().participants || [];
            await updateDoc(sessionRef, {
                participants: [...currentParticipants, participantData],
            });

            setCurrentSession(sessionIdFromName);
            setIsInSession(true);
            setAutoRecordingCompleted(false); // Reset auto-recording completion flag for joined session

            // Start listening to session updates
            listenToSession(sessionIdFromName);

            // Automatically get location when joining session
            if (!location) {
                getCurrentLocation();
            }

            alert(`Successfully joined session!`);
        } catch (error) {
            console.error("Error joining session:", error);
            alert("Failed to join session. Please try again.");
        }
    };

    const leaveSession = async () => {
        if (!currentSession) return;

        try {
            const sessionRef = doc(db, "sessions", currentSession);
            const sessionSnapshot = await getDoc(sessionRef);

            if (sessionSnapshot.exists()) {
                const currentParticipants = sessionSnapshot.data().participants || [];
                const updatedParticipants = currentParticipants.map((p) =>
                    p.username === (username.trim() || "Anonymous")
                        ? { ...p, isActive: false }
                        : p
                );

                await updateDoc(sessionRef, {
                    participants: updatedParticipants,
                });
            }

            setCurrentSession(null);
            setSessionId("");
            setIsInSession(false);
            setAutoRecordCountdown(0);
            setIsAutoRecording(false);
            setAutoRecordingTime(0);
            setAutoRecordingTriggered(false);
            setAutoRecordingCompleted(false); // Reset auto-recording completion flag

            // Clear any existing countdown interval
            if (countdownIntervalId) {
                clearInterval(countdownIntervalId);
                setCountdownIntervalId(null);
            }

            // Clear any existing recording interval
            if (recordingIntervalId) {
                clearInterval(recordingIntervalId);
                setRecordingIntervalId(null);
            }

            alert("Left session successfully!");
        } catch (error) {
            console.error("Error leaving session:", error);
            alert("Failed to leave session.");
        }
    };

    const listenToSession = (sessionId) => {
        const sessionRef = doc(db, "sessions", sessionId);

        const unsubscribe = onSnapshot(sessionRef, (doc) => {
            if (doc.exists()) {
                const sessionData = doc.data();
                setSessionParticipants(sessionData.participants || []);
                setSessionRecordings(sessionData.recordings || []);
                setSessionStartTimeData(sessionData.startTime);

                // Check if it's time to start auto-recording (only if not already recording or counting down)
                if (
                    !isAutoRecording &&
                    autoRecordCountdown === 0 &&
                    !autoRecordingCompleted
                ) {
                    checkAutoRecordTime(sessionData.startTime);
                }
            }
        });

        return unsubscribe;
    };

    const checkAutoRecordTime = (startTime) => {
        if (!startTime || autoRecordingCompleted) return;

        const now = new Date();
        const scheduledTime = new Date(startTime);
        const timeDiff = scheduledTime.getTime() - now.getTime();

        console.log("Time check:", {
            now: now.toLocaleTimeString(),
            scheduled: scheduledTime.toLocaleTimeString(),
            timeDiff: timeDiff,
            timeDiffSeconds: Math.ceil(timeDiff / 1000),
            autoRecordingCompleted: autoRecordingCompleted,
        });

        if (timeDiff > 0 && timeDiff <= 30000) {
            // Within 30 seconds - only start countdown if not already running
            if (!countdownIntervalId) {
                setAutoRecordCountdown(Math.ceil(timeDiff / 1000));

                // Start countdown
                const intervalId = setInterval(() => {
                    setAutoRecordCountdown((prev) => {
                        if (prev <= 1) {
                            clearInterval(intervalId);
                            setCountdownIntervalId(null);
                            if (!autoRecordingTriggered) {
                                setAutoRecordingTriggered(true);
                                startAutoRecording();
                            }
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);

                setCountdownIntervalId(intervalId);
            }
        } else if (timeDiff <= 0) {
            // Time has passed, start recording immediately
            console.log(
                "Scheduled time has passed, starting recording immediately"
            );
            // Clear any existing countdown
            if (countdownIntervalId) {
                clearInterval(countdownIntervalId);
                setCountdownIntervalId(null);
            }
            if (!autoRecordingTriggered) {
                setAutoRecordingTriggered(true);
                startAutoRecording();
            }
        } else {
            // More than 30 seconds away, clear countdown and interval
            if (countdownIntervalId) {
                clearInterval(countdownIntervalId);
                setCountdownIntervalId(null);
            }
            setAutoRecordCountdown(0);
        }
    };

    const startAutoRecording = async () => {
        if (isAutoRecording || autoRecordingTriggered) return;

        setAutoRecordingTriggered(true);
        setIsAutoRecording(true);
        setAutoRecordingTime(15);
        await startRecording();

        // Start countdown timer for auto-recording (only if not already running)
        if (!recordingIntervalId) {
            console.log("Starting auto-recording timer for 15 seconds");
            const intervalId = setInterval(() => {
                setAutoRecordingTime((prev) => {
                    console.log("Auto-recording timer tick:", prev);
                    if (prev <= 1) {
                        console.log(
                            "Auto-recording timer reached 0, stopping recording"
                        );
                        clearInterval(intervalId);
                        setRecordingIntervalId(null);
                        // Always call stopRecording when timer reaches 0
                        stopRecording();
                        setIsAutoRecording(false);
                        setAutoRecordingTime(0);
                        setAutoRecordingTriggered(false);
                        setAutoRecordingCompleted(true); // Mark auto-recording as completed

                        // Upload the recording to session after a short delay to ensure recording is processed
                        setTimeout(() => {
                            uploadSessionRecording();
                        }, 500);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            setRecordingIntervalId(intervalId);
        }
    };

    const uploadSessionRecording = async () => {
        if (!audioBlob || !currentSession) return;

        try {
            const timestamp = new Date().toISOString();
            const fileName = `session_${currentSession}_${username}_${timestamp}.wav`;
            const audioRef = ref(storage, `sessions/${fileName}`);

            await uploadBytes(audioRef, audioBlob);
            const audioUrl = await getDownloadURL(audioRef);

            // Add recording to session
            const sessionRef = doc(db, "sessions", currentSession);
            const sessionSnapshot = await getDoc(sessionRef);

            if (sessionSnapshot.exists()) {
                const currentRecordings = sessionSnapshot.data().recordings || [];
                const newRecording = {
                    username: username.trim() || "Anonymous",
                    deviceName: editableName.trim() || deviceInfo.name,
                    audioUrl: audioUrl,
                    timestamp: new Date().toISOString(),
                    duration: 15,
                };

                await updateDoc(sessionRef, {
                    recordings: [...currentRecordings, newRecording],
                });
            }

            alert("Recording uploaded to session successfully!");
        } catch (error) {
            console.error("Error uploading session recording:", error);
            alert("Failed to upload recording to session.");
        }
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

                // Create filename using lat/lon with 3 decimal places (truncated, not rounded)
                const latStr = Math.trunc(location.latitude * 1000) / 1000;
                const lonStr = Math.trunc(location.longitude * 1000) / 1000;
                const latStrFormatted = latStr.toString().replace(".", "p");
                const lonStrFormatted = lonStr.toString().replace(".", "p");
                const audioFileName = `audio_${username.trim()}_${latStrFormatted}_${lonStrFormatted}.wav`;
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
                {/* Get Location button removed; location is requested during Create/Join flows */}

                {/* Inline clock placed below Get Location button */}
                <div className="app-clock" aria-hidden="true">
                    <div className="clock-badge">
                        <span>🕒</span>
                        <span className="clock-time">{currentTime.toLocaleTimeString()}</span>
                    </div>
                </div>

                {/* Session Management Section */}
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
                                    <label htmlFor="creator-username">Your Username:</label>
                                    <input
                                        type="text"
                                        id="creator-username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Enter your username"
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="session-start-time">
                                        Start Time (24-hour format):
                                    </label>
                                    <input
                                        type="time"
                                        id="session-start-time"
                                        value={
                                            sessionStartTime ||
                                            getCurrentTimePlusFive()
                                        }
                                        onChange={(e) =>
                                            setSessionStartTime(e.target.value)
                                        }
                                        placeholder={getCurrentTimePlusFive()}
                                        className="form-input"
                                    />
                                    <small className="time-hint">
                                        Default: {getCurrentTimePlusFive()}{" "}
                                        (current time + 5 min)
                                    </small>
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
                                        placeholder="Enter session name"
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="join-username">Your Username:</label>
                                    <input
                                        type="text"
                                        id="join-username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        placeholder="Enter your username"
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
                                    <strong>Session Name / ID:</strong>{" "}
                                    {currentSession}
                                </p>
                                <p>
                                    <strong>Participants:</strong>{" "}
                                    {
                                        sessionParticipants.filter(
                                            (p) => p.isActive
                                        ).length
                                    }
                                </p>
                                {/* Current time removed per request */}
                                <p>
                                    <strong>Scheduled Time:</strong>{" "}
                                    {sessionStartTimeData
                                        ? new Date(
                                              sessionStartTimeData
                                          ).toLocaleTimeString()
                                        : "Loading..."}
                                </p>

                                {autoRecordingCompleted ? (
                                    <div className="session-completed">
                                        <h4>✅ Session Completed</h4>
                                        <p>The scheduled recording has finished. You can schedule a new session to record again.</p>
                                    </div>
                                ) : (
                                    <>
                                        {autoRecordCountdown > 0 && (
                                            <div className="countdown">
                                                <h4>
                                                    ⏰ Auto-Recording in: {autoRecordCountdown}s
                                                </h4>
                                            </div>
                                        )}

                                        {autoRecordCountdown === 0 &&
                                            sessionStartTimeData &&
                                            !isAutoRecording && (
                                                <div className="waiting-status">
                                                    <h4>
                                                        ⏳ Waiting for recording time...
                                                    </h4>
                                                    <p>
                                                        Countdown will start 30 seconds
                                                        before scheduled time
                                                    </p>
                                                </div>
                                            )}
                                    </>
                                )}

                                {isAutoRecording && (
                                    <div className="auto-recording">
                                        <h4>
                                            🎤 Auto-Recording... (
                                            {autoRecordingTime}s remaining)
                                        </h4>
                                    </div>
                                )}
                            </div>

                            <div className="participants-list">
                                <h4>👥 Participants</h4>
                                {sessionParticipants.map((participant, index) => (
                                    <div
                                        key={index}
                                        className={`participant ${participant.isActive ? "active" : "inactive"}`}
                                    >
                                        <div className="participant-main">
                                            <strong>{participant.username}</strong>
                                            <span className="device-name">({participant.deviceName})</span>
                                        </div>
                                        {participant.location && (
                                            <div className="participant-location">
                                                <small>
                                                    {participant.location.latitude.toFixed(6)}, {participant.location.longitude.toFixed(6)}
                                                </small>
                                                <small> • joined at {new Date(participant.joinedAt).toLocaleTimeString()}</small>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Session recordings list removed per request */}

                            <button
                                className="session-btn leave"
                                onClick={leaveSession}
                            >
                                🚪 Leave Session
                            </button>
                        </div>
                    )}
                </div>

                {/* Audio recording UI removed; playback is now displayed with location before saving */}

                {error && (
                    <div className="error-message">
                        <h3>❌ Error</h3>
                        <p>{error}</p>
                    </div>
                )}

                {location && (
                    <div className="location-info">
                        {(location.latitude && location.longitude && location.accuracy && location.timestamp && audioBlob) ? (
                            <h3>Data Collected:</h3>
                        ) : null}
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

                        <>
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

                            <button
                                className="save-btn"
                                onClick={saveToDatabase}
                                disabled={saving}
                            >
                                {saving ? "Saving..." : audioBlob ? "💾 Save Location & Audio" : "💾 Save/Update Location"}
                            </button>
                            {saveMessage && (
                                <div className={`save-message ${saveMessage.includes("✅") ? "success" : "error"}`}>
                                    {saveMessage}
                                </div>
                            )}
                        </>
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
