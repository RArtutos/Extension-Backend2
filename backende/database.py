import json
import os
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

class Database:
    def __init__(self):
        self.file_path = os.getenv('DATA_FILE', '/app/data/db.json')
        self.data = self._load_data()
        self.cleanup_interval = timedelta(minutes=5)
        self.last_cleanup = datetime.now()

    def _load_data(self) -> Dict[str, Any]:
        try:
            with open(self.file_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            try:
                with open('/app/data/db.json', 'r') as f:
                    return json.load(f)
            except FileNotFoundError:
                return {
                    "users": [],
                    "accounts": [],
                    "user_accounts": [],
                    "sessions": [],
                    "analytics": [],
                    "presets": []
                }

    def _save_data(self):
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        with open(self.file_path, 'w') as f:
            json.dump(self.data, f, indent=2)

    def get_user(self, email: str) -> Optional[Dict]:
        for user in self.data["users"]:
            if user["email"] == email:
                return user
        return None

    def update_user_sessions(self, email: str, sessions: int):
        for user in self.data["users"]:
            if user["email"] == email:
                user["active_sessions"] = sessions
                self._save_data()
                return True
        return False

    def get_user_accounts(self, email: str) -> List[Dict]:
        return [ua for ua in self.data["user_accounts"] if ua["user_id"] == email]

    def get_account(self, account_id: int) -> Optional[Dict]:
        for account in self.data["accounts"]:
            if account["id"] == account_id:
                return account
        return None

    def verify_user_account_access(self, email: str, account_id: int) -> bool:
        return any(
            ua["user_id"] == email and ua["account_id"] == account_id 
            for ua in self.data["user_accounts"]
        )

    def get_account_active_sessions(self, account_id: int) -> int:
        return len([
            s for s in self.data["sessions"]
            if s["account_id"] == account_id and s.get("active", False)
        ])

    def get_session(self, session_id: str) -> Optional[Dict]:
        for session in self.data["sessions"]:
            if session["id"] == session_id:
                return session
        return None

    def create_session(self, session_data: Dict):
        self.data["sessions"].append(session_data)
        self._save_data()

    def end_session(self, session_id: str):
        for session in self.data["sessions"]:
            if session["id"] == session_id:
                session["active"] = False
                session["ended_at"] = datetime.now().isoformat()
                self._save_data()
                return True
        return False

    def update_session_heartbeat(self, session_id: str) -> bool:
        current_time = datetime.now()

        if current_time - self.last_cleanup > self.cleanup_interval:
            self.cleanup_inactive_sessions()
            self.last_cleanup = current_time

        for session in self.data["sessions"]:
            if session["id"] == session_id and session.get("active", False):
                session["last_heartbeat"] = current_time.isoformat()
                self._save_data()
                return True
        return False

    def cleanup_inactive_sessions(self):
        current_time = datetime.now()
        inactive_threshold = current_time - self.cleanup_interval

        inactive_sessions = []
        for session in self.data["sessions"]:
            if session.get("active", False):
                last_heartbeat = datetime.fromisoformat(session.get("last_heartbeat", "2000-01-01T00:00:00"))
                if last_heartbeat < inactive_threshold:
                    session["active"] = False
                    session["ended_at"] = current_time.isoformat()
                    inactive_sessions.append(session)

        if inactive_sessions:
            user_session_counts = {}
            for session in inactive_sessions:
                user_id = session["user_id"]
                user_session_counts[user_id] = user_session_counts.get(user_id, 0) + 1

            for user in self.data["users"]:
                if user["email"] in user_session_counts:
                    current_sessions = user.get("active_sessions", 0)
                    user["active_sessions"] = max(0, current_sessions - user_session_counts[user["email"]])

            self._save_data()

    def get_user_active_sessions(self, email: str) -> int:
        active_count = 0
        current_time = datetime.now()
        inactive_threshold = current_time - self.cleanup_interval

        for session in self.data["sessions"]:
            if session.get("user_id") == email and session.get("active", False):
                last_heartbeat = datetime.fromisoformat(session.get("last_heartbeat", "2000-01-01T00:00:00"))
                if last_heartbeat >= inactive_threshold:
                    active_count += 1

        return active_count

    def create_analytics_event(self, event_data: Dict):
        self.data["analytics"].append(event_data)
        self._save_data()

    def increment_account_sessions(self, account_id: int) -> bool:
        for account in self.data["accounts"]:
            if account["id"] == account_id:
                active_sessions = account.get("active_sessions", 0)
                account["active_sessions"] = active_sessions + 1
                self._save_data()
                return True
        return False

    def decrement_account_sessions(self, account_id: int) -> bool:
        for account in self.data["accounts"]:
            if account["id"] == account_id:
                active_sessions = account.get("active_sessions", 0)
                account["active_sessions"] = max(0, active_sessions - 1)
                self._save_data()
                return True
        return False

