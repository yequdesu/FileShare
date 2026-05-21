import os
from pathlib import Path

DATA_DIR = os.environ.get("DATA_DIR", str(Path(__file__).parent / "data"))
MAX_TOTAL_SIZE_GB = float(os.environ.get("MAX_TOTAL_SIZE_GB", "10"))
MAX_FILE_SIZE_MB = float(os.environ.get("MAX_FILE_SIZE_MB", "2048"))
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8080"))
KROKI_URL = os.environ.get("KROKI_URL", "https://kroki.io")
