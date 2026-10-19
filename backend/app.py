"""Start the Panik API:  python app.py [--port 8001] [--host 127.0.0.1] [--no-reload]

Run from backend/ with the virtualenv's Python (.venv\\Scripts\\python app.py on Windows).
The app/ package wins over this file when importing "app", so "app.main:app" still resolves to the API.
"""
import argparse
import os

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Panik API with uvicorn.")
    parser.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", "8001")))
    parser.add_argument("--no-reload", dest="reload", action="store_false",
                        help="disable auto-reload on code changes")
    args = parser.parse_args()

    os.chdir(os.path.dirname(os.path.abspath(__file__)))  # .env is read from the working directory
    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload,
                reload_dirs=["app"] if args.reload else None)


if __name__ == "__main__":
    main()
