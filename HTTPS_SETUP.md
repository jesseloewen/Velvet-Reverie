# HTTPS Setup Guide

This guide explains how to enable HTTPS for Velvet Reverie, which is **required** for browser notifications to work on network devices.

## Why HTTPS?

Browser notifications only work in secure contexts:
- ✅ `https://` URLs (works everywhere)
- ✅ `http://localhost` (works on same machine only)
- ❌ `http://192.168.x.x` (blocked by browsers for security)

## Quick Setup (3 Steps)

### 1. Generate SSL Certificates

Run the certificate generator:
```powershell
python generate_cert.py
```

This creates `cert.pem` and `key.pem` files (valid for 1 year).

### 2. Enable SSL

Create a `.env` file (copy from `.env.example`):
```powershell
cp .env.example .env
```

Edit `.env` and set:
```env
ENABLE_SSL=True
```

### 3. Start the Server

```powershell
python app.py
```

The server will now run on `https://localhost:4879`

## Accessing from Other Devices

1. Find your computer's IP address:
   ```powershell
   ipconfig
   # Look for "IPv4 Address" (e.g., 192.168.1.100)
   ```

2. On another device, open your browser and go to:
   ```
   https://192.168.1.100:4879
   ```

3. Accept the security warning:
   - **Chrome/Edge**: Click "Advanced" → "Proceed to 192.168.1.100 (unsafe)"
   - **Firefox**: Click "Advanced" → "Accept the Risk and Continue"
   - **Safari**: Click "Show Details" → "visit this website"

4. Login and enable browser notifications in the queue sidebar

5. You're done! Browser notifications now work on this device 🎉

## Security Notes

- ⚠️ **Self-signed certificates** show security warnings - this is normal
- ✅ Safe for **local network** use (home, office)
- ✅ Traffic is **encrypted** even with self-signed certs
- ❌ **Don't expose** to the internet without proper certificates
- 🔒 Certificate files (`*.pem`) are **ignored by git** for security

## Troubleshooting

### "Certificate not found" error
- Run `python generate_cert.py` first
- Check that `cert.pem` and `key.pem` exist in project root

### "Connection refused" on other devices
- Make sure `FLASK_HOST=0.0.0.0` in `.env` (allows external connections)
- Check your firewall allows port 4879
- Try: `netsh advfirewall firewall add rule name="Flask" dir=in action=allow protocol=TCP localport=4879`

### Browser notifications still don't work
- Verify you're using `https://` not `http://`
- Check that you accepted the security warning
- Enable notifications checkbox in the queue sidebar
- Grant permission when browser prompts

### Certificate expired (after 1 year)
- Run `python generate_cert.py` again
- It will ask if you want to overwrite - type `y`
- Restart the Flask app

## Disable HTTPS

To go back to HTTP:
1. Set `ENABLE_SSL=False` in `.env`
2. Restart the Flask app

Note: Browser notifications won't work on network devices without HTTPS.
