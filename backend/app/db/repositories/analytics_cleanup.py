from typing import List
from datetime import datetime
from .analytics_repository import AnalyticsRepository
from ..base import BaseRepository
from ...core.config import settings

class AnalyticsCleanupRepository(BaseRepository):
    def __init__(self):
        super().__init__(settings.DATA_FILE)
        self.analytics = AnalyticsRepository()

    def cleanup_domain_analytics(self, user_id: str, domain: str) -> int:
        """
        Cleanup analytics for a specific user and domain
        Returns the number of records removed
        """
        data = self._read_data()
        initial_count = len(data.get("analytics", []))
        
        # Filter out analytics for this user and domain
        data["analytics"] = [
            activity for activity in data.get("analytics", [])
            if not (
                activity.get("user_id") == user_id and 
                activity.get("domain") == domain
            )
        ]
        
        # Calculate removed records
        removed_count = initial_count - len(data.get("analytics", []))
        
        if removed_count > 0:
            self._write_data(data)
            
        return removed_count

    def cleanup_session_analytics(self, user_id: str, domain: str) -> bool:
        """Cleanup session data for a specific user and domain"""
        data = self._read_data()
        
        # Mark sessions as ended
        modified = False
        for session in data.get("sessions", []):
            if (session.get("user_id") == user_id and 
                session.get("domain") == domain and 
                session.get("active", True)):
                session["active"] = False
                session["end_time"] = datetime.utcnow().isoformat()
                if session.get("created_at"):
                    start = datetime.fromisoformat(session["created_at"])
                    end = datetime.utcnow()
                    session["duration"] = (end - start).total_seconds()
                modified = True
        
        if modified:
            self._write_data(data)
            
        return modified