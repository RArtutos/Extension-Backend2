from datetime import datetime, timedelta
from typing import List, Dict, Optional
from ..base import BaseRepository
from ...core.config import settings
import random

class SessionRepository(BaseRepository):
    def __init__(self):
        super().__init__(settings.DATA_FILE)

    def create_session(self, session_data: Dict) -> bool:
        """Create a new session"""
        data = self._read_data()
        if "sessions" not in data:
            data["sessions"] = []
            
        # Generate a random numeric ID between 100000 and 999999
        while True:
            session_id = str(random.randint(100000, 999999))
            # Check if ID already exists
            if not any(s.get("id") == session_id for s in data["sessions"]):
                break
        
        session_data["id"] = session_id
        session_data["created_at"] = datetime.utcnow().isoformat()
        session_data["last_activity"] = datetime.utcnow().isoformat()
        session_data["active"] = True
        
        data["sessions"].append(session_data)
        self._write_data(data)
        return True

    def update_session_activity(self, session_id: str, activity_data: Dict) -> bool:
        """Update session activity"""
        data = self._read_data()
        session = next(
            (s for s in data.get("sessions", []) if s.get("id") == session_id),
            None
        )
        
        if session:
            session.update(activity_data)
            session["last_activity"] = datetime.utcnow().isoformat()
            self._write_data(data)
            return True
        return False

    def end_session(self, session_id: str) -> bool:
        """End a session"""
        data = self._read_data()
        session = next(
            (s for s in data.get("sessions", []) if s.get("id") == session_id),
            None
        )
        
        if session:
            session["active"] = False
            session["end_time"] = datetime.utcnow().isoformat()
            if session.get("created_at"):
                start = datetime.fromisoformat(session["created_at"])
                end = datetime.utcnow()
                session["duration"] = (end - start).total_seconds()
            
            self._write_data(data)
            return True
        return False

    def get_active_sessions(self, account_id: int) -> List[Dict]:
        """Get all active sessions for an account"""
        data = self._read_data()
        sessions = data.get("sessions", [])
        
        # Filter active sessions for the account
        active_sessions = [
            session for session in sessions
            if session.get("account_id") == account_id and
            session.get("active", True) and
            self._is_session_active(session)
        ]
        
        return active_sessions

    def get_sessions_by_domain_and_email(self, domain: str, email: str) -> List[Dict]:
        """Get sessions by domain and email"""
        data = self._read_data()
        sessions = data.get("sessions", [])
        
        # Filter sessions by domain, email, and active status
        filtered_sessions = [
            session for session in sessions
            if session.get("domain") == domain and
               session.get("user_id") == email and
               session.get("active", True)
        ]
        
        return filtered_sessions
    
    def delete_session(self, session_id: str) -> bool:
        """Delete a session by ID"""
        data = self._read_data()
        sessions = data.get("sessions", [])
        
        # Find the session by ID and remove it
        session_index = next(
            (index for index, session in enumerate(sessions) if session.get("id") == session_id),
            None
        )
        
        if session_index is not None:
            del sessions[session_index]
            data["sessions"] = sessions
            self._write_data(data)
            return True
        
        return False

    def _is_session_active(self, session: Dict) -> bool:
        """Check if a session is still active based on last activity"""
        if not session.get("last_activity"):
            return False
            
        last_activity = datetime.fromisoformat(session["last_activity"])
        timeout = datetime.utcnow() - timedelta(minutes=settings.COOKIE_INACTIVITY_TIMEOUT)
        return last_activity > timeout
