# Firebase Authentication for HuddleAI

This document outlines how Firebase Authentication is implemented in the HuddleAI application.

## Setup

1. **Firebase Configuration**: 
   - Firebase is initialized in `src/lib/firebase.ts`
   - The application uses environment variables to store Firebase configuration values

2. **Environment Variables**:
   - Create a `.env` file in the root directory with the following variables:
   ```
   VITE_FIREBASE_API_KEY=your-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id
   ```

3. **Firebase Console Setup**:
   - Create a project in the [Firebase Console](https://console.firebase.google.com/)
   - Go to "Authentication" and enable Email/Password authentication
   - Copy the configuration values from "Project Settings" > "Your apps" section

## Authentication Context

The application uses a React Context to manage authentication state:

- `src/lib/AuthContext.tsx`: Provides the authentication context and provider
- `src/hooks/useAuth.ts`: Contains the hooks for interacting with Firebase Authentication

## Features

### 1. User Registration
- `/signup` route handled by `src/pages/Signup.tsx`
- Creates a new user with email and password
- Updates user profile with display name

### 2. User Login
- `/login` route handled by `src/pages/Login.tsx`
- Authenticates users with email and password

### 3. Password Reset
- `/forgot-password` route handled by `src/pages/ForgotPassword.tsx`
- Sends password reset emails to users

### 4. Profile Management
- `/profile` route handled by `src/pages/Profile.tsx`
- Displays user information
- Allows users to update their profile

### 5. Protected Routes
- Routes requiring authentication are wrapped with the `ProtectedRoute` component
- Unauthenticated users are redirected to the login page

### 6. Authentication State
- Firebase auth state changes are monitored to keep the application in sync
- The `currentUser` object contains user information when authenticated

## Components

1. **AuthProvider**: Wraps the application to provide authentication context
2. **LogoutButton**: Handles user logout functionality
3. **UserProfile**: Displays and manages user profile information
4. **ProtectedRoute**: Guards routes that require authentication

## Usage

To use authentication in components:

```tsx
import { useAuth } from '@/hooks/useAuth';

function MyComponent() {
  const { currentUser, login, logout } = useAuth();
  
  if (currentUser) {
    return <div>Hello, {currentUser.displayName}!</div>;
  }
  
  return <div>Please log in</div>;
}
```

## Firebase Methods

The application exposes these Firebase auth methods:

1. `signUp(email, password)`: Register a new user
2. `login(email, password)`: Sign in an existing user
3. `logout()`: Sign out the current user
4. `resetPassword(email)`: Send a password reset email
5. `updateUserProfile(displayName, photoURL)`: Update user profile information 