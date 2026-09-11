# Security

Do not attach sensitive documents, credentials, or customer font assets to a public
issue. Use GitHub's private vulnerability reporting for this repository when enabled;
otherwise contact the maintainer privately through their GitHub profile before
sharing an exploit or private input. Do not post tokens in bug reports or build logs.

Native decoders, fonts, PDFs and animations process complex untrusted formats. Use
application-level input-size limits and a sandbox appropriate to the threat model.
A successful finite test corpus is not a security audit or universal compatibility
certificate. Review [release policy](docs/RELEASING.md) for the opt-in npm workflow,
credential handling, native hash verification, and immutable-release procedure.

Security fixes target the latest released line. No extended maintenance or response
time guarantee is implied. Validate the release artifact checksums and retain its
third-party notices when redistributing.
