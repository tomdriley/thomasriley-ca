"""Provision website-only stage slots and scoped GitHub OIDC identities.

Requires an authenticated Azure CLI (AZ) and gh CLI. Never copies production
connection strings, registry passwords, identities, or certificates.
"""
import json
import os
import subprocess
import uuid

AZ = os.environ.get("AZ", "az")
SUBSCRIPTION = "b9ee5d35-c096-4772-8a56-0529054b4dcf"
GROUP = "ff-westus3-pilot"
REPO = "tomdriley/thomasriley-ca"
FANTASY_APP = "thomasriley-fantasy-w3-pilot"
RG_ID = f"/subscriptions/{SUBSCRIPTION}/resourceGroups/{GROUP}"


def run(*args):
    result = subprocess.run(args, check=True, text=True, capture_output=True)
    return json.loads(result.stdout) if result.stdout.strip() else None


def az(*args):
    return run(AZ, *args, "--subscription", SUBSCRIPTION, "-o", "json")


def github(path, body):
    subprocess.run(
        ["gh", "api", "--method", "PUT", f"repos/{REPO}/{path}", "--input", "-"],
        input=json.dumps(body), text=True, check=True, stdout=subprocess.DEVNULL,
    )


def main():
    tenant = az("account", "show")["tenantId"]
    repo = run("gh", "api", f"repos/{REPO}")
    assert repo["id"] == 452078536 and repo["owner"]["id"] == 17971412
    github("actions/oidc/customization/sub", {
        "use_default": True, "use_immutable_subject": True,
    })
    for service, app in (
        ("article-service", "thomasriley-article-w3-pilot"),
        ("website", "thomasriley-blog-w3-pilot"),
    ):
        app_id = f"{RG_ID}/providers/Microsoft.Web/sites/{app}"
        stage_id = f"{app_id}/slots/stage"
        production = az("webapp", "config", "show", "-g", GROUP, "-n", app)
        slots = az("webapp", "deployment", "slot", "list", "-g", GROUP, "-n", app)
        new_slot = not any(slot["name"].split("/")[-1] == "stage" for slot in slots)
        if new_slot:
            az("webapp", "deployment", "slot", "create", "-g", GROUP, "-n", app,
               "--slot", "stage")
        # Explicit allowlist: no production settings or connection strings copied.
        settings = {
            "WEBSITES_PORT": "8080",
            "WEBSITES_ENABLE_APP_SERVICE_STORAGE": "false",
        }
        if service == "article-service":
            settings["ARTICLE_DATA_MODE"] = "synthetic"
        else:
            article = az("webapp", "show", "-g", GROUP,
                         "-n", "thomasriley-article-w3-pilot", "--slot", "stage")
            settings["ARTICLE_SERVICE_URI"] = f"https://{article['defaultHostName']}"
            # The blog reverse-proxies /fantasy-football/ to the fantasy app.
            # Stage must resolve the fantasy *stage* slot; there is deliberately
            # no fallback to the fantasy production app.
            fantasy = az("webapp", "show", "-g", GROUP,
                         "-n", FANTASY_APP, "--slot", "stage")
            fantasy_host = fantasy["defaultHostName"]
            if not fantasy_host.startswith(f"{FANTASY_APP}-stage."):
                raise SystemExit(
                    f"Unexpected fantasy stage host {fantasy_host!r}; refusing to "
                    "configure the blog stage slot."
                )
            settings["FANTASY_APP_ORIGIN"] = f"https://{fantasy_host}"
            # TLS terminates at the App Service front end, so the external
            # scheme is stated here rather than read from a request header.
            settings["FANTASY_FORWARDED_PROTO"] = "https"
        az("rest", "--method", "put",
           "--url", f"{stage_id}/config/appsettings?api-version=2024-11-01",
           "--body", json.dumps({"properties": settings}))
        az("rest", "--method", "put",
           "--url", f"{stage_id}/config/connectionstrings?api-version=2024-11-01",
           "--body", '{"properties":{}}')
        web_config = {
            "alwaysOn": True, "ftpsState": "Disabled", "minTlsVersion": "1.2",
        }
        if new_slot:
            web_config["linuxFxVersion"] = production["linuxFxVersion"]
        az("rest", "--method", "patch",
           "--url", f"{stage_id}/config/web?api-version=2024-11-01",
           "--body", json.dumps({"properties": web_config}))
        az("rest", "--method", "patch",
           "--url", f"{stage_id}?api-version=2024-11-01",
           "--body", '{"properties":{"httpsOnly":true}}')
        for policy in ("scm", "ftp"):
            az("rest", "--method", "put",
               "--url", f"{stage_id}/basicPublishingCredentialsPolicies/{policy}?api-version=2024-11-01",
               "--body", '{"properties":{"allow":false}}')
        for target in ("stage", "production"):
            environment = f"{target}-{service}"
            github(f"environments/{environment}", {
                "deployment_branch_policy": {
                    "protected_branches": False, "custom_branch_policies": True,
                },
            })
            policies = run("gh", "api", f"repos/{REPO}/environments/{environment}/deployment-branch-policies")
            if not any(p["name"] == "main" for p in policies["branch_policies"]):
                run("gh", "api", "--method", "POST",
                    f"repos/{REPO}/environments/{environment}/deployment-branch-policies",
                    "-f", "name=main", "-f", "type=branch")
            identity_name = f"{app}-{target}-deployer"
            identity = az("identity", "create", "-g", GROUP, "-n", identity_name,
                          "--location", "westus3")
            az("identity", "federated-credential", "create", "-g", GROUP,
               "--identity-name", identity_name, "-n", "github-environment",
               "--issuer", "https://token.actions.githubusercontent.com",
               "--subject", f"repo:tomdriley@17971412/thomasriley-ca@452078536:environment:{environment}",
               "--audiences", "api://AzureADTokenExchange")
            actions = [
                "Microsoft.Web/sites/slots/read",
                "Microsoft.Web/sites/slots/config/read",
            ]
            if target == "stage":
                actions += ["Microsoft.Web/sites/slots/config/write",
                            "Microsoft.Web/sites/slots/restart/action"]
            else:
                actions += ["Microsoft.Web/sites/read", "Microsoft.Web/sites/config/read",
                            "Microsoft.Web/sites/config/write", "Microsoft.Web/sites/restart/action"]
            role_name = f"{identity_name}-image"
            roles = az("role", "definition", "list", "--name", role_name)
            definition = {
                "roleName": role_name, "roleType": "CustomRole",
                "description": "Image config deployment; no publishing credentials, RBAC or slot swap.",
                "permissions": [{"actions": actions, "notActions": [],
                                 "dataActions": [], "notDataActions": []}],
                "assignableScopes": [RG_ID],
            }
            role_id = roles[0]["id"] if roles else (
                f"/subscriptions/{SUBSCRIPTION}/providers/Microsoft.Authorization/"
                f"roleDefinitions/{uuid.uuid5(uuid.NAMESPACE_URL, role_name)}"
            )
            role = az("rest", "--method", "put",
                      "--url", f"{role_id}?api-version=2022-04-01",
                      "--body", json.dumps({"properties": definition}))
            scope = stage_id if target == "stage" else app_id
            az("role", "assignment", "create", "--assignee-object-id", identity["principalId"],
               "--assignee-principal-type", "ServicePrincipal", "--role", role["id"], "--scope", scope)
            for name, value in (("AZURE_CLIENT_ID", identity["clientId"]), ("AZURE_TENANT_ID", tenant)):
                subprocess.run(["gh", "variable", "set", name, "--repo", REPO,
                                "--env", environment, "--body", value], check=True)
            print(f"Configured {environment}: {scope}", flush=True)


if __name__ == "__main__":
    main()
