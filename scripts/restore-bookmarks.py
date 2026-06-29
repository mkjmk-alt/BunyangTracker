import os
import sqlite3
import shutil
import urllib.parse
import json
import sys
import psycopg2
import psycopg2.extras

def extract_slug_from_url(url):
    try:
        parsed_url = urllib.parse.urlparse(url)
        path_parts = parsed_url.path.strip("/").split("/")
        if len(path_parts) >= 2 and path_parts[0] == "projects":
            return path_parts[1]
        elif "projects" in path_parts:
            idx = path_parts.index("projects")
            if idx + 1 < len(path_parts):
                return path_parts[idx + 1]
    except Exception:
        pass
    return None

def extract_slugs_from_bookmarks_node(node, visited_slugs):
    if not isinstance(node, dict):
        return
    
    node_type = node.get("type")
    if node_type == "url":
        url = node.get("url", "")
        slug = extract_slug_from_url(url)
        if slug:
            visited_slugs.add(slug)
    elif node_type == "folder" or "children" in node:
        children = node.get("children", [])
        for child in children:
            extract_slugs_from_bookmarks_node(child, visited_slugs)

def find_browser_files():
    local_app_data = os.environ.get("LOCALAPPDATA")
    if not local_app_data:
        return []

    browsers = [
        ("Whale", os.path.join(local_app_data, "Naver", "Naver Whale", "User Data")),
        ("Chrome", os.path.join(local_app_data, "Google", "Chrome", "User Data")),
        ("Edge", os.path.join(local_app_data, "Microsoft", "Edge", "User Data")),
    ]

    files = []
    for browser_name, user_data_path in browsers:
        if not os.path.exists(user_data_path):
            continue
        # Scan profiles
        for folder in os.listdir(user_data_path):
            profile_path = os.path.join(user_data_path, folder)
            if not os.path.isdir(profile_path):
                continue
            
            history_path = os.path.join(profile_path, "History")
            bookmarks_path = os.path.join(profile_path, "Bookmarks")
            
            if os.path.exists(history_path) or os.path.exists(bookmarks_path):
                files.append({
                    "browser": browser_name,
                    "profile": folder,
                    "history": history_path if os.path.exists(history_path) else None,
                    "bookmarks": bookmarks_path if os.path.exists(bookmarks_path) else None,
                })
    return files

def main():
    browser_files = find_browser_files()
    visited_slugs = set()
    scanned_profiles = []

    temp_history = "temp_browser_history_sync.db"

    for entry in browser_files:
        label = f"{entry['browser']} ({entry['profile']})"
        scanned_profiles.append(label)

        # 1. Parse Bookmarks JSON
        if entry["bookmarks"]:
            try:
                with open(entry["bookmarks"], "r", encoding="utf-8", errors="ignore") as f:
                    data = json.load(f)
                    roots = data.get("roots", {})
                    for root_key in roots:
                        extract_slugs_from_bookmarks_node(roots[root_key], visited_slugs)
            except Exception as e:
                # Silently ignore format / parse errors
                pass

        # 2. Parse History SQLite
        if entry["history"]:
            try:
                # Copy file to prevent locks
                shutil.copy2(entry["history"], temp_history)
                conn = sqlite3.connect(temp_history)
                cursor = conn.cursor()
                
                query = "SELECT url FROM urls WHERE url LIKE '%/projects/%' OR url LIKE '%localhost%'"
                cursor.execute(query)
                rows = cursor.fetchall()
                for (url,) in rows:
                    slug = extract_slug_from_url(url)
                    if slug:
                        visited_slugs.add(slug)
                conn.close()
            except Exception as e:
                pass
            finally:
                if os.path.exists(temp_history):
                    os.remove(temp_history)

    if not visited_slugs:
        print(json.dumps({
            "success": True,
            "restoredCount": 0,
            "scannedProfiles": scanned_profiles,
            "message": "No project slugs found in browser bookmarks or history."
        }))
        return

    # Database load
    db_url = None
    env_path = ".env.local"
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    k, v = line.split("=", 1)
                    if k.strip() == "DATABASE_URL":
                        db_url = v.strip().strip("'").strip('"')
                        break

    if not db_url:
        print(json.dumps({
            "success": False,
            "error": "DATABASE_URL not found in .env.local"
        }))
        return

    try:
        pg_conn = psycopg2.connect(db_url)
        pg_cursor = pg_conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        
        restored_count = 0
        for slug in visited_slugs:
            pg_cursor.execute("SELECT id FROM housing_projects WHERE slug = %s", (slug,))
            proj = pg_cursor.fetchone()
            if proj:
                proj_id = proj["id"]
                pg_cursor.execute(
                    "UPDATE announcements SET is_bookmarked = true, updated_at = NOW() WHERE project_id = %s",
                    (proj_id,)
                )
                restored_count += pg_cursor.rowcount
                    
        pg_conn.commit()
        pg_cursor.close()
        pg_conn.close()
        
        print(json.dumps({
            "success": True,
            "restoredCount": restored_count,
            "scannedProfiles": scanned_profiles
        }))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Database error during bookmark restoration: {str(e)}"
        }))

if __name__ == "__main__":
    main()
