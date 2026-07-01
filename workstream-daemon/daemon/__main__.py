import uvicorn
from daemon.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "daemon.server:app",
        host="127.0.0.1",
        port=settings.port,
        reload=False,
    )
