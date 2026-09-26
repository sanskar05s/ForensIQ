import httpx
from supabase import Client, ClientOptions, create_client

from app.core.config import settings


http_client = httpx.Client(
    # The installed PostgREST client enables HTTP/2 by default. The runtime
    # logs show intermittent HTTP/2 stream disconnects under parallel reads;
    # use HTTP/1.1 with a bounded connection timeout for this shared client.
    http2=False,
    timeout=httpx.Timeout(120.0, connect=10.0),
    follow_redirects=True,
)

supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY,
    options=ClientOptions(httpx_client=http_client),
)


def get_supabase_client() -> Client:
    return supabase
