"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeDoc = exports.directiveDoc = exports.instructionDoc = void 0;
exports.instructionDoc = {
    'A': '**ADD** — Add the contents of location m to the contents of the Accumulator. ' +
        'The sum replaces the contents of the Accumulator. ' +
        'If an addition results in a number beyond the limits of the Accumulator, overflow will occur. ' +
        'The contents of m remains unaltered.',
    'S': '**SUBTRACT** — Subtract the contents of location m from the contents of the Accumulator and retain the difference in the Accumulator. ' +
        'If a subtraction results in a number beyond the limits of the Accumulator, overflow will occur. ' +
        'Memory remains unaltered.',
    'M': '**MULTIPLY** — Multiply the contents of the Accumulator by the contents of location m, forming a 62-bit product ' +
        'of which 31 bits are retained: the sign and the **most significant 30 bits** of the product replace the contents of the Accumulator. ' +
        'The Instruction Register holds the multiplicand during the multiply operation. Memory remains unaltered.',
    'N': '**MULTIPLY** — Multiply the contents of the Accumulator by the contents of location m, forming a 62-bit product ' +
        'of which 31 bits are retained: the **least significant 31 bits** replace the contents of the Accumulator, occupying bit positions 0 through 30. ' +
        'Loss of any of the most significant bits does not cause overflow. ' +
        'During the multiply operation, the Instruction Register holds the multiplicand. Memory remains unaltered.',
    'D': '**DIVIDE** — Divide the number in the Accumulator by the number in location m, retaining the quotient, rounded to 30 bits, in the Accumulator. ' +
        'The absolute value of the contents of m must be greater than the absolute value of the contents of the Accumulator, or overflow will occur. ' +
        'During the divide operation the Instruction Register holds the divisor. m remains unaltered.',
    'E': '**EXTRACT** — Where `1` bits are in location m, retain the value of the corresponding bit positions in the Accumulator; ' +
        'where `0` bits are in m, place 0 bits in the corresponding positions in the Accumulator. ' +
        'The word in location m is called the "mask" and remains unaltered.',
    'B': '**BRING** — Bring the contents of location m into the Accumulator, replacing its contents. Memory remains unchanged.',
    'H': '**HOLD** — Store the contents of the Accumulator into location m, without altering the contents of the Accumulator.',
    'C': '**CLEAR** — Store the contents of the Accumulator into memory location m; then clear the Accumulator to zero.',
    'R': '**SET RETURN ADDRESS** — In the address portion of location m, record the address which is 2 greater than ' +
        'the location of the R instruction being executed (i.e., the contents of the Counter Register plus 1).',
    'Y': '**STORE ADDRESS** — Replace the address portion of the word in location m with the address portion of the word in the Accumulator, ' +
        'leaving the rest of m and all of the Accumulator undisturbed.',
    'U': '**UNCONDITIONAL TRANSFER** — Replace the contents of the address portion of the Counter Register with m ' +
        'and get the next instruction from location m.',
    'T': '**CONDITIONAL TRANSFER** — If the contents of the Accumulator is negative (1 in the sign position), ' +
        'replace the contents of the address portion of the Counter Register with m and get the next instruction from location m. ' +
        'If the contents of the Accumulator is positive, continue to the next instruction in sequence without altering the Counter.',
    '-T': '**TRANSFER CONTROL** — If the contents of the Accumulator is negative, or if the TC switch on the console is ON, ' +
        'replace the contents of the address portion of the Counter Register with m and get the next instruction from location m.',
    'Z': '**STOP / NO-OP / SENSE BRANCH SWITCHES** — Behaviour depends on the track portion of the address:\n\n' +
        '| Address | Action |\n' +
        '|---|---|\n' +
        '| `0000`, `0100` | **Halt** |\n' +
        '| `0200`, `0300` | **No-op** |\n' +
        '| `0400`–`6000` | **Sense Branch Switches** — if all specified switches are ON, execute next instruction; if any is OFF, skip it |\n\n' +
        '_Branch Switches are numbered 4, 8, 16 and 32._',
    '-Z': '**SENSE OVERFLOW AND TRANSFER** — If overflow is OFF (`0` in the sign position of the Counter Register), skip the next instruction in sequence. ' +
        'If overflow is ON (`1` in the sign position of the Counter), reset the overflow bit to zero; then execute the next instruction.\n\n' +
        'The track portion of the address designates which, if any, Branch Switches are also to be interrogated.',
    'I': '**6-BIT SHIFT / INPUT** — Shift the contents of the Accumulator left 6 places, inserting zeros at the right. ' +
        'Then give a start read signal, allowing 6 bits of each character read by the input device to enter the Accumulator. ' +
        'A character enters the low-order (right) end of the Accumulator, shifting the previous contents toward the high-order end.\n\n' +
        '_When n = `6200`: shift only, no input._\n\n' +
        '**Input device (track field):**\n' +
        '- `00` — Model 141 Tape Reader\n' +
        '- `02` — Model 121 Typewriter',
    '-I': '**4-BIT SHIFT / INPUT** — Shift the contents of the Accumulator left 4 places, inserting zeros at the right. ' +
        'Then give a start read signal, allowing the 4 bits of each character read by the input device to enter the Accumulator. ' +
        'A character enters the low-order (right) end of the Accumulator, shifting the previous contents toward the high-order end.\n\n' +
        '_When n = `6200`: shift only, no input._\n\n' +
        '**Input device (track field):**\n' +
        '- `00` — Model 141 Tape Reader\n' +
        '- `02` — Model 121 Typewriter',
    'P': '**6-BIT PRINT** — Transmit the character represented by bits 0 through 5 of the Accumulator to the output device. ' +
        'The contents of the Accumulator remains unaltered.\n\n' +
        '**Output device (track field):**\n' +
        '- `02` — Model 121 Typewriter\n' +
        '- `06` — Model 151 Tape Punch',
    '-P': '**4-BIT PRINT** — Combine `1` for channel 5 and `0` for channel 6 with bits 0 through 3 from the Accumulator, ' +
        'then transfer this character to the output device. The contents of the Accumulator remains unaltered.\n\n' +
        '**Output device (track field):**\n' +
        '- `02` — Model 121 Typewriter\n' +
        '- `06` — Model 151 Tape Punch',
};
exports.directiveDoc = {
    '.ORG': '**Origin** — specifies the LGP-21 memory address at which the program will be loaded. DevKit directive; not part of the original LGP-21 instruction set.',
    '.DATA': '**Data** — defines one or more data values at the current location, separated by commas. Values may be numbers, strings. DevKit directive; not part of the original LGP-21 instruction set.',
};
exports.escapeDoc = {
    'lc': '**Lower Case** _(tape code 1)_ — shift typewriter to lower-case mode.',
    'uc': '**Upper Case** _(tape code 2)_ — shift typewriter to upper-case mode.',
    'cs': '**Color Shift** _(tape code 3)_ — shift typewriter ribbon color.',
    'cr': '**Carriage Return** _(tape code 4)_ — return carriage to left margin and advance paper.',
    'bs': '**Back Space** _(tape code 5)_ — move typewriter carriage back one character position.',
    'tab': '**Tabulate** _(tape code 6)_ — advance typewriter carriage to the next tab stop.',
};
//# sourceMappingURL=descriptions.js.map