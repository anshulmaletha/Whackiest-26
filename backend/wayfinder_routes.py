from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from wayfinder_nav import open_destination, resolve_destination

app = FastAPI()

# Allow local frontend to call the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ResolveRequest(BaseModel):
    utterance: str
    source: str = "voice"


class OpenRequest(BaseModel):
    destinationId: str


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/resolve")
def api_resolve(req: ResolveRequest):
    return resolve_destination(req.utterance)


@app.post("/api/open")
def api_open(req: OpenRequest):
    # If the repo has an existing browser function, pass it as navigate_fn=...
    return open_destination(req.destinationId)