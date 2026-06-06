"""
setup_pinterest.py
──────────────────
One-time installer and login helper for the Pinterest scraper.

Usage
-----
  Install dependencies (run once after main requirements are installed):
      py setup_pinterest.py

  Log in with email + password (opens a Firefox window):
      py setup_pinterest.py --login
      py setup_pinterest.py --login --email you@example.com --password secret

  Log in with a Google account (click "Continue with Google" in the browser):
      py setup_pinterest.py --login --google

  Save cookies to a custom path:
      py setup_pinterest.py --login --cookies my_cookies.json

Notes
-----
- The `pinterest-dl[image]` extra pins pillow==10.4.0, which cannot be built
  from source on Python 3.12+.  Dependencies are installed with --no-deps and
  then re-added without that constraint.
- Cookies are saved in Selenium-compatible JSON format.
- The default cookie path (pinterest_cookies.json) matches PINTEREST_COOKIES_PATH
  in .env.  Pass --cookies <path> to override.
"""

import argparse
import getpass
import json
import subprocess
import sys
import time
from pathlib import Path


# ── Dependency installer ─────────────────────────────────────────────────────

def _run(cmd: list[str], desc: str) -> bool:
    print(f"\n>>> {desc}")
    print("    " + " ".join(cmd))
    result = subprocess.run(cmd, capture_output=False)
    if result.returncode != 0:
        print(f"    [WARN] Command exited with code {result.returncode}")
        return False
    return True


def install_deps() -> None:
    pip = [sys.executable, "-m", "pip"]
    playwright_cmd = [sys.executable, "-m", "playwright"]

    print("=" * 60)
    print("  Pinterest Scraper — Dependency Setup")
    print("=" * 60)

    # 1. Core package without the pinned-Pillow extras
    _run(
        pip + ["install", "pinterest-dl", "--no-deps"],
        "Installing pinterest-dl (no pinned-Pillow extras)",
    )

    # 2. Runtime deps (mirrors [image] extras minus Pillow==10.4.0)
    deps = [
        "playwright>=1.40.0",
        "selenium>=4.26.1",
        "requests",
        "Deprecated",
        "m3u8",
        "tqdm",
    ]
    _run(
        pip + ["install"] + deps,
        "Installing pinterest-dl runtime dependencies",
    )

    # 3. Firefox binary for Playwright login flow
    _run(
        playwright_cmd + ["install", "firefox"],
        "Downloading Playwright Firefox browser binary",
    )

    # 4. Smoke-test the import
    print("\n>>> Verifying pinterest_dl import …")
    result = subprocess.run(
        [sys.executable, "-c", "from pinterest_dl import PinterestDL; print('  OK')"],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        print(result.stdout.strip())
        print("\n✔  Setup complete.")
        print("   Run  py setup_pinterest.py --login  to generate your cookies file.")
    else:
        print("  [ERROR] Import failed:")
        print(result.stderr)
        print("\n✖  Setup encountered errors — check output above.")


# ── Cookie helpers ───────────────────────────────────────────────────────────

def _save_cookies(page, cookies_path: str) -> list:
    """
    Extract all cookies from a Playwright page's browser context and save them
    to *cookies_path* in Selenium-compatible JSON format.
    Returns the saved cookie list.
    """
    raw = page.context.cookies()
    selenium_cookies = []
    for c in raw:
        sc = {
            "name":   c.get("name", ""),
            "value":  c.get("value", ""),
            "domain": c.get("domain", ""),
            "path":   c.get("path", "/"),
            "secure": c.get("secure", False),
        }
        if c.get("expires", -1) > 0:
            sc["expiry"] = int(c["expires"])
        selenium_cookies.append(sc)
    Path(cookies_path).write_text(json.dumps(selenium_cookies, indent=2), encoding="utf-8")
    return selenium_cookies


# ── Login flows ──────────────────────────────────────────────────────────────

def do_login(email: str | None, password: str | None, cookies_path: str) -> None:
    """
    Open a visible Firefox window, log in to Pinterest with email + password,
    then save the resulting session cookies to *cookies_path*.
    Prompts interactively for any credential that is not supplied.
    """
    try:
        from pinterest_dl.webdriver.playwright_browser import PlaywrightBrowser
        from pinterest_dl.webdriver.playwright_driver import PlaywrightDriver
    except ImportError:
        print("[ERROR] pinterest-dl is not installed.")
        print("  Run  py setup_pinterest.py  first (without --login) to install dependencies.")
        raise SystemExit(1)

    if not email:
        email = input("  Pinterest email: ").strip()
    if not password:
        password = getpass.getpass("  Pinterest password: ")

    print("\n  Launching Firefox — complete any CAPTCHA or 2FA if prompted.")

    pw_browser = PlaywrightBrowser()
    pw_browser.launch(browser_type="firefox", headless=False, incognito=True, image_enable=True)
    page = pw_browser.page

    try:
        driver = PlaywrightDriver(page)
        driver.login(email=email, password=password)

        print("  Waiting for session to settle…")
        for remaining in range(6, 0, -1):
            print(f"    Capturing in {remaining}…", end="\r")
            time.sleep(1)
        print(" " * 30, end="\r")

        cookies = _save_cookies(page, cookies_path)
        _report_cookies(cookies, cookies_path)

    finally:
        try:
            pw_browser.close()
        except Exception:
            pass


def do_login_google(cookies_path: str) -> None:
    """
    Open a visible Firefox window, click "Continue with Google" on the Pinterest
    login page, wait for the user to complete the Google OAuth flow (including
    any 2FA), then capture and save the resulting session cookies.
    """
    try:
        from pinterest_dl.webdriver.playwright_browser import PlaywrightBrowser
    except ImportError:
        print("[ERROR] pinterest-dl is not installed.")
        print("  Run  py setup_pinterest.py  first (without --login) to install dependencies.")
        raise SystemExit(1)

    print("\n  Launching Firefox for Google login.")
    print("  Complete the sign-in in the browser window — it will close automatically.")

    pw_browser = PlaywrightBrowser()
    pw_browser.launch(browser_type="firefox", headless=False, incognito=True, image_enable=True)
    page = pw_browser.page

    try:
        print("  Navigating to Pinterest login page…")
        page.goto("https://www.pinterest.com/login/", wait_until="domcontentloaded")
        time.sleep(2)

        # Locate the "Continue with Google" button
        google_btn = page.locator(
            "[data-test-id='google-sso-button'], "
            "button:has-text('Continue with Google'), "
            "div[role='button']:has-text('Continue with Google')"
        )
        google_btn.first.wait_for(timeout=10_000)
        print("  Clicking 'Continue with Google'…")

        # Google sign-in opens in a popup — capture it
        with page.expect_popup(timeout=15_000) as popup_info:
            google_btn.first.click()
        google_page = popup_info.value
        google_page.wait_for_load_state("domcontentloaded")
        print("  Google sign-in popup opened — please sign in now.")
        print("  (The window closes automatically once Pinterest confirms the login.)")

        # Wait up to 2 minutes for the OAuth popup to close
        for _ in range(120):
            if google_page.is_closed():
                break
            time.sleep(1)

        # Confirm Pinterest redirected away from the login page
        page.wait_for_url("**/pinterest.com/**", timeout=30_000)
        time.sleep(3)  # let session cookies settle

        if "/login" in page.url:
            raise RuntimeError(
                "Still on the login page after Google OAuth — login may have failed."
            )

        print("  Login confirmed. Capturing cookies…")
        cookies = _save_cookies(page, cookies_path)
        _report_cookies(cookies, cookies_path)

    finally:
        try:
            pw_browser.close()
        except Exception:
            pass


def _report_cookies(cookies: list, cookies_path: str) -> None:
    """Print a summary of the saved cookies and highlight the session cookie status."""
    pinterest_cookies = [c for c in cookies if "pinterest.com" in c.get("domain", "")]
    session_ok = any(
        c["name"] in ("_pinterest_sess", "csrftoken") for c in pinterest_cookies
    )
    print(f"\n  ✔ {len(cookies)} cookies saved to '{cookies_path}'")
    if session_ok:
        print("  ✔ Session cookie detected — authentication looks good.")
    else:
        print("  ⚠ No Pinterest session cookie found — scraping may fail.")
        print("    Try running --login again to get a fresh session.")


# ── CLI ──────────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Pinterest scraper setup and login helper for Velvet Reverie.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  py setup_pinterest.py                         # install deps\n"
            "  py setup_pinterest.py --login                 # email/password login\n"
            "  py setup_pinterest.py --login --google        # Google account login\n"
            "  py setup_pinterest.py --login --cookies c.json  # custom cookie path\n"
        ),
    )
    parser.add_argument(
        "--login",
        action="store_true",
        help="Launch Firefox, log in to Pinterest, save cookies, then exit.",
    )
    parser.add_argument(
        "--google",
        action="store_true",
        help="Used with --login: sign in via Google OAuth instead of email/password.",
    )
    parser.add_argument(
        "--email",
        type=str,
        default=None,
        help="Pinterest email address (prompted interactively if omitted).",
    )
    parser.add_argument(
        "--password",
        type=str,
        default=None,
        help="Pinterest password (prompted securely if omitted).",
    )
    parser.add_argument(
        "--cookies",
        type=str,
        default="pinterest_cookies.json",
        help="Path to save / load the cookies JSON file (default: pinterest_cookies.json).",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    if args.login:
        print("=" * 60)
        if args.google:
            print("  Pinterest Login — Google account")
        else:
            print("  Pinterest Login — email / password")
        print("=" * 60)

        if args.google:
            do_login_google(cookies_path=args.cookies)
        else:
            do_login(
                email=args.email,
                password=args.password,
                cookies_path=args.cookies,
            )
    else:
        install_deps()


if __name__ == "__main__":
    main()
