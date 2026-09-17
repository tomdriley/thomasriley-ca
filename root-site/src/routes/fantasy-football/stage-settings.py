"""Stage app settings for the /fantasy-football proxy.

Loaded by scripts/bootstrap-stage.py so that the shared bootstrap script holds
no fantasy-specific app names, hostnames or setting names. Everything the
proxy needs at deploy time lives here, next to the code that reads it.
"""

FANTASY_APP = "thomasriley-fantasy-w3-pilot"


def stage_settings(az, group, blog_app):
    """Return the blog stage slot's settings for the fantasy football proxy.

    Resolves the fantasy *stage* slot and refuses anything else, so stage can
    never be pointed at the fantasy production app by accident. Raises if the
    slot lookup fails rather than falling back.
    """
    fantasy = az("webapp", "show", "-g", group, "-n", FANTASY_APP, "--slot", "stage")
    fantasy_host = fantasy["defaultHostName"]
    if not fantasy_host.startswith(f"{FANTASY_APP}-stage."):
        raise SystemExit(
            f"Unexpected fantasy stage host {fantasy_host!r}; refusing to "
            "configure the blog stage slot."
        )
    # The external origin browsers use for stage. Stated here so the blog never
    # reads it back out of a request header.
    blog = az("webapp", "show", "-g", group, "-n", blog_app, "--slot", "stage")
    return {
        "FANTASY_APP_ORIGIN": f"https://{fantasy_host}",
        "FANTASY_PUBLIC_ORIGIN": f"https://{blog['defaultHostName']}",
    }
