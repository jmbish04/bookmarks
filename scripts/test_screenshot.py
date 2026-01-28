import os
import requests
import json

# Configuration
TARGET_URL = "https://developers.cloudflare.com/r2-sql/query-data/"
OUTPUT_FILE = "screenshot.png"
DEV_VARS_PATH = os.path.join(os.path.dirname(__file__), "../.dev.vars")

import subprocess

def load_env_vars(filepath):
    """Parses .dev.vars file."""
    vars = {}
    if not os.path.exists(filepath):
        print(f"Error: {filepath} not found.")
        return vars
    
    with open(filepath, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, value = line.split("=", 1)
                # Remove quotes if present
                value = value.strip().strip('"').strip("'")
                vars[key.strip()] = value
    return vars

def upload_to_images(account_id, token, file_path):
    """Uploads file to Cloudflare Images."""
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/images/v1"
    headers = {"Authorization": f"Bearer {token}"}
    
    print(f"Uploading {file_path} to Cloudflare Images...")
    try:
        with open(file_path, "rb") as f:
            files = {"file": f}
            response = requests.post(url, headers=headers, files=files)
            
        if response.status_code == 200:
            result = response.json()
            if result.get("success"):
                variants = result["result"]["variants"]
                if variants:
                    return variants[0]
            print(f"Upload failed logic: {result}")
        else:
            print(f"Upload failed status {response.status_code}: {response.text}")
    except Exception as e:
        print(f"Upload error: {e}")
    return None

def main():
    print(f"Loading credentials from {DEV_VARS_PATH}...")
    env = load_env_vars(DEV_VARS_PATH)
    
    account_id = env.get("CLOUDFLARE_ACCOUNT_ID")
    browser_token = env.get("CLOUDFLARE_BROWSER_RENDER_TOKEN") 
    images_token = env.get("CLOUDFLARE_IMAGES_TOKEN")

    if not account_id or not browser_token:
        print("Error: Missing Account ID or Browser Token.")
        return

    if not images_token:
        print("Warning: CLOUDFLARE_IMAGES_TOKEN missing. Upload will be skipped.")

    # 1. Capture Screenshot
    api_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/browser-rendering/screenshot"
    print(f"Requesting screenshot for: {TARGET_URL}")
    
    payload = {
        "url": TARGET_URL,
        "screenshotOptions": {
            "type": "png",
            "encoding": "binary",
            "fullPage": False, 
        }
    }
    
    screenshot_success = False
    try:
        response = requests.post(
            api_url,
            headers={
                "Authorization": f"Bearer {browser_token}",
                "Content-Type": "application/json"
            },
            json=payload,
            stream=True 
        )
        
        if response.status_code == 200:
            with open(OUTPUT_FILE, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            print(f"Success! Screenshot saved to {OUTPUT_FILE}")
            screenshot_success = True
        else:
            print(f"Screenshot failed with status {response.status_code}")
            print("Response:", response.text)
            
    except Exception as e:
        print(f"An error occurred during screenshot: {e}")
        return

    # 2. Upload & Open
    if screenshot_success and images_token:
        image_url = upload_to_images(account_id, images_token, OUTPUT_FILE)
        if image_url:
            print(f"Image uploaded successfully: {image_url}")
            print("Opening in Chrome...")
            try:
                subprocess.run(["open", "-a", "Google Chrome", image_url])
            except Exception as e:
                print(f"Failed to open Chrome: {e}")
        else:
            print("Failed to upload image.")

if __name__ == "__main__":
    main()
