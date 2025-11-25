# app/init_db.py

from .core.database import engine, Base
from . import models  # noqa: F401  -> just to load all model classes

def init():
    print("Metadata tables BEFORE create_all:")
    print(list(Base.metadata.tables.keys()))  # should include 'users', 'cameras', etc.

    Base.metadata.create_all(bind=engine)

    print("Metadata tables AFTER create_all:")
    print(list(Base.metadata.tables.keys()))
    print("✅ Tables created (or already existed).")

if __name__ == "__main__":
    init()
