# ZipToURL

Upload a `.zip` file and get a shareable download link.

## Run on your PC

1. Double-click **`start.bat`**
2. Open **http://localhost:3847**

## Push code to GitHub

1. Install [Git for Windows](https://git-scm.com/download/win)
2. Double-click **`push-to-github.bat`**
3. Create a repo at [github.com/new](https://github.com/new) named `ziptourl`
4. In terminal (replace `YOUR_USER`):

```bash
git remote add origin https://github.com/YOUR_USER/ziptourl.git
git push -u origin main
```

## Why uploads fail on GitHub Pages

**GitHub Pages only serves HTML/CSS/JS.** It cannot run `server.js`, so `/api/upload` does not exist there.

To make uploads work online:

1. Push this repo to GitHub (steps above)
2. Deploy on [Render](https://dashboard.render.com) (free):
   - **New** → **Web Service** → connect repo **ziptourl**
   - Render reads `render.yaml` and runs `node server.js`
   - Use your `https://xxxx.onrender.com` URL

> **Note:** Free cloud hosts have disk and size limits. Very large files (100 GB) need a VPS or dedicated server with enough storage.
