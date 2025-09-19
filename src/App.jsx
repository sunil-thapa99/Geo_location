import { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

function App() {
    const [location, setLocation] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [deviceInfo, setDeviceInfo] = useState({ name: "" });
    const [editableName, setEditableName] = useState("");
    const [username, setUsername] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState("");

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
            const locationData = {
                username: username.trim(),
                name: editableName.trim() || deviceInfo.name,
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy,
                timestamp: location.timestamp,
                savedAt: new Date().toISOString(),
            };

            // Check if location with this username already exists
            const existingResponse = await axios.get(
                `http://localhost:3001/locations?username=${encodeURIComponent(
                    username.trim()
                )}`
            );

            if (existingResponse.data.length > 0) {
                // Update existing location
                const existingLocation = existingResponse.data[0];
                await axios.put(
                    `http://localhost:3001/locations/${existingLocation.id}`,
                    locationData
                );
                setSaveMessage("✅ Location updated successfully!");
            } else {
                // Create new location
                await axios.post(
                    `http://localhost:3001/locations`,
                    locationData
                );
                setSaveMessage("✅ Location saved successfully!");
            }
        } catch (error) {
            console.error("Error saving location:", error);
            console.error(
                "Error details:",
                error.response?.data || error.message
            );
            setSaveMessage(
                "❌ Failed to save location. Make sure the database server is running!"
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="app">
            <header className="app-header">
                <h1>📍 Location Finder</h1>
                <p>Get your current coordinates instantly</p>
            </header>

            <main className="main-content">
                <button
                    className="get-location-btn"
                    onClick={getCurrentLocation}
                    disabled={loading}
                >
                    {loading ? "Getting Location..." : "Get My Location"}
                </button>

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
