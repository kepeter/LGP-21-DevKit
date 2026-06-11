# LGP-21 DevKit

VS Code language extension for the [LGP-21](https://en.wikipedia.org/wiki/LGP-21) drum-memory computer (1963). Provides a full language server for `.lgp21` assembly source files.

## Features

### Syntax Highlighting
Tokens are coloured by category: instructions, directives, labels, addresses, strings, comments, and numeric literals.

### Diagnostics
Real-time error detection for:
- Duplicate label definitions
- References to undefined labels
- Invalid instruction operands
- Malformed `.ORG` / `.DATA` directives
- Unknown string escape sequences

### Hover Documentation
Hover over any token for inline documentation:
- **Instructions** — description and operand format from the 1963 LGP-21 Programming Manual
- **Directives** — `.ORG` and `.DATA` usage notes
- **Addresses** — `ttSS` address decoding (track and sector) when used as an instruction or `.ORG` operand
- **String escapes** — `{uc}`, `{lc}`, `{cs}`, `{cr}`, `{bs}`, `{tab}` typewriter control codes

### Navigation
- **Go to Definition** — jump to a label's definition
- **Find All References** — list every use of a label
- **Rename Symbol** — safely rename a label and all its references across the file

### Document Outline
Open the Outline panel to see all labels in the file as a navigable symbol tree.

## Language Reference

| Element | Syntax |
|---|---|
| File extension | `.lgp21` |
| Comment | `# text` |
| Label | `label:` (inline labels supported) |
| Load address | `.ORG ttSS` |
| Data | `.DATA value, value, …` (where values are string or numeric literals) |
| Address format | `ttSS` — `tt` = track (00–63), `SS` = sector (00–63) |

### String Escapes (inside `.DATA` strings)

| Escape | Meaning |
|---|---|
| `{uc}` | Shift to upper case |
| `{lc}` | Shift to lower case |
| `{cs}` | Clear screen / carriage return to column 1 |
| `{cr}` | Carriage return |
| `{bs}` | Backspace |
| `{tab}` | Tab |

## Requirements

VS Code 1.120 or later.
