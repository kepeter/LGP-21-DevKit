# LGP-21 DevKit

VS Code language extension for the [LGP-21](https://en.wikipedia.org/wiki/LGP-21) drum-memory computer (1963). Provides a full language server for `.lgp21` assembly source files, including a compiler

[![release](https://img.shields.io/github/v/release/kepeter/LGP-21-DevKit)](https://github.com/kepeter/LGP-21-DevKit/releases/latest)

## Features

### Syntax Highlighting
Tokens are coloured by category: instructions, directives, labels, addresses, string literals, comments, and numeric literals

### Diagnostics
Real-time error detection for:
- Duplicate label definitions
- References to undefined labels
- Invalid instruction operands
- Malformed `.ORG` / `.DATA` directives
- Unknown string escape sequences
- Invalid numeric/string literals
- Warnings on potential, but not fatal, mistakes

### Hover Documentation
Hover over any token for inline documentation:
- **Instructions** — description and operand format from the 1963 LGP-21 Programming Manual
- **Directives** — `.ORG`, `.SWITCH`, `.Q` and `.DATA` usage notes
- **Addresses** — `ttSS` address decoding (track and sector) when used as an instruction or `.ORG` operand
- **String escapes** — `{tf}`, `{uc}`, `{lc}`, `{cs}`, `{cr}`, `{bs}`, `{tb}` typewriter control codes

### Navigation
- **Go to Definition** — jump to a label's definition
- **Find All References** — list every use of a label
- **Rename Symbol** — safely rename a label and all its references across the file

### Document Outline
Open the Outline panel to see all labels in the file as a navigable symbol tree

### Auto format source code
Auto foramtting is enabled for lgp21 files. The formatter align labels, instructions and comments for readibility

### Commands
- LGP-21: Open Programming Manual - opens the original programming manual as PDF in the OS's default viewer
- LGP-21: Open Example - enables to open one of the embedded example files

## Language Reference

| Element | Syntax |
|---|---|
| File extension | `.lgp21` |
| Comment | `# text` |
| Label | `label:` (inline labels supported) |
| Load address | `.ORG ttSS` |
| Data | `.DATA value, value, …` (where values are string or numeric literals) |
| Console switches | `.SWITCH [BS4, BS8, BS16, BS32, TC]` set initial states of the switches for debugging purposes |
| Default q value | `.Q n` where n is a value between 0 a to 30 |
| Address format | `ttSS` — `tt` = track (00–63), `SS` = sector (00–63) |

### String Escapes (inside `.DATA` strings)

| Escape | Meaning |
|---|---|
| `{tf}` | Feed the paper tape without input |
| `{uc}` | Shift to upper case |
| `{lc}` | Shift to lower case |
| `{cs}` | Color shift between black and red ribbon |
| `{cr}` | Carriage return |
| `{bs}` | Backspace |
| `{tb}` | Tab |

## Compiler
Compile the active `.lgp21` file.
The compiler validates the source and, if there are no errors, writes four output files alongside the source:

| File | Contents |
|---|---|# LGP-21 DevKit

VS Code language extension for the [LGP-21](https://en.wikipedia.org/wiki/LGP-21) drum-memory computer (1963). Provides a full language server for `.lgp21` assembly source files, including a compiler

[![release](https://img.shields.io/github/v/release/kepeter/LGP-21-DevKit)](https://github.com/kepeter/LGP-21-DevKit/releases/latest)

## Features

### Syntax Highlighting
Tokens are coloured by category: instructions, directives, labels, addresses, string literals, comments, and numeric literals

### Diagnostics
Real-time error detection for:
- Duplicate label definitions
- References to undefined labels
- Invalid instruction operands
- Malformed `.ORG` / `.DATA` directives
- Unknown string escape sequences
- Invalid numeric/string literals
- Warnings on potential, but not fatal, mistakes

### Hover Documentation
Hover over any token for inline documentation:
- **Instructions** — description and operand format from the 1963 LGP-21 Programming Manual
- **Directives** — `.ORG`, `.SWITCH`, `.Q` and `.DATA` usage notes
- **Addresses** — `ttSS` address decoding (track and sector) when used as an instruction or `.ORG` operand
- **String escapes** — `{tf}`, `{uc}`, `{lc}`, `{cs}`, `{cr}`, `{bs}`, `{tb}` typewriter control codes

### Navigation
- **Go to Definition** — jump to a label's definition
- **Find All References** — list every use of a label
- **Rename Symbol** — safely rename a label and all its references across the file

### Document Outline
Open the Outline panel to see all labels in the file as a navigable symbol tree

### Auto format source code
Auto foramting is enabled for lgp21 files. The formatter align labels, instructions and comments for readibility

### Commands
- LGP-21: Open Programming Manual - opens the original programming manual as PDF in the OS's default viewer
- LGP-21: Open Example - enables to open one of the embedded example files

## Language Reference

| Element | Syntax |
|---|---|
| File extension | `.lgp21` |
| Comment | `# text` |
| Label | `label:` (inline labels supported) |
| Load address | `.ORG ttSS` |
| Data | `.DATA value, value, …` (where values are string or numeric literals) |
| Console switches | `.SWITCH BS4, BS8, BS16, BS32, TC` set initial states of the switches for debugging purposes |
| Default q value | `.Q n` where n is a value between 0 a to 30 |
| Address format | `ttSS` — `tt` = track (00–63), `SS` = sector (00–63) |

### String Escapes (inside `.DATA` strings)

| Escape | Meaning |
|---|---|
| `{tf}` | Feed the paper tape without input |
| `{uc}` | Shift to upper case |
| `{lc}` | Shift to lower case |
| `{cs}` | Color shift between black and red ribbon |
| `{cr}` | Carriage return |
| `{bs}` | Backspace |
| `{tb}` | Tab |

## Compiler
Compile the active `.lgp21` file.
The compiler validates the source and, if there are no errors, writes four output files alongside the source:

| File | Contents |
|---|---|
| `.bin` | Raw binary image as 32-bit big-endian words |
| `.hex` | LGP-21 hex notation (digits `0–9 F G J K Q W`), 8 words per line |
| `.json` | Memory file for use with [Paul Kimpel's emulator](https://www.phkimpel.us/LGP-21/webUI/LGP21.html) |
| `.info` | Human-readable assembly report: symbol table, numeric literal analysis, and a per-track memory map |

The compiler provides warnings and errors the way as the real-time diagnostic does.

### Features
- While programmer can use explicit {uc}/{lc} escapes the compiler will automatically apply them based on the character to print, if none provided
- Build command (default to Ctrl+Shift+B) is active only if lgp21 file is opened, but that case it is the default - no task selection needed
- Numeric literals will accept a q value in the form of @q at the end of the literal (for convenience default q value can be set using .Q directive). About the q value read more in the Programming Manual


## Requirements

VS Code 1.120 or later.
