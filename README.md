# 📍 Location Finder

A modern React application built with Vite that helps you get your current location coordinates instantly.

## Features

-   **Real-time Location**: Get your current latitude and longitude coordinates
-   **High Accuracy**: Uses GPS for precise location data
-   **Copy to Clipboard**: Easy copying of coordinates
-   **Google Maps Integration**: Open your location directly in Google Maps
-   **Error Handling**: Comprehensive error messages for various scenarios
-   **Responsive Design**: Works perfectly on desktop and mobile devices
-   **Modern UI**: Beautiful gradient design with smooth animations

## Getting Started

### Prerequisites

-   Node.js (version 16 or higher)
-   npm or yarn

### Installation

1. Clone or download this project
2. Navigate to the project directory:

    ```bash
    cd geolocation-app
    ```

3. Install dependencies:

    ```bash
    npm install
    ```

4. Start the development server:

    ```bash
    npm run dev
    ```

5. Open your browser and visit the URL shown in the terminal (usually `http://localhost:5173`)

## How to Use

1. **Click "Get My Location"** - The app will request permission to access your location
2. **Allow Location Access** - Grant permission when prompted by your browser
3. **View Your Coordinates** - Your latitude, longitude, accuracy, and timestamp will be displayed
4. **Copy Coordinates** - Use the copy buttons to copy individual coordinates or the full coordinate pair
5. **Open in Maps** - Click "Open in Google Maps" to view your location on a map

## Browser Permissions

The app requires location permission to work. When you click "Get My Location":

-   **Chrome/Edge**: You'll see a location permission popup
-   **Firefox**: A notification will appear asking for location access
-   **Safari**: A permission dialog will show up

## Error Handling

The app handles various error scenarios:

-   **Permission Denied**: When you deny location access
-   **Location Unavailable**: When GPS/location services are disabled
-   **Timeout**: When location request takes too long
-   **Unsupported Browser**: When the browser doesn't support geolocation

## Technical Details

-   **Framework**: React 18 with hooks
-   **Build Tool**: Vite
-   **Styling**: CSS3 with modern features (gradients, animations, flexbox)
-   **Geolocation API**: Browser's native Geolocation API
-   **Responsive**: Mobile-first design with breakpoints

## Browser Support

-   Chrome 5+
-   Firefox 3.5+
-   Safari 5+
-   Edge 12+
-   Mobile browsers (iOS Safari, Chrome Mobile, etc.)

## Privacy

-   **No Data Storage**: Your location data is never stored or sent to any servers
-   **Client-Side Only**: All processing happens in your browser
-   **No Tracking**: No analytics or tracking scripts included

## Development

### Available Scripts

-   `npm run dev` - Start development server
-   `npm run build` - Build for production
-   `npm run preview` - Preview production build
-   `npm run lint` - Run ESLint

### Project Structure

```
src/
├── App.jsx          # Main application component
├── App.css          # Application styles
├── index.css        # Global styles
└── main.jsx         # Application entry point
```

## License

This project is open source and available under the MIT License.

---

Built with ❤️ using React and Vite
