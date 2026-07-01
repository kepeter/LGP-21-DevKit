import * as fs from 'fs';
import * as path from 'path';
import {
    AssemblyError,
    stripComment,
    splitByComma,
    collectLabelDefs,
    validateTokens,
    nonLabelTokens,
    instructionSet,
    lcChars,
    ucChars,
    valueInstructions,
    labelIdentify,
    labelDefinition,
    labelScan,
    labelWithOffset,
    analyzeNumericLiteral,
    NumericLiteralInfo,
    Address,
} from '../shared/assembler';

// Valid 6-bit character codes for LGP-21
const Charset6: Record<string, number> = {
    ')': 0b000010, '0': 0b000010,
    'L': 0b000110, 'l': 0b000110, '1': 0b000110,
    '*': 0b001010, '2': 0b001010,
    '"': 0b001110, '3': 0b001110,
    'Δ': 0b010010, '4': 0b010010,
    '%': 0b010110, '5': 0b010110,
    '$': 0b011010, '6': 0b011010,
    'π': 0b011110, '7': 0b011110,
    'Σ': 0b100010, '8': 0b100010,
    '(': 0b100110, '9': 0b100110,

    'F': 0b101010, 'f': 0b101010,
    'G': 0b101110, 'g': 0b101110,
    'J': 0b110010, 'j': 0b110010,
    'K': 0b110110, 'k': 0b110110,
    'Q': 0b111010, 'q': 0b111010,
    'W': 0b111110, 'w': 0b111110,
    'Z': 0b000001, 'z': 0b000001,
    'B': 0b000101, 'b': 0b000101,
    'Y': 0b001001, 'y': 0b001001,
    'R': 0b001101, 'r': 0b001101,
    'I': 0b010001, 'i': 0b010001,
    'D': 0b010101, 'd': 0b010101,
    'N': 0b011001, 'n': 0b011001,
    'M': 0b011101, 'm': 0b011101,
    'P': 0b100001, 'p': 0b100001,
    'E': 0b100101, 'e': 0b100101,
    'U': 0b101001, 'u': 0b101001,
    'T': 0b101101, 't': 0b101101,
    'H': 0b110001, 'h': 0b110001,
    'C': 0b110101, 'c': 0b110101,
    'A': 0b111001, 'a': 0b111001,
    'S': 0b111101, 's': 0b111101,

    ' ': 0b000011,
    '_': 0b000111, '-': 0b000111,
    '=': 0b001011, '+': 0b001011,
    ':': 0b001111, ';': 0b001111,
    '?': 0b010011, '/': 0b010011,
    ']': 0b010111, '.': 0b010111,
    '[': 0b011011, ',': 0b011011,
    'V': 0b011111, 'v': 0b011111,
    'O': 0b100011, 'o': 0b100011,
    'X': 0b100111, 'x': 0b100111,
};

// 6-bit codes for {escape} sequences (zone 00, control characters)
const Escape6: Record<string, number> = {
    'tf': 0b000000,
    'lc': 0b000100,
    'uc': 0b001000,
    'cs': 0b001100,
    'cr': 0b010000,
    'bs': 0b010100,
    'tb': 0b011000,
};

// LGP-21 hex digits for 32-bit word output
const LGP21HexDigits = '0123456789FGJKQW';

// Instruction letter to opcode mapping
const Opcodes: Record<string, number> = {
    Z: 0, B: 1, Y: 2, R: 3, I: 4, D: 5, N: 6, M: 7, P: 8, E: 9, U: 10, T: 11, H: 12, C: 13, A: 14, S: 15,
};



// Usage markers for memory map
type Mark = 'I' | 'D' | 'R' | '.';

// Memory file structure for JSON output
interface memoryFile { Comments: string[]; Registers: { C: number; R: number; A: number; }; Memory: number[]; }

type WordEntry = { addr: Address; word: number; kind: 'code' | 'data' };

// Auto-insert {uc}/{lc} shifts for case transitions in a string literal.
// Only applied when the literal contains no explicit {uc} or {lc} escapes.
// Assumes LC mode at the start of the string.
function autoCaseShift(token: string): string {
    const content = token.slice(1, -1);

    if (/\{uc\}|\{lc\}/.test(content)) return token;

    let currentCase: 'uc' | 'lc' = 'lc';
    let result = '';
    let i = 0;

    while (i < content.length) {
        if (content[i] === '{') {
            const close = content.indexOf('}', i);

            if (close >= 0) {
                result += content.slice(i, close + 1);
                i = close + 1;
            } else {
                result += content[i];
                i++;
            }
        } else {
            const ch = content[i];

            if (ucChars.has(ch) && currentCase !== 'uc') { result += '{uc}'; currentCase = 'uc'; }
            else if (lcChars.has(ch) && currentCase !== 'lc') { result += '{lc}'; currentCase = 'lc'; }

            result += ch;
            i++;
        }
    }

    return "'" + result + "'";
}

// Count the number of characters in a string literal, ignoring escape sequences
function charCountInString(token: string): number {
    const content = token.slice(1, -1);
    let count = 0;
    let i = 0;

    while (i < content.length) {
        if (content[i] === '{') {
            const close = content.indexOf('}', i);
            i = close >= 0 ? close + 1 : content.length;
        } else {
            i++;
        }

        count++;
    }

    return count;
}

// Count the number of 32-bit words needed to store a data token
function dataWordCount(token: string): number {
    if (/^'[^']*'$/.test(token)) return Math.max(1, Math.ceil(charCountInString(token) / 5));

    return 1;
}

// Encode an instruction and its operand address into a 32-bit word
// The word format is: s00000000000IIII00TTTTTTSSSSSS00
function encodeInstruction(instr: string, addr: Address): number {
    const minus = instr.startsWith('-');
    const base = minus ? instr.slice(1) : instr;
    const opcode = Opcodes[base] ?? 0;
    let word = minus ? 0x80000000 : 0;

    word |= (opcode & 0xF) << 16;
    word |= (addr.track & 0x3F) << 8;
    word |= (addr.sector & 0x3F) << 2;

    return word >>> 0;
}

// Encode an integer token: [-]digits to 32 bits
function encodeInteger(n: number): number {
    return (n << 1) >>> 0;
}

// Encode a numeric token: [-]digits[.digits][@digits]
function encodeNumeric(token: string, defaultQ?: number): number {
    const info = analyzeNumericLiteral(token, defaultQ);

    return info.storedValue ?? 0;
}

// Flush a range of free tracks to the info lines
function flushFreeRange(upTo: number, freeStart: number, infoLines: string[]): number {
    if (freeStart === -1) return -1;

    const from = freeStart;
    const to = upTo - 1;
    const desc = from === to ? String(from).padStart(2, '0') : `${String(from).padStart(2, '0')}-${String(to).padStart(2, '0')}`;
    const total = (to - from + 1) * 64;

    infoLines.push(`  ${trackLabel(desc)} ${'.'.repeat(64)}  [${total} free]`);

    return -1;
}

// Format an address as a ttSS string
function formatTtSS(a: Address): string {
    return String(a.track).padStart(2, '0') + String(a.sector).padStart(2, '0');
}

// Convert an address to a linear index (0..4095)
function linearOf(a: Address): number {
    return a.track * 64 + a.sector;
}

// Get the next address in sequence, wrapping to the next track if needed
function nextAddr(a: Address): Address {
    const s = a.sector + 1;

    return s < 64 ? { track: a.track, sector: s } : { track: a.track + 1, sector: 0 };
}

// Parse a ttSS string into an Address
function parseTtSS(s: string): Address {
    return { track: parseInt(s.slice(0, 2), 10), sector: parseInt(s.slice(2, 4), 10) };
}

// Resolve a token into an Address, either from a plain label, label[n] offset, or a ttSS string.
// On error, pushes to errors and returns address 0000 so the emit loop can continue and collect all errors.
function resolveAddr(token: string, labelAddresses: Map<string, Address>, line: number, col: number, errors: AssemblyError[]): Address {
    if (labelIdentify.test(token)) return { ...labelAddresses.get(token)! };

    const om = labelWithOffset.exec(token);

    if (om) {
        const base = labelAddresses.get(om[1])!;
        const linear = linearOf(base) + parseInt(om[2], 10);

        if (linear < 0 || linear > 4095) {
            errors.push({
                line, start: col, end: col + token.length,
                message: `'${token}' resolves to address ${linear} which is outside the valid range [0, 4095]`
            });
            return { track: 0, sector: 0 };
        }

        return { track: Math.floor(linear / 64), sector: linear % 64 };
    }

    return parseTtSS(token);
}

// Convert a string literal into an array of 32-bit words, packing 5 characters per word
function stringToWords(token: string): number[] {
    const content = token.slice(1, -1);
    const codes: number[] = [];
    let i = 0;

    while (i < content.length) {
        if (content[i] === '{') {
            const close = content.indexOf('}', i);

            if (close >= 0) {
                const key = content.slice(i + 1, close);

                codes.push(Escape6[key] ?? 0);
                i = close + 1;
            } else {
                i = content.length;
            }
        } else {
            codes.push(Charset6[content[i]] ?? 0);
            i++;
        }
    }

    const words: number[] = [];

    for (let w = 0; w < codes.length; w += 5) {
        const c = [0, 1, 2, 3, 4].map(j => codes[w + j] ?? 0);

        words.push(((c[0] << 26) | (c[1] << 20) | (c[2] << 14) | (c[3] << 8) | (c[4] << 2)) >>> 0);
    }

    if (words.length === 0) words.push(0);

    return words;
}

// Convert a 32-bit word into a LGP-21 hex string
function toLgp21Hex(word: number): string {
    let s = '';

    for (let shift = 28; shift >= 0; shift -= 4)
        s += LGP21HexDigits[(word >>> shift) & 0xF];

    return s;
}

// Generate a label for a track in the info output
function trackLabel(desc: string): string {
    return `Track ${desc}:`.padEnd(12);
}

// Write the binary output file
function writeBin(binPath: string, orgAddr: Address, words: WordEntry[]): void {
    const binBuf = Buffer.alloc(words.length * 4);

    for (let i = 0; i < words.length; i++)
        binBuf.writeUInt32BE(words[i].word, i * 4);

    fs.writeFileSync(binPath, binBuf);
}

// Write the hex output file
function writeHex(hexPath: string, words: WordEntry[]): void {
    const hexLines: string[] = [];

    for (let i = 0; i < words.length; i += 8)
        hexLines.push(words.slice(i, i + 8).map(w => toLgp21Hex(w.word)).join(' '));

    fs.writeFileSync(hexPath, hexLines.join('\n') + '\n');
}

// Write the info output file
function writeInfo(infoPath: string, fileName: string, orgAddr: Address, activeSwitches: string[], currentDefaultQ: number | undefined, labelAddresses: Map<string, Address>, numericEntries: Map<string, NumericLiteralInfo>, words: WordEntry[], refLinear: Set<number>): void {
    const memMap: Mark[] = new Array(4096).fill('.');

    for (const w of words)
        memMap[linearOf(w.addr)] = w.kind === 'code' ? 'I' : 'D';

    for (const idx of refLinear)
        if (idx < 4096 && memMap[idx] === '.') memMap[idx] = 'R';

    const codeCount = memMap.filter(m => m === 'I').length;
    const dataCount = memMap.filter(m => m === 'D').length;
    const refCount = memMap.filter(m => m === 'R').length;
    const freeCount = memMap.filter(m => m === '.').length;

    const sortedLabels = [...labelAddresses.entries()].sort((a, b) => linearOf(a[1]) - linearOf(b[1]));
    const colW = Math.max(6, ...sortedLabels.map(([n]) => n.length)) + 4;
    const bar = '─'.repeat(68);
    const switchStr = activeSwitches.length > 0 ? activeSwitches.join(', ') : '(none)';

    const infoLines: string[] = [
        'LGP-21 Assembly Information',
        bar,
        `Source: ${fileName}`,
        '',
        'INITIAL STATE',
        `  Load address: ${formatTtSS(orgAddr)}`,
        `  Switches    : ${switchStr}`,
        `  Default q   : ${currentDefaultQ ?? '(none)'}`,
        '',
        'SYMBOL TABLE',
    ];

    for (const [name, addr] of sortedLabels)
        infoLines.push(`  ${name.padEnd(colW)}${formatTtSS(addr)}`);

    if (numericEntries.size > 0) {
        const tokW = Math.max(5, ...([...numericEntries.keys()].map(k => k.length))) + 2;
        infoLines.push('', 'NUMERIC LITERALS', `  ${'Token'.padEnd(tokW)}  ${'q'.padStart(2)}    Exact    Note`);
        infoLines.push('  ' + '─'.repeat(tokW + 40));

        for (const [tok, info] of numericEntries) {
            const exact = info.reason === 'exact' ? 'Yes' : 'No ';
            const hasFraction = tok.split('@')[0].includes('.');
            const qCol = hasFraction ? String(info.q).padStart(2) : '  ';
            let note = '';

            if (info.reason === 'infinite')
                note = `infinite binary fraction; stored fraction ${info.storedFractionValue}`;
            else if (info.reason === 'truncated')
                note = `needs ${info.bitsNeeded} fraction bits, ${info.bitsAvailable} available; stored fraction ${info.storedFractionValue}`;

            infoLines.push(`  ${tok.padEnd(tokW)}  ${qCol}    ${exact}      ${note}`);
        }
    }

    infoLines.push(
        '',
        'MEMORY USAGE',
        `  Instructions : ${String(codeCount).padStart(4)} word(s)`,
        `  Data         : ${String(dataCount).padStart(4)} word(s)`,
        `  Referenced   : ${String(refCount).padStart(4)} word(s)`,
        `  Free         : ${String(freeCount).padStart(4)} word(s)`,
        `  Total        : 4096 word(s)`,
        '',
        'MEMORY MAP',
        '  I = instruction   D = data   R = referenced   . = free',
        bar,
    );

    let freeStart = -1;

    for (let t = 0; t < 64; t++) {
        const sectors = memMap.slice(t * 64, t * 64 + 64);
        const usedCount = sectors.filter(s => s !== '.').length;

        if (usedCount === 0) {
            if (freeStart === -1) freeStart = t;

            continue;
        }

        freeStart = flushFreeRange(t, freeStart, infoLines);

        const iC = sectors.filter(s => s === 'I').length;
        const dC = sectors.filter(s => s === 'D').length;
        const rC = sectors.filter(s => s === 'R').length;
        const fC = sectors.filter(s => s === '.').length;

        const parts: string[] = [];

        if (iC > 0) parts.push(`${iC} instr`);
        if (dC > 0) parts.push(`${dC} data`);
        if (rC > 0) parts.push(`${rC} ref`);
        if (fC > 0) parts.push(`${fC} free`);

        infoLines.push(`  ${trackLabel(String(t).padStart(2, '0'))} ${sectors.join('')}  [${parts.join(', ')}]`);
    }

    flushFreeRange(64, freeStart, infoLines);

    fs.writeFileSync(infoPath, infoLines.join('\n') + '\n');
}

// Write the JSON output file
function writeJson(jsonPath: string, orgAddr: Address, words: WordEntry[]): void {
    const orgLinear = linearOf(orgAddr);
    const jsonContent: memoryFile = { Comments: [], Registers: { C: orgLinear << 2, R: 0, A: 0 }, Memory: [] };

    for (let i = 0; i < orgLinear; i++)
        jsonContent.Memory.push(0);

    for (let i = 0; i < words.length; i++)
        jsonContent.Memory.push(words[i].word);

    const maxDigits = jsonContent.Memory.length > 0 ? String(Math.max(...jsonContent.Memory)).length : 1;
    const memRows: string[] = [];

    for (let i = 0; i < jsonContent.Memory.length; i += 8) {
        const chunk = jsonContent.Memory.slice(i, i + 8).map(n => String(n).padStart(maxDigits));
        memRows.push('    ' + chunk.join(', '));
    }

    const jsonOut = '{\n'
        + `  "Registers": ${JSON.stringify(jsonContent.Registers)},\n`
        + `  "Memory": [\n${memRows.join(',\n')}\n  ]\n`
        + '}';
    fs.writeFileSync(jsonPath, jsonOut + '\n');
}

// Main entry point for the compiler
function main(): void {
    const args = process.argv.slice(2);
    const filePath = args.find(a => !a.startsWith('-'));

    if (!filePath) {
        process.stderr.write('Usage: lgp21-compile <file.lgp21>\n');
        process.exit(1);
    }

    const absPath = path.resolve(filePath);
    const base = absPath.replace(/\.lgp21$/i, '');

    // Output file paths
    const binPath = base + '.bin';
    const hexPath = base + '.hex';
    const jsonPath = base + '.json';
    const infoPath = base + '.info';

    if (!fs.existsSync(absPath)) {
        process.stderr.write(`${filePath}: error: file not found\n`);
        process.exit(1);
    }

    const source = fs.readFileSync(absPath, 'utf-8');
    const lines = source.split(/\r?\n/);

    const errors: AssemblyError[] = [];
    const labelDefs = collectLabelDefs(lines, errors);

    validateTokens(lines, labelDefs, errors);

    const rel = path.relative(process.cwd(), absPath);

    const hardErrors = errors.filter(e => e.severity !== 'warning' && e.severity !== 'information');
    const warnings = errors.filter(e => e.severity === 'warning');
    const infos = errors.filter(e => e.severity === 'information');

    for (const i of infos)
        process.stderr.write(`${rel}:${i.line + 1}:${i.start + 1}: info: ${i.message}\n`);

    for (const w of warnings)
        process.stderr.write(`${rel}:${w.line + 1}:${w.start + 1}: warning: ${w.message}\n`);

    if (hardErrors.length > 0) {
        for (const e of hardErrors)
            process.stderr.write(`${rel}:${e.line + 1}:${e.start + 1}: error: ${e.message}\n`);

        process.exit(1);
    }

    // Collect switches and compute label addresses
    const activeSwitches: string[] = [];
    const labelAddresses = new Map<string, Address>();
    let cur: Address = { track: 0, sector: 0 };

    for (const rawLine of lines) {
        const stripped = stripComment(rawLine);

        if (!stripped.trim()) continue;

        const tokens = nonLabelTokens(stripped);

        if (tokens.length === 0) {
            const labelRegEx = new RegExp(labelScan.source, labelScan.flags);
            let lm: RegExpExecArray | null;

            while ((lm = labelRegEx.exec(stripped)) !== null)
                labelAddresses.set(lm[1], { ...cur });

            continue;
        }

        const keyword = tokens[0].token;

        if (keyword === '.SWITCH') {
            for (const t of tokens.slice(1)) activeSwitches.push(t.token);
        } else if (keyword === '.DATA') {
            let seenKeyword = false;

            for (const t of splitByComma(stripped).flat()) {
                if (t.token === '.DATA') { seenKeyword = true; continue; }
                if (labelDefinition.test(t.token)) {
                    labelAddresses.set(t.token.slice(0, -1), { ...cur });
                } else if (seenKeyword) {
                    const tok = /^'[^']*'$/.test(t.token) ? autoCaseShift(t.token) : t.token;

                    for (let w = 0; w < dataWordCount(tok); w++) cur = nextAddr(cur);
                }
            }
        } else {
            const labelRegEx = new RegExp(labelScan.source, labelScan.flags);
            let lm: RegExpExecArray | null;

            while ((lm = labelRegEx.exec(stripped)) !== null)
                labelAddresses.set(lm[1], { ...cur });

            if (keyword === '.ORG') {
                cur = parseTtSS(tokens[1].token);
            } else if (instructionSet.has(keyword)) {
                cur = nextAddr(cur);
            }
        }
    }

    // Emit words
    const words: WordEntry[] = [];
    const refLinear = new Set<number>();

    let orgAddr: Address = { track: 0, sector: 0 };
    let hasOrg = false;

    const numericEntries = new Map<string, NumericLiteralInfo>();
    let currentDefaultQ: number | undefined = undefined;

    cur = { track: 0, sector: 0 };

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const rawLine = lines[lineIdx];
        const stripped = stripComment(rawLine);

        if (!stripped.trim()) continue;

        const tokens = nonLabelTokens(stripped);

        if (tokens.length === 0) continue;

        const keyword = tokens[0].token;

        if (keyword === '.ORG') {
            cur = parseTtSS(tokens[1].token);

            if (!hasOrg) { orgAddr = { ...cur }; hasOrg = true; }
        } else if (keyword === '.Q') {
            if (tokens.length === 2) currentDefaultQ = parseInt(tokens[1].token, 10);
        } else if (keyword === '.SWITCH') {
            // no words emitted
        } else if (keyword === '.DATA') {
            for (const t of tokens.slice(1)) {
                if (/^'[^']*'$/.test(t.token)) {
                    for (const word of stringToWords(autoCaseShift(t.token))) {
                        words.push({ addr: { ...cur }, word, kind: 'data' });

                        cur = nextAddr(cur);
                    }
                } else if (/^-?[0-9]+(\.[0-9]+)?(@[0-9]+)?$/.test(t.token)) {
                    if (!numericEntries.has(t.token))
                        numericEntries.set(t.token, analyzeNumericLiteral(t.token, currentDefaultQ));

                    words.push({ addr: { ...cur }, word: encodeNumeric(t.token, currentDefaultQ), kind: 'data' });

                    cur = nextAddr(cur);
                } else {
                    const a = resolveAddr(t.token, labelAddresses, lineIdx, t.col, errors);

                    words.push({ addr: { ...cur }, word: encodeInteger(parseInt(formatTtSS(a), 10)), kind: 'data' });

                    cur = nextAddr(cur);
                }
            }
        } else if (instructionSet.has(keyword)) {
            const operandAddr = resolveAddr(tokens[1].token, labelAddresses, lineIdx, tokens[1].col, errors);

            if (!valueInstructions.has(keyword)) refLinear.add(linearOf(operandAddr));

            words.push({ addr: { ...cur }, word: encodeInstruction(keyword, operandAddr), kind: 'code' });

            cur = nextAddr(cur);
        }
    }

    const emitErrors = errors.filter(e => e.severity !== 'warning' && e.severity !== 'information');

    if (emitErrors.length > 0) {
        for (const e of emitErrors)
            process.stderr.write(`${rel}:${e.line + 1}:${e.start + 1}: error: ${e.message}\n`);

        process.exit(1);
    }

    writeBin(binPath, orgAddr, words);
    writeHex(hexPath, words);
    writeJson(jsonPath, orgAddr, words);
    writeInfo(infoPath, path.basename(absPath), orgAddr, activeSwitches, currentDefaultQ, labelAddresses, numericEntries, words, refLinear);

    process.stdout.write(`Assembled ${rel}: ${words.length} word(s)\n`);
    process.stdout.write(`  Binary : ${path.relative(process.cwd(), binPath)}\n`);
    process.stdout.write(`  Hex    : ${path.relative(process.cwd(), hexPath)}\n`);
    process.stdout.write(`  JSON   : ${path.relative(process.cwd(), jsonPath)}\n`);
    process.stdout.write(`  Info   : ${path.relative(process.cwd(), infoPath)}\n`);
}

main();
