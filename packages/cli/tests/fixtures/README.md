# HTTPS test fixtures

`localhost-cert.pem` and `localhost-key.pem` are a public, test-only self-signed
certificate/key pair for localhost and 127.0.0.1 (2020–2040). They are not credentials
for any deployed service. Tests trust this certificate only in their CLI child
process using `NODE_EXTRA_CA_CERTS`; TLS verification remains enabled.
