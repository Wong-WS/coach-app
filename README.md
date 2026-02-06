# CoachApp

A multi-tenant scheduling SaaS for coaches. Manage availability, locations, and bookings - share a public page with clients.

## Features

- **Coach Dashboard**: Manage your schedule, locations, and bookings
- **Multiple Locations**: Handle lessons at different venues with automatic travel buffer
- **Public Page**: Share your availability with clients via a unique URL
- **WhatsApp Integration**: Clients contact you directly via WhatsApp
- **Smart Availability**: Automatically calculates available slots based on bookings and travel time

## Getting Started

### Prerequisites

- Node.js 18+
- A Firebase project with Firestore and Authentication enabled

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env.local` from the example:
   ```bash
   cp .env.local.example .env.local
   ```

4. Fill in your Firebase configuration in `.env.local`

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

### Firebase Setup

1. Create a new Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** with Email/Password provider
3. Enable **Firestore Database**
4. Deploy security rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

## Deployment

This app is designed to be deployed on Vercel:

1. Connect your GitHub repository to Vercel
2. Add your environment variables in Vercel dashboard
3. Deploy!

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Hosting**: Vercel

## License

MIT
