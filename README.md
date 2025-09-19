# Geolocation App with Database

A React application that gets your current location and allows you to save coordinates to a database with name and ID.

## Features

-   📍 Get current GPS coordinates
-   📋 Copy coordinates to clipboard
-   🗺️ Open location in Google Maps
-   💾 Save/Update coordinates to database with name and ID
-   ✅ Success/Error feedback for database operations

## Database Schema

The application stores location data with the following structure:

```json
{
    "id": "unique-identifier",
    "name": "Location Name",
    "latitude": 40.7128,
    "longitude": -74.006,
    "accuracy": 10.5,
    "timestamp": "12/25/2023, 2:30:00 PM",
    "savedAt": "2023-12-25T19:30:00.000Z"
}
```

## Getting Started

### Prerequisites

-   Node.js (v18 or higher)
-   npm or yarn

### Installation

1. Install dependencies:

```bash
npm install
```

2. Start the database server:

```bash
npm run db
```

3. In a new terminal, start the development server:

```bash
npm run dev
```

Or run both simultaneously:

```bash
npm run dev:full
```

### Usage

1. Open your browser and go to `http://localhost:5173`
2. Click "Get My Location" to retrieve your current coordinates
3. Enter a name and unique ID for the location
4. Click "Save/Update to Database" to store the location
5. The app will automatically update existing locations if the ID already exists

### API Endpoints

The json-server provides the following REST API endpoints:

-   `GET /locations` - Get all saved locations
-   `GET /locations?id={id}` - Get location by ID
-   `POST /locations` - Create a new location
-   `PUT /locations/{id}` - Update an existing location
-   `DELETE /locations/{id}` - Delete a location

## Technologies Used

-   React 19
-   Vite
-   Axios (for API calls)
-   JSON Server (for local database)
-   CSS3 with modern styling

## Project Structure

```
src/
├── App.jsx          # Main application component
├── App.css          # Application styles
├── main.jsx         # Application entry point
└── index.css        # Global styles

db.json              # JSON database file
package.json         # Project dependencies and scripts
```

## Development

The application uses:

-   **Frontend**: React with Vite for fast development
-   **Backend**: JSON Server for REST API simulation
-   **Database**: JSON file-based storage

For production deployment, you would typically replace JSON Server with a real database like PostgreSQL, MongoDB, or Firebase.
