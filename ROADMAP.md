# LGP-21 DevKit — Roadmap

## Done

- Syntax highlighting
- Diagnostics (duplicate/undefined labels, operand validation, `.ORG` / `.DATA` / string escape validation)
- Hover (instructions, directives, `ttSS` address decoding, escape sequences)
- Go to Definition and Find (All) References
- Rename Symbol
- Document Symbols / Outline
- Document formatter with consistent label indentation and column alignment

### Compiler
Assemble `.lgp21` source files into LGP-21 machine code binary.
- Two-pass assembly (resolve forward label references)
- `.ORG` and `.DATA` directive support
- Error reporting mapped back to source locations
- VS Code build task integration (Ctrl+Shift+B)

## Planned

### Debugger
Step through LGP-21 programs using a built-in software emulator.
- Full LGP-21 instruction set emulation
- Breakpoints, step-in / step-over / continue
- Register and accumulator inspection
- Drum memory viewer — live 64×64 track/sector map showing contents and current program counter position
- I/O device simulation (typewriter input/output)
