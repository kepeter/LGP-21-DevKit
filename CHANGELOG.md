# LGP-21 DevKit Changelog

## [0.0.3] — 2026-06-11

Initial published release.

### Content
- Syntax highlighting via TextMate grammar for instructions, directives, labels, addresses, literals (strings and numbers) and comments
- Diagnostics: duplicate labels, undefined label references, invalid instruction operands, malformed `.ORG`/`.DATA` and unknown string escapes
- Hover documentation for instructions (from the 1963 Programming Manual), directives, `ttSS` address decoding, and string escape sequences
- Go to Definition and Find (All) References for labels
- Rename Symbol with pre-rename validation
- Document Symbols / Outline for easy navigation

## [0.0.5] — 2026-06-11

Update for Marketplace publishing

### Content
- Only cosmetic changes to enable pushing the package to Marketplace

## [0.1.1] — 2026-06-22

Adding compiler and polishing functionality

### Content
- Added an automatic build provider, to compile any opened lgp21 files
- Added LGP-21: Open Programming Manual command, that will open the embedded PDF manual in the OS's default viewer
- Added LGP-21: Open Example, that will let the programmer open any of the embedded sample codes
- Added support for .SWITCH and .Q directives in source code
- Updated documentation shown on hover
- Shared logic between server and compiler was redesigned
- Added tf (Tape Feed) to escape options
- Added a compiler to the language
