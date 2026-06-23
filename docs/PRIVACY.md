# Privacy and Data Use

Latency is disabled by default. A user must explicitly enable sponsored wait
screens in VS Code settings or through the enable command.

When enabled, the extension stores a random installation identifier in VS Code
global state and a server-issued credential in VS Code SecretStorage. The API
records ad identifiers, impression duration, click state, timestamps, and the
pseudonymous installation identifier. It does not require a developer email,
source code, prompts, file contents, or workspace paths.

Advertiser email addresses and sessions are handled by Supabase Auth. Secret
and service-role keys remain server-side. Request logs exclude authorization
headers and request bodies.

Before a production launch, publish final retention, deletion, support, and
contact policies and confirm they match the deployed system.
