import json
import os
from datetime import datetime
from typing import Optional, List, Dict, Any

class Database:
    def __init__(self):
        self.file_path = os.getenv('DATA_FILE', '/app/data/db.json')
        self.data = self._load_data()

    def _load_data(self) -> Dict[str, Any]:
        try:
            with open(self.file_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            # Si el archivo no existe, intentar cargar desde el backend 1.0
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
        """Get user by email"""
        for user in self.data["users"]:
            if user["email"] == email:
                return user
        return None

    def update_user_sessions(self, email: str, sessions: int):
        """Update user's active sessions count"""
        for user in self.data["users"]:
            if user["email"] == email:
                user["active_sessions"] = sessions
                self._save_data()
                return True
        return False

    def get_user_accounts(self, email: str) -> List[Dict]:
        """Get all accounts associated with a user"""
        return [ua for ua in self.data["user_accounts"] if ua["user_id"] == email]

    def get_account(self, account_id: int) -> Optional[Dict]:
        """Get account by ID"""
        for account in self.data["accounts"]:
            if account["id"] == account_id:
                return account
        return None

    def verify_user_account_access(self, email: str, account_id: int) -> bool:
        """Verify if user has access to an account"""
        return any(
            ua["user_id"] == email and ua["account_id"] == account_id 
            for ua in self.data["user_accounts"]
        )

    def get_account_active_sessions(self, account_id: int) -> int:
        """Get number of active sessions for an account"""
        return len([
            s for s in self.data["sessions"]
            if s["account_id"] == account_id and s.get("active", False)
        ])

    def get_session(self, session_id: str) -> Optional[Dict]:
        """Get session by ID"""
        for session in self.data["sessions"]:
            if session["id"] == session_id:
                return session
        return None

    def create_session(self, session_data: Dict):
        """Create a new session"""
        self.data["sessions"].append(session_data)
        self._save_data()

    def end_session(self, session_id: str):
        """End a session"""
        for session in self.data["sessions"]:
            if session["id"] == session_id:
                session["active"] = False
                session["ended_at"] = datetime.now().isoformat()
                self._save_data()
                return True
        return False

    def create_analytics_event(self, event_data: Dict):
        """Create a new analytics event"""
        self.data["analytics"].append(event_data)
        self._save_data()