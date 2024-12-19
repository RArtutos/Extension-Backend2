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

    # ... resto del código igual que antes ...