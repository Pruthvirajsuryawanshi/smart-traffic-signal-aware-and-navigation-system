# Traffic Signal Nav

A smart traffic signal monitoring and ambulance navigation system built with React, TypeScript, Vite, Tailwind CSS, and Supabase.

## Project overview

This application simulates and manages traffic signals for a mapped route network. It is designed to:

- monitor traffic signals in real time
- compute route signal behavior for ambulance paths
- import ambulance GPS routes from CSV
- trigger emergency green-light overrides with ESP32 integration
- manage signal configurations and intersection IPs via admin controls

## Key features

- **Live signal sync** from Supabase with computed cycle state
- **Ambulance route planning** using route signal detection
- **Signal override simulation** for approaching ambulances
- **Admin dashboard** for updating signal state and runtime
- **Settings panel** for signal metadata and device IP management

## Technology stack

- React + TypeScript
- Vite
- Tailwind CSS
- shadcn-ui / Radix UI
- Supabase
- React Router
- TanStack Query
- Leaflet / React-Leaflet

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Preview

Open the project preview at:

https://traffic-pulse-mapper.lovable.app

## Build and preview

```sh
npm run build
npm run preview
```

## Tests

```sh
npm test
npm run test:watch
```

## Repo structure

- `src/pages/Index.tsx` — main dashboard with route, signal, and ambulance tabs
- `src/hooks/useSignals.ts` — Supabase polling and runtime signal calculation
- `src/hooks/useAmbulanceSimulation.ts` — ambulance route simulation and override logic
- `src/components/` — UI panels, map integration, and dialogs
- `src/integrations/supabase/` — Supabase client and functions
- `src/lib/` — route and signal helper utilities
- `src/types/` — shared signal and route types

## Data and integration

Traffic signal state is synchronized from Supabase tables such as `traffic_signals` and `intersection_ips`. The UI refreshes signal data frequently and calculates intersection timing so the map and dashboard stay current.

### ESP32 integration

The app includes optional local network support to send `emergency` and `normal` commands to ESP32 devices at configured intersection IPs. This requires the app and ESP32 devices to be on the same network.

## Demo Video

Watch the working demo here:

https://youtube.com/shorts/TPqlkP2FtBA?feature=share

<!-- Embed-style clickable thumbnail -->
[![Watch Demo](https://img.youtube.com/vi/TPqlkP2FtBA/0.jpg)](https://youtube.com/shorts/TPqlkP2FtBA?feature=share)

## Notes

- The current UI title is **Traffic Signal Nav**.
- The app uses Supabase for signal persistence and runtime updates.
- Future improvements can include route editing, better signal matching, and stronger hardware integration.
