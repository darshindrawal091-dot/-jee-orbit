# JEE Orbit — starter app

A mobile-friendly installable web app (PWA) with:
- Custom countdown timer (hours, minutes, seconds)
- Accurate countdown after closing/reopening the app
- Local persistence
- Daily motivational quote and YouTube search shortcut
- Daily task checklist
- Optional Google sign-in + Firestore cloud sync

## Run it locally
This is a static web app using ES modules, so serve the folder over HTTP (not by double-clicking `index.html`).

For example, if Python is installed:
```bash
python -m http.server 8000
```
Then open `http://localhost:8000`.

## Turn on Google login and multi-device sync
1. Create a project at https://console.firebase.google.com/
2. Add a Web app in Project settings and copy its Firebase config.
3. In `app.js`, replace the four `PASTE_...` values in `firebaseConfig`.
4. In Firebase Console, open **Authentication → Sign-in method** and enable **Google**.
5. Open **Firestore Database** and create a database.
6. In **Authentication → Settings → Authorized domains**, add your deployed website domain (and `localhost` for local testing).

### Starter Firestore rules
Publish these rules in Firestore → Rules:
```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/appData/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
These rules keep each user's app data private to that signed-in account. Review security rules before production use.

## Deploy the website
Upload the contents of this folder to a static host that supports HTTPS, such as Firebase Hosting, Netlify, or GitHub Pages. For Firebase Hosting, follow https://firebase.google.com/docs/hosting.

## Install on Android
1. Open the deployed HTTPS website in Chrome on Android.
2. Open Chrome's menu (⋮).
3. Choose **Install app** or **Add to Home screen**.
4. Launch JEE Orbit from the home screen.

The PWA is the first Android-ready version. A Play Store APK/AAB would require a separate packaging and signing step (for example, with Capacitor).

## Important notes
- The countdown uses an end timestamp, so it remains accurate while the app is closed.
- Cross-device synchronization becomes active only after Firebase is configured and the user signs in.
- The motivation button opens a fresh YouTube search each day; it does not automatically select or verify a specific video.
- Browser notifications and background alarms are not included in this starter version.


## Added in the expanded dashboard
- Daily study streak and longest streak (mark a day as studied)
- Editable JEE Main and JEE Advanced target dates with countdowns
- Daily rotating YouTube motivation search
- These new fields are included in local/cloud app state

## Floating timer across other Android apps
The current PWA can keep accurate time and show it while JEE Orbit is open, but browsers do not let a website draw a floating overlay above YouTube or other apps. That feature needs a native Android app (or Android wrapper with a native overlay/foreground-service implementation), plus the user's explicit Android overlay permission. It is not included in this web starter.


## V3 additions
- Weekly Monday-to-Sunday study progress appears under the home-screen streak card.
- Optional 2-hour study check-in notifications can be enabled from the timer panel. They run while the app page is active and the focus timer is running; a two-hour timer also sends a check-in when it completes.

## Notification and Android limitations
A browser/PWA cannot guarantee exact recurring notifications after Android suspends or closes the page. For reliable reminders while the app is fully closed, and for a floating timer over other apps, a native Android app with Android scheduling/overlay permissions is required. The floating overlay is not part of this web V3 build.
