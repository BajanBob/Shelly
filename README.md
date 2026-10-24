# Shelly

Private chat, voice and video calls with the people you invite, with a calypso feel. By BajanBob.

- **Peer to peer:** messages and calls go straight from one phone to the other.
- **AES-256-GCM end-to-end:** every chat message, and every audio and video frame, is encrypted with AES-256-GCM.
- **Hybrid post-quantum handshake:** each session agrees fresh keys with **ECDH P-384** (192-bit) plus **ML-KEM-768** (NIST FIPS 203) in both directions.
  - These are combined with the invite's 256-bit secret using HKDF-SHA-384, and bound to the whole handshake.
  - An attacker would have to break P-384, ML-KEM-768 *and* steal the invite secret.
  - Older handshakes without the post-quantum part are refused.
- **Safety code:** shown on the call screen, so both people can check that nobody is in the middle.
- **Nothing lasts:**
  - Chats and call records are destroyed **3 hours** after they're sent.
  - Contacts are erased **3 hours** after they're added.
  - Invites expire after 3 hours.
  - **Every night at 1 am**, Shelly destroys all its data, keys and its own ID, and starts over with a new identity. If Shelly was closed at 1 am, this happens the moment it opens. A call in progress is never cut off.
  - While stored, everything is encrypted with AES-256-GCM, using a key the browser keeps locked.
- **Files and voice notes:** photos, videos, documents (up to 25 MB) and voice notes (up to 5 minutes).
  - They go phone to phone in AES-256-sealed pieces, are stored encrypted, and are destroyed with the chat.
  - **The sender decides** whether the receiver can only view it inside Shelly or may save it to their phone.
  - Documents are always "can save", because they can't be opened without saving.
- **No copying of chats.** The Android app also blocks screenshots and screen recording (Android's secure-screen flag, FLAG_SECURE).
- **Invites:** scan a QR code, or paste a 256-bit passcode. Each invite works once.
- **Push notifications:** Shelly rings and alerts you while it is closed. Notifications never contain message text.
- **Three steel-pan tones** for messages, voice calls and video calls.
- **Colour themes:** Calypso, Sunset, Reef, Carnival and Palm.
- **Chat wallpapers and quick replies.**

## What's in this repository

| File | What it is |
|---|---|
| `index.html` | The whole Shelly app |
| `sw.js`, `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png` | Make Shelly installable and able to receive notifications |
| `config.json` | The address of your push relay (filled in at step 3) |
| `relay/worker.js` | The push relay; paste it into Cloudflare (step 3) |
| `android/` | Ringtones and notification icon for the Android app |
| `.github/workflows/build-apk.yml` | Builds the Android app (Shelly.apk) automatically |

## Setup

### 1. Website (GitHub Pages)
1. Go to **Settings → Pages → Deploy from a branch**.
2. Choose **main** and **/ (root)**, then click **Save**.

Shelly is then at **https://bajanbob.github.io/Shelly/**.

### 2. Install it as an app
- **Android (Chrome):** open the link, then use the menu **⋮ → Install app**.
- **iPhone (Safari):** tap **Share → Add to Home Screen**, then open Shelly from the Home Screen icon.

### 3. Push relay (free Cloudflare Worker): makes phones ring when Shelly is closed
1. Create a free account at **dash.cloudflare.com**.
2. Go to **Workers & Pages → Create → Create Worker**. Name it `shelly-relay`, then click **Deploy**.
3. Click **Edit code**, delete what's there, paste all of `relay/worker.js`, and click **Deploy**.
4. Open `https://shelly-relay.YOUR-NAME.workers.dev/new-keys` and copy the long line it shows.
5. Go to **Worker → Settings → Variables and Secrets → Add**:
   - Type: **Secret**
   - Name: `VAPID_PRIVATE`
   - Value: the line you copied
   
   Then click **Deploy**.
6. In this repo, edit `config.json` and set `"relay": "https://shelly-relay.YOUR-NAME.workers.dev"`. Commit the change.
7. In Shelly, tap **Turn on** to allow notifications.

### 4. Firebase (only needed for push in the Android app)
1. Go to **console.firebase.google.com → Add project** and name it `Shelly`. Analytics can be off.
2. Click **Add app → Android**:
   - package name `bb.shelly.app` → **Register**;
   - download **google-services.json**.
3. In this GitHub repo, go to **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `GOOGLE_SERVICES_JSON`
   - Value: the whole contents of google-services.json
4. In Firebase, go to **Project settings → Service accounts → Generate new private key**. Open the file it downloads.
5. In Cloudflare, add another **Secret** to the worker:
   - Name: `FCM_SERVICE_ACCOUNT`
   - Value: the whole contents of that file
   
   Then click **Deploy**.

### 5. Android app (Shelly.apk)
1. Go to **Actions → Build Shelly Android app → Run workflow**. It also runs on every upload.
2. When it finishes with a green tick, open the run and download **Shelly-android**. It contains **Shelly.apk**.
3. **First build only:** the download also contains `NEW-SIGNING-KEY.txt`. Add its long line as a repository secret named `SHELLY_KEYSTORE`, so that later versions install over this one.
4. Send Shelly.apk to your contacts. On the phone, open it and allow "install unknown apps" when asked.

## Stingrays and Pegasus: what Shelly can and can't do

- **Stingrays (fake cell towers):**
  - They can see *that* and *where* a phone is used. They can't read or listen to Shelly, because everything is end-to-end encrypted.
  - Turn off **Allow 2G** on Android, and prefer trusted Wi-Fi.
  - **Always use the relay** (Settings) also hides your internet address from contacts.
- **Pegasus-type spyware:**
  - It takes over the *phone itself*, so it can read the screen and microphone before any app encrypts anything. No app can stop that.
  - Shelly limits what spyware or tampering can grab: messages are destroyed after 3 hours, stored data is encrypted, and copying is blocked.
  - A strict security policy stops injected code from running or sending data out.
  - The Android app blocks screenshots and screen recording, and carries all of its own code instead of loading any from the internet.
  - Protect the phone itself: install updates promptly, restart daily, use Lockdown Mode on iPhone or Advanced Protection on Android, and don't open unknown links. The in-app **Security checklist** covers this.

## Limits

- **Both phones must be online for anything to arrive.**
  - Push notifications wake the other phone; when it opens, the call or message comes through.
  - The sender's Shelly must still be open at that moment, because nothing is stored on a server.
- **Screenshot blocking only works in the Android app.**
  - Browsers and iPhone don't allow apps to block screenshots.
  - Nothing can stop someone photographing the screen with another phone.
- **Some mobile networks block direct connections.** Add a TURN relay under **Settings** if calls won't connect.
- **Shelly hasn't had an independent security audit.**
