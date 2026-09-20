# Security policy

## Supported versions

Security fixes are provided for the latest published release.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting for this repository. Include the affected version, a minimal reproduction, and the impact you observed.

You should receive an acknowledgement within 72 hours. A fix timeline depends on severity and reproducibility.

## Security model

`xcstrings-doctor` reads local `.xcstrings` files and writes reports to standard output. It does not modify catalogs, execute catalog contents, make network requests, or collect telemetry.

Catalog paths and translation text can appear in reports. Treat generated JSON and CI annotations as project data and apply your repository's normal retention rules.
