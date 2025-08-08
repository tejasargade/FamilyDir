# Family Contact Directory (LocalStorage)

A simple, mobile-friendly web app to manage your family contact directory. Works fully offline using localStorage with an optional shared passcode lock.

## Features
- Add / Edit / Delete members: Full Name, Mobile, Relation, Email (optional), Birthday (optional), Photo
- Grid card view with search by name or relation
- Profile photo via file upload or webcam capture
- Shared passcode lock (stored as SHA-256 hash in browser)
- Export JSON / CSV and Import JSON
- Mobile-friendly UI

## Quick Start
1. Serve the folder with any static server. Examples:
   - Python: `python3 -m http.server 5173` (then open http://localhost:5173)
   - Node (http-server): `npx http-server -p 5173` (then open http://localhost:5173)
2. First visit: set a shared family passcode. On future visits: unlock with the passcode.
3. Add members, search, export backups when needed.

No build step required.

## Files
- `index.html`: App UI
- `styles.css`: Styles
- `app.js`: Logic (localStorage, passcode, CRUD, webcam, export/import)

## Notes
- Passcode is a SHA-256 hash in localStorage; intended for casual protection, not strong security.
- To fully reset, click "Forgot/Reset" on the unlock screen (clears local data & passcode).
- Backend mode placeholders exist in Settings; you can extend with an API later (Node/Express + MongoDB).

## License
MIT