# Shelly

Private chat, voice and video calls with the people you invite, with a calypso feel. By BajanBob.

- **Peer to peer:** messages and calls go straight from one phone to the other.
- **AES-256-GCM end-to-end:** every chat message, and every audio and video frame, is encrypted with AES-256-GCM.
- **Hybrid post-quantum handshake:** each session agrees fresh keys with **ECDH P-384** (192-bit) plus **ML-KEM-768** (NIST FIPS 203) in both directions.
  - These are combined with the invite's 256-bit secret using HKDF-SHA-384, and bound to the whole handshake.
  - An attacker would have to break P-384, ML-KEM-768 *and* steal the invite secret.
  - Older handshakes without the post-quantum part are refused.
- **Safety code:** the call screen stays clean - the encryption badge and safety code are hidden by default. **Tap the caller's name at the top of a call** to reveal the "AES-256 end-to-end" badge and the safety code, so both people can check that nobody is in the middle; tap again to hide them.
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
- **Two modes, clearly chosen:** a picker on the home screen switches between **1-to-1** (private chats, up to **4 contacts**) and **Family** (Shelly Ultra).
- **Invites:** scan a QR code, or paste a 256-bit passcode. Each invite works once.
  - **Phone-locked invites:** tap **🔒 Invite one specific phone**, paste the device code the person sends you, and the invite you get back **only opens on that one phone** - forward it anywhere else and it won't decrypt. (Phones don't let any app read IMEI/IMSI, so Shelly binds to a device key kept on the phone instead - harder to spoof than IMEI.) Each phone shows its own code under **Show my device code**.
- **In-app alerts:** a tappable banner shows new messages and calls while Shelly is open on another screen.
- **Incoming calls** ring right away with Accept/Decline; the secure line is set up the moment you answer.
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
| `android/` | Ringtones (message, voice, video, SOS) and notification icon for the Android app |
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

## Shelly Ultra (family mode)

Turn it on in **Settings → Shelly Ultra**. Everything stays end-to-end encrypted.

- **Family contacts:**
  - Open a chat and tap **☆ Add to family**.
  - Family stay saved (encrypted) and survive the 3-hour erase and the 1 am clean-up. The 1 am clean-up then keeps your identity, family and family groups, and destroys chats, files and non-family contacts.
  - Chats with family are still destroyed after 3 hours.
- **Offline delivery:**
  - If a family member's Shelly is closed, your message waits on your relay until they open it.
  - It is sealed with AES-256 using your pair's 256-bit secret, so the relay can't read it, and it expires after 3 hours.
- **Family groups:**
  - The family circle holds up to **7** people. Adding an 8th automatically drops the longest-standing member to keep it at 7.
  - Tap **New family group**. Shelly introduces the members to each other securely, giving every pair a fresh 256-bit key.
  - Group chat, plus group calls (video up to 4 people, voice up to 6). Every link in a group call is AES-256 end-to-end.
- **SOS:**
  - **Hold the red SOS button for 2 seconds.** Every family member gets a loud alarm, a full-screen alert and your location on a map, even if their Shelly is closed (with push set up).
  - Hold again within 30 minutes to cancel.
- **Go live to family (panic broadcast):** tap **🔴 Go live**. Your camera, microphone and location stream **one way** to your family, end-to-end encrypted. They can watch, listen and come help without having to answer.
  - **You** start it and **only you** can stop it. A "Hide screen" button disguises your phone while it keeps streaming; tap the time three times to bring the controls back.
  - Family can receive your broadcast; they can never switch it on from their end.
- **Family safe board (emergency check-in):** tap **🟢 Family safe board**.
  - In a declared disaster, national emergency or lockdown, anyone in the family can **Declare a family emergency** (name it - Hurricane, Lockdown, Flood). Everyone is alerted to check in.
  - Each member taps **🟢 I'm safe** or **🔴 I need help** and can add a **landmark** they type (e.g. "by the gas station, Oistins") and, **only if they allow it**, their location - shown with a free OpenStreetMap link so family can find them.
  - **Location, two ways:** if you allow GPS, the pin is precise. If GPS is off, denied or fails, Shelly uses a **free approximate area from your own internet connection** - worked out by your own relay from the connection's IP address (Cloudflare's built-in edge geo), so **no third-party service** is contacted and your IP isn't exposed to anyone new. It's city-level only and clearly marked "approx. area".
  - **Free offline map:** the board shows an embedded **OpenStreetMap** map with a coloured pin for each family member (green safe, red needs help). It's free and built into Shelly - the map library is bundled in the app, not loaded from the internet. Map tiles you've viewed are cached, so an area still shows **when the network is down**. Tap **⬇ Save map for offline** to pre-download the area around your family before a storm. (Map tiles come from OpenStreetMap's free tile service; a family's use is well within its fair-use limits.)
  - The board shows every family member's status, landmark, note, time and map pin, and how many have checked in. A "needs help" check-in rings the family like an SOS.
  - It is **family-only and consent-based**: a location is shared only when you tap to share it, once, with that check-in - there is no continuous tracking. Everything is end-to-end encrypted and erased after 3 hours like the rest of Shelly. Anyone in the family can end the emergency.
- **Live location:** in a chat, tap **📍 Share location** for 15 minutes, 1 hour or 3 hours.
- **Reactions and replies:** tap any message for ❤️ 👍 😂 😮 🙏, or **↩ Reply**.
- **Read receipts:** shows "Seen". You can turn it off, which hides yours and theirs.
- **Protected-phone badge:** 🛡 means a contact uses the Shelly Android app, where screenshots are blocked; ⚠ means they use the browser version, where screenshots are possible. **Protected phones only** (a setting) stops Shelly sending view-only photos, videos or voice notes to a ⚠ contact.
- **HD voice:** calls use Opus at 64 kbps, full-band 48 kHz, with lost-packet repair - richer and clearer. Hurricane mode drops to 20 kbps voice-only to save data.
- **Simple mode:** bigger text and buttons, for older relatives.
- **Hurricane mode:** voice-only calls, low-bitrate audio, and smaller photos and voice notes to save data when networks struggle.

### Extra relay step for Ultra (offline delivery)
1. In Cloudflare, go to **Storage & Databases → KV → Create**, and name it `shelly-box`.
2. Open your worker: **Settings → Bindings → Add → KV namespace**.
   - Variable name: `BOX`
   - Namespace: `shelly-box`
   
   Then click **Deploy**.
3. Paste the new `relay/worker.js` into the worker and click **Deploy**.

Cloudflare's free plan allows 1,000 stored messages a day, which is plenty for a family. A message is only stored when the other person is offline.

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
