"""Vercel entry point for the CardioTwin-4D FastAPI application."""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from backend.app import app as backend_app

app = backend_app
