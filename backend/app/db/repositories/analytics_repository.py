from typing import List, Dict, Optional
from datetime import datetime, timedelta
from ..base import BaseRepository
from ...core.config import settings

class AnalyticsRepository(BaseRepository):
    def __init__(self):
        super().__init__(settings.DATA_FILE)

    def create_activity(self, activity_data: Dict) -> Dict:
        """Create a new activity record"""
        data = self._read_data()
        if "analytics" not in data:
            data["analytics"] = []
            
        activity = {
            "id": len(data["analytics"]) + 1,
            **activity_data
        }
        
        data["analytics"].append(activity)
        self._write_data(data)
        return activity

    def get_recent_activities(self, limit: int = 10, account_id: Optional[int] = None) -> List[Dict]:
        data = self._read_data()
        activities = data.get("analytics", [])
        
        # Filter by account if specified
        if account_id is not None:
            activities = [a for a in activities if a.get("account_id") == account_id]
        
        # Sort by timestamp descending and limit
        sorted_activities = sorted(
            activities,
            key=lambda x: x.get("timestamp", ""),
            reverse=True
        )
        return sorted_activities[:limit]

    def get_account_sessions(self, account_id: int) -> List[Dict]:
        data = self._read_data()
        return [
            s for s in data.get("sessions", [])
            if s.get("account_id") == account_id
        ]

    def get_user_sessions(self, user_id: str) -> List[Dict]:
        data = self._read_data()
        return [
            s for s in data.get("sessions", [])
            if s.get("user_id") == user_id
        ]

    def get_account_users(self, account_id: int) -> List[Dict]:
        data = self._read_data()
        user_accounts = [
            ua for ua in data.get("user_accounts", [])
            if ua.get("account_id") == account_id
        ]
        user_ids = [ua.get("user_id") for ua in user_accounts]
        return [
            u for u in data.get("users", [])
            if u.get("email") in user_ids
        ]

    def get_user_account_usage(self, user_id: str) -> List[Dict]:
        data = self._read_data()
        sessions = self.get_user_sessions(user_id)
        
        usage = {}
        for session in sessions:
            account_id = session.get("account_id")
            if account_id not in usage:
                usage[account_id] = {
                    "total_time": 0,
                    "last_access": None
                }
            
            if session.get("duration"):
                usage[account_id]["total_time"] += session["duration"]
            
            timestamp = session.get("last_activity")
            if timestamp:
                current = datetime.fromisoformat(timestamp)
                if not usage[account_id]["last_access"] or current > usage[account_id]["last_access"]:
                    usage[account_id]["last_access"] = current

        # Add account names
        accounts = data.get("accounts", [])
        return [
            {
                "account_id": account_id,
                "name": next((a["name"] for a in accounts if a["id"] == account_id), "Unknown"),
                "total_time": stats["total_time"],
                "last_access": stats["last_access"].isoformat() if stats["last_access"] else None
            }
            for account_id, stats in usage.items()
        ]

    def get_user_total_time(self, user_id: str) -> int:
        sessions = self.get_user_sessions(user_id)
        return sum(s.get("duration", 0) for s in sessions)

    def get_active_users_count(self, account_id: int) -> int:
        """Get number of active users for an account"""
        data = self._read_data()
        active_users = set()
        
        for activity in data.get("analytics", []):
            # Solo procesar actividades que tengan account_id y coincida con el solicitado
            if (activity.get("account_id") == account_id and 
                activity.get("action") == "account_access" and
                not self._has_logout_after(activity, data["analytics"])):
                active_users.add(activity.get("user_id"))
                
        return len(active_users)

    def _has_logout_after(self, activity: Dict, activities: List[Dict]) -> bool:
        """Check if user has logged out after this activity"""
        if not activity.get("timestamp"):
            return False
            
        activity_time = datetime.fromisoformat(activity["timestamp"])
        user_id = activity.get("user_id")
        
        if not user_id:
            return False
        
        for other in activities:
            if (other.get("user_id") == user_id and 
                other.get("action") == "account_logout" and
                other.get("timestamp") and
                datetime.fromisoformat(other["timestamp"]) > activity_time):
                return True
                
        return False

    def record_account_access(self, user_id: str, account_id: int, domain: str, 
                            ip_address: Optional[str] = None, 
                            user_agent: Optional[str] = None) -> Dict:
        """Record account access activity"""
        return self.create_activity({
            "user_id": user_id,
            "account_id": account_id,
            "action": "account_access",
            "domain": domain,
            "timestamp": datetime.utcnow().isoformat(),
            "ip_address": ip_address,
            "user_agent": user_agent
        })

    def record_account_logout(self, user_id: str, account_id: int) -> Dict:
        """Record account logout activity"""
        return self.create_activity({
            "user_id": user_id,
            "account_id": account_id,
            "action": "account_logout",
            "timestamp": datetime.utcnow().isoformat()
        })