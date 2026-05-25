# Traffic Signal Nav

![Demo GIF](https://img.youtube.com/vi/TPqlkP2FtBA/0.jpg)

## Table of Contents
- [Project Overview](#project-overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Running the Application](#running-the-application)
- [User Controls & Interaction Guide](#user-controls--interaction-guide)
- [ESP32 Integration (Optional)](#esp32-integration-optional)
- [Building for Production](#building-for-production)
- [Testing](#testing)
- [Repository Structure](#repository-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Project Overview

**Traffic Signal Nav** is a sophisticated, real‑time traffic‑signal monitoring and ambulance‑navigation system. It enables emergency responders to see signal states, compute optimal routes, and, when needed, request a green‑light override at intersections via ESP32 devices.

---

## Key Features

- **Live Signal Sync** – Real‑time updates from Supabase with automatic cycle calculations.
- **Ambulance Route Planning** – Import GPS routes (CSV) and visualize signal behavior along the path.
- **Green‑Light Override** – Trigger emergency override commands to ESP32‑controlled intersections.
- **Admin Dashboard** – Manage signal metadata, intersection IPs, and runtime state.
- **Settings Panel** – Configure default signal timings, simulation speed, and hardware integration.

---

## Technology Stack

- **React** + **TypeScript**
- **Vite** – Fast development server and bundler.
- **Tailwind CSS** – Utility‑first styling with dark‑mode support.
- **shadcn‑ui / Radix UI** – Accessible component library.
- **Supabase** – Backend‑as‑a‑service for realtime data.
- **React Router** – Multi‑page navigation.
- **TanStack Query** – Data fetching & caching.
- **Leaflet / React‑Leaflet** – Interactive map visualisation.
- **ESP32 (optional)** – Hardware endpoint for emergency commands.

---

## Prerequisites

1. **Node.js** (v18+)
2. **npm** (comes with Node)
3. **Supabase** project with the required tables (`traffic_signals`, `intersection_ips`, etc.)
4. (Optional) **ESP32** devices on the same LAN if you plan to use hardware overrides.

---

## Installation & Setup

```bash
# Clone the repository
git clone https://github.com/Pruthvirajsuryawanshi/smart-traffic-signal-aware-and-navigation-system.git
cd smart-traffic-signal-aware-and-navigation-system

# Install dependencies
npm install
```

### Supabase Configuration
Create a `.env` file in the project root (you already have one) and add the following variables:

```dotenv
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

> **Tip** – You can retrieve these values from the Supabase dashboard under *Project Settings → API*.

---

## Running the Application

```bash
npm run dev
```
Open your browser at `http://localhost:5173`. The app will hot‑reload on source changes.

---

## User Controls & Interaction Guide

| Section | Control | Description |
|---------|---------|-------------|
| **Map** | **Pan / Zoom** | Drag to move; scroll wheel or pinch to zoom. |
| **Signal List** | **Toggle Visibility** | Click the eye icon to show/hide individual signals on the map. |
| **Ambulance Tab** | **Upload CSV** | Use the **Upload Route** button to import a CSV of GPS points (format: `lat,lon`). |
| **Simulation** | **Play / Pause** | Start the traffic‑signal simulation with the **▶** button; pause with **⏸**. |
| **Override** | **Emergency Green** | Select an intersection and click **Request Green** to send an `emergency` command to the ESP32 device. |
| **Admin Dashboard** | **Edit Signal** | Click the pencil icon on a signal row to modify its state or timing parameters. |
| **Settings** | **Theme Switch** | Toggle between Light and Dark mode for better visibility. |

### Step‑by‑Step Example
1. **Open the app** – Navigate to `http://localhost:5173`.
2. **View live signals** – The map displays all intersections with colour‑coded states (red = stop, green = go).
3. **Load an ambulance route** – Click **Ambulance** → **Upload Route** and select your CSV file.
4. **Observe signal interactions** – As the ambulance moves, the UI highlights signals it will encounter.
5. **Trigger an override** – Choose a red signal on the map, then press **Request Green**. The UI shows a confirmation and sends the command to the ESP32 (if configured).
6. **Adjust parameters** – Open **Settings** to change simulation speed or default signal timings.

---

## ESP32 Integration (Optional)

The frontend communicates with ESP32 devices via HTTP GET requests:
- `http://<INTERSECTION_IP>/emergency` – Switch to green for emergency vehicles.
- `http://<INTERSECTION_IP>/normal` – Revert to normal cycle.

Make sure each ESP32 runs the appropriate firmware and is reachable on the same LAN as the client machine.

---

## Building for Production

```bash
npm run build   # Generate static assets in `dist/`
npm run preview # Serve built assets locally for a final check
```
Deploy the contents of the `dist/` folder to any static‑hosting provider (e.g., Vercel, Netlify, Cloudflare Pages).

---

## Testing

```bash
npm test               # Run unit and integration tests
npm run test:watch     # Watch mode for continuous testing during development
```
The repository includes Playwright end‑to‑end tests located in `tests/`.

---

## Repository Structure

```
src/
  ├─ components/          # UI components, dialogs, panels
  ├─ hooks/               # Custom React hooks (signals, ambulance simulation)
  ├─ integrations/        # Supabase client & ESP32 helpers
  ├─ lib/                 # Utility functions (route, signal calculations)
  └─ pages/               # Router page components
public/                    # Static assets (icons, images)
.env.example               # Example environment file
README.md                  # You are reading it!
```

---

## Contributing

Contributions are welcome! Please fork the repo, create a feature branch, and open a pull request. Follow the existing code style (Prettier + ESLint) and ensure all tests pass before submitting.

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
