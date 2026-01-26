import requests
import json
import sys
import os

# --- CONFIGURATION ---
VARS_PATH = "/Volumes/Projects/workers/bookmarks/.dev.vars"
API_ENDPOINT = "https://api.raindrop.io/rest/v1/user/stats" # Simple endpoint to test auth

def load_test_token(filepath):
    """
    Parses the .dev.vars file to find RAINDROP_TOKEN.
    """
    if not os.path.exists(filepath):
        print(f"❌ Error: Credentials file not found at: {filepath}")
        sys.exit(1)

    print(f"📂 Reading credentials from: {filepath}")
    
    token = None
    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            # Skip comments and empty lines
            if not line or line.startswith('#'):
                continue
            
            # Look for RAINDROP_TOKEN
            if line.startswith("RAINDROP_TOKEN="):
                _, value = line.split('=', 1)
                token = value.strip().strip('"').strip("'")
                break

    if not token:
        print("❌ Error: Could not find RAINDROP_TOKEN in file.")
        sys.exit(1)
        
    return token

def test_token(token):
    """
    Uses the token to fetch user stats from Raindrop.
    """
    print("🚀 Testing token against Raindrop API...")
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.get(API_ENDPOINT, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        print("\n✅ Authentication Successful!")
        print("--- User Stats ---")
        print(json.dumps(data, indent=2))
        return True

    except requests.exceptions.HTTPError as err:
        print(f"\n❌ HTTP Error: {err}")
        print(f"Response: {response.text}")
        return False
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return False

def main():
    # 1. Load Token
    token = load_test_token(VARS_PATH)
    
    # 2. Verify it works
    test_token(token)

if __name__ == "__main__":
    main()